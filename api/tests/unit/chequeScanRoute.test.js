/**
 * chequeScanRoute.test.js — POST /api/cheques/scan and GET /api/cheques/scan/quota: who may scan,
 * what is sent to Gemini, the daily limit per user tier, and that nothing is stored
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/lib/auth.js', () => ({
  getAuthenticatedUser: vi.fn(),
  isUserAdmin: (email) => email === 'admin@example.com',
}));

import { getAuthenticatedUser } from '../../src/lib/auth.js';
import { handleChequeScanRoute, handleChequeScanQuotaRoute } from '../../src/handlers/chequeScanRoutes.js';
import { tehranDay } from '../../src/lib/usageQuota.js';

const ADMIN = { id: 'a1', role: 'admin', email: 'admin@example.com' };
const USER = { id: 'u1', role: 'user', email: 'user@example.com' };

const GEMINI_ANSWER = JSON.stringify({
  amount: 500000000, // 500M Rials
  amountWords: 'پنجاه میلیون تومان', // 50M Tomans = 500M Rials
  sayadId: '1234567890123456',
  dueDate: '1404/08/15',
  bankName: 'بانک پاسارگاد',
  payee: 'علی محمدی',
  chequeNumber: '987654',
  confidence: { amount: 'high', dueDate: 'high', sayadId: 'high' },
});

const geminiReply = (text = GEMINI_ANSWER) => new Response(
  JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
  { status: 200, headers: { 'Content-Type': 'application/json' } },
);

describe('POST /api/cheques/scan route', () => {
  let env;
  let kvStore;
  let dbCalls;
  let fetchMock;

  beforeEach(() => {
    vi.clearAllMocks();
    kvStore = new Map();
    dbCalls = [];
    fetchMock = vi.fn(async () => geminiReply());
    vi.stubGlobal('fetch', fetchMock);

    env = {
      ADMIN_EMAIL: 'admin@example.com',
      GEMINI_API_KEY: 'gkey',
      REALRATE_KV: {
        get: vi.fn(async (key) => kvStore.get(key) || null),
        put: vi.fn(async (key, val) => kvStore.set(key, val)),
      },
      DB: {
        prepare: vi.fn(() => {
          dbCalls.push('prepare');
          return { bind: vi.fn(() => ({ first: vi.fn(), all: vi.fn(), run: vi.fn() })) };
        }),
        batch: vi.fn(async () => {
          dbCalls.push('batch');
          return [];
        }),
      },
    };
  });

  afterEach(() => vi.unstubAllGlobals());

  function createScanRequest({ file } = {}) {
    const formData = new FormData();
    if (file !== undefined) {
      if (file !== null) formData.append('image', file);
    } else {
      formData.append('image', new Blob([new Uint8Array(100)], { type: 'image/jpeg' }), 'cheque.jpg');
    }
    return new Request('https://api.realrate.ir/api/cheques/scan', { method: 'POST', body: formData });
  }

  const usedToday = (user) => Number(kvStore.get(`quota:cheque_scan:${user.id}:${tehranDay()}`) || 0);

  it('conceals route with 404 when unauthenticated', async () => {
    getAuthenticatedUser.mockResolvedValue(null);
    await expect(handleChequeScanRoute(createScanRequest(), env)).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('lets a regular user scan, and counts the scan', async () => {
    getAuthenticatedUser.mockResolvedValue(USER);
    const res = await handleChequeScanRoute(createScanRequest(), env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.quota).toMatchObject({ limit: 10, used: 1, remaining: 9 });
    expect(usedToday(USER)).toBe(1);
    // The raw answer is for admins only
    expect(body.raw).toBeUndefined();
  });

  it('refuses a regular user\'s 11th scan of the day with 429', async () => {
    getAuthenticatedUser.mockResolvedValue(USER);
    kvStore.set(`quota:cheque_scan:${USER.id}:${tehranDay()}`, '10');
    await expect(handleChequeScanRoute(createScanRequest(), env)).rejects.toMatchObject({ statusCode: 429, code: 'QUOTA_EXCEEDED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never limits the admin', async () => {
    getAuthenticatedUser.mockResolvedValue(ADMIN);
    kvStore.set(`quota:cheque_scan:${ADMIN.id}:${tehranDay()}`, '500');
    const res = await handleChequeScanRoute(createScanRequest(), env);
    const body = await res.json();
    expect(body.quota).toMatchObject({ limit: null, remaining: null, used: 501 });
    expect(body.raw).toBe(GEMINI_ANSWER);
  });

  it('rejects requests without image file with 400', async () => {
    getAuthenticatedUser.mockResolvedValue(ADMIN);
    await expect(handleChequeScanRoute(createScanRequest({ file: null }), env)).rejects.toMatchObject({ statusCode: 400, code: 'BAD_REQUEST' });
  });

  it('rejects files larger than 2MB with 413', async () => {
    getAuthenticatedUser.mockResolvedValue(ADMIN);
    const big = new Blob([new Uint8Array(2 * 1024 * 1024 + 10)], { type: 'image/jpeg' });
    await expect(handleChequeScanRoute(createScanRequest({ file: big }), env)).rejects.toMatchObject({ statusCode: 413, code: 'PAYLOAD_TOO_LARGE' });
  });

  it('does not count an invalid upload against the daily limit', async () => {
    getAuthenticatedUser.mockResolvedValue(USER);
    const gif = new Blob([new Uint8Array(10)], { type: 'image/gif' });
    await expect(handleChequeScanRoute(createScanRequest({ file: gif }), env)).rejects.toMatchObject({ statusCode: 400 });
    expect(usedToday(USER)).toBe(0);
  });

  it('sends the image inline to Gemini with the key in a header', async () => {
    getAuthenticatedUser.mockResolvedValue(USER);
    await handleChequeScanRoute(createScanRequest(), env);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/models/gemini-3.8-flash:generateContent');
    expect(url).not.toContain('gkey');
    expect(init.headers['x-goog-api-key']).toBe('gkey');
    const body = JSON.parse(init.body);
    expect(body.contents[0].parts[0].inlineData.mimeType).toBe('image/jpeg');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('gives the scan back when Gemini fails, and tells only the admin why', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 400 }));

    getAuthenticatedUser.mockResolvedValue(USER);
    await expect(handleChequeScanRoute(createScanRequest(), env)).rejects.toMatchObject({
      statusCode: 502,
      code: 'AI_GATEWAY_ERROR',
      message: 'پردازش تصویر ناموفق بود.',
    });
    expect(usedToday(USER)).toBe(0);

    getAuthenticatedUser.mockResolvedValue(ADMIN);
    await expect(handleChequeScanRoute(createScanRequest(), env)).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringContaining('API key not valid'),
    });
  });

  it('answers 503 without the Gemini key, naming the secret to the admin only', async () => {
    delete env.GEMINI_API_KEY;
    getAuthenticatedUser.mockResolvedValue(USER);
    await expect(handleChequeScanRoute(createScanRequest(), env)).rejects.toMatchObject({
      statusCode: 503,
      code: 'SCAN_NOT_CONFIGURED',
      message: 'اسکن چک فعلاً در دسترس نیست.',
    });
    expect(usedToday(USER)).toBe(0);

    getAuthenticatedUser.mockResolvedValue(ADMIN);
    await expect(handleChequeScanRoute(createScanRequest(), env)).rejects.toMatchObject({
      message: expect.stringContaining('GEMINI_API_KEY'),
    });
  });

  it('succeeds with proper response shape and NEVER writes to database', async () => {
    getAuthenticatedUser.mockResolvedValue(USER);
    const res = await handleChequeScanRoute(createScanRequest(), env);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.notACheque).toBe(false);
    // 500,000,000 Rials / 10 = 50,000,000 Tomans for ChequeForm
    expect(data.fields.amount).toBe(50000000);
    expect(data.fields.dueDate).toBe('2025-11-06'); // 1404/08/15
    expect(data.fields.sayadId).toBe('1234567890123456');
    expect(data.fields.chequeNumber).toBe('987654');
    expect(data.fields.bankId).toBe('pasargad');
    expect(data.fields.bankName).toBe('بانک پاسارگاد');
    expect(data.fields.counterparty).toBe('علی محمدی');
    expect(data.model).toBe('gemini-3.8-flash');
    expect(typeof data.durationMs).toBe('number');
    expect(dbCalls).toEqual([]);
  });

  it('reports today\'s quota', async () => {
    getAuthenticatedUser.mockResolvedValue(USER);
    kvStore.set(`quota:cheque_scan:${USER.id}:${tehranDay()}`, '3');
    const res = await handleChequeScanQuotaRoute(new Request('https://api.realrate.ir/api/cheques/scan/quota'), env);
    expect((await res.json()).quota).toEqual({ key: 'cheque_scan', limit: 10, used: 3, remaining: 7 });
  });
});

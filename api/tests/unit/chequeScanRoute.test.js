import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/auth.js', () => ({
  getAuthenticatedUser: vi.fn(),
  isUserAdmin: (email) => email === 'admin@example.com',
}));

import { getAuthenticatedUser } from '../../src/lib/auth.js';
import { handleChequeScanRoute } from '../../src/handlers/chequeScanRoutes.js';
import { CHEQUE_SCAN_MODELS } from '../../src/config/ai.config.js';

// Only the AI binding is set here: the first Workers AI model is the default
const DEFAULT_CHEQUE_SCAN_MODEL = CHEQUE_SCAN_MODELS.find((m) => m.provider === 'workers-ai');

describe('POST /api/cheques/scan route', () => {
  let env;
  let kvStore;
  let dbCalls;

  beforeEach(() => {
    vi.clearAllMocks();
    kvStore = new Map();
    dbCalls = [];

    env = {
      ADMIN_EMAIL: 'admin@example.com',
      REALRATE_KV: {
        get: vi.fn(async (key) => kvStore.get(key) || null),
        put: vi.fn(async (key, val) => kvStore.set(key, val)),
      },
      DB: {
        prepare: vi.fn(() => {
          dbCalls.push('prepare');
          return {
            bind: vi.fn(() => {
              dbCalls.push('bind');
              return {
                first: vi.fn(async () => null),
                all: vi.fn(async () => []),
                run: vi.fn(async () => ({ success: true })),
              };
            }),
          };
        }),
        batch: vi.fn(async () => {
          dbCalls.push('batch');
          return [];
        }),
      },
      AI: {
        run: vi.fn(async () => ({
          response: {
            amount: 500000000, // 500M Rials
            amountWords: 'پنجاه میلیون تومان', // 50M Tomans = 500M Rials
            sayadId: '1234567890123456',
            dueDate: '1404/08/15',
            bankName: 'بانک پاسارگاد',
            payee: 'علی محمدی',
            chequeNumber: '987654',
            confidence: {
              amount: 'high',
              dueDate: 'high',
              sayadId: 'high',
            },
          },
        })),
      },
    };
  });

  function createScanRequest({ file, model = null, headers = {} } = {}) {
    const formData = new FormData();
    if (file !== undefined) {
      if (file !== null) {
        formData.append('image', file);
      }
    } else {
      // Default valid 100-byte JPEG
      const dummyJpeg = new Blob([new Uint8Array(100)], { type: 'image/jpeg' });
      formData.append('image', dummyJpeg, 'cheque.jpg');
    }

    if (model) {
      formData.append('model', model);
    }

    return new Request('https://api.realrate.ir/api/cheques/scan', {
      method: 'POST',
      body: formData,
      headers,
    });
  }

  it('conceals route with 404 when unauthenticated', async () => {
    getAuthenticatedUser.mockResolvedValue(null);
    const req = createScanRequest();

    await expect(handleChequeScanRoute(req, env)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('conceals route with 404 when user is not admin', async () => {
    getAuthenticatedUser.mockResolvedValue({ id: 'u1', role: 'user', email: 'user@example.com' });
    const req = createScanRequest();

    await expect(handleChequeScanRoute(req, env)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('rejects requests without image file with 400', async () => {
    getAuthenticatedUser.mockResolvedValue({ id: 'a1', role: 'admin', email: 'admin@example.com' });
    const req = createScanRequest({ file: null });

    await expect(handleChequeScanRoute(req, env)).rejects.toMatchObject({
      statusCode: 400,
      code: 'BAD_REQUEST',
    });
  });

  it('rejects invalid file MIME type with 400', async () => {
    getAuthenticatedUser.mockResolvedValue({ id: 'a1', role: 'admin', email: 'admin@example.com' });
    const pdfBlob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    const req = createScanRequest({ file: pdfBlob });

    await expect(handleChequeScanRoute(req, env)).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_FILE_TYPE',
    });
  });

  it('rejects files larger than 2MB with 413', async () => {
    getAuthenticatedUser.mockResolvedValue({ id: 'a1', role: 'admin', email: 'admin@example.com' });
    // 2.5 MB blob
    const largeBlob = new Blob([new Uint8Array(2.5 * 1024 * 1024)], { type: 'image/jpeg' });
    const req = createScanRequest({ file: largeBlob });

    await expect(handleChequeScanRoute(req, env)).rejects.toMatchObject({
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
    });
  });

  it('falls back to default model when requested model is not in allowed list', async () => {
    getAuthenticatedUser.mockResolvedValue({ id: 'a1', role: 'admin', email: 'admin@example.com' });
    const req = createScanRequest({ model: 'unsupported/rogue-model' });

    const res = await handleChequeScanRoute(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.model).toBe(DEFAULT_CHEQUE_SCAN_MODEL.id);
    expect(env.AI.run).toHaveBeenCalledWith(DEFAULT_CHEQUE_SCAN_MODEL.id, expect.any(Object));
  });

  it('uses requested model when it is valid in allowed list', async () => {
    getAuthenticatedUser.mockResolvedValue({ id: 'a1', role: 'admin', email: 'admin@example.com' });
    const req = createScanRequest({ model: '@cf/mistralai/mistral-small-3.1-24b-instruct' });

    const res = await handleChequeScanRoute(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.model).toBe('@cf/mistralai/mistral-small-3.1-24b-instruct');
    expect(env.AI.run).toHaveBeenCalledWith('@cf/mistralai/mistral-small-3.1-24b-instruct', expect.any(Object));
  });

  it('returns 502 with friendly Persian message when AI model fails or throws', async () => {
    getAuthenticatedUser.mockResolvedValue({ id: 'a1', role: 'admin', email: 'admin@example.com' });
    env.AI.run.mockRejectedValue(new Error('Cloudflare AI backend overloaded'));

    const req = createScanRequest();
    await expect(handleChequeScanRoute(req, env)).rejects.toMatchObject({
      statusCode: 502,
      code: 'AI_GATEWAY_ERROR',
      // The provider's reason is passed on to the admin
      message: expect.stringContaining('Cloudflare AI backend overloaded'),
    });
  });

  it('enforces daily rate limit of 30 scans with 429 response', async () => {
    getAuthenticatedUser.mockResolvedValue({ id: 'a1', role: 'admin', email: 'admin@example.com' });
    const today = new Date().toISOString().slice(0, 10);
    kvStore.set(`ai_scan:a1:${today}`, '30');

    const req = createScanRequest();
    await expect(handleChequeScanRoute(req, env)).rejects.toMatchObject({
      statusCode: 429,
      code: 'RATE_LIMIT_EXCEEDED',
    });
  });

  it('succeeds with proper response shape and NEVER writes to database', async () => {
    getAuthenticatedUser.mockResolvedValue({ id: 'admin_user', role: 'admin', email: 'admin@example.com' });
    const req = createScanRequest();

    const res = await handleChequeScanRoute(req, env);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.notACheque).toBe(false);
    expect(data.fields).toBeDefined();
    // 500,000,000 Rials / 10 = 50,000,000 Tomans for ChequeForm
    expect(data.fields.amount).toBe(50000000);
    expect(data.fields.dueDate).toBe('2025-11-06'); // 1404/08/15
    expect(data.fields.sayadId).toBe('1234567890123456');
    expect(data.fields.chequeNumber).toBe('987654');
    expect(data.fields.bankId).toBe('pasargad');
    expect(data.fields.bankName).toBe('بانک پاسارگاد');
    expect(data.fields.counterparty).toBe('علی محمدی');
    expect(data.confidence).toBeDefined();
    expect(data.raw).toBeDefined();
    expect(typeof data.durationMs).toBe('number');

    // Strict validation: ZERO queries or writes to Database
    expect(dbCalls).toEqual([]);
  });
  it('sends the image once, inside the messages, and asks for JSON by schema', async () => {
    getAuthenticatedUser.mockResolvedValue({ id: 'a1', role: 'admin', email: 'admin@example.com' });
    await handleChequeScanRoute(createScanRequest(), env);

    const payload = env.AI.run.mock.calls[0][1];
    expect(payload.image).toBeUndefined();
    const imagePart = payload.messages[1].content.find((c) => c.type === 'image_url');
    expect(imagePart.image_url.url).toMatch(/^data:image\/jpeg;base64,/);
    expect(payload.response_format.type).toBe('json_schema');
  });

  it('retries without JSON mode when the model refuses it', async () => {
    getAuthenticatedUser.mockResolvedValue({ id: 'a1', role: 'admin', email: 'admin@example.com' });
    const answer = await env.AI.run();
    env.AI.run.mockReset();
    env.AI.run
      .mockRejectedValueOnce(new Error('response_format not supported'))
      .mockResolvedValueOnce(answer);

    const res = await handleChequeScanRoute(createScanRequest(), env);
    expect(res.status).toBe(200);
    expect(env.AI.run).toHaveBeenCalledTimes(2);
    expect(env.AI.run.mock.calls[1][1].response_format).toBeUndefined();
    expect((await res.json()).fields.amount).toBe(50000000);
  });

  it('does not count an invalid upload against the daily limit', async () => {
    getAuthenticatedUser.mockResolvedValue({ id: 'a1', role: 'admin', email: 'admin@example.com' });
    const gif = new Blob([new Uint8Array(10)], { type: 'image/gif' });
    await expect(handleChequeScanRoute(createScanRequest({ file: gif }), env)).rejects.toMatchObject({ statusCode: 400 });
    expect(kvStore.size).toBe(0);
  });
});

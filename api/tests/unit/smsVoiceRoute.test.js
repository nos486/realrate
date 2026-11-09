/**
 * smsVoiceRoute.test.js — POST /api/sms/voice: admin-only while experimental, what is sent to
 * Gemini, the category fallback, and the daily limit
 */

import { memoryStateDb } from '../helpers/memoryStateDb.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/lib/auth.js', () => ({
  getAuthenticatedUser: vi.fn(),
  isUserAdmin: (email) => email === 'admin@example.com',
}));

import { getAuthenticatedUser } from '../../src/lib/auth.js';
import { handleSmsVoiceRoute } from '../../src/handlers/smsVoiceRoutes.js';
import { normalizeSmsVoice, cleanVoiceCategories } from '../../src/domain/smsVoice.js';
import { isFeatureEnabled } from '../../src/config/features.js';

const ADMIN = { id: 'a1', role: 'admin', email: 'admin@example.com' };
const USER = { id: 'u1', role: 'user', email: 'user@example.com', groups: ['pro'] };
const CATEGORIES = [{ value: 'c_ship1234', label: 'ارسال و پست' }, { value: 'food', label: 'خوراک' }, { value: 'other', label: 'سایر' }];

const geminiReply = (obj) => new Response(
  JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }),
  { status: 200, headers: { 'Content-Type': 'application/json' } },
);

/** The first bytes of a WebM file (EBML header), then filler */
const WEBM = new Uint8Array(200);
WEBM.set([0x1a, 0x45, 0xdf, 0xa3]);

function voiceRequest({ type = 'audio/webm;codecs=opus', bytes = WEBM, categories = CATEGORIES, engine } = {}) {
  const form = new FormData();
  form.append('audio', new Blob([bytes], { type }), 'voice.webm');
  form.append('categories', JSON.stringify(categories));
  if (engine) form.append('engine', engine);
  return new Request('https://api.realrate.ir/api/sms/voice', { method: 'POST', body: form });
}

describe('sms_voice feature', () => {
  it('is experimental: admins only, until a group is given', () => {
    expect(isFeatureEnabled('sms_voice', ADMIN)).toBe(true);
    expect(isFeatureEnabled('sms_voice', USER)).toBe(false);
  });
});

describe('normalizeSmsVoice', () => {
  it('keeps a category the user has, by key or by name, and falls back to other', () => {
    expect(normalizeSmsVoice({ title: 'هزینه تیپاکس', category: 'c_ship1234' }, CATEGORIES)).toEqual({ understood: true, title: 'هزینه تیپاکس', category: 'c_ship1234' });
    expect(normalizeSmsVoice({ title: 'x', category: 'خوراک' }, CATEGORIES).category).toBe('food');
    expect(normalizeSmsVoice({ title: 'x', category: 'invented' }, CATEGORIES).category).toBe('other');
  });
  it('is not understood without a title', () => {
    expect(normalizeSmsVoice({ understood: false, title: '', category: 'food' }, CATEGORIES).understood).toBe(false);
    expect(normalizeSmsVoice('not json', CATEGORIES).understood).toBe(false);
  });
  it('cleans the category list', () => {
    expect(cleanVoiceCategories([{ value: 'a', label: ' A ' }, { value: 'a', label: 'dup' }, { value: '', label: 'x' }, 5])).toEqual([{ value: 'a', label: 'A' }]);
  });
});

describe('POST /api/sms/voice', () => {
  let env;
  let fetchMock;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn(async () => geminiReply({ understood: true, title: 'هزینه تیپاکس', category: 'c_ship1234' }));
    vi.stubGlobal('fetch', fetchMock);
    env = { ADMIN_EMAIL: 'admin@example.com', GEMINI_API_KEY: 'gkey', DB: memoryStateDb() };
  });
  afterEach(() => vi.unstubAllGlobals());

  it('hides the route from an ordinary user', async () => {
    getAuthenticatedUser.mockResolvedValue(USER);
    await expect(handleSmsVoiceRoute(voiceRequest(), env)).rejects.toMatchObject({ statusCode: 404 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the clip and the user categories to Gemini and returns title and category', async () => {
    getAuthenticatedUser.mockResolvedValue(ADMIN);
    const res = await handleSmsVoiceRoute(voiceRequest(), env);
    const body = await res.json();
    expect(body).toMatchObject({ understood: true, title: 'هزینه تیپاکس', category: 'c_ship1234' });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.contents[0].parts[0].inlineData.mimeType).toBe('audio/webm');
    expect(sent.systemInstruction.parts[0].text).toContain('c_ship1234: ارسال و پست');
  });

  it('falls back to other for a category the model invented', async () => {
    getAuthenticatedUser.mockResolvedValue(ADMIN);
    fetchMock.mockResolvedValue(geminiReply({ understood: true, title: 'چیزی', category: 'nope' }));
    const body = await (await handleSmsVoiceRoute(voiceRequest(), env)).json();
    expect(body.category).toBe('other');
  });

  it('refuses a file whose bytes are not audio of the declared type', async () => {
    getAuthenticatedUser.mockResolvedValue(ADMIN);
    await expect(handleSmsVoiceRoute(voiceRequest({ bytes: new Uint8Array(50) }), env)).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_FILE_TYPE' });
    await expect(handleSmsVoiceRoute(voiceRequest({ type: 'image/png' }), env)).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('a note on a deposit', () => {
  it('asks about an income and sends the income categories', async () => {
    getAuthenticatedUser.mockResolvedValue(ADMIN);
    const fetchMock = vi.fn(async () => geminiReply({ understood: true, title: 'فروش لپ‌تاپ', category: 'sale' }));
    vi.stubGlobal('fetch', fetchMock);
    const env = { ADMIN_EMAIL: 'admin@example.com', GEMINI_API_KEY: 'gkey', DB: memoryStateDb() };
    const form = new FormData();
    form.append('audio', new Blob([WEBM], { type: 'audio/webm' }), 'v.webm');
    form.append('categories', JSON.stringify([{ value: 'sale', label: 'فروش' }, { value: 'other', label: 'سایر' }]));
    form.append('kind', 'income');
    const body = await (await handleSmsVoiceRoute(new Request('https://x/api/sms/voice', { method: 'POST', body: form }), env)).json();
    expect(body).toMatchObject({ understood: true, category: 'sale' });
    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).systemInstruction.parts[0].text;
    expect(prompt).toContain('درآمد');
    expect(prompt).toContain('sale: فروش');
    vi.unstubAllGlobals();
  });
});

describe('voice model fallback', () => {
  it('tries the next model when one times out', async () => {
    getAuthenticatedUser.mockResolvedValue(ADMIN);
    const timeout = Object.assign(new Error('timeout'), { name: 'TimeoutError' });
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(timeout)
      .mockResolvedValueOnce(geminiReply({ understood: true, title: 'تیپاکس', category: 'other' }));
    vi.stubGlobal('fetch', fetchMock);
    const env = { ADMIN_EMAIL: 'admin@example.com', GEMINI_API_KEY: 'gkey', DB: memoryStateDb() };
    const body = await (await handleSmsVoiceRoute(voiceRequest(), env)).json();
    expect(body.title).toBe('تیپاکس');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('gemini-3.5-flash-lite')
    expect(fetchMock.mock.calls[1][0]).toContain('gemini-3.6-flash');
    vi.unstubAllGlobals();
  });
});

describe('voice model unavailable', () => {
  it('tries the next model when Google answers 404 for one', async () => {
    getAuthenticatedUser.mockResolvedValue(ADMIN);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'no longer available' } }), { status: 404 }))
      .mockResolvedValueOnce(geminiReply({ understood: true, title: 'تیپاکس', category: 'other' }));
    vi.stubGlobal('fetch', fetchMock);
    const env = { ADMIN_EMAIL: 'admin@example.com', GEMINI_API_KEY: 'gkey', DB: memoryStateDb() };
    const body = await (await handleSmsVoiceRoute(voiceRequest(), env)).json();
    expect(body.title).toBe('تیپاکس');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});

describe('voice engines (admin comparison)', () => {
  const makeEnv = (ai) => ({ ADMIN_EMAIL: 'admin@example.com', GEMINI_API_KEY: 'gkey', DB: memoryStateDb(), AI: { run: ai } });

  it('runs a Cloudflare speech model then GLM, and shows what was heard to the admin', async () => {
    getAuthenticatedUser.mockResolvedValue(ADMIN);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const ai = vi.fn()
      .mockResolvedValueOnce({ text: 'هزینه تیپاکس' })
      .mockResolvedValueOnce({ response: JSON.stringify({ understood: true, title: 'هزینه تیپاکس', category: 'c_ship1234' }) });
    const body = await (await handleSmsVoiceRoute(voiceRequest({ engine: 'cf-whisper-turbo' }), makeEnv(ai))).json();
    expect(body).toMatchObject({ title: 'هزینه تیپاکس', category: 'c_ship1234', engine: 'cf-whisper-turbo' });
    expect(ai.mock.calls[0][0]).toBe('@cf/openai/whisper-large-v3-turbo');
    expect(typeof ai.mock.calls[0][1].audio).toBe('string');
    expect(ai.mock.calls[1][1].messages[1].content).toContain('هزینه تیپاکس');
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('is not understood when the speech model hears nothing', async () => {
    getAuthenticatedUser.mockResolvedValue(ADMIN);
    const ai = vi.fn().mockResolvedValueOnce({ text: '  ' });
    const body = await (await handleSmsVoiceRoute(voiceRequest({ engine: 'cf-whisper' }), makeEnv(ai))).json();
    expect(body.understood).toBe(false);
    expect(ai).toHaveBeenCalledTimes(1);
    expect(Array.isArray(ai.mock.calls[0][1].audio)).toBe(true);
  });

  it('runs only the chosen Gemini model', async () => {
    getAuthenticatedUser.mockResolvedValue(ADMIN);
    const fetchMock = vi.fn(async () => geminiReply({ understood: true, title: 'x', category: 'food' }));
    vi.stubGlobal('fetch', fetchMock);
    const body = await (await handleSmsVoiceRoute(voiceRequest({ engine: 'gemini-3.8-flash' }), makeEnv(vi.fn()))).json();
    expect(body.engine).toBe('gemini-3.8-flash');
    expect(fetchMock.mock.calls[0][0]).toContain('gemini-3.8-flash');
    vi.unstubAllGlobals();
  });
});

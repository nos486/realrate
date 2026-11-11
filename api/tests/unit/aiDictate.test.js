/**
 * aiDictate.test.js — POST /api/ai/dictate: admin-only while experimental, the words come back as text
 * only, and an empty clip gives its use back
 */

import { memoryStateDb } from '../helpers/memoryStateDb.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/lib/auth.js', () => ({
  getAuthenticatedUser: vi.fn(),
  isUserAdmin: (email) => email === 'admin@example.com',
}));

import { getAuthenticatedUser } from '../../src/lib/auth.js';
import { handleAiDictateRoute } from '../../src/handlers/aiDictateRoutes.js';
import { processDictation } from '../../src/services/ai/dictate.service.js';
import { normalizeDictation, DICTATION_MAX_CHARS } from '../../src/services/ai/dictate.service.js';

const ADMIN = { id: 'a1', role: 'admin', email: 'admin@example.com' };
const USER = { id: 'u1', role: 'user', email: 'user@example.com', groups: ['pro'] };
const WEBM = new Uint8Array(200);
WEBM.set([0x1a, 0x45, 0xdf, 0xa3]);
const reply = (obj) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const request = () => {
  const form = new FormData();
  form.append('audio', new Blob([WEBM], { type: 'audio/webm' }), 'v.webm');
  return new Request('https://x/api/ai/dictate', { method: 'POST', body: form });
};

describe('normalizeDictation', () => {
  it('keeps one trimmed line within the limit, and is empty for silence', () => {
    expect(normalizeDictation({ text: '  سلام   دنیا ' })).toEqual({ understood: true, text: 'سلام دنیا' });
    expect(normalizeDictation('not json').understood).toBe(false);
    expect(normalizeDictation({ text: 'x'.repeat(DICTATION_MAX_CHARS + 50) }).text).toHaveLength(DICTATION_MAX_CHARS);
  });
});

describe('POST /api/ai/dictate', () => {
  let env;
  let fetchMock;
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn(async () => reply({ text: 'فروشنده آقای رضایی' }));
    vi.stubGlobal('fetch', fetchMock);
    env = { ADMIN_EMAIL: 'admin@example.com', GEMINI_API_KEY: 'gkey', DB: memoryStateDb() };
  });
  afterEach(() => vi.unstubAllGlobals());

  it('hides the route from an ordinary user', async () => {
    getAuthenticatedUser.mockResolvedValue(USER);
    await expect(handleAiDictateRoute(request(), env)).rejects.toMatchObject({ statusCode: 404 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the words as text', async () => {
    getAuthenticatedUser.mockResolvedValue(ADMIN);
    const body = await (await handleAiDictateRoute(request(), env)).json();
    expect(body).toMatchObject({ understood: true, text: 'فروشنده آقای رضایی' });
  });

  it('reports an empty clip as not understood', async () => {
    getAuthenticatedUser.mockResolvedValue(ADMIN);
    fetchMock.mockResolvedValue(reply({ text: '' }));
    const body = await (await handleAiDictateRoute(request(), env)).json();
    expect(body.understood).toBe(false);
  });
});

describe('Cloudflare engines', () => {
  const makeEnv = async (ai, voiceEngine) => {
    const { memoryStateDb } = await import('../helpers/memoryStateDb.js');
    const { saveAiSettings } = await import('../../src/services/ai/aiSettings.service.js');
    const env = { DB: memoryStateDb(), AI: { run: ai } };
    await saveAiSettings(env, { voiceEngine });
    return env;
  };

  it('dictation stops after the speech model and asks no second one', async () => {
    const ai = vi.fn().mockResolvedValueOnce({ text: ' سلام دنیا ' });
    const out = await processDictation(await makeEnv(ai, 'cf-whisper-turbo'), { audioBuffer: new ArrayBuffer(8), mimeType: 'audio/webm' });
    expect(out).toMatchObject({ understood: true, text: 'سلام دنیا' });
    expect(ai).toHaveBeenCalledTimes(1);
    expect(ai.mock.calls[0][1]).toMatchObject({ language: 'fa' });
  });

  it('gives the GLM step room for its reasoning on top of the answer', async () => {
    const { processAiVoice } = await import('../../src/services/ai/assistant.service.js');
    const { NEWS_AI_MODEL } = await import('../../src/config/news.config.js');
    const ai = vi.fn()
      .mockResolvedValueOnce({ text: 'امروز چقدر خرج کردم' })
      .mockResolvedValueOnce({ response: JSON.stringify({ understood: true, intent: 'question', questions: ['خرج امروز'] }) });
    const out = await processAiVoice(await makeEnv(ai, 'cf-whisper-turbo'), { audioBuffer: new ArrayBuffer(8), mimeType: 'audio/webm', expense: [], income: [], accounts: [] });
    expect(out).toMatchObject({ understood: true, intent: 'question', questions: ['خرج امروز'] });
    expect(ai.mock.calls[1][1].max_tokens).toBeGreaterThanOrEqual(2000 + NEWS_AI_MODEL.reasoningTokens);
  });

  it('the older Whisper is not given a language it does not take', async () => {
    const ai = vi.fn().mockResolvedValueOnce({ text: 'متن' });
    await processDictation(await makeEnv(ai, 'cf-whisper'), { audioBuffer: new ArrayBuffer(8), mimeType: 'audio/webm' });
    expect(ai.mock.calls[0][1].language).toBeUndefined();
  });
});

describe('Cloudflare engine output', () => {
  it('shows the admin what Whisper heard when the model could not read it', async () => {
    const { memoryStateDb } = await import('../helpers/memoryStateDb.js');
    const { saveAiSettings } = await import('../../src/services/ai/aiSettings.service.js');
    const { processAiVoice } = await import('../../src/services/ai/assistant.service.js');
    const ai = vi.fn().mockResolvedValueOnce({ text: 'متن شنیده' }).mockResolvedValueOnce({ response: 'not json' });
    const env = { DB: memoryStateDb(), AI: { run: ai } };
    await saveAiSettings(env, { voiceEngine: 'cf-whisper-turbo' });
    const out = await processAiVoice(env, { audioBuffer: new ArrayBuffer(8), mimeType: 'audio/wav', expense: [], income: [], accounts: [], debug: true });
    expect(out).toMatchObject({ understood: false, heard: 'متن شنیده' });
  });
});

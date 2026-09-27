/**
 * visionProviders.test.js — Each cheque-scan provider sends the image the way its API wants and
 * turns failures into a short reason; models without a key are refused before anything is sent
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const anthropicCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }
  class APIConnectionTimeoutError extends Error {}
  class Anthropic {
    constructor(opts) { this.opts = opts; this.messages = { create: anthropicCreate }; }
  }
  Anthropic.APIError = APIError;
  Anthropic.APIConnectionTimeoutError = APIConnectionTimeoutError;
  return { default: Anthropic };
});

vi.mock('../../src/lib/auth.js', () => ({
  getAuthenticatedUser: vi.fn(async () => ({ id: 'a1', role: 'admin', email: 'admin@example.com' })),
  isUserAdmin: () => true,
}));

import { runVisionModel, toBase64, VisionProviderError } from '../../src/services/ai/visionProviders.js';
import { getChequeScanModel, resolveChequeScanModel, isChequeScanModelAvailable } from '../../src/config/ai.config.js';
import { processChequeScan, listChequeScanModels } from '../../src/services/ai/chequeScan.service.js';
import { handleChequeScanRoute, handleChequeScanModelsRoute } from '../../src/handlers/chequeScanRoutes.js';

const REQ = {
  systemPrompt: 'SYSTEM',
  userText: 'READ THIS',
  imageBase64: 'QUJD',
  mimeType: 'image/jpeg',
  jsonSchema: { type: 'object' },
};
const ANSWER = JSON.stringify({ amount: 10000000, sayadId: '1234567890123456', dueDate: '1404/08/15' });

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

let fetchMock;
beforeEach(() => {
  anthropicCreate.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('model list', () => {
  it('offers a model only when its key or binding is set, and picks the first usable one', () => {
    const env = { OPENAI_API_KEY: 'k' };
    expect(isChequeScanModelAvailable(getChequeScanModel('gpt-5.4-mini'), env)).toBe(true);
    expect(isChequeScanModelAvailable(getChequeScanModel('gemini-3.5-flash'), env)).toBe(false);
    expect(resolveChequeScanModel(undefined, env).id).toBe('gpt-5.4-mini');
    expect(resolveChequeScanModel('claude-haiku-4-5', env).id).toBe('claude-haiku-4-5');

    const listed = listChequeScanModels(env);
    expect(listed.find((m) => m.id === 'gemini-3.5-flash')).toMatchObject({ available: false, secret: 'GEMINI_API_KEY' });
    // Never the key itself
    expect(JSON.stringify(listed)).not.toContain('"k"');
  });

  it('serves the list to an admin', async () => {
    const res = await handleChequeScanModelsRoute(new Request('https://x/api/cheques/scan/models'), { GEMINI_API_KEY: 'g' });
    const body = await res.json();
    expect(body.models.find((m) => m.id === 'gemini-3.5-flash').available).toBe(true);
  });
});

describe('Gemini', () => {
  it('sends the image inline with the key in a header and reads the text parts', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      candidates: [{ content: { parts: [{ text: 'thinking', thought: true }, { text: ANSWER }] } }],
    }));
    const out = await runVisionModel({ GEMINI_API_KEY: 'gkey' }, getChequeScanModel('gemini-3.5-flash'), REQ);
    expect(out).toBe(ANSWER);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/models/gemini-3.5-flash:generateContent');
    expect(url).not.toContain('gkey');
    expect(init.headers['x-goog-api-key']).toBe('gkey');
    const body = JSON.parse(init.body);
    expect(body.contents[0].parts[0].inlineData).toEqual({ mimeType: 'image/jpeg', data: 'QUJD' });
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('turns an HTTP error into a short reason', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'User location is not supported' } }, 400));
    await expect(runVisionModel({ GEMINI_API_KEY: 'g' }, getChequeScanModel('gemini-3.5-flash'), REQ))
      .rejects.toMatchObject({ reason: 'HTTP 400: User location is not supported' });
  });
});

describe('OpenAI', () => {
  it('sends the image as a data URL and asks for a JSON object', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: ANSWER } }] }));
    const out = await runVisionModel({ OPENAI_API_KEY: 'okey' }, getChequeScanModel('gpt-5.4-mini'), REQ);
    expect(out).toBe(ANSWER);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer okey');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('gpt-5.4-mini');
    expect(body.messages[1].content[1].image_url.url).toBe('data:image/jpeg;base64,QUJD');
    expect(body.response_format).toEqual({ type: 'json_object' });
  });
});

describe('Anthropic', () => {
  it('sends a base64 image block and joins the text blocks', async () => {
    anthropicCreate.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: ANSWER }] });
    const out = await runVisionModel({ ANTHROPIC_API_KEY: 'akey' }, getChequeScanModel('claude-sonnet-5'), REQ);
    expect(out).toBe(ANSWER);

    const params = anthropicCreate.mock.calls[0][0];
    expect(params.model).toBe('claude-sonnet-5');
    expect(params.system).toBe('SYSTEM');
    expect(params.messages[0].content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } });
    expect(params.output_config).toEqual({ effort: 'low' });
    expect(params.temperature).toBeUndefined();
  });

  it('sends no effort to Haiku 4.5, and reports a refusal', async () => {
    anthropicCreate.mockResolvedValue({ stop_reason: 'refusal', content: [] });
    await expect(runVisionModel({ ANTHROPIC_API_KEY: 'a' }, getChequeScanModel('claude-haiku-4-5'), REQ))
      .rejects.toBeInstanceOf(VisionProviderError);
    expect(anthropicCreate.mock.calls[0][0].output_config).toBeUndefined();
  });
});

describe('the scan with a provider model', () => {
  it('refuses a model without its key before calling anything, and without using the daily quota', async () => {
    await expect(processChequeScan({}, { imageBuffer: new Uint8Array(4).buffer, mimeType: 'image/jpeg', requestedModel: 'gemini-3.5-flash' }))
      .rejects.toMatchObject({ statusCode: 400, code: 'MODEL_NOT_CONFIGURED', message: expect.stringContaining('GEMINI_API_KEY') });
    expect(fetchMock).not.toHaveBeenCalled();

    const kv = { get: vi.fn(async () => null), put: vi.fn() };
    const form = new FormData();
    form.append('image', new Blob([new Uint8Array(10)], { type: 'image/jpeg' }), 'c.jpg');
    form.append('model', 'gemini-3.5-flash');
    await expect(handleChequeScanRoute(new Request('https://x/api/cheques/scan', { method: 'POST', body: form }), { REALRATE_KV: kv }))
      .rejects.toMatchObject({ code: 'MODEL_NOT_CONFIGURED' });
    expect(kv.put).not.toHaveBeenCalled();
  });

  it('reads the cheque from a Gemini answer', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ candidates: [{ content: { parts: [{ text: ANSWER }] } }] }));
    const res = await processChequeScan({ GEMINI_API_KEY: 'g' }, { imageBuffer: new Uint8Array(4).buffer, mimeType: 'image/jpeg', requestedModel: 'gemini-3.5-flash' });
    expect(res.model).toBe('gemini-3.5-flash');
    expect(res.fields.amount).toBe(1000000);
    expect(res.fields.sayadId).toBe('1234567890123456');
  });
});

describe('toBase64', () => {
  it('matches Buffer for an image larger than one chunk', () => {
    const bytes = new Uint8Array(100000).map((_, i) => (i * 31) % 256);
    expect(toBase64(bytes.buffer)).toBe(Buffer.from(bytes).toString('base64'));
  });
});

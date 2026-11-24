/**
 * aiSettings.test.js — The admin's choice of voice engine and news model (aiSettings.service.js,
 * newsModel.js, /api/admin/ai-settings)
 */

import { memoryStateDb } from '../helpers/memoryStateDb.js';
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../src/lib/auth.js', () => ({
  getAuthenticatedUser: vi.fn(),
  isUserAdmin: (email) => email === 'admin@example.com',
}));

import { getAuthenticatedUser } from '../../src/lib/auth.js';
import { loadAiSettings, saveAiSettings } from '../../src/services/ai/aiSettings.service.js';
import { resolveNewsModel } from '../../src/services/news/newsModel.js';
import { handleAdminGetAiSettings, handleAdminSaveAiSettings } from '../../src/handlers/aiSettingsRoutes.js';
import { NEWS_AI_MODEL } from '../../src/config/news.config.js';

const makeEnv = () => ({ DB: memoryStateDb(), GEMINI_API_KEY: 'gkey', AI: { run: vi.fn(async () => ({ response: 'glm' })) } });
const messages = [{ role: 'system', content: 'sys' }, { role: 'user', content: 'usr' }];

afterEach(() => vi.unstubAllGlobals());

describe('AI settings', () => {
  it('defaults to automatic voice and GLM news', async () => {
    expect(await loadAiSettings(makeEnv())).toEqual({ voiceEngine: 'auto', newsModel: 'glm-5.3', newsDailyCalls: 600 });
  });

  it('saves only the fields given and refuses unknown ids', async () => {
    const env = makeEnv();
    await saveAiSettings(env, { newsModel: 'gemini-3.5-flash' });
    await saveAiSettings(env, { voiceEngine: 'cf-whisper' });
    expect(await loadAiSettings(env)).toEqual({ voiceEngine: 'cf-whisper', newsModel: 'gemini-3.5-flash', newsDailyCalls: 600 });
    await expect(saveAiSettings(env, { newsModel: 'nope' })).rejects.toThrow();
    await expect(saveAiSettings(env, { voiceEngine: 'nope' })).rejects.toThrow();
  });
});

describe('the news daily limit', () => {
  it('can be raised by the admin within bounds, and a bad value is refused', async () => {
    const env = makeEnv();
    await saveAiSettings(env, { newsDailyCalls: 1500 });
    expect((await loadAiSettings(env)).newsDailyCalls).toBe(1500);
    for (const bad of [10, 5000, 2.5, 'abc']) await expect(saveAiSettings(env, { newsDailyCalls: bad })).rejects.toThrow();
    expect((await loadAiSettings(env)).newsDailyCalls).toBe(1500);
  });
});

describe('the news model', () => {
  it('asks Workers AI by default', async () => {
    const env = makeEnv();
    const model = await resolveNewsModel(env, NEWS_AI_MODEL);
    expect(model).toMatchObject({ kind: 'workers', available: true });
    expect(await model.ask(messages, { maxTokens: 100 })).toBe('glm');
    expect(env.AI.run).toHaveBeenCalledTimes(1);
  });

  it('falls back to the next model when the chosen one is retired', async () => {
    const env = makeEnv();
    env.AI.run = vi.fn(async (id) => {
      if (id === '@cf/zai-org/glm-5.3') throw new Error('5028: deprecated');
      return { response: 'gemma' };
    });
    const model = await resolveNewsModel(env, NEWS_AI_MODEL);
    expect(await model.ask(messages, { maxTokens: 100 })).toBe('gemma');
    expect(model.used()).toBe('@cf/google/gemma-4-26b-a4b-it');
    // Models that don't reason are not sent reasoning_effort
    expect(env.AI.run.mock.calls[1][1].reasoning_effort).toBeUndefined();
  });

  it('asks the Gemini model the admin chose, with the system and user text', async () => {
    const env = makeEnv();
    await saveAiSettings(env, { newsModel: 'gemini-3.5-flash-lite' });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '[1]' }] } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const model = await resolveNewsModel(env, NEWS_AI_MODEL);
    expect(model).toMatchObject({ kind: 'gemini', available: true });
    expect(await model.ask(messages, { maxTokens: 500, temperature: 0 })).toBe('[1]');
    expect(fetchMock.mock.calls[0][0]).toContain('gemini-3.5-flash-lite');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.systemInstruction.parts[0].text).toBe('sys');
    expect(body.contents[0].parts).toEqual([{ text: 'usr' }]);
    expect(body.generationConfig.maxOutputTokens).toBe(500);
    expect(env.AI.run).not.toHaveBeenCalled();
  });

  it('skips Gemini without its key and uses Workers AI instead', async () => {
    const env = { ...makeEnv(), GEMINI_API_KEY: '' };
    await saveAiSettings(env, { newsModel: 'gemini-3.5-flash' });
    const model = await resolveNewsModel(env, NEWS_AI_MODEL);
    expect(model.available).toBe(true);
    expect(model.id).toBe('@cf/zai-org/glm-5.3');
  });

  it('is unavailable with neither Gemini nor Workers AI', async () => {
    const env = { DB: memoryStateDb(), GEMINI_API_KEY: '' };
    expect((await resolveNewsModel(env, NEWS_AI_MODEL)).available).toBe(false);
  });
});

describe('/api/admin/ai-settings', () => {
  const put = (body) => new Request('https://api.realrate.ir/api/admin/ai-settings', { method: 'PUT', body: JSON.stringify(body) });

  it('is admin only', async () => {
    getAuthenticatedUser.mockResolvedValue({ id: 'u1', role: 'user' });
    await expect(handleAdminGetAiSettings(new Request('https://x/api/admin/ai-settings'), makeEnv())).rejects.toThrow();
  });

  it('gives the choice with the lists, and saves a new one', async () => {
    getAuthenticatedUser.mockResolvedValue({ id: 'a1', role: 'admin' });
    const env = makeEnv();
    const saved = await (await handleAdminSaveAiSettings(put({ newsModel: 'gemini-3.6-flash' }), env)).json();
    expect(saved).toMatchObject({ success: true, newsModel: 'gemini-3.6-flash', voiceEngine: 'auto' });
    const got = await (await handleAdminGetAiSettings(new Request('https://x/api/admin/ai-settings'), env)).json();
    expect(got.newsModel).toBe('gemini-3.6-flash');
    expect(got.voiceEngines.length).toBeGreaterThan(1);
    expect(got.newsModels[0].id).toBe('glm-5.3');
  });
});

/**
 * smsVoiceRoute.test.js — POST /api/sms/voice: admin-only while experimental, Whisper only (no language
 * model), the category read from the words, the offered actions, and the request cleaning
 */

import { memoryStateDb } from '../helpers/memoryStateDb.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/lib/auth.js', () => ({
  getAuthenticatedUser: vi.fn(),
  isUserAdmin: (email) => email === 'admin@example.com',
}));

import { getAuthenticatedUser } from '../../src/lib/auth.js';
import { handleSmsVoiceRoute } from '../../src/handlers/smsVoiceRoutes.js';
import { cleanVoiceCategories, cleanVoiceActions } from '../../src/domain/smsVoice.js';
import { isFeatureEnabled } from '../../src/config/features.js';

const ADMIN = { id: 'a1', role: 'admin', email: 'admin@example.com' };
const USER = { id: 'u1', role: 'user', email: 'user@example.com', groups: ['pro'] };
const CATEGORIES = [{ value: 'c_ship1234', label: 'ارسال و پست' }, { value: 'food', label: 'خوراک' }, { value: 'other', label: 'سایر' }];

/** The first bytes of a WebM file (EBML header), then filler */
const WEBM = new Uint8Array(200);
WEBM.set([0x1a, 0x45, 0xdf, 0xa3]);

function voiceRequest({ type = 'audio/webm;codecs=opus', bytes = WEBM, categories = CATEGORIES } = {}) {
  const form = new FormData();
  form.append('audio', new Blob([bytes], { type }), 'voice.webm');
  form.append('categories', JSON.stringify(categories));
  return new Request('https://api.realrate.ir/api/sms/voice', { method: 'POST', body: form });
}

describe('sms_voice feature', () => {
  it('is experimental: admins only, until a group is given', () => {
    expect(isFeatureEnabled('sms_voice', ADMIN)).toBe(true);
    expect(isFeatureEnabled('sms_voice', USER)).toBe(false);
  });
});


describe('cleaning the request', () => {
  it('keeps only known actions', () => {
    expect(cleanVoiceActions(['transfer', 'rm -rf', 'transfer'])).toEqual(['transfer']);
  });
  it('cleans the category list', () => {
    expect(cleanVoiceCategories([{ value: 'a', label: ' A ' }, { value: 'a', label: 'dup' }, { value: '', label: 'x' }, 5])).toEqual([{ value: 'a', label: 'A' }]);
  });
});

describe('POST /api/sms/voice', () => {
  const PROJECTS = [{ id: 'grp_1', name: 'خانه' }];
  let ai;
  let fetchMock;
  let env;
  const say = (text) => ai.mockResolvedValue({ text });

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    ai = vi.fn();
    env = { ADMIN_EMAIL: 'admin@example.com', DB: memoryStateDb(), AI: { run: ai } };
  });
  afterEach(() => vi.unstubAllGlobals());

  const ask = async (text, extra = {}, user = ADMIN) => {
    getAuthenticatedUser.mockResolvedValue(user);
    say(text);
    const request = voiceRequest(extra);
    return (await handleSmsVoiceRoute(request, env)).json();
  };

  it('hides the route from an ordinary user', async () => {
    getAuthenticatedUser.mockResolvedValue(USER);
    await expect(handleSmsVoiceRoute(voiceRequest(), env)).rejects.toMatchObject({ statusCode: 404 });
    expect(ai).not.toHaveBeenCalled();
  });

  it('transcribes with Whisper only and reads the category from the words: no language model, no Gemini', async () => {
    const body = await ask('پیتزا', { categories: [{ value: 'groceries', label: 'خوراک' }, { value: 'dining', label: 'رستوران و کافه' }, { value: 'other', label: 'سایر' }] });
    expect(body).toMatchObject({ understood: true, title: 'پیتزا', category: 'dining', engine: 'cf-whisper-turbo' });
    expect(ai).toHaveBeenCalledTimes(1);
    expect(ai.mock.calls[0][0]).toBe('@cf/openai/whisper-large-v3-turbo');
    expect(ai.mock.calls[0][1]).toMatchObject({ language: 'fa', task: 'transcribe' });
    expect(typeof ai.mock.calls[0][1].audio).toBe('string');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores the admin voice-engine setting', async () => {
    const { saveAiSettings } = await import('../../src/services/ai/aiSettings.service.js');
    await saveAiSettings(env, { voiceEngine: 'gemini-3.8-flash' });
    const body = await ask('قهوه');
    expect(body.engine).toBe('cf-whisper-turbo');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the name of a custom category before the word table', async () => {
    const body = await ask('تیپاکس', { categories: [{ value: 'c_ship1234', label: 'تیپاکس و پست' }, { value: 'running_costs', label: 'هزینه‌های جاری' }, { value: 'other', label: 'سایر' }] });
    expect(body.category).toBe('c_ship1234');
  });

  it('falls back to other for a word nobody knows, and for a category the user no longer has', async () => {
    expect((await ask('چیزی عجیب')).category).toBe('other');
    expect((await ask('پیتزا', { categories: [{ value: 'other', label: 'سایر' }] })).category).toBe('other');
  });

  it('is not understood when nothing is heard, and says what it heard to an admin', async () => {
    const body = await ask('  ');
    expect(body.understood).toBe(false);
    const heard = await ask('کافه');
    expect(heard.heard).toBe('کافه');
  });

  it('reads a deposit against the income categories', async () => {
    getAuthenticatedUser.mockResolvedValue(ADMIN);
    say('فروش لپ‌تاپ');
    const form = new FormData();
    form.append('audio', new Blob([WEBM], { type: 'audio/webm' }), 'v.webm');
    form.append('categories', JSON.stringify([{ value: 'business', label: 'کسب‌وکار' }, { value: 'asset_sale', label: 'فروش دارایی' }, { value: 'other', label: 'سایر' }]));
    form.append('kind', 'income');
    const body = await (await handleSmsVoiceRoute(new Request('https://x/api/sms/voice', { method: 'POST', body: form }), env)).json();
    expect(body).toMatchObject({ understood: true, category: 'asset_sale' });
  });

  it('answers an offered action, and a project by its name', async () => {
    getAuthenticatedUser.mockResolvedValue(ADMIN);
    const post = async (text, actions, projects = []) => {
      say(text);
      const form = new FormData();
      form.append('audio', new Blob([WEBM], { type: 'audio/webm' }), 'v.webm');
      form.append('categories', JSON.stringify(CATEGORIES));
      form.append('actions', JSON.stringify(actions));
      form.append('projects', JSON.stringify(projects));
      return (await handleSmsVoiceRoute(new Request('https://x/api/sms/voice', { method: 'POST', body: form }), env)).json();
    };
    expect(await post('انتقال بین حساب‌هام است', ['transfer', 'project'])).toMatchObject({ action: 'transfer', projectId: '' });
    expect(await post('برای پروژه خانه است', ['transfer', 'project'], PROJECTS)).toMatchObject({ action: 'project', projectId: 'grp_1' });
    // Not offered for this message: only recorded
    expect((await post('انتقال بین حساب‌هام است', ['project'])).action).toBe('');
  });

  it('does not understand a transcript in another language', async () => {
    expect((await ask('пицца')).understood).toBe(false);
  });

  it('refuses a file whose bytes are not audio of the declared type', async () => {
    getAuthenticatedUser.mockResolvedValue(ADMIN);
    await expect(handleSmsVoiceRoute(voiceRequest({ bytes: new Uint8Array(50) }), env)).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_FILE_TYPE' });
    await expect(handleSmsVoiceRoute(voiceRequest({ type: 'image/png' }), env)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('says so when Cloudflare Workers AI is not configured', async () => {
    getAuthenticatedUser.mockResolvedValue(ADMIN);
    await expect(handleSmsVoiceRoute(voiceRequest(), { ...env, AI: undefined })).rejects.toMatchObject({ statusCode: 503 });
  });
});

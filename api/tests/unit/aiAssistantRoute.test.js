/**
 * aiAssistantRoute.test.js — POST /api/ai/voice: admin-only while experimental, what is sent
 * to Gemini, and how the spoken transactions are normalized
 */

import { memoryStateDb } from '../helpers/memoryStateDb.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/lib/auth.js', () => ({
  getAuthenticatedUser: vi.fn(),
  isUserAdmin: (email) => email === 'admin@example.com',
}));

import { getAuthenticatedUser } from '../../src/lib/auth.js';
import { handleAiVoiceRoute } from '../../src/handlers/aiAssistantRoutes.js';
import { normalizeAiVoice, cleanAiAccounts } from '../../src/domain/aiAssistant.js';
import { buildAiVoicePrompt } from '../../src/services/ai/assistant.service.js';
import { isFeatureEnabled } from '../../src/config/features.js';

const ADMIN = { id: 'a1', role: 'admin', email: 'admin@example.com' };
const USER = { id: 'u1', role: 'user', email: 'user@example.com', groups: ['pro'] };
const CONTEXT = {
  expense: [{ value: 'food', label: 'خوراک' }, { value: 'other', label: 'سایر' }],
  income: [{ value: 'salary', label: 'حقوق' }, { value: 'other', label: 'سایر' }],
  accounts: [{ id: 'acc_1', name: 'ملی' }, { id: 'acc_2', name: 'نقد' }],
};
const TODAY = '2026-11-09';

const geminiReply = (obj) => new Response(
  JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }),
  { status: 200, headers: { 'Content-Type': 'application/json' } },
);
const WEBM = new Uint8Array(200);
WEBM.set([0x1a, 0x45, 0xdf, 0xa3]);

function voiceRequest({ context = CONTEXT } = {}) {
  const form = new FormData();
  form.append('audio', new Blob([WEBM], { type: 'audio/webm;codecs=opus' }), 'voice.webm');
  form.append('context', JSON.stringify(context));
  return new Request('https://api.realrate.ir/api/ai/voice', { method: 'POST', body: form });
}

describe('ai_assistant feature', () => {
  it('is experimental: admins only, until a group is given', () => {
    expect(isFeatureEnabled('ai_assistant', ADMIN)).toBe(true);
    expect(isFeatureEnabled('ai_assistant', USER)).toBe(false);
  });
});

describe('normalizeAiVoice', () => {
  const ctx = { ...CONTEXT, today: TODAY };
  it('keeps valid items and falls back for what the user does not have', () => {
    const { understood, items } = normalizeAiVoice({
      items: [
        { kind: 'expense', amount: 1000, title: 'نان', category: 'food', date: '2026-11-08', accountId: 'acc_1' },
        { kind: 'income', amount: '250,000', title: 'فروش', category: 'invented', date: 'bad', accountId: 'nope' },
      ],
    }, ctx);
    expect(understood).toBe(true);
    expect(items[0]).toEqual({ kind: 'expense', amount: 1000, title: 'نان', category: 'food', date: '2026-11-08', accountId: 'acc_1' });
    expect(items[1]).toEqual({ kind: 'income', amount: 250000, title: 'فروش', category: 'other', date: TODAY, accountId: '' });
  });
  it('uses the right list per kind, accepts names, and clamps a future day to today', () => {
    const { items } = normalizeAiVoice({ items: [{ kind: 'income', amount: 5, title: 'x', category: 'حقوق', date: '2030-01-01', accountId: 'ملی' }] }, ctx);
    expect(items[0]).toMatchObject({ category: 'salary', date: TODAY, accountId: 'acc_1' });
  });
  it('keeps an item whose amount was not understood as 0, for the user to fill in', () => {
    const { items } = normalizeAiVoice({ items: [{ kind: 'expense', amount: null, title: 'نان' }, { kind: 'expense', amount: -5, title: 'شیر' }] }, ctx);
    expect(items.map((i) => i.amount)).toEqual([0, 0]);
  });
  it('drops items without a kind or title, and is not understood when none is left', () => {
    const none = normalizeAiVoice({ items: [{ kind: 'x', amount: 5, title: 't' }, { kind: 'expense', amount: 5, title: '' }] }, ctx);
    expect(none).toEqual({ understood: false, intent: 'records', items: [] });
    expect(normalizeAiVoice('not json', ctx).understood).toBe(false);
  });
  it('reads a question: up to three cleaned sentences, no records', () => {
    const r = normalizeAiVoice({ intent: 'question', questions: [' خرج خوراک این ماه ', '', 'خرج خوراک مهر ۱۴۰۴', 'سه', 'چهار'] }, ctx);
    expect(r).toEqual({ understood: true, intent: 'question', questions: ['خرج خوراک این ماه', 'خرج خوراک مهر ۱۴۰۴', 'سه'] });
    expect(normalizeAiVoice({ intent: 'question', questions: [] }, ctx).understood).toBe(false);
    expect(normalizeAiVoice({ intent: 'question', understood: false, questions: ['x'] }, ctx).understood).toBe(false);
  });
  it('cleans the account list', () => {
    expect(cleanAiAccounts([{ id: 'a', name: ' A ' }, { id: 'a', name: 'dup' }, { id: '', name: 'x' }, 7])).toEqual([{ id: 'a', name: 'A' }]);
  });
  it('puts today, the categories and the accounts in the prompt', () => {
    const prompt = buildAiVoicePrompt({ ...CONTEXT, today: TODAY });
    expect(prompt).toContain(TODAY);
    expect(prompt).toContain('salary: حقوق');
    expect(prompt).toContain('acc_2: نقد');
    expect(prompt).toContain('question');
    expect(prompt).toContain('آبان'); // today's Shamsi month, for «last year's same month»
  });
});

describe('POST /api/ai/voice', () => {
  let env;
  let fetchMock;
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn(async () => geminiReply({ understood: true, items: [{ kind: 'expense', amount: 1000, title: 'نان', category: 'food', date: TODAY, accountId: 'acc_2' }] }));
    vi.stubGlobal('fetch', fetchMock);
    env = { ADMIN_EMAIL: 'admin@example.com', GEMINI_API_KEY: 'gkey', DB: memoryStateDb() };
  });
  afterEach(() => vi.unstubAllGlobals());

  it('hides the route from an ordinary user', async () => {
    getAuthenticatedUser.mockResolvedValue(USER);
    await expect(handleAiVoiceRoute(voiceRequest(), env)).rejects.toMatchObject({ statusCode: 404 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the clip with the user lists and returns the items', async () => {
    getAuthenticatedUser.mockResolvedValue(ADMIN);
    const body = await (await handleAiVoiceRoute(voiceRequest(), env)).json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ kind: 'expense', amount: 1000, category: 'food', accountId: 'acc_2' });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.contents[0].parts[0].inlineData.mimeType).toBe('audio/webm');
    expect(sent.systemInstruction.parts[0].text).toContain('acc_1: ملی');
  });

  it('refuses a malformed context', async () => {
    getAuthenticatedUser.mockResolvedValue(ADMIN);
    const form = new FormData();
    form.append('audio', new Blob([WEBM], { type: 'audio/webm' }), 'v.webm');
    form.append('context', '{oops');
    await expect(handleAiVoiceRoute(new Request('https://x/api/ai/voice', { method: 'POST', body: form }), env)).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('normalizeAiVoice: edit', () => {
  const ctx = { ...CONTEXT, today: TODAY };
  it('reads the last record and its change', () => {
    const r = normalizeAiVoice({ intent: 'edit', op: 'update', kind: 'expense', target: { which: 'last' }, changes: { amount: '300,000', category: 'خوراک', accountId: 'نقد', date: '2030-01-01' } }, ctx);
    expect(r).toEqual({ understood: true, intent: 'edit', op: 'update', kind: 'expense', target: { which: 'last', text: '', date: '' }, changes: { amount: 300000, category: 'food', accountId: 'acc_2' } });
  });
  it('finds by word and day, and deletes without changes', () => {
    const r = normalizeAiVoice({ intent: 'edit', op: 'delete', kind: 'expense', target: { which: 'search', text: ' تیپاکس ', date: '2026-11-08' }, changes: { amount: 5 } }, ctx);
    expect(r).toMatchObject({ understood: true, op: 'delete', target: { which: 'search', text: 'تیپاکس', date: '2026-11-08' }, changes: {} });
  });
  it('is not understood without a target or without a change', () => {
    expect(normalizeAiVoice({ intent: 'edit', op: 'delete', target: { which: 'search' } }, ctx).understood).toBe(false);
    expect(normalizeAiVoice({ intent: 'edit', op: 'update', target: { which: 'last' }, changes: { amount: 0 } }, ctx).understood).toBe(false);
  });
});

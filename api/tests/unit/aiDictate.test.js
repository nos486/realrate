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

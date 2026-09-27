/**
 * authLookupOnce.test.js — the router gates and the handler share one session lookup per request
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/repositories/session.repository.js', () => ({
  dbGetSession: vi.fn(async (_env, token) => (token === 'good' ? { userId: 'u1', email: 'u@example.com', kind: '' } : null)),
}));

import { dbGetSession } from '../../src/repositories/session.repository.js';
import { getAuthenticatedUser } from '../../src/lib/auth.js';

const withToken = (token) => new Request('https://api.realrate.ir/api/portfolios', { headers: { Authorization: `Bearer ${token}` } });

describe('getAuthenticatedUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the session once for any number of callers on the same request', async () => {
    const request = withToken('good');
    const [a, b] = await Promise.all([getAuthenticatedUser(request, {}), getAuthenticatedUser(request, {})]);
    const c = await getAuthenticatedUser(request, {});
    expect(dbGetSession).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(c).toMatchObject({ userId: 'u1', role: 'user' });
  });

  it('looks each request up on its own', async () => {
    await getAuthenticatedUser(withToken('good'), {});
    expect(await getAuthenticatedUser(withToken('bad'), {})).toBeNull();
    expect(dbGetSession).toHaveBeenCalledTimes(2);
  });
});

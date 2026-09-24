import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/repositories/index.js', () => ({
  dbGetPortfolioByShareSlug: vi.fn(),
  dbGetPortfolioHoldings: vi.fn(),
  dbGetTransactionsByPortfolio: vi.fn(),
  dbGetPortfolioById: vi.fn(),
  dbUpdatePortfolio: vi.fn(),
}));

import {
  dbGetPortfolioByShareSlug,
  dbGetPortfolioHoldings,
  dbGetTransactionsByPortfolio,
  dbGetPortfolioById,
  dbUpdatePortfolio,
} from '../../src/repositories/index.js';
import {
  isTrustedOrigin,
  hashSharePassword,
  verifySharePassword,
  isHashedSharePassword,
} from '../../src/lib/security.js';
import { getCorsHeaders } from '../../src/lib/helpers.js';
import { buildFrontendRedirect } from '../../src/handlers/authRoutes.js';
import { handleGetSharedPortfolio } from '../../src/handlers/portfolioRoutes.js';
import { dbAddPortfolioHolding } from '../../src/repositories/holdings.repository.js';
import worker from '../../src/index.js';

function createMemoryKv() {
  const store = new Map();
  return {
    store,
    get: vi.fn(async (k) => (store.has(k) ? store.get(k) : null)),
    put: vi.fn(async (k, v) => { store.set(k, v); }),
    delete: vi.fn(async (k) => { store.delete(k); }),
  };
}

describe('isTrustedOrigin', () => {
  it('accepts our own domains and their subdomains over https', () => {
    expect(isTrustedOrigin('https://realrate.ir')).toBe(true);
    expect(isTrustedOrigin('https://www.realrate.ir')).toBe(true);
    expect(isTrustedOrigin('https://realrate.geekio.org')).toBe(true);
    expect(isTrustedOrigin('https://realrate.pages.dev')).toBe(true);
    expect(isTrustedOrigin('https://abc123.realrate.pages.dev')).toBe(true);
    expect(isTrustedOrigin('http://localhost:5173')).toBe(true);
  });

  it('rejects look-alike and third-party hosts', () => {
    expect(isTrustedOrigin('https://evil.pages.dev')).toBe(false);
    expect(isTrustedOrigin('https://evilrealrate.ir')).toBe(false);
    expect(isTrustedOrigin('https://evilgeekio.org')).toBe(false);
    expect(isTrustedOrigin('https://realrate.ir.evil.com')).toBe(false);
    expect(isTrustedOrigin('http://realrate.ir')).toBe(false);
    expect(isTrustedOrigin('not a url')).toBe(false);
  });
});

describe('CORS', () => {
  it('reflects only trusted origins', () => {
    expect(getCorsHeaders('https://www.realrate.ir')['Access-Control-Allow-Origin']).toBe('https://www.realrate.ir');
    expect(getCorsHeaders('https://evil.pages.dev')['Access-Control-Allow-Origin']).not.toBe('https://evil.pages.dev');
    expect(getCorsHeaders('https://evilrealrate.ir')['Access-Control-Allow-Origin']).not.toBe('https://evilrealrate.ir');
  });
});

describe('buildFrontendRedirect (OAuth token redirect)', () => {
  const base = 'https://realrate.ir';

  it('keeps trusted targets', () => {
    const url = new URL(buildFrontendRedirect(base, 'https://realrate.ir/loans', { auth_token: 't' }));
    expect(url.origin).toBe('https://realrate.ir');
    expect(url.pathname).toBe('/loans');
    expect(url.searchParams.get('auth_token')).toBe('t');
  });

  it.each([
    'https://evil.pages.dev/',
    'https://evilrealrate.ir/',
    '//evil.pages.dev/steal',
    '/\\evil.pages.dev',
  ])('never sends the token off-site for return_to=%s', (target) => {
    const url = new URL(buildFrontendRedirect(base, target, { auth_token: 't' }));
    expect(isTrustedOrigin(url.origin)).toBe(true);
  });

  it('ignores an untrusted frontend origin from the (unsigned) state', () => {
    const url = new URL(buildFrontendRedirect('https://evil.pages.dev', '/', { auth_token: 't' }));
    expect(url.origin).toBe('https://realrate.geekio.org');
  });
});

describe('share password hashing', () => {
  it('hashes and verifies', async () => {
    const hashed = await hashSharePassword('  s3cret ');
    expect(isHashedSharePassword(hashed)).toBe(true);
    expect(hashed).not.toContain('s3cret');
    expect(await verifySharePassword('s3cret', hashed)).toBe(true);
    expect(await verifySharePassword('wrong', hashed)).toBe(false);
  });

  it('still verifies legacy plaintext values', async () => {
    expect(await verifySharePassword('legacy', 'legacy')).toBe(true);
    expect(await verifySharePassword('nope', 'legacy')).toBe(false);
  });

  it('empty password means no password', async () => {
    expect(await hashSharePassword('   ')).toBe('');
    expect(await verifySharePassword('', '')).toBe(false);
  });
});

describe('handleGetSharedPortfolio password protection', () => {
  let env;

  beforeEach(async () => {
    vi.clearAllMocks();
    env = { REALRATE_KV: createMemoryKv() };
    dbGetPortfolioByShareSlug.mockResolvedValue({
      id: 'p1',
      userId: 'u1',
      name: 'محافظت‌شده',
      shareSlug: 'abc123',
      shareEnabled: true,
      sharePassword: await hashSharePassword('secret'),
      isE2ee: false,
    });
    dbGetPortfolioHoldings.mockResolvedValue([{ id: 'h1', assetId: 'gold_18k', amount: 1 }]);
    dbGetTransactionsByPortfolio.mockResolvedValue([]);
  });

  const post = (body) => new Request('https://api.realrate.ir/api/portfolio/shared', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
    body: JSON.stringify(body),
  });

  it('ignores a password passed in the query string', async () => {
    const req = new Request('https://api.realrate.ir/api/portfolio/shared?slug=abc123&password=secret');
    const body = await (await handleGetSharedPortfolio(req, env)).json();
    expect(body.requirePassword).toBe(true);
    expect(body.holdings).toBeUndefined();
  });

  it('unlocks with the right password and never echoes the stored hash', async () => {
    const res = await handleGetSharedPortfolio(post({ slug: 'abc123', password: 'secret' }), env);
    const text = await res.text();
    expect(JSON.parse(text).success).toBe(true);
    expect(text).not.toContain('pbkdf2$');
  });

  it('rate-limits repeated wrong passwords', async () => {
    for (let i = 0; i < 10; i++) {
      const body = await (await handleGetSharedPortfolio(post({ slug: 'abc123', password: 'bad' }), env)).json();
      expect(body.requirePassword).toBe(true);
    }
    await expect(handleGetSharedPortfolio(post({ slug: 'abc123', password: 'secret' }), env))
      .rejects.toMatchObject({ statusCode: 429 });
  });

  it('upgrades a legacy plaintext password to a hash after a successful unlock', async () => {
    dbGetPortfolioByShareSlug.mockResolvedValue({
      id: 'p1', userId: 'u1', shareSlug: 'abc123', shareEnabled: true, sharePassword: 'legacy',
    });
    dbGetPortfolioById.mockResolvedValue({ id: 'p1', shareSlug: 'abc123' });

    const body = await (await handleGetSharedPortfolio(post({ slug: 'abc123', password: 'legacy' }), env)).json();
    expect(body.success).toBe(true);
    expect(dbUpdatePortfolio).toHaveBeenCalledTimes(1);
    const saved = dbUpdatePortfolio.mock.calls[0][3].sharePassword;
    expect(isHashedSharePassword(saved)).toBe(true);
  });
});

describe('dbAddPortfolioHolding ownership', () => {
  function createDb(changes) {
    const run = vi.fn(async () => ({ meta: { changes } }));
    return {
      prepare: vi.fn(() => ({ bind: vi.fn(() => ({ run, first: vi.fn(async () => null), all: vi.fn(async () => ({ results: [] })) })) })),
      batch: vi.fn(async () => []),
      exec: vi.fn(async () => ({})),
      run,
    };
  }

  it('only updates an existing holding owned by the same user', async () => {
    const DB = createDb(1);
    await dbAddPortfolioHolding({ DB }, { id: 'h1', userId: 'u1', portfolioId: 'p1', assetId: 'gold_18k', amount: 1 });
    const sql = DB.prepare.mock.calls.map((c) => c[0]).find((q) => q.includes('INSERT INTO portfolio_holdings'));
    expect(sql).toMatch(/WHERE portfolio_holdings\.user_id = excluded\.user_id/);
  });

  it("rejects writing to another user's holding id", async () => {
    const DB = createDb(0);
    await expect(
      dbAddPortfolioHolding({ DB }, { id: 'victim_h', userId: 'attacker', portfolioId: 'p9', assetId: 'gold_18k', amount: 1 })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('admin-only upstream sync endpoints', () => {
  it.each([
    ['POST', '/api/bourse/sync'],
    ['POST', '/api/funds/sync'],
    ['GET', '/api/bourse/symbols?force=true'],
    ['GET', '/api/telegram?force=true'],
  ])('%s %s is forbidden for anonymous callers', async (method, path) => {
    const res = await worker.fetch(new Request(`https://api.realrate.ir${path}`, { method }), {}, {});
    expect(res.status).toBe(403);
  });
});

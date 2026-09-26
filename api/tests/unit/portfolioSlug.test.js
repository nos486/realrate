import { describe, it, expect } from 'vitest';
import { dbUpdatePortfolio } from '../../src/repositories/portfolio.repository.js';

/** D1 stub: the slug lookup finds `takenBy`; any UPDATE of a portfolio is recorded */
function envWithSlugOwner(takenBy) {
  const updates = [];
  const DB = {
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...a) { args = a; return stmt; },
        async run() {
          if (/^\s*UPDATE\s+portfolios\b/.test(sql)) updates.push(args);
          return { meta: { changes: 1 } };
        },
        async first() {
          return /FROM portfolios WHERE LOWER\(share_slug\)/.test(sql) && takenBy ? { id: takenBy } : null;
        },
        async all() { return { results: [] }; },
      };
      return stmt;
    },
  };
  return { env: { DB }, updates };
}

describe('portfolio share link', () => {
  it('answers 409 (not a 500) when the link belongs to another portfolio, and changes nothing', async () => {
    const { env, updates } = envWithSlugOwner('p_other');
    await expect(dbUpdatePortfolio(env, 'p_mine', 'u1', { shareSlug: 'plainslug' }))
      .rejects.toMatchObject({ statusCode: 409, code: 'SLUG_TAKEN' });
    expect(updates).toHaveLength(0);
  });

  it('answers 400 for a link that is too short', async () => {
    const { env } = envWithSlugOwner(null);
    await expect(dbUpdatePortfolio(env, 'p_mine', 'u1', { shareSlug: '!' }))
      .rejects.toMatchObject({ statusCode: 400 });
  });
});

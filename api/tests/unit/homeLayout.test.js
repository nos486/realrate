import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sanitizeHomeLayout, HOME_LAYOUT_LIMITS } from '../../src/domain/homeLayout.js';

vi.mock('../../src/lib/auth.js', () => ({ getAuthenticatedUser: vi.fn() }));
const { getAuthenticatedUser } = await import('../../src/lib/auth.js');
const { handleGetHomeLayout, handleSaveHomeLayout } = await import('../../src/handlers/homeLayoutRoutes.js');

describe('sanitizeHomeLayout', () => {
  it('keeps a valid layout as is', () => {
    const layout = {
      version: 1,
      sections: [
        { id: 's_gold', title: 'طلا و سکه', style: 'detailed', items: ['gold_18k', 'full_coin'] },
        { id: 's_fx', title: 'ارزها', style: 'compact', items: ['USD', 'EUR'] },
      ],
    };
    expect(sanitizeHomeLayout(layout)).toEqual(layout);
  });

  it('rejects non-layouts and repairs malformed parts', () => {
    expect(sanitizeHomeLayout(null)).toBeNull();
    expect(sanitizeHomeLayout({ sections: 'x' })).toBeNull();
    const out = sanitizeHomeLayout({
      sections: [
        { id: 'bad id!', title: 'x'.repeat(100), style: 'weird', items: ['USD', 'USD', '', 42, 'a'.repeat(500)] },
        'not a section',
        { id: 's_2', items: 'nope' },
        { id: 's_2', title: 'dup id', style: 'detailed' },
      ],
    });
    expect(out.sections).toHaveLength(3);
    expect(out.sections[0]).toMatchObject({ style: 'compact', items: ['USD', '42'] });
    expect(out.sections[0].id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(out.sections[0].title).toHaveLength(HOME_LAYOUT_LIMITS.titleLength);
    expect(out.sections[1]).toMatchObject({ id: 's_2', items: [] });
    expect(out.sections[2].id).not.toBe('s_2');
  });

  it('caps the number of sections and items', () => {
    const many = sanitizeHomeLayout({
      sections: Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, style: 'compact', items: Array.from({ length: 200 }, (_, j) => `a${j}`) })),
    });
    expect(many.sections).toHaveLength(HOME_LAYOUT_LIMITS.sections);
    expect(many.sections[0].items).toHaveLength(HOME_LAYOUT_LIMITS.itemsPerSection);
  });
});

describe('home layout routes', () => {
  let stored;
  const env = {
    DB: {
      prepare(sql) {
        let args = [];
        const stmt = {
          bind(...a) { args = a; return stmt; },
          async run() {
            if (sql.startsWith('UPDATE users SET home_layout')) stored = args[0];
            return { meta: {} };
          },
          async first() { return sql.includes('home_layout AS homeLayout') ? { homeLayout: stored } : null; },
          async all() { return { results: [] }; },
        };
        return stmt;
      },
    },
  };
  const put = (body) => new Request('https://api.realrate.ir/api/user/home-layout', { method: 'PUT', body: typeof body === 'string' ? body : JSON.stringify(body) });

  beforeEach(() => {
    stored = '';
    getAuthenticatedUser.mockResolvedValue({ userId: 'u1' });
  });

  it('requires a signed-in user', async () => {
    getAuthenticatedUser.mockResolvedValue(null);
    await expect(handleGetHomeLayout(new Request('https://x/api/user/home-layout'), env)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('saves a sanitized layout, reads it back, and resets with null', async () => {
    const res = await handleSaveHomeLayout(put({ layout: { sections: [{ id: 's1', title: 'بورس', style: 'compact', items: ['a', 'a', 'b'] }] } }), env);
    expect((await res.json()).layout.sections[0].items).toEqual(['a', 'b']);
    const got = await (await handleGetHomeLayout(new Request('https://x'), env)).json();
    expect(got.layout.sections[0].title).toBe('بورس');

    await handleSaveHomeLayout(put({ layout: null }), env);
    expect(stored).toBe('');
    expect((await (await handleGetHomeLayout(new Request('https://x'), env)).json()).layout).toBeNull();
  });

  it('rejects invalid or oversized input', async () => {
    await expect(handleSaveHomeLayout(put('{bad json'), env)).rejects.toMatchObject({ statusCode: 400 });
    await expect(handleSaveHomeLayout(put({ layout: { sections: 5 } }), env)).rejects.toMatchObject({ statusCode: 400 });
    await expect(handleSaveHomeLayout(put({ layout: { sections: [], pad: 'x'.repeat(40000) } }), env)).rejects.toMatchObject({ statusCode: 400 });
  });
});

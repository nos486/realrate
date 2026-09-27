import { describe, it, expect } from 'vitest';
import {
  sanitizePortfolioLayout,
  PORTFOLIO_LAYOUT_VERSION,
  PORTFOLIO_LAYOUT_LIMITS,
} from '../../src/domain/portfolioLayout.js';
import {
  VAULT_RECORD_KINDS,
  PORTFOLIO_ITEM_KINDS,
} from '../../src/repositories/vault.repository.js';

describe('portfolioLayout domain & vault repository', () => {
  it('vault repository includes portfolio_layout in VAULT_RECORD_KINDS and PORTFOLIO_ITEM_KINDS', () => {
    expect(VAULT_RECORD_KINDS).toContain('portfolio_layout');
    expect(PORTFOLIO_ITEM_KINDS).toContain('portfolio_layout');
  });

  it('sanitizePortfolioLayout returns null on invalid or non-object inputs', () => {
    expect(sanitizePortfolioLayout(null)).toBeNull();
    expect(sanitizePortfolioLayout(undefined)).toBeNull();
    expect(sanitizePortfolioLayout('invalid')).toBeNull();
    expect(sanitizePortfolioLayout({})).toBeNull();
    expect(sanitizePortfolioLayout({ groups: 'not-an-array' })).toBeNull();
  });

  it('normalizes valid groups and trims titles', () => {
    const input = {
      version: 1,
      groups: [
        { id: 'g_gold', title: '  طلا و سکه  ', icon: 'gold', items: ['gold_18k', 'full_coin'] },
        { id: 'g_fx', title: 'ارزها', icon: 'currency', items: ['usd', 'eur'] },
      ],
    };
    const sanitized = sanitizePortfolioLayout(input);
    expect(sanitized).toEqual({
      version: PORTFOLIO_LAYOUT_VERSION,
      groups: [
        { id: 'g_gold', title: 'طلا و سکه', icon: 'gold', items: ['gold_18k', 'full_coin'] },
        { id: 'g_fx', title: 'ارزها', icon: 'currency', items: ['usd', 'eur'] },
      ],
    });
  });

  it('deduplicates group IDs and assigns fallbacks for invalid IDs', () => {
    const input = {
      groups: [
        { id: 'duplicate_id', title: 'گروه اول', items: ['usd'] },
        { id: 'duplicate_id', title: 'گروه دوم', items: ['eur'] },
        { id: 'invalid id with spaces!', title: 'گروه سوم', items: ['tether'] },
      ],
    };
    const sanitized = sanitizePortfolioLayout(input);
    expect(sanitized.groups).toHaveLength(3);
    const ids = sanitized.groups.map((g) => g.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe('duplicate_id');
    expect(ids[1]).toMatch(/^g_2_/);
    expect(ids[2]).toMatch(/^g_3_/);
  });

  it('ensures each assetKey appears in at most one group', () => {
    const input = {
      groups: [
        { id: 'g_1', title: 'دسته اول', items: ['usd', 'eur', 'usd'] },
        { id: 'g_2', title: 'دسته دوم', items: ['usd', 'gold_18k'] },
      ],
    };
    const sanitized = sanitizePortfolioLayout(input);
    expect(sanitized.groups[0].items).toEqual(['usd', 'eur']);
    // usd was already claimed by group 1, so group 2 only gets gold_18k
    expect(sanitized.groups[1].items).toEqual(['gold_18k']);
  });

  it('falls back to custom icon when an invalid icon is passed', () => {
    const input = {
      groups: [
        { id: 'g_1', title: 'دسته', icon: 'unknown_icon_3847', items: [] },
      ],
    };
    const sanitized = sanitizePortfolioLayout(input);
    expect(sanitized.groups[0].icon).toBe('custom');
  });

  it('respects limits on groups, items per group, and title length', () => {
    const longTitle = 'a'.repeat(100);
    const manyGroups = Array.from({ length: PORTFOLIO_LAYOUT_LIMITS.groups + 10 }, (_, i) => ({
      id: `g_${i}`,
      title: `Group ${i}`,
      items: [],
    }));
    const manyItems = Array.from({ length: PORTFOLIO_LAYOUT_LIMITS.itemsPerGroup + 20 }, (_, i) => `asset_${i}`);

    const sanitized = sanitizePortfolioLayout({
      groups: [
        { id: 'g_main', title: longTitle, items: manyItems },
        ...manyGroups,
      ],
    });

    expect(sanitized.groups.length).toBe(PORTFOLIO_LAYOUT_LIMITS.groups);
    expect(sanitized.groups[0].title.length).toBe(PORTFOLIO_LAYOUT_LIMITS.titleLength);
    expect(sanitized.groups[0].items.length).toBe(PORTFOLIO_LAYOUT_LIMITS.itemsPerGroup);
  });
});

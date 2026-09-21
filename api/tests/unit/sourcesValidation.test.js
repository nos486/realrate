import { describe, it, test, expect } from 'vitest';
import { PRICE_SOURCES_CONFIG } from '../../src/config/sources.config.js';
import { CATEGORY_MAP, CATEGORIES_CONFIG } from '../../src/config/categories.config.js';
import { getAdapterForSource } from '../../src/services/market/sources/index.js';

describe('Master Sources Configuration & Schema Validation Tests (CI / Integrity)', () => {
  test('all sources have non-empty unique IDs and names', () => {
    expect(PRICE_SOURCES_CONFIG.length).toBeGreaterThan(0);
    const seenIds = new Set();

    for (const source of PRICE_SOURCES_CONFIG) {
      expect(source.id, `Source missing id`).toBeDefined();
      expect(typeof source.id).toBe('string');
      expect(source.id.trim().length).toBeGreaterThan(0);

      expect(seenIds.has(source.id), `Duplicate source ID detected: ${source.id}`).toBe(false);
      seenIds.add(source.id);

      expect(source.name, `Source ${source.id} missing name`).toBeDefined();
      expect(typeof source.name).toBe('string');
      expect(source.name.trim().length).toBeGreaterThan(0);
    }
  });

  test('every source has exactly one valid category defined in CATEGORY_MAP', () => {
    const validCategoryKeys = new Set(Object.keys(CATEGORY_MAP));
    expect(validCategoryKeys.size).toBeGreaterThan(0);

    for (const source of PRICE_SOURCES_CONFIG) {
      // Must have category
      expect(
        source.category,
        `Source ${source.id} must define a category`
      ).toBeDefined();

      // Must be a string (exactly one, not array or object)
      expect(
        typeof source.category,
        `Source ${source.id} category must be a string`
      ).toBe('string');
      expect(
        source.category.trim().length,
        `Source ${source.id} category must not be empty`
      ).toBeGreaterThan(0);

      // Must exist in CATEGORY_MAP
      expect(
        validCategoryKeys.has(source.category),
        `Source ${source.id} has invalid category "${source.category}". Allowed categories: ${Array.from(validCategoryKeys).join(', ')}`
      ).toBe(true);
    }
  });

  test('every source has exactly one valid unit (non-empty string)', () => {
    for (const source of PRICE_SOURCES_CONFIG) {
      // Must have unit
      expect(
        source.unit,
        `Source ${source.id} must define a unit`
      ).toBeDefined();

      // Must be a string (exactly one, not array or object)
      expect(
        typeof source.unit,
        `Source ${source.id} unit must be a string`
      ).toBe('string');
      expect(
        source.unit.trim().length,
        `Source ${source.id} unit must not be empty`
      ).toBeGreaterThan(0);
    }
  });

  test('no source directly defines a badge property (badge must derive strictly from category)', () => {
    for (const source of PRICE_SOURCES_CONFIG) {
      expect(
        source.badge,
        `Source ${source.id} defines a "badge" field (${source.badge}). Badge must be removed and derived strictly from category.badge in categories.config.js to prevent drift.`
      ).toBeUndefined();
    }
  });

  test('every category in CATEGORIES_CONFIG defines a non-empty badge', () => {
    for (const cat of CATEGORIES_CONFIG) {
      expect(cat.badge, `Category ${cat.key} missing badge`).toBeDefined();
      expect(typeof cat.badge).toBe('string');
      expect(cat.badge.trim().length).toBeGreaterThan(0);
    }
  });

  test('every configured source maps to an active adapter', () => {
    for (const source of PRICE_SOURCES_CONFIG) {
      const adapter = getAdapterForSource(source);
      expect(adapter, `Source ${source.id} could not be resolved to any adapter`).toBeDefined();
      expect(typeof adapter.id).toBe('string');
      expect(typeof adapter.supports).toBe('function');
      expect(typeof adapter.fetchRaw).toBe('function');
      expect(typeof adapter.parse).toBe('function');
    }
  });
});

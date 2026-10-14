/**
 * catalogI18n.test.js — Every Persian name, unit, badge and label the shared data files show on screen
 * has an English entry in web/src/i18n/en/catalog.js, and the display helpers use them
 *
 * The data files (config/*.js, domain/specs/*.js) stay Persian because the Worker shares them; the
 * web translates at display time (displayEngine.js, specs/registry.js, shared/banks, the price-book
 * assets). This test walks the data, so a new asset, unit, category, source or bank without an
 * English name fails here instead of showing Persian in the English UI.
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { registerMessages, setActiveLocale } from '../../src/domain/i18n.js';
import { DICTIONARY_DIR } from '../../../web/scripts/i18n-scan.mjs';
import catalog from '../../../web/src/i18n/en/catalog.js';
import { CATEGORIES_CONFIG } from '../../src/config/categories.config.js';
import { PRICE_SOURCES_CONFIG } from '../../src/config/sources.config.js';
import { BANKS, BANK_TYPES } from '../../src/config/banks.config.js';
import { TGJU_CATALOG } from '../../src/config/tgjuCatalog.js';
import { USAGE_LIMITS, USER_TIERS } from '../../src/config/usageLimits.js';
import { FEATURES } from '../../src/config/features.js';
import { PLAN_LIMITS, PLAN_COMPARISON } from '../../src/config/planLimits.js';
import { NEWS_CATEGORIES } from '../../src/config/news.config.js';
import { CANONICAL_ASSET_REGISTRY } from '../../src/domain/specs/registry.js';
import { getItemBaseName, getItemBadge, getItemDisplayName, getItemUnit, getSourceBrand } from '../../src/domain/displayEngine.js';
import { resolveBank, getBankGroups } from '../../../web/src/shared/banks/resolveBank.js';
import { toAsset } from '../../../web/src/features/market/priceBookAssets.js';

const PERSIAN = /[؀-ۿ]/;
const SHORT_NAME_KEY = 'بانک · ';

// Every English dictionary together, as the app loads them
const dictionary = {};
for (const file of fs.readdirSync(DICTIONARY_DIR).filter((f) => f.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(DICTIONARY_DIR, file), 'utf8');
  Object.assign(dictionary, new Function(src.replace(/^[\s\S]*?export default/, 'return'))());
}

/** Persian texts a data file shows, as `where: text` for readable failures */
function displayedTexts() {
  const out = [];
  const add = (where, text) => {
    if (typeof text === 'string' && PERSIAN.test(text)) out.push([where, text]);
  };
  for (const c of CATEGORIES_CONFIG) {
    add(`category ${c.key} name`, c.name);
    add(`category ${c.key} badge`, c.badge);
  }
  for (const spec of new Set(Object.values(CANONICAL_ASSET_REGISTRY))) {
    for (const field of ['name', 'unit', 'badge']) add(`spec ${spec.id} ${field}`, spec[field]);
  }
  for (const s of PRICE_SOURCES_CONFIG) {
    for (const field of ['name', 'brand', 'unit', 'referenceLabel', 'referenceShortLabel']) add(`source ${s.id} ${field}`, s[field]);
    for (const series of s.series || []) add(`source ${s.id} series ${series.id}`, series.name);
    for (const [key, known] of Object.entries(s.knownItems || {})) {
      add(`source ${s.id} item ${key} name`, known.name);
      add(`source ${s.id} item ${key} unit`, known.unit);
    }
  }
  for (const [type, label] of Object.entries(BANK_TYPES)) add(`bank type ${type}`, label);
  for (const entry of TGJU_CATALOG) {
    add(`tgju ${entry.slug} label`, entry.label);
    add(`tgju ${entry.slug} group`, entry.group);
  }
  for (const [key, limit] of Object.entries(USAGE_LIMITS)) {
    add(`usage ${key} label`, limit.label);
    add(`usage ${key} unit`, limit.unit);
  }
  for (const [key, tier] of Object.entries(USER_TIERS)) add(`tier ${key}`, tier.label);
  for (const [key, feature] of Object.entries(FEATURES)) {
    add(`feature ${key} label`, feature.label);
    add(`feature ${key} description`, feature.description);
  }
  for (const [key, limit] of Object.entries(PLAN_LIMITS)) add(`plan limit ${key}`, limit.label);
  // The rows with a number in them are built by template (not a fixed text) and are translated where shown
  for (const row of PLAN_COMPARISON) {
    add('plan comparison label', row.label);
    for (const side of ['free', 'pro']) if (!/\d/.test(row[side])) add(`plan comparison ${side}`, row[side]);
  }
  for (const [key, label] of Object.entries(NEWS_CATEGORIES)) add(`news category ${key}`, label);
  return out;
}

describe('English catalog', () => {
  it('has an entry for every displayed name, unit, badge and label', () => {
    const missing = displayedTexts().filter(([, text]) => !dictionary[text]).map(([where, text]) => `${where}: ${text}`);
    expect(missing).toEqual([]);
  });

  it('names every bank in full and by its short name', () => {
    const missing = [];
    for (const bank of BANKS) {
      if (PERSIAN.test(bank.name) && dictionary[bank.name] !== bank.enName && bank.name !== 'بانک دی') missing.push(`${bank.id} name`);
      if (PERSIAN.test(bank.shortName) && !dictionary[SHORT_NAME_KEY + bank.shortName]) missing.push(`${bank.id} short name`);
    }
    expect(missing).toEqual([]);
  });

  it('is well formed: no Persian in a value, no dictionary key shadowed by another file with a different text', () => {
    expect(Object.entries(catalog).filter(([, value]) => PERSIAN.test(value)).map(([key]) => key)).toEqual([]);
    const shadowed = [];
    for (const file of fs.readdirSync(DICTIONARY_DIR).filter((f) => f.endsWith('.js') && f !== 'catalog.js')) {
      const other = new Function(fs.readFileSync(path.join(DICTIONARY_DIR, file), 'utf8').replace(/^[\s\S]*?export default/, 'return'))();
      for (const [key, value] of Object.entries(other)) if (key in catalog && catalog[key] !== value) shadowed.push(`${file}: ${key}`);
    }
    expect(shadowed).toEqual([]);
  });
});

describe('English display helpers', () => {
  beforeAll(() => registerMessages('en', catalog));
  afterEach(() => setActiveLocale('fa'));
  afterAll(() => setActiveLocale('fa'));

  it('keep the Persian output unchanged in Persian', () => {
    expect(getItemBaseName('gold_18k')).toBe('طلای ۱۸ عیار');
    expect(getItemUnit('gold_18k')).toBe('گرم');
    expect(getItemBadge('gold_18k')).toBe('طلا');
    expect(getItemDisplayName('src_def_emofid__اهرم')).toContain('(مفید)');
    expect(resolveBank({ bankId: 'melli' }).shortName).toBe('ملی');
    expect(getBankGroups()[0].label).toBe('بانک‌های دولتی');
  });

  it('translate names, units, badges, brands and banks in English', () => {
    setActiveLocale('en');
    expect(getItemBaseName('gold_18k')).toBe('18k gold');
    expect(getItemUnit('gold_18k')).toBe('gram');
    expect(getItemBadge('full_coin')).toBe('Coin');
    expect(getSourceBrand('src_def_emofid')).toBe('Mofid');
    expect(getItemDisplayName('src_def_emofid__اهرم')).toMatch(/\(Mofid\)$/);
    expect(getItemBaseName('bourse_فولاد')).toBe('Stock فولاد');
    const bank = resolveBank({ bankId: 'melli' });
    expect(bank.name).toBe('Bank Melli Iran');
    expect(bank.shortName).toBe('Melli');
    expect(resolveBank({ bankId: 'maskan' }).shortName).toBe('Maskan');
    expect(getBankGroups()[0].label).toBe('State banks');
  });

  it('translate a price-book asset but keep its Persian aliases searchable', () => {
    const item = { id: 'gold_18k', name: 'طلای ۱۸ عیار', category: 'gold', unit: 'گرم', price: 1000, params: { sourceName: 'طلا و سکه (tgju)' } };
    setActiveLocale('en');
    const asset = toAsset(item);
    expect(asset.name).toBe('18k gold');
    expect(asset.unit).toBe('gram');
    expect(asset.badge).toBe('Gold');
    expect(asset.sourceName).toBe('Gold and coins (tgju)');
    expect(asset.aliases).toContain('طلای ۱۸ عیار');
    expect(asset.aliases).toContain('18k gold');
  });
});

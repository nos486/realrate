/**
 * dashboardLayout.test.js — The home page's widget dashboard: the layout document is made valid
 * (unknown widgets, sizes, options), each screen keeps its own list with a default, edits are
 * pure, and the layout is part of the full backup
 */

import { describe, it, expect } from 'vitest';
import {
  WIDGET_CATALOG, WIDGET_GROUPS, WIDGET_TYPES, DASHBOARD_LIMITS, DEFAULT_DASHBOARD,
  sanitizeWidgets, sanitizeDashboard, defaultWidgets, widgetsOf, withScreen, canAddWidget,
  addWidget, removeWidget, moveWidget, shiftWidget, resizeWidget, setWidgetHeight, configureWidget,
} from '../../src/domain/dashboardLayout.js';
import { ACCOUNT_KINDS } from '../../../web/src/shared/vault/fullBackup.js';
import { VAULT_RECORD_KINDS } from '../../src/repositories/vault.repository.js';

const types = (widgets) => widgets.map((w) => w.type);

describe('the catalog', () => {
  it('lets every widget take all three sizes, so small and medium ones sit side by side', () => {
    for (const type of WIDGET_TYPES) expect(WIDGET_CATALOG[type].sizes, type).toEqual([1, 2, 3]);
  });

  it('gives every widget a default height class', () => {
    for (const type of WIDGET_TYPES) expect([1, 2, 3], type).toContain(WIDGET_CATALOG[type].defaultHeight);
  });

  it('puts every widget in a known group, with a default size it allows', () => {
    const groups = new Set(WIDGET_GROUPS.map((g) => g.id));
    for (const type of WIDGET_TYPES) {
      const spec = WIDGET_CATALOG[type];
      expect(groups.has(spec.group), type).toBe(true);
      expect(spec.sizes, type).toContain(spec.defaultSize);
    }
  });

  it('only defaults to widgets that exist', () => {
    for (const list of Object.values(DEFAULT_DASHBOARD)) {
      for (const { type, size } of list) {
        expect(WIDGET_CATALOG[type], type).toBeTruthy();
        expect(WIDGET_CATALOG[type].sizes, type).toContain(size);
      }
    }
  });
});

describe('sanitizeWidgets', () => {
  it('drops unknown types and junk, and keeps the order', () => {
    const out = sanitizeWidgets([{ type: 'news' }, { type: 'nope' }, null, 'x', { type: 'month' }]);
    expect(types(out)).toEqual(['news', 'month']);
  });

  it('makes sizes and options valid', () => {
    const [news, month] = sanitizeWidgets([{ type: 'news', size: 9, config: { count: 4, extra: 1 } }, { type: 'month', size: 1 }]);
    expect(news.size).toBe(3);
    expect(news.config).toEqual({ count: 10 });
    expect(month.size).toBe(1);
    expect(sanitizeWidgets([{ type: 'news', config: { count: 8 } }])[0].config).toEqual({ count: 8 });
  });

  it('keeps one of a unique widget, and several of the others', () => {
    const out = sanitizeWidgets([{ type: 'news' }, { type: 'news' }, { type: 'asset' }, { type: 'asset' }]);
    expect(types(out)).toEqual(['news', 'asset', 'asset']);
  });

  it('gives every widget its own valid id', () => {
    const out = sanitizeWidgets([{ id: 'w_a', type: 'asset' }, { id: 'w_a', type: 'asset' }, { id: 'bad id!', type: 'goals' }]);
    expect(new Set(out.map((w) => w.id)).size).toBe(3);
    expect(out[0].id).toBe('w_a');
    expect(out.every((w) => /^[A-Za-z0-9_-]{1,40}$/.test(w.id))).toBe(true);
  });

  it('keeps an asset id only when it looks like one', () => {
    expect(sanitizeWidgets([{ type: 'asset', config: { assetId: 'gold_18k' } }])[0].config.assetId).toBe('gold_18k');
    expect(sanitizeWidgets([{ type: 'asset', config: { assetId: 'a b' } }])[0].config.assetId).toBeUndefined();
  });

  it('limits the length', () => {
    const many = Array.from({ length: DASHBOARD_LIMITS.widgets + 10 }, () => ({ type: 'asset' }));
    expect(sanitizeWidgets(many)).toHaveLength(DASHBOARD_LIMITS.widgets);
    expect(sanitizeWidgets('x')).toEqual([]);
  });
});

describe('heights', () => {
  it('uses the type\'s default when none (or an invalid one) is stored', () => {
    const [a, b, c] = sanitizeWidgets([{ type: 'ai_analysis' }, { type: 'rates', height: 9 }, { type: 'month', height: 3 }]);
    expect(a.height).toBe(WIDGET_CATALOG.ai_analysis.defaultHeight);
    expect(b.height).toBe(WIDGET_CATALOG.rates.defaultHeight);
    expect(c.height).toBe(3);
  });

  it('sets a height class, and a new widget starts at its default', () => {
    const list = sanitizeWidgets([{ type: 'month' }]);
    expect(setWidgetHeight(list, list[0].id, 1)[0].height).toBe(1);
    expect(setWidgetHeight(list, list[0].id, 7)[0].height).toBe(WIDGET_CATALOG.month.defaultHeight);
    expect(addWidget(list, 'goals')[1].height).toBe(WIDGET_CATALOG.goals.defaultHeight);
  });
});

describe('a dashboard per screen', () => {
  it('starts from the default of a screen that was never arranged', () => {
    expect(types(widgetsOf(null, 'desktop'))).toEqual(types(defaultWidgets('desktop')));
    expect(types(widgetsOf(null, 'mobile'))).toEqual(DEFAULT_DASHBOARD.mobile.map((w) => w.type));
    expect(types(defaultWidgets('desktop'))).not.toEqual(types(defaultWidgets('mobile')));
  });

  it('arranges one screen without touching the other', () => {
    const doc = withScreen(null, 'mobile', [{ type: 'rates', size: 3 }]);
    expect(types(doc.mobile)).toEqual(['rates']);
    expect(doc.desktop).toBeNull();
    expect(types(widgetsOf(doc, 'desktop'))).toEqual(types(defaultWidgets('desktop')));
    const both = withScreen(doc, 'desktop', [{ type: 'news' }]);
    expect(types(both.mobile)).toEqual(['rates']);
    expect(types(both.desktop)).toEqual(['news']);
  });

  it('reads a stored document back, and refuses one with no list', () => {
    const doc = withScreen(null, 'desktop', [{ type: 'month' }, { type: 'bogus' }]);
    expect(sanitizeDashboard(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
    expect(sanitizeDashboard({ desktop: 'x' })).toBeNull();
    expect(sanitizeDashboard(null)).toBeNull();
    // An empty list is a choice (no widgets), not a missing one
    expect(sanitizeDashboard({ mobile: [] }).mobile).toEqual([]);
  });
});

describe('edits', () => {
  const start = sanitizeWidgets([{ type: 'month' }, { type: 'news' }, { type: 'goals' }]);

  it('adds a widget at the end, and a unique one only once', () => {
    expect(canAddWidget(start, 'news')).toBe(false);
    expect(addWidget(start, 'news')).toBe(start);
    expect(canAddWidget(start, 'asset')).toBe(true);
    const next = addWidget(start, 'asset', { assetId: 'usd' });
    expect(types(next)).toEqual(['month', 'news', 'goals', 'asset']);
    expect(next[3]).toMatchObject({ size: 1, config: { assetId: 'usd' } });
    expect(types(addWidget(next, 'asset'))).toHaveLength(5);
  });

  it('removes, moves and shifts', () => {
    const [a, b, c] = start;
    expect(types(removeWidget(start, b.id))).toEqual(['month', 'goals']);
    expect(moveWidget(start, a.id, c.id).map((w) => w.id)).toEqual([b.id, c.id, a.id]);
    expect(moveWidget(start, c.id, a.id).map((w) => w.id)).toEqual([c.id, a.id, b.id]);
    expect(moveWidget(start, a.id, a.id)).toBe(start);
    expect(shiftWidget(start, b.id, -1).map((w) => w.id)).toEqual([b.id, a.id, c.id]);
    expect(shiftWidget(start, a.id, -1)).toBe(start);
    expect(shiftWidget(start, c.id, 1)).toBe(start);
  });

  it('resizes to a size the widget allows and sets its options', () => {
    const [month, news] = start;
    expect(resizeWidget(start, month.id, 3)[0].size).toBe(3);
    expect(resizeWidget(start, month.id, 1)[0].size).toBe(1);
    expect(resizeWidget(start, month.id, 9)[0].size).toBe(3);
    expect(configureWidget(start, news.id, { count: 5 })[1].config).toEqual({ count: 5 });
    expect(configureWidget(start, news.id, { count: 4 })[1].config).toEqual({ count: 10 });
  });
});

describe('storage', () => {
  it('is an encrypted vault record in the full backup', () => {
    expect(VAULT_RECORD_KINDS).toContain('dashboard_layout');
    expect(ACCOUNT_KINDS).toContain('dashboard_layout');
  });
});

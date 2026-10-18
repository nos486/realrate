/**
 * dashboardLayout.test.js — The home page's widget dashboard: the layout document is made valid
 * (unknown widgets, options), each screen keeps its own list with a default, edits are
 * pure, and the layout is part of the full backup
 */

import { describe, it, expect } from 'vitest';
import {
  WIDGET_CATALOG, WIDGET_HEIGHTS, WIDGET_HEIGHT_PX, WIDGET_GROUPS, WIDGET_TYPES, DASHBOARD_LIMITS, DEFAULT_DASHBOARD,
  sanitizeWidgets, sanitizeDashboard, screenOfColumns, hasSavedScreen, defaultWidgets, widgetsOf, withScreen, canAddWidget,
  addWidget, removeWidget, moveWidget, shiftWidget, setWidgetHeight, configureWidget, layoutColumns, placeWidget,
} from '../../src/domain/dashboardLayout.js';
import { ACCOUNT_KINDS } from '../../../web/src/shared/vault/fullBackup.js';
import { VAULT_RECORD_KINDS } from '../../src/repositories/vault.repository.js';

const types = (widgets) => widgets.map((w) => w.type);

describe('the catalog', () => {
  it('gives every widget a default height class', () => {
    for (const type of WIDGET_TYPES) expect(WIDGET_HEIGHTS, type).toContain(WIDGET_CATALOG[type].defaultHeight);
  });

  it('puts every widget in a known group, ', () => {
    const groups = new Set(WIDGET_GROUPS.map((g) => g.id));
    for (const type of WIDGET_TYPES) {
      const spec = WIDGET_CATALOG[type];
      expect(groups.has(spec.group), type).toBe(true);
    }
  });

  it('only defaults to widgets that exist', () => {
    for (const list of Object.values(DEFAULT_DASHBOARD)) {
      for (const { type } of list) {
        expect(WIDGET_CATALOG[type], type).toBeTruthy();
      }
    }
  });
});

describe('sanitizeWidgets', () => {
  it('drops unknown types and junk, and keeps the order', () => {
    const out = sanitizeWidgets([{ type: 'news' }, { type: 'nope' }, null, 'x', { type: 'month' }]);
    expect(types(out)).toEqual(['news', 'month']);
  });

  it('makes options valid and keeps no width (every widget is one column wide)', () => {
    const [news] = sanitizeWidgets([{ type: 'news', size: 9, config: { count: 4, extra: 1 } }]);
    expect(news.size).toBeUndefined();
    expect(news.config).toMatchObject({ count: 10 });
    expect(news.config.extra).toBeUndefined();
    expect(sanitizeWidgets([{ type: 'news', config: { count: 8 } }])[0].config.count).toBe(8);
  });

  it('keeps one of a unique widget, and several of the others', () => {
    const out = sanitizeWidgets([{ type: 'news' }, { type: 'news' }, { type: 'rate_list' }, { type: 'rate_list' }]);
    expect(types(out)).toEqual(['news', 'rate_list', 'rate_list']);
  });

  it('gives every widget its own valid id', () => {
    const out = sanitizeWidgets([{ id: 'w_a', type: 'rate_list' }, { id: 'w_a', type: 'rate_list' }, { id: 'bad id!', type: 'goals' }]);
    expect(new Set(out.map((w) => w.id)).size).toBe(3);
    expect(out[0].id).toBe('w_a');
    expect(out.every((w) => /^[A-Za-z0-9_-]{1,40}$/.test(w.id))).toBe(true);
  });

  it('keeps a rate list\'s assets: valid ids only, no repeats, at most four', () => {
    const ids = ['usd', 'usd', 'a b', 7, 'gold_18k'];
    expect(sanitizeWidgets([{ type: 'rate_list', config: { assetIds: ids } }])[0].config.assetIds).toEqual(['usd', 'gold_18k']);
    const many = Array.from({ length: DASHBOARD_LIMITS.rateListAssets + 5 }, (_, i) => `asset${i}`);
    expect(sanitizeWidgets([{ type: 'rate_list', config: { assetIds: many } }])[0].config.assetIds).toHaveLength(DASHBOARD_LIMITS.rateListAssets);
    expect(sanitizeWidgets([{ type: 'rate_list' }, { type: 'rate_list' }])).toHaveLength(2);
  });

  it('no longer has the single-asset widget: a stored one is dropped', () => {
    expect(WIDGET_CATALOG.asset).toBeUndefined();
    expect(sanitizeWidgets([{ type: 'asset', config: { assetId: 'usd' } }, { type: 'goals' }]).map((w) => w.type)).toEqual(['goals']);
  });

  it('limits the length', () => {
    const many = Array.from({ length: DASHBOARD_LIMITS.widgets + 10 }, () => ({ type: 'rate_list' }));
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

  it('offers four sizes (150, 300, 450, 600px) and each widget allows some of them, its default among them', () => {
    expect(WIDGET_HEIGHT_PX).toEqual({ 1: 150, 2: 300, 3: 450, 4: 600 });
    for (const spec of Object.values(WIDGET_CATALOG)) {
      expect(spec.heights.length).toBeGreaterThan(0);
      expect(spec.heights.every((h) => WIDGET_HEIGHTS.includes(h))).toBe(true);
      expect(spec.heights).toContain(spec.defaultHeight);
    }
    expect(WIDGET_CATALOG.calendar.heights).toEqual([2, 4]);
  });

  it('snaps a height the widget does not allow to the nearest allowed one (the taller on a tie)', () => {
    const height = (type, h) => sanitizeWidgets([{ type, height: h }])[0].height;
    expect(height('calendar', 1)).toBe(2);
    expect(height('ai_analysis', 1)).toBe(3);
    expect(height('calendar', 3)).toBe(4);
    expect(setWidgetHeight([{ id: 'w_c', type: 'calendar', height: 2, config: {} }], 'w_c', 1)[0].height).toBe(2);
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
    const doc = withScreen(null, 'mobile', [{ type: 'rates' }]);
    expect(types(doc.mobile)).toEqual(['rates']);
    expect(doc.desktop).toBeNull();
    expect(types(widgetsOf(doc, 'desktop'))).toEqual(types(defaultWidgets('desktop')));
    const both = withScreen(doc, 'desktop', [{ type: 'news' }]);
    expect(types(both.mobile)).toEqual(['rates']);
    expect(types(both.desktop)).toEqual(['news']);
  });

  it('keeps a list per number of columns: 4, 3, 2 and 1', () => {
    expect([4, 3, 2, 1].map(screenOfColumns)).toEqual(['wide', 'desktop', 'tablet', 'mobile']);
    let doc = withScreen(null, 'wide', [{ type: 'news' }]);
    doc = withScreen(doc, 'tablet', [{ type: 'goals' }]);
    expect([types(doc.wide), types(doc.tablet), doc.desktop, doc.mobile]).toEqual([['news'], ['goals'], null, null]);
    expect(types(widgetsOf(doc, 'wide'))).toEqual(['news']);
    expect(types(widgetsOf(doc, 'tablet'))).toEqual(['goals']);
    expect(hasSavedScreen(doc)).toBe(true);
    expect(hasSavedScreen(null)).toBe(false);
    expect(sanitizeDashboard(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });

  it('gives every column count its own default, filling all columns', () => {
    for (const [screen, count] of [['wide', 4], ['desktop', 3], ['tablet', 2]]) {
      expect(types(widgetsOf(null, screen)), screen).toEqual(DEFAULT_DASHBOARD[screen].map((w) => w.type));
      const columns = layoutColumns(defaultWidgets(screen), count);
      expect(columns.every((c) => c.length > 0), screen).toBe(true);
    }
    // Also when the user cannot see some of them (no news or analysis in English)
    const visible = defaultWidgets('wide').filter((w) => !['news', 'ai_analysis'].includes(w.type));
    expect(layoutColumns(visible, 4).every((c) => c.length > 0)).toBe(true);
  });

  it('starts a user who arranged nothing with every widget on the website, the favorite rates already filled', () => {
    for (const screen of ['wide', 'desktop', 'tablet']) {
      expect(types(defaultWidgets(screen)).sort(), screen).toEqual([...WIDGET_TYPES].sort());
    }
    const rates = defaultWidgets('desktop').find((w) => w.type === 'rate_list');
    expect(rates.config.assetIds.length).toBe(DASHBOARD_LIMITS.rateListAssets);
    expect(types(defaultWidgets('mobile')).length).toBeLessThan(WIDGET_TYPES.length);
  });

  it('starts a 4- or 2-column list from the 3-column one when that was arranged, spreading it over the columns', () => {
    const doc = withScreen(null, 'desktop', [{ type: 'month', col: 2 }, { type: 'goals', col: 2 }, { type: 'plan', col: 2 }, { type: 'alerts', col: 2 }]);
    const wide = widgetsOf(doc, 'wide');
    expect(types(wide)).toEqual(['month', 'goals', 'plan', 'alerts']);
    expect(wide.every((w) => w.col === undefined)).toBe(true);
    expect(layoutColumns(wide, 4).every((c) => c.length > 0)).toBe(true);
    expect(types(widgetsOf(doc, 'mobile'))).toEqual(DEFAULT_DASHBOARD.mobile.map((w) => w.type));
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
    expect(canAddWidget(start, 'rate_list')).toBe(true);
    const next = addWidget(start, 'rate_list', { assetIds: ['usd'] });
    expect(types(next)).toEqual(['month', 'news', 'goals', 'rate_list']);
    expect(next[3]).toMatchObject({ config: { assetIds: ['usd'] } });
    expect(types(addWidget(next, 'rate_list'))).toHaveLength(5);
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

  it('sets its options', () => {
    const [, news] = start;
    expect(configureWidget(start, news.id, { count: 5 })[1].config.count).toBe(5);
    expect(configureWidget(start, news.id, { count: 4 })[1].config.count).toBe(10);
  });
});

describe('storage', () => {
  it('is an encrypted vault record in the full backup', () => {
    expect(VAULT_RECORD_KINDS).toContain('dashboard_layout');
    expect(ACCOUNT_KINDS).toContain('dashboard_layout');
  });
});

describe('widget settings', () => {
  const config = (widget) => sanitizeWidgets([widget])[0].config;

  it('keeps a valid style and falls back to the default for another', () => {
    expect(config({ type: 'clock', config: { style: 'analog' } }).style).toBe('analog');
    expect(config({ type: 'clock', config: { style: 'nope' } }).style).toBe('digital');
    expect(config({ type: 'rate_list' }).style).toBe('grid');
  });

  it('keeps a switch only as a boolean, else its default', () => {
    expect(config({ type: 'clock', config: { seconds: true, gregorian: 'x' } })).toMatchObject({ seconds: true, gregorian: true });
    expect(config({ type: 'month' }).comparison).toBe(true);
  });

  it('keeps a subset of a multi choice in its own order, never an empty one', () => {
    expect(config({ type: 'alerts', config: { sources: ['subscription', 'loan', 'x'] } }).sources).toEqual(['loan', 'subscription']);
    expect(config({ type: 'alerts', config: { sources: [] } }).sources).toEqual(['loan', 'cheque', 'subscription']);
    expect(config({ type: 'calendar', config: { kinds: ['goal'] } }).kinds).toEqual(['goal']);
  });

  it('drops a setting the widget does not declare', () => {
    expect(config({ type: 'plan', config: { style: 'grid', seconds: true } })).toEqual({ title: true, card: true });
  });

  it('gives every widget the title and card switches, on by default', () => {
    for (const type of Object.keys(WIDGET_CATALOG)) {
      expect(config({ type })).toMatchObject({ title: true, card: true });
    }
    expect(config({ type: 'goals', config: { title: false, card: 'no' } })).toMatchObject({ title: false, card: true });
  });

  it('keeps a choice only as one of its values, else its default', () => {
    expect(config({ type: 'loans', config: { sort: 'balance' } }).sort).toBe('balance');
    expect(config({ type: 'loans', config: { sort: 'x' } }).sort).toBe('due');
    expect(config({ type: 'expenses_latest', config: { range: 'week' } }).range).toBe('week');
    expect(config({ type: 'expenses_latest' }).range).toBe('month');
  });
});

describe('columns', () => {
  const list = (specs) => sanitizeWidgets(specs.map(([type, height, col]) => ({ id: `w_${type}`, type, height, col })));
  const ids = (columns) => columns.map((c) => c.map((w) => w.type));

  it('keeps a valid column and drops another', () => {
    expect(sanitizeWidgets([{ type: 'goals', col: 2 }])[0].col).toBe(2);
    expect(sanitizeWidgets([{ type: 'goals', col: 3 }])[0].col).toBe(3);
    expect(sanitizeWidgets([{ type: 'goals', col: 4 }])[0].col).toBeUndefined();
    expect(sanitizeWidgets([{ type: 'goals', col: 'x' }])[0].col).toBeUndefined();
  });

  it('puts widgets without a column under the shortest one, in order', () => {
    const widgets = list([['ai_analysis', 3], ['month', 1], ['goals', 1], ['plan', 1], ['news', 2]]);
    expect(ids(layoutColumns(widgets, 3))).toEqual([['ai_analysis'], ['month', 'plan'], ['goals', 'news']]);
  });

  it('keeps the user\'s column, wrapped when there are fewer columns', () => {
    const widgets = list([['month', 1, 2], ['goals', 1, 0]]);
    expect(ids(layoutColumns(widgets, 3))).toEqual([['goals'], [], ['month']]);
    expect(ids(layoutColumns(widgets, 2))).toEqual([['month', 'goals'], []].map((c) => c));
  });

  it('drops a widget into the empty space under a tall one (the end of a column)', () => {
    const widgets = list([['ai_analysis', 3], ['month', 1], ['goals', 1], ['plan', 1]]);
    const moved = placeWidget(widgets, 3, 'w_plan', 0);
    expect(ids(layoutColumns(moved, 3))[0]).toEqual(['ai_analysis', 'plan']);
    // the others stay where they were shown
    expect(ids(layoutColumns(moved, 3)).slice(1)).toEqual([['month'], ['goals']]);
  });

  it('drops a widget before another, in its column or another', () => {
    const widgets = list([['month', 1, 0], ['goals', 1, 0], ['plan', 1, 1]]);
    expect(ids(layoutColumns(placeWidget(widgets, 3, 'w_plan', 0, 'w_goals'), 3))[0]).toEqual(['month', 'plan', 'goals']);
    expect(ids(layoutColumns(placeWidget(widgets, 3, 'w_goals', 0, 'w_month'), 3))[0]).toEqual(['goals', 'month']);
  });

  it('ignores a column that does not exist', () => {
    const widgets = list([['month', 1]]);
    expect(placeWidget(widgets, 3, 'w_month', 5)).toBe(widgets);
  });
});

// @vitest-environment happy-dom
/**
 * dashboardWidgetContract.test.jsx — What every widget of the home page must have, checked for the
 * whole catalog so a new widget cannot skip it: a title and description, a known group and
 * requirement, a view with an icon, and a source file that says what it is. Also the shared
 * shell (WidgetCard) and states (WidgetState) every card-style widget is drawn with.
 */
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { Target } from 'lucide-react';
import { WIDGET_CATALOG, WIDGET_GROUPS, WIDGET_TYPES, sanitizeWidgets } from '../../src/domain/dashboardLayout.js';
import { WIDGET_VIEWS, WIDGET_REQUIREMENTS } from '../../../web/src/features/dashboard/widgetRegistry.jsx';
import WidgetCard from '../../../web/src/features/dashboard/WidgetCard.jsx';
import WidgetState from '../../../web/src/features/dashboard/WidgetState.jsx';

afterEach(cleanup);

const widgetsDir = path.resolve(__dirname, '../../../web/src/features/dashboard/widgets');

describe('every widget of the catalog', () => {
  it('has a title, a description and a known group', () => {
    const groups = new Set(WIDGET_GROUPS.map((g) => g.id));
    for (const type of WIDGET_TYPES) {
      const spec = WIDGET_CATALOG[type];
      expect(spec.title, type).toBeTruthy();
      expect(spec.description, type).toBeTruthy();
      expect(groups.has(spec.group), type).toBe(true);
    }
  });

  it('names only a requirement the page knows how to check', () => {
    for (const type of WIDGET_TYPES) {
      const need = WIDGET_CATALOG[type].requires;
      expect(need === null || WIDGET_REQUIREMENTS.includes(need), `${type}: ${need}`).toBe(true);
    }
  });

  it('has a view with an icon and a component, and nothing is registered without a catalog entry', () => {
    expect(Object.keys(WIDGET_VIEWS).sort()).toEqual([...WIDGET_TYPES].sort());
    for (const type of WIDGET_TYPES) {
      expect(WIDGET_VIEWS[type].Icon, type).toBeTruthy();
      expect(WIDGET_VIEWS[type].Component, type).toBeTruthy();
    }
  });

  it('has a source file with a header comment', () => {
    const files = fs.readdirSync(widgetsDir).filter((f) => f.endsWith('Widget.jsx'));
    expect(files).toHaveLength(WIDGET_TYPES.length);
    for (const file of files) expect(fs.readFileSync(path.join(widgetsDir, file), 'utf8').startsWith('/**'), file).toBe(true);
  });
});

describe('the settings every widget declares', () => {
  const optionsOf = (type) => WIDGET_CATALOG[type].options || {};

  it('has a label for every style and every multi-choice value, and a default among them', () => {
    for (const type of WIDGET_TYPES) {
      const { style, multi = {} } = optionsOf(type);
      if (style) {
        expect(style.values, type).toContain(style.default);
        for (const v of style.values) expect(style.labels[v], `${type}.${v}`).toBeTruthy();
      }
      for (const [key, def] of Object.entries(multi)) {
        expect(def.label, `${type}.${key}`).toBeTruthy();
        expect(def.default.every((v) => def.values.includes(v)), `${type}.${key}`).toBe(true);
        for (const v of def.values) expect(def.labels[v], `${type}.${key}.${v}`).toBeTruthy();
      }
    }
  });

  it('labels every choice and keeps its default among its values', () => {
    for (const type of WIDGET_TYPES) {
      for (const [key, def] of Object.entries(optionsOf(type).choices || {})) {
        expect(def.label, `${type}.${key}`).toBeTruthy();
        expect(def.values, `${type}.${key}`).toContain(def.default);
        for (const v of def.values) expect(def.labels[v], `${type}.${key}.${v}`).toBeTruthy();
      }
    }
  });

  it('labels every switch', () => {
    for (const type of WIDGET_TYPES) {
      for (const [key, def] of Object.entries(optionsOf(type).toggles || {})) {
        expect(def.label, `${type}.${key}`).toBeTruthy();
        expect(typeof def.default, `${type}.${key}`).toBe('boolean');
      }
    }
  });

  it('keeps each widget\'s defaults when nothing is stored', () => {
    for (const type of WIDGET_TYPES) {
      const { config } = sanitizeWidgets([{ type }])[0];
      const o = optionsOf(type);
      if (o.style) expect(config.style, type).toBe(o.style.default);
      for (const [key, def] of Object.entries(o.toggles || {})) expect(config[key], `${type}.${key}`).toBe(def.default);
    }
  });
});

describe('the widget shell', () => {
  it('draws a labelled card with a title and a link that opens the section', () => {
    const open = vi.fn();
    render(<WidgetCard title="اهداف" Icon={Target} action={{ onClick: open }}><p>body</p></WidgetCard>);
    expect(screen.getByRole('region', { name: 'اهداف' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /همه/ }));
    expect(open).toHaveBeenCalled();
    expect(screen.getByText('body')).toBeTruthy();
  });

  it('has no link without an action', () => {
    render(<WidgetCard title="اهداف"><p>body</p></WidgetCard>);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('the widget states', () => {
  it('shows placeholders while loading', () => {
    render(<WidgetState state="loading" rows={2} />);
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
  });

  it('offers the next step when empty, or just says so', () => {
    const onAction = vi.fn();
    const { rerender } = render(<WidgetState state="empty" message="چیزی نیست" onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: /چیزی نیست/ }));
    expect(onAction).toHaveBeenCalled();
    rerender(<WidgetState state="empty" message="چیزی نیست" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says it failed and offers a retry', () => {
    const retry = vi.fn();
    render(<WidgetState state="error" onAction={retry} />);
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }));
    expect(retry).toHaveBeenCalled();
  });
});

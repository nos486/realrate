// @vitest-environment happy-dom
/**
 * allocationTargets.test.jsx — category target shares: storage in the layout, drift beyond 5
 * points, the targets card and the editor
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { sanitizePortfolioLayout } from '../../src/domain/portfolioLayout.js';
import {
  buildCustomCategoryGroups,
  buildDefaultPortfolioLayout,
  setTargets,
  addGroup,
  removeGroup,
  moveAsset,
} from '../../../web/src/features/portfolio/portfolioLayoutModel.js';
import { buildAllocation, targetKeyOf, describeDrift } from '../../../web/src/features/portfolio/utils/allocationTargets.js';
import AllocationTargetsCard from '../../../web/src/features/portfolio/components/AllocationTargetsCard.jsx';
import TargetAllocationModal from '../../../web/src/features/portfolio/components/TargetAllocationModal.jsx';

afterEach(cleanup);

const group = (key, name, value) => ({ key, name, icon: key, totalRealValue: value, items: [] });

describe('targets in the portfolio layout', () => {
  it('keeps valid percents only', () => {
    const layout = sanitizePortfolioLayout({ groups: [], targets: { g_gold: 30.04, g_fx: '25', bad$: 10, g_zero: 0, g_neg: -3, g_big: 150 } });
    expect(layout.targets).toEqual({ g_gold: 30, g_fx: 25, g_big: 100 });
    // No targets: the shape stays as before
    expect(sanitizePortfolioLayout({ groups: [] })).toEqual({ version: 1, groups: [] });
  });

  it('every edit keeps the targets; removing a group drops its target', () => {
    let layout = setTargets({ groups: [{ id: 'g_a', title: 'A', icon: 'gold', items: [] }] }, { g_a: 60, g_other: 40 });
    layout = addGroup(layout, { title: 'B' });
    layout = moveAsset(layout, 'usd', 'g_a');
    expect(layout.targets).toEqual({ g_a: 60, g_other: 40 });
    expect(removeGroup(layout, 'g_a').targets).toEqual({ g_other: 40 });
  });

  it('the standard categories use the same keys a custom layout made from them gets', () => {
    const items = [{ assetId: 'usd', assetType: 'currency', itemRealVal: 100 }];
    const standard = buildCustomCategoryGroups(items, null, '', { keepEmpty: true });
    const custom = buildCustomCategoryGroups(items, buildDefaultPortfolioLayout(items), '', { keepEmpty: true });
    const currencyStandard = standard.find((g) => g.items.length);
    const currencyCustom = custom.find((g) => g.items.length);
    expect(targetKeyOf(currencyStandard)).toBe(targetKeyOf(currencyCustom));
  });
});

describe('buildAllocation', () => {
  const groups = [group('gold', 'طلا', 400), group('currency', 'ارز', 350), group('bourse', 'بورس', 250), group('crypto', 'رمزارز', 0)];

  it('flags a category more than 5 points away from its target', () => {
    const a = buildAllocation(groups, { g_gold: 30, g_currency: 35, g_bourse: 25, g_crypto: 10 });
    expect(a.complete).toBe(true);
    const byKey = Object.fromEntries(a.rows.map((r) => [r.key, r]));
    expect(byKey.gold).toMatchObject({ currentPct: 40, targetPct: 30, diff: 10, drifted: true });
    expect(byKey.currency).toMatchObject({ diff: 0, drifted: false });
    // Holding nothing, but targeted: shown, and 10 points short
    expect(byKey.crypto).toMatchObject({ currentPct: 0, diff: -10, drifted: true });
    expect(a.drifted.map(describeDrift)).toEqual(['طلا ۱۰٪ بیشتر از هدف', 'رمزارز ۱۰٪ کمتر از هدف']);
  });

  it('exactly 5 points is fine; an untargeted category aims for 0', () => {
    const a = buildAllocation(groups, { g_gold: 35, g_currency: 40, g_bourse: 25 });
    expect(a.drifted.map((r) => r.key)).toEqual([]);
    const b = buildAllocation([...groups, group('cash', 'نقد', 100)], { g_gold: 40, g_currency: 35, g_bourse: 25 });
    expect(b.drifted.map((r) => r.key)).toContain('cash');
  });

  it('targets not adding up to 100 are not judged; no targets, no target column', () => {
    expect(buildAllocation(groups, { g_gold: 10 })).toMatchObject({ complete: false, drifted: [] });
    const none = buildAllocation(groups, {});
    expect(none.hasTargets).toBe(false);
    expect(none.rows.every((r) => r.targetPct === null)).toBe(true);
    expect(none.rows.map((r) => r.key)).toEqual(['gold', 'currency', 'bourse']);
  });
});

describe('targets UI', () => {
  const groups = [group('gold', 'طلا', 600), group('currency', 'ارز', 400)];

  it('the card compares today with the target and marks the drift', () => {
    const allocation = buildAllocation(groups, { g_gold: 50, g_currency: 50 });
    render(<AllocationTargetsCard allocation={allocation} onEdit={vi.fn()} />);
    expect(screen.getByText('هدف ترکیب پورتفو')).toBeTruthy();
    expect(document.querySelectorAll('.allocation-targets-list li.is-drifted')).toHaveLength(2);
    expect(document.body.textContent).toMatch(/۶۰٪/);
    expect(document.body.textContent).toMatch(/هدف ۵۰٪/);
  });

  it('without targets the card invites setting them', () => {
    const onEdit = vi.fn();
    render(<AllocationTargetsCard allocation={buildAllocation(groups, {})} onEdit={onEdit} />);
    fireEvent.click(screen.getAllByText('هدف‌گذاری').map((el) => el.closest('button')).find(Boolean));
    expect(onEdit).toHaveBeenCalled();
  });

  it('the editor saves only when the targets add up to 100; «از ترکیب فعلی» fills today\'s mix', () => {
    const onSave = vi.fn();
    render(<TargetAllocationModal groups={groups} targets={{}} onSave={onSave} onClose={vi.fn()} />);
    const save = screen.getByText('ذخیره').closest('button');
    fireEvent.change(screen.getByLabelText('هدف طلا'), { target: { value: '70' } });
    expect(save.disabled).toBe(true);
    fireEvent.click(screen.getByText('از ترکیب فعلی').closest('button'));
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith({ g_gold: 60, g_currency: 40 });
  });
});

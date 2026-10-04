// @vitest-environment happy-dom
/**
 * expenseTags.test.jsx — tags on a project's expenses: normalized, summed per tag beside the
 * list, a tag filters the list, and the form adds them (with the project's tags as suggestions)
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { normalizeTags, summarizeByTag, validateExpense, hasTag } from '../../src/domain/expenseDocument.js';

const state = { groups: [], expenses: [] };
const saveExpense = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('../../../web/src/features/expenses/hooks/useExpenses.js', () => ({
  useExpenses: () => ({
    ...state, vaultLocked: false, loading: false, submitting: false, deletingId: null, error: null,
    clearError: vi.fn(), fetchAll: vi.fn(), saveGroup: vi.fn(), deleteGroup: vi.fn(), saveExpense, deleteExpense: vi.fn(),
  }),
}));
vi.mock('../../../web/src/features/accounts/hooks/useAccounts.js', () => ({ useAccounts: () => ({ accounts: [] }) }));
vi.mock('../../../web/src/shared/vault/useVault.js', () => ({ useVault: () => ({ status: 'unlocked' }) }));
vi.mock('../../../web/src/features/market/index.js', () => ({ usePricing: () => ({ getAssetPrice: () => 100000, summary: {} }) }));
vi.mock('../../../web/src/features/demo/index.js', () => ({ useDemo: () => ({ readOnly: false }), isDemoReadOnly: () => false }));
vi.mock('../../../web/src/hooks/usePrivacyMode.js', () => ({ usePrivacyMode: () => false }));
vi.mock('../../../web/src/shared/vault/VaultUnlockCard.jsx', () => ({ default: () => null }));
vi.mock('../../../web/src/shared/vault/portfolioFunds.js', () => ({ CURRENCY_ASSET: { USD: 'usd' }, newSpendTxId: () => 'txs_1', rateOnDay: async () => null }));
vi.mock('../../../web/src/shared/vault/useAssetFunds.js', () => ({ useAssetFunds: () => ({ funds: [], loading: false }) }));

const { FeedbackProvider } = await import('../../../web/src/shared/ui/FeedbackProvider.jsx');
const { default: ExpensesPage } = await import('../../../web/src/features/expenses/components/ExpensesPage.jsx');

afterEach(cleanup);
const exp = (id, title, amount, tags = []) => ({ id, groupId: 'exg_1', title, amount, currency: 'IRT', date: '2026-09-01', tags, usdRate: null });

describe('tags in the document', () => {
  it('are trimmed, deduplicated and limited', () => {
    expect(normalizeTags([' مصالح ', '#دستمزد', 'مصالح', '', 'a  b'])).toEqual(['مصالح', 'دستمزد', 'a b']);
    expect(normalizeTags('کاشی، سیمان,کاشی')).toEqual(['کاشی', 'سیمان']);
    expect(normalizeTags(Array.from({ length: 15 }, (_, i) => `t${i}`))).toHaveLength(10);
    expect(validateExpense({ groupId: 'g', title: 't', amount: 1, date: '2026-01-01', tags: ['مصالح', 'مصالح '] }).value.tags).toEqual(['مصالح']);
    expect(hasTag({ tags: ['Floor2'] }, 'floor2')).toBe(true);
  });

  it('sum per tag (an expense under each of its tags) and the untagged apart', () => {
    const s = summarizeByTag([exp('1', 'کاشی', 300, ['مصالح']), exp('2', 'کاشی‌کار', 200, ['دستمزد', 'مصالح']), exp('3', 'تاکسی', 50)]);
    expect(s.tags.map(({ dollar: _d, ...t }) => t)).toEqual([{ tag: 'مصالح', totalToman: 500, count: 2 }, { tag: 'دستمزد', totalToman: 200, count: 1 }]);
    expect(s.untagged).toMatchObject({ totalToman: 50, count: 1 });
  });

  it('each tag at today\'s rate: its dollars (each expense at its day rate) and what they cost today', () => {
    const s = summarizeByTag([
      { ...exp('1', 'کاشی', 30_000_000, ['مصالح']), usdRate: 100_000 },
      { ...exp('2', 'سیمان', 10_000_000, ['مصالح']), usdRate: 50_000 },
      { ...exp('3', 'دستمزد', 5_000_000, ['دستمزد']) },
    ], { usdToman: 125_000 });
    const materials = s.tags.find((t) => t.tag === 'مصالح');
    expect(materials.dollar).toMatchObject({ usd: 500, paidToman: 40_000_000, todayToman: 62_500_000, counted: 2, missing: 0 });
    expect(Math.round(materials.dollar.changePct)).toBe(56);
    // Without the day's rate: counted apart
    expect(s.tags.find((t) => t.tag === 'دستمزد').dollar).toMatchObject({ counted: 0, missing: 1, todayToman: null });
  });
});

describe('tags on the projects page', () => {
  it('shows each tag\'s total beside the list; a tag shows only its expenses', () => {
    state.groups = [{ id: 'exg_1', name: 'تعمیر خانه', type: 'project', createdAt: '2026-01-01' }];
    state.expenses = [{ ...exp('e1', 'کاشی', 3_000_000, ['مصالح']), usdRate: 50_000 }, exp('e2', 'دستمزد کاشی‌کار', 2_000_000, ['دستمزد']), exp('e3', 'سیمان', 1_000_000, ['مصالح'])];
    render(<MemoryRouter><FeedbackProvider><ExpensesPage segment="projects" /></FeedbackProvider></MemoryRouter>);

    const card = document.querySelector('.expense-tag-totals');
    expect(card.textContent).toMatch(/#مصالح/);
    // «مصالح» has a day rate on one expense: its value today (100,000 today ÷ 50,000 then → ×2)
    expect(card.textContent).toMatch(/امروز\s*۶٬۰۰۰٬۰۰۰|امروز\s*۶,۰۰۰,۰۰۰/);
    expect(card.textContent).toMatch(/۴٬۰۰۰٬۰۰۰|۴,۰۰۰,۰۰۰/);
    fireEvent.click([...card.querySelectorAll('.expense-tag-row')].find((b) => b.textContent.includes('دستمزد')));
    expect(screen.queryByText('سیمان')).toBeNull();
    expect(screen.getAllByText('دستمزد کاشی‌کار').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('همه'));
    expect(screen.getAllByText('سیمان').length).toBeGreaterThan(0);
  });

  it('the form adds tags, offering the project\'s', async () => {
    state.groups = [{ id: 'exg_1', name: 'تعمیر خانه', type: 'project', createdAt: '2026-01-01' }];
    state.expenses = [exp('e1', 'کاشی', 3_000_000, ['مصالح'])];
    render(<MemoryRouter><FeedbackProvider><ExpensesPage segment="projects" /></FeedbackProvider></MemoryRouter>);
    fireEvent.click(screen.getAllByText('ثبت هزینه').map((el) => el.closest('button')).find(Boolean));
    fireEvent.change(document.getElementById('expense-title'), { target: { value: 'سیمان' } });
    fireEvent.change(document.getElementById('expense-amount'), { target: { value: '500000' } });
    fireEvent.click(screen.getByText('+ مصالح'));
    const field = document.getElementById('expense-tags');
    fireEvent.change(field, { target: { value: 'طبقه دوم' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    fireEvent.submit(screen.getAllByText('ثبت هزینه').map((el) => el.closest('form')).find(Boolean));
    await waitFor(() => expect(saveExpense).toHaveBeenCalled());
    expect(saveExpense.mock.calls[0][0].tags).toEqual(['مصالح', 'طبقه دوم']);
  });
});

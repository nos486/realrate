// @vitest-environment happy-dom
/**
 * categories.test.js — the user's own expense and income categories: validation, the merge over
 * the built-ins, records accepting custom keys, and the store the screens read
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isCategoryValue,
  validateCategoryList,
  validateCategorySettings,
  mergeCategories,
  newCategoryId,
  splitByExclusion,
  CUSTOM_CATEGORY_RE,
  BUILTIN_CATEGORIES,
} from '../../src/domain/categoryDocument.js';
import { validateExpense } from '../../src/domain/expenseDocument.js';

const vault = vi.hoisted(() => ({ records: [], put: vi.fn() }));
vi.mock('../../../web/src/shared/vault/vaultApi.js', () => ({ listVaultRecords: vi.fn(async () => ({ records: vault.records })) }));
vi.mock('../../../web/src/shared/vault/vaultRecordMeta.js', () => ({ putRecord: (...args) => vault.put(...args) }));
vi.mock('../../../web/src/shared/vault/vaultStore.js', () => ({
  encryptVaultRecord: vi.fn(async (plain) => JSON.stringify(plain)),
  decryptVaultRecord: vi.fn(async (payload) => JSON.parse(payload)),
}));
const store = await import('../../../web/src/shared/categories/categoryStore.js');
const { getExpenseCategory } = await import('../../../web/src/features/expenses/constants/expenseCategories.js');
const { getIncomeCategory } = await import('../../../web/src/features/incomes/constants/incomeCategories.js');
const { parseIncomeInput } = await import('../../../web/src/shared/vault/vaultIncomes.js');

describe('categoryDocument', () => {
  it('accepts built-in and custom keys only', () => {
    expect(isCategoryValue('expense', 'dining')).toBe(true);
    expect(isCategoryValue('expense', 'c_ab12cd34')).toBe(true);
    expect(isCategoryValue('expense', 'salary')).toBe(false);
    expect(isCategoryValue('income', 'salary')).toBe(true);
    expect(isCategoryValue('income', 'evil key')).toBe(false);
    expect(CUSTOM_CATEGORY_RE.test(newCategoryId())).toBe(true);
  });

  it('validates labels, icons and colors; "other" never hides', () => {
    const { value } = validateCategoryList('expense', [
      { value: 'dining', label: '  کافه  ', icon: 'Coffee', color: '#FF0000', hidden: false },
      { value: 'other', label: 'متفرقه', hidden: true },
      { value: 'c_pets0001', label: 'حیوان خانگی', icon: 'NoSuchIcon', color: 'red' },
      { value: 'bad', label: 'x' },
    ]);
    expect(value).toEqual([
      { value: 'dining', label: 'کافه', icon: 'Coffee', color: '#ff0000', hidden: false, excluded: false },
      { value: 'other', label: 'متفرقه', icon: 'CircleEllipsis', color: '#94a3b8', hidden: false, excluded: false },
      { value: 'c_pets0001', label: 'حیوان خانگی', icon: 'Tag', color: '#94a3b8', hidden: false, excluded: false },
    ]);
    expect(validateCategoryList('expense', [{ value: 'c_a0000001', label: '' }]).error).toBeTruthy();
    expect(validateCategoryList('expense', [{ value: 'c_a0000001', label: 'الف' }, { value: 'c_b0000001', label: 'الف' }]).error).toMatch(/تکراری/);
    expect(validateCategorySettings({ expense: [], income: 'x' }).error).toBeTruthy();
  });

  it('merges over the built-ins: stored order, missing built-ins added, "other" last', () => {
    const merged = mergeCategories('expense', [
      { value: 'c_pets0001', label: 'حیوان خانگی', icon: 'PawPrint', color: '#10b981' },
      { value: 'dining', label: 'کافه', hidden: true },
    ]);
    expect(merged.slice(0, 2).map((c) => c.value)).toEqual(['c_pets0001', 'dining']);
    expect(merged[0].custom).toBe(true);
    expect(merged[1]).toMatchObject({ label: 'کافه', hidden: true, custom: false });
    expect(merged.at(-1).value).toBe('other');
    // Every built-in, plus the custom one
    expect(merged).toHaveLength(BUILTIN_CATEGORIES.expense.length + 1);
    expect(mergeCategories('income', null).map((c) => c.value)[0]).toBe('salary');
  });

  it('cash management and investment spending are left out of the totals by default; any category can be switched', () => {
    const byValue = (list) => Object.fromEntries(list.map((c) => [c.value, c]));
    const expense = byValue(mergeCategories('expense', null));
    expect(expense.cash_management).toMatchObject({ label: 'مدیریت نقدینگی', excluded: true });
    expect(expense.investment.excluded).toBe(true);
    expect(expense.groceries.excluded).toBe(false);
    const income = byValue(mergeCategories('income', null));
    expect(income.cash_management.excluded).toBe(true);
    // Investment returns are income
    expect(income.investment.excluded).toBe(false);
    expect(isCategoryValue('income', 'cash_management')).toBe(true);
    expect(isCategoryValue('expense', 'cash_management')).toBe(true);

    // A list saved before the flag existed keeps the defaults; a saved flag wins
    const old = byValue(mergeCategories('expense', [{ value: 'investment', label: 'سرمایه‌گذاری' }, { value: 'dining', label: 'کافه' }]));
    expect(old.investment.excluded).toBe(true);
    const changed = byValue(mergeCategories('expense', [
      { value: 'investment', label: 'سرمایه‌گذاری', excluded: false },
      { value: 'dining', label: 'کافه', excluded: true },
      { value: 'c_save0001', label: 'پس‌انداز', excluded: true },
    ]));
    expect(changed.investment.excluded).toBe(false);
    expect(changed.dining.excluded).toBe(true);
    expect(changed.c_save0001.excluded).toBe(true);
  });

  it('splits records into counted and excluded', () => {
    const records = [{ id: 1, category: 'groceries' }, { id: 2, category: 'cash_management' }, { id: 3 }];
    const { counted, excluded } = splitByExclusion(records, (c) => c === 'cash_management');
    expect(counted.map((r) => r.id)).toEqual([1, 3]);
    expect(excluded.map((r) => r.id)).toEqual([2]);
  });
});

describe('records take custom categories', () => {
  it('expenses, budgets and incomes', () => {
    const exp = validateExpense({ groupId: 'exg_1', title: 'غذای گربه', amount: 1, date: '2026-09-01', category: 'c_pets0001' });
    expect(exp.value.category).toBe('c_pets0001');
    expect(validateExpense({ groupId: 'exg_1', title: 't', amount: 1, date: '2026-09-01', category: 'nope' }).value.category).toBe('');
    expect(parseIncomeInput({ title: 'فروش', amount: 1, incomeDate: '2026-09-01', category: 'c_sale0001' }).category).toBe('c_sale0001');
    expect(parseIncomeInput({ title: 'فروش', amount: 1, incomeDate: '2026-09-01', category: 'nope' }).category).toBe('other');
  });
});

describe('categoryStore', () => {
  beforeEach(() => {
    vault.records = [];
    vault.put.mockReset();
    store.resetCategories();
  });

  it('shows the built-ins until the user\'s record is loaded', async () => {
    expect(getExpenseCategory('dining').label).toBe('رستوران و کافه');
    vault.records = [{ id: 'main', payload: JSON.stringify({ expense: [{ value: 'dining', label: 'کافه' }, { value: 'c_pets0001', label: 'حیوان خانگی', icon: 'PawPrint', color: '#10b981' }], income: [] }) }];
    const changed = vi.fn();
    window.addEventListener(store.CATEGORIES_EVENT, changed);
    await store.loadCategories(1);
    window.removeEventListener(store.CATEGORIES_EVENT, changed);
    expect(changed).toHaveBeenCalled();
    expect(getExpenseCategory('dining').label).toBe('کافه');
    expect(getExpenseCategory('c_pets0001')).toMatchObject({ label: 'حیوان خانگی', custom: true });
    expect(typeof getExpenseCategory('c_pets0001').Icon).toBe('object');
    // A removed or unknown one shows as "other"
    expect(getExpenseCategory('c_gone0001').value).toBe('other');
    expect(getIncomeCategory('salary').label).toBe('حقوق');
  });

  it('hides hidden ones from pickers, except the value being edited', async () => {
    vault.records = [{ id: 'main', payload: JSON.stringify({ expense: [{ value: 'dining', label: 'کافه', hidden: true }], income: [] }) }];
    await store.loadCategories(2);
    expect(store.listCategories('expense').some((c) => c.value === 'dining')).toBe(false);
    expect(store.listCategories('expense', { keep: 'dining' }).some((c) => c.value === 'dining')).toBe(true);
    expect(store.listCategories('expense', { includeHidden: true })).toHaveLength(BUILTIN_CATEGORIES.expense.length);
  });

  it('splits records by the user\'s exclusions', async () => {
    const records = [{ id: 1, category: 'groceries' }, { id: 2, category: 'cash_management' }, { id: 3, category: 'investment' }];
    expect(store.splitCounted('expense', records).counted.map((r) => r.id)).toEqual([1]);
    expect(store.isExcludedCategory('income', 'cash_management')).toBe(true);
    vault.records = [{ id: 'main', payload: JSON.stringify({ expense: [{ value: 'investment', label: 'سرمایه‌گذاری', excluded: false }], income: [] }) }];
    await store.loadCategories(4);
    expect(store.splitCounted('expense', records).counted.map((r) => r.id)).toEqual([1, 3]);
    expect(store.splitCounted('expense', records).excluded.map((r) => r.id)).toEqual([2]);
  });

  it('saves one kind, keeping the other, as one encrypted record', async () => {
    await store.loadCategories(3);
    await store.saveCategories('income', [{ value: 'c_sale0001', label: 'فروش', icon: 'Store', color: '#10b981' }]);
    expect(vault.put).toHaveBeenCalledTimes(1);
    const [kind, id, payload] = vault.put.mock.calls[0];
    expect([kind, id]).toEqual(['category_settings', 'main']);
    expect(JSON.parse(payload)).toMatchObject({ expense: [], income: [{ value: 'c_sale0001', label: 'فروش' }] });
    expect(getIncomeCategory('c_sale0001').label).toBe('فروش');
    await expect(store.saveCategories('income', [{ value: 'c_x0000001', label: '' }])).rejects.toThrow();
  });
});

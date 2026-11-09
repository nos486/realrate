/**
 * aiEdit.test.js — The `edit` intent of the AI assistant: finding the record the voice means, the
 * guards (records of other features, linked expenses), applying a change or a deletion, and undo
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getExpenses = vi.fn();
const saveExpense = vi.fn(async (input, existing) => ({ expense: { ...existing, ...input } }));
const deleteExpense = vi.fn(async () => {});
const getIncomes = vi.fn();
const updateIncome = vi.fn(async () => {});
const deleteIncome = vi.fn(async () => {});
const createIncome = vi.fn(async () => {});
vi.mock('../../../web/src/shared/vault/vaultExpenses.js', () => ({ getExpenses: (...a) => getExpenses(...a), saveExpense: (...a) => saveExpense(...a), deleteExpense: (...a) => deleteExpense(...a) }));
vi.mock('../../../web/src/shared/vault/vaultIncomes.js', () => ({ getIncomes: (...a) => getIncomes(...a), updateIncome: (...a) => updateIncome(...a), deleteIncome: (...a) => deleteIncome(...a), createIncome: (...a) => createIncome(...a) }));

import { findEditCandidates, applyEdit, undoEdit } from '../../../web/src/features/ai/aiEdit.js';

const exp = (id, title, date, createdAt, extra = {}) => ({ id, title, date, createdAt, amount: 1000, category: 'food', ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  getIncomes.mockResolvedValue({ incomes: [] });
  getExpenses.mockResolvedValue({ expenses: [
    exp('e1', 'نان', '2026-11-08', '2026-11-08T10:00:00Z'),
    exp('e2', 'تیپاکس', '2026-11-07', '2026-11-09T09:00:00Z'),
    exp('e3', 'تیپاکس قبلی', '2026-11-01', '2026-11-01T09:00:00Z'),
    exp('e4', 'قسط', '2026-11-09', '2026-11-09T11:00:00Z', { recordedBy: 'loan' }),
    exp('e5', 'خرید بزرگ', '2026-11-09', '2026-11-09T12:00:00Z', { payments: [{ accountId: 'a' }, { accountId: 'b' }] }),
  ] });
});

const answer = (extra) => ({ op: 'update', kind: 'expense', target: { which: 'search', text: '', date: '' }, changes: { amount: 5000 }, ...extra });

describe('findEditCandidates', () => {
  it('the latest means the most recently created, never another feature’s or a linked one', async () => {
    const found = await findEditCandidates(answer({ target: { which: 'last', text: '', date: '' } }));
    expect(found.map((c) => c.record.id)).toEqual(['e2']);
  });
  it('finds by a word in the title, newest day first', async () => {
    const found = await findEditCandidates(answer({ target: { which: 'search', text: 'تیپاکس', date: '' } }));
    expect(found.map((c) => c.record.id)).toEqual(['e2', 'e3']);
  });
  it('a deletion may take a linked expense, but not another feature’s', async () => {
    const found = await findEditCandidates(answer({ op: 'delete', changes: {}, target: { which: 'search', text: '', date: '' } }));
    const ids = found.map((c) => c.record.id);
    expect(ids).toContain('e5');
    expect(ids).not.toContain('e4');
  });
});

describe('applyEdit / undoEdit', () => {
  const candidates = (record, kind = 'expense') => [{ kind, record }];
  it('updates only what changes and undoes it', async () => {
    const record = exp('e1', 'نان', '2026-11-08', 'x');
    const done = await applyEdit(answer({ candidates: candidates(record), chosenId: 'e1' }));
    expect(saveExpense).toHaveBeenCalledWith({ amount: 5000 }, record);
    expect(done.before).toEqual({ amount: 1000 });
    await undoEdit(done);
    expect(saveExpense).toHaveBeenLastCalledWith({ amount: 1000 }, record);
  });
  it('maps an income’s day to incomeDate', async () => {
    const record = { id: 'i1', title: 'فروش', incomeDate: '2026-11-01', amount: 9, category: 'other', createdAt: 'x' };
    await applyEdit(answer({ kind: 'income', changes: { date: '2026-11-05' }, candidates: candidates(record, 'income'), chosenId: 'i1' }));
    expect(updateIncome).toHaveBeenCalledWith('i1', { ...record, incomeDate: '2026-11-05' });
  });
  it('deletes and puts the same expense back on undo', async () => {
    const record = exp('e1', 'نان', '2026-11-08', 'x');
    const done = await applyEdit({ op: 'delete', kind: 'expense', changes: {}, candidates: candidates(record), chosenId: 'e1' });
    expect(deleteExpense).toHaveBeenCalledWith('e1', record);
    await undoEdit(done);
    expect(saveExpense).toHaveBeenCalledWith(record, null, { id: 'e1' });
  });
});

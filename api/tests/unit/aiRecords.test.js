/**
 * aiRecords.test.js — The `records` intent of the AI assistant: spoken items become expenses and
 * incomes (everyday section, tomans), and can be taken back
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const saveExpenses = vi.fn(async (list) => list.map((x, i) => ({ ...x, id: `e${i}` })));
const deleteExpenses = vi.fn(async () => {});
const createIncomes = vi.fn(async (list) => list.map((x, i) => ({ ...x, id: `i${i}` })));
const deleteIncomes = vi.fn(async () => {});
vi.mock('../../../web/src/shared/vault/vaultExpenses.js', () => ({ saveExpenses: (...a) => saveExpenses(...a), deleteExpenses: (...a) => deleteExpenses(...a) }));
vi.mock('../../../web/src/shared/vault/vaultIncomes.js', () => ({ createIncomes: (...a) => createIncomes(...a), deleteIncomes: (...a) => deleteIncomes(...a) }));

import { saveVoiceItems, undoVoiceItems } from '../../../web/src/features/ai/aiRecords.js';

const ITEMS = [
  { kind: 'expense', amount: 1000, title: 'نان', category: 'food', date: '2026-11-08', accountId: 'acc_1' },
  { kind: 'income', amount: 250000, title: 'فروش', category: 'other', date: '2026-11-09', accountId: '' },
];

describe('aiRecords', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates expenses and incomes in tomans on their days', async () => {
    const saved = await saveVoiceItems(ITEMS);
    expect(saveExpenses).toHaveBeenCalledWith([{ title: 'نان', category: 'food', amount: 1000, accountId: 'acc_1', currency: 'IRT', date: '2026-11-08' }]);
    expect(createIncomes).toHaveBeenCalledWith([{ title: 'فروش', category: 'other', amount: 250000, accountId: '', currency: 'IRT', incomeDate: '2026-11-09' }]);
    expect(saved.expenses).toHaveLength(1);
    expect(saved.incomes).toHaveLength(1);
  });

  it('does not call a store with nothing for it', async () => {
    await saveVoiceItems([ITEMS[0]]);
    expect(createIncomes).not.toHaveBeenCalled();
  });

  it('undoes what it created', async () => {
    await undoVoiceItems(await saveVoiceItems(ITEMS));
    expect(deleteExpenses).toHaveBeenCalledTimes(1);
    expect(deleteIncomes).toHaveBeenCalledWith(['i0']);
  });
});

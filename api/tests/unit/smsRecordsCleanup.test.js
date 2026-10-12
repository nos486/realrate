/**
 * smsRecordsCleanup.test.js — Only SMS-made expenses and incomes are found and deleted
 */
import { describe, it, expect, vi } from 'vitest';

const vault = vi.hoisted(() => ({
  getExpenses: vi.fn(),
  deleteExpense: vi.fn(async () => ({})),
  getIncomes: vi.fn(),
  deleteIncome: vi.fn(async () => ({})),
}));
vi.mock('../../../web/src/shared/vault/vaultExpenses.js', () => ({ getExpenses: vault.getExpenses, deleteExpense: vault.deleteExpense }));
vi.mock('../../../web/src/shared/vault/vaultIncomes.js', () => ({ getIncomes: vault.getIncomes, deleteIncome: vault.deleteIncome }));

const { findSmsRecords, deleteSmsRecords } = await import('../../../web/src/features/app-settings/smsRecordsCleanup.js');

describe('SMS records cleanup', () => {
  it('keeps hand-entered records out and deletes the rest', async () => {
    vault.getExpenses.mockResolvedValue({ expenses: [
      { id: 'e1', source: 'sms', smsKey: 'k1' },
      { id: 'e2', source: 'manual' },
      { id: 'e3' },
    ] });
    vault.getIncomes.mockResolvedValue({ incomes: [
      { id: 'i1', source: 'sms', smsKey: 'k2' },
      { id: 'i2', source: 'manual' },
    ] });
    const found = await findSmsRecords('2026-01-01', '2026-01-31');
    expect(vault.getExpenses).toHaveBeenCalledWith({ from: '2026-01-01', to: '2026-01-31' });
    expect(found.expenses.map((e) => e.id)).toEqual(['e1']);
    expect(found.incomes.map((i) => i.id)).toEqual(['i1']);
    expect(await deleteSmsRecords(found)).toBe(2);
    expect(vault.deleteExpense).toHaveBeenCalledWith('e1', found.expenses[0]);
    expect(vault.deleteIncome).toHaveBeenCalledWith('i1');
  });

  it('deletes several at a time and reports progress', async () => {
    let active = 0;
    let peak = 0;
    vault.deleteExpense.mockImplementation(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 1));
      active -= 1;
    });
    const expenses = Array.from({ length: 20 }, (_, i) => ({ id: `e${i}` }));
    const seen = [];
    expect(await deleteSmsRecords({ expenses, incomes: [] }, (done, total) => seen.push([done, total]))).toBe(20);
    expect(peak).toBeGreaterThan(1);
    expect(seen.at(-1)).toEqual([20, 20]);
  });
});

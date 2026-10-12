/**
 * smsRecordsCleanup.test.js — Only SMS-made expenses and incomes are found and deleted
 */
import { describe, it, expect, vi } from 'vitest';

const vault = vi.hoisted(() => ({
  getExpenses: vi.fn(),
  deleteExpenses: vi.fn(async () => ({})),
  getIncomes: vi.fn(),
  deleteIncomes: vi.fn(async () => ({})),
}));
vi.mock('../../../web/src/shared/vault/vaultExpenses.js', () => ({ getExpenses: vault.getExpenses, deleteExpenses: vault.deleteExpenses }));
vi.mock('../../../web/src/shared/vault/vaultIncomes.js', () => ({ getIncomes: vault.getIncomes, deleteIncomes: vault.deleteIncomes }));

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
    // Together, not one request each
    expect(vault.deleteExpenses).toHaveBeenCalledWith(found.expenses);
    expect(vault.deleteIncomes).toHaveBeenCalledWith(['i1']);
  });
});

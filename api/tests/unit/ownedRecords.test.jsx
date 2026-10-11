// @vitest-environment happy-dom
/**
 * ownedRecords.test.jsx — What another feature records in the expenses or incomes (a loan's paid
 * installment, a subscription's payment, a cleared cheque's money) is that feature's
 * (recordOwners.js): the expenses and incomes neither edit, move nor delete it — the store refuses
 * unless its owner asks — and their lists show its page instead of edit and delete
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { recordOwnerOf, recordOwnerInfo, RECORD_OWNERS } from '../../src/domain/recordOwners.js';
import { validateExpense } from '../../src/domain/expenseDocument.js';
import { validateIncome } from '../../src/domain/incomeDocument.js';

vi.mock('../../../web/src/shared/vault/vaultApi.js', () => ({
  VAULT_BATCH_MAX: 100,
  putVaultRecords: vi.fn(async () => ({})),
  listVaultRecords: vi.fn(async () => ({ records: [] })),
  deleteVaultRecord: vi.fn(async () => ({})),
}));
vi.mock('../../../web/src/shared/vault/vaultRecordMeta.js', () => ({ putRecord: vi.fn(), recordDateOf: (kind, e) => e.date }));
vi.mock('../../../web/src/shared/vault/vaultStore.js', () => ({
  encryptVaultRecord: vi.fn(async (v) => JSON.stringify(v)),
  decryptVaultRecord: vi.fn(async (p) => JSON.parse(p)),
  decryptVaultRecords: async (payloads) => Promise.all(payloads.map(async (p) => JSON.parse(p))),
}));
vi.mock('../../../web/src/shared/vault/recordLinks.js', () => ({ syncRecordLinks: vi.fn(), releaseRecordLinks: vi.fn() }));
vi.mock('../../../web/src/features/loans/context/LoansContext.jsx', () => ({ useOptionalLoans: () => [] }));

const store = await import('../../../web/src/shared/vault/vaultExpenses.js');
const vaultApi = await import('../../../web/src/shared/vault/vaultApi.js');
const { default: ExpensesTable } = await import('../../../web/src/features/expenses/components/ExpensesTable.jsx');
const { default: IncomesTable } = await import('../../../web/src/features/incomes/components/IncomesTable.jsx');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const base = { groupId: 'exg_daily', title: 'قسط وام خودرو', amount: 4_000_000, currency: 'IRT', date: '2026-03-01', category: 'installments' };

describe('who owns a record', () => {
  it('is the feature that recorded it; an older one by its id and what it names; none for the user\'s', () => {
    expect(recordOwnerOf({ id: 'exp_1', recordedBy: 'loan' })).toBe('loan');
    expect(recordOwnerOf({ id: 'exp_sabc', subscriptionId: 'sub_1' })).toBe('subscription');
    expect(recordOwnerOf({ id: 'exp_sabc', chequeId: 'chq_1' })).toBe('cheque');
    expect(recordOwnerOf({ id: 'exp_sabc', loanInstallment: { loanId: 'l', installmentId: '1' } })).toBe('loan');
    expect(recordOwnerOf({ id: 'exp_1', chequeId: 'chq_1' })).toBeNull();
    expect(recordOwnerOf({ id: 'exp_1', recordedBy: 'nobody' })).toBeNull();
    expect(recordOwnerInfo({ id: 'x', recordedBy: 'cheque' })).toEqual({ key: 'cheque', ...RECORD_OWNERS.cheque });
  });

  it('is kept by the documents, an unknown one never', () => {
    expect(validateExpense({ ...base, recordedBy: 'loan' }).value.recordedBy).toBe('loan');
    expect(validateExpense({ ...base, recordedBy: 'me' }).value).not.toHaveProperty('recordedBy');
    expect(validateIncome({ title: 'چک', amount: 10, incomeDate: '2026-03-01', recordedBy: 'cheque' }).value.recordedBy).toBe('cheque');
  });
});

describe('the store', () => {
  const owned = { ...base, id: 'exp_s1', recordedBy: 'loan', loanInstallment: { loanId: 'l1', installmentId: '7' } };

  it('refuses to edit, move or delete what another feature recorded', async () => {
    await expect(store.saveExpense({ amount: 1 }, owned)).rejects.toThrow(/«وام‌ها»/);
    await expect(store.moveExpenses([owned], 'exg_proj')).rejects.toThrow(/«وام‌ها»/);
    await expect(store.deleteExpense(owned.id, owned)).rejects.toThrow(/«وام‌ها»/);
    expect(vaultApi.deleteVaultRecord).not.toHaveBeenCalled();
  });

  it('lets its owner change and remove it, and the user\'s own as before', async () => {
    const { expense } = await store.saveExpense({ amount: 4_100_000 }, owned, { asOwner: true });
    expect(expense).toMatchObject({ amount: 4_100_000, recordedBy: 'loan' });
    await store.deleteExpense(owned.id, owned, { asOwner: true });
    expect(vaultApi.deleteVaultRecord).toHaveBeenCalledWith('expense', 'exp_s1');
    const mine = { ...base, id: 'exp_9', category: 'groceries', title: 'نان' };
    await expect(store.saveExpense({ amount: 5 }, mine)).resolves.toMatchObject({ expense: { amount: 5 } });
  });
});

describe('the lists', () => {
  it('show an owned expense\'s page in place of edit and delete', () => {
    const rows = [
      { ...base, id: 'exp_s1', recordedBy: 'loan' },
      { ...base, id: 'exp_2', title: 'نان', category: 'groceries' },
    ];
    render(<MemoryRouter><ExpensesTable expenses={rows} onEdit={() => {}} onDelete={() => {}} /></MemoryRouter>);
    const link = screen.getByRole('link', { name: 'ثبت خودکار از «وام‌ها»' });
    expect(link.getAttribute('href')).toBe('/loans');
    // Only the user's own has edit and delete
    expect(screen.getAllByTitle('ویرایش هزینه')).toHaveLength(1);
    expect(screen.getAllByTitle('حذف هزینه')).toHaveLength(1);
  });

  it('and an income a cleared cheque recorded', () => {
    const rows = [
      { id: 'inc_1', title: 'چک شرکت', amount: 9_000_000, currency: 'IRT', incomeDate: '2026-03-01', category: 'freelance', chequeId: 'chq_1', recordedBy: 'cheque' },
      { id: 'inc_2', title: 'حقوق', amount: 30_000_000, currency: 'IRT', incomeDate: '2026-03-01', category: 'salary' },
    ];
    render(<MemoryRouter><IncomesTable incomes={rows} onEdit={() => {}} onDelete={() => {}} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'ثبت خودکار از «چک‌ها»' }).getAttribute('href')).toBe('/cheques');
    expect(screen.getAllByTitle('ویرایش درآمد')).toHaveLength(1);
  });
});

/**
 * vaultLoansList.test.js — The list of loans the browser reads (shared/vault/vaultLoans.js) carries
 * each loan's whole installment schedule, paid ones included, which the calendar widget needs to
 * show finished installments
 */
import { describe, it, expect, vi } from 'vitest';
import { createLoanDoc, markInstallmentPaidDoc } from '../../src/domain/loanDocument.js';

let records = [];
vi.mock('../../../web/src/shared/vault/vaultApi.js', () => ({
  listVaultRecords: async () => ({ records }),
  deleteVaultRecord: async () => ({}),
}));
vi.mock('../../../web/src/shared/vault/vaultStore.js', () => ({
  encryptVaultRecord: async (v) => v,
  decryptVaultRecords: async (payloads) => payloads,
}));
vi.mock('../../../web/src/shared/vault/vaultRecordMeta.js', () => ({
  putRecord: async () => ({}),
  backfillRecordDates: () => {},
  backfillReminders: () => {},
}));
vi.mock('../../../web/src/shared/banks/useCustomBanks.js', () => ({ ensureCustomBanks: async () => [] }));

import { getLoans } from '../../../web/src/shared/vault/vaultLoans.js';

describe('the list of loans', () => {
  it('carries the whole schedule with the paid installments, and no extra payments', async () => {
    let doc = createLoanDoc({ id: 'loan_a', title: 'Car', principalAmount: 10_000_000, annualInterestRate: 12, installmentCount: 4, startDate: '1404-01-01' });
    doc = markInstallmentPaidDoc(doc, '1').doc;
    records = [{ id: 'loan_a', payload: doc }];
    const { loans } = await getLoans();
    expect(loans).toHaveLength(1);
    expect(loans[0].installments).toHaveLength(4);
    expect(loans[0].installments.filter((i) => i.isPaid)).toHaveLength(1);
    expect(loans[0].extraPayments).toBeUndefined();
    expect(loans[0].nextDueInstallment).toBeTruthy();
  });
});

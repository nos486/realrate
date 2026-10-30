/**
 * creditSettlementSms.test.js — Paying a bank credit's debt, read from two bank messages: the
 * withdrawal (what was paid) and the deposit into the credit (the debt settled) pair up even when
 * the bank's interest and fee is well above a transfer's fee, fill the settlement form, and once
 * recorded neither message waits again
 */
import { describe, it, expect, vi } from 'vitest';

const vault = vi.hoisted(() => ({ transfers: [] }));
vi.mock('../../../web/src/shared/vault/vaultExpenses.js', () => ({ getExpenses: vi.fn(async () => ({ expenses: [] })) }));
vi.mock('../../../web/src/features/incomes/api/incomeApi.js', () => ({ getIncomes: vi.fn(async () => ({ incomes: [] })) }));
vi.mock('../../../web/src/shared/vault/vaultTransfers.js', () => ({ getTransfers: vi.fn(async () => ({ transfers: vault.transfers })) }));

const { findCreditSettlementCounterpart, findTransferCounterpart, smsCreditSettlementDraft } = await import('../../../web/src/features/sms-inbox/smsDrafts.js');
const { findRecorded, sameDayKey } = await import('../../../web/src/features/sms-inbox/recordedCheck.js');

const msg = (fingerprint, direction, amount, date = '2026-10-30', extra = {}) => ({
  fingerprint, tx: { direction, bankId: 'ayandeh', amount, date, time: '10:04', key: `k-${fingerprint}`, ...extra },
});
const credit = { id: 'c1', type: 'credit', name: 'اعتبار سازمانی', bankId: 'ayandeh', accountNumber: '9999', credit: { limit: 50_000_000 } };
const bank = { id: 'b1', type: 'bank', name: 'آینده', bankId: 'ayandeh', accountNumber: '1234' };

describe('a credit settlement from bank messages', () => {
  const paid = msg('d', 'debit', 30_503_420, '2026-10-30', { accountLast4: '1234' });
  const deposit = msg('c', 'credit', 29_900_070, '2026-10-30', { accountLast4: '9999' });

  it('pairs a deposit 2% short of the withdrawal, which a transfer would not', () => {
    expect(findTransferCounterpart(paid, [paid, deposit])).toBeNull();
    expect(findCreditSettlementCounterpart(paid, [paid, deposit])?.fingerprint).toBe('c');
    expect(findCreditSettlementCounterpart(deposit, [paid, deposit])?.fingerprint).toBe('d');
  });

  it('does not pair a gap above 10%, a deposit above the withdrawal, or another day', () => {
    expect(findCreditSettlementCounterpart(paid, [paid, msg('x', 'credit', 20_000_000)])).toBeNull();
    expect(findCreditSettlementCounterpart(paid, [paid, msg('y', 'credit', 31_000_000)])).toBeNull();
    expect(findCreditSettlementCounterpart(paid, [paid, msg('z', 'credit', 29_900_070, '2026-11-02')])).toBeNull();
  });

  it('the deposit is the debt settled into its credit, the withdrawal what was paid from its account', () => {
    const { draft, counterpart } = smsCreditSettlementDraft(paid, [paid, deposit], [credit, bank]);
    expect(counterpart.fingerprint).toBe('c');
    expect(draft).toEqual({
      creditId: 'c1', fromAccountId: 'b1', settled: 29_900_070, paid: 30_503_420, date: '2026-10-30', smsKeys: ['k-d', 'k-c'],
    });
  });

  it('falls back to the only credit, and leaves the payer empty when it would be the credit', () => {
    const plainDeposit = msg('c2', 'credit', 29_900_070);
    const { draft } = smsCreditSettlementDraft(plainDeposit, [plainDeposit], [credit, bank]);
    expect(draft).toMatchObject({ creditId: 'c1', settled: 29_900_070, paid: 29_900_070, smsKeys: ['k-c2'] });
    const two = [credit, { ...credit, id: 'c2' }];
    expect(smsCreditSettlementDraft(plainDeposit, [plainDeposit], two).draft.creditId).toBe('');
  });

  it('a recorded settlement covers its deposit by the debt settled, not the amount paid', async () => {
    vault.transfers = [{ id: 't1', fromAccountId: 'b1', toAccountId: 'c1', amount: 30_503_420, fee: 603_350, date: '2026-10-30' }];
    const { sameDay } = await findRecorded([paid, deposit]);
    expect(sameDay.has(sameDayKey('debit', '2026-10-30', 30_503_420))).toBe(true);
    expect(sameDay.has(sameDayKey('credit', '2026-10-30', 29_900_070))).toBe(true);
  });
});

/**
 * transfers.test.js — money moved between the user's own accounts: the document, the totals per
 * account, the record kind, and a bank message's draft (with the other side's message)
 */
import { describe, it, expect } from 'vitest';
import { validateTransfer, summarizeTransfersByAccount, compareTransfers } from '../../src/domain/transferDocument.js';
import { VAULT_RECORD_KINDS, VAULT_KIND_FEATURES } from '../../src/repositories/vault.repository.js';
import { smsTransferDraft, findTransferCounterpart } from '../../../web/src/features/sms-inbox/smsDrafts.js';

const base = { fromAccountId: 'acc_1', toAccountId: 'acc_2', amount: 2_000_000, date: '2026-09-28' };

describe('transfer document', () => {
  it('normalizes a valid transfer', () => {
    expect(validateTransfer({ ...base, amount: '2000000.4', fee: 0, notes: '  کارت به کارت  ', smsKeys: ['k1', 'k1', '', 'k2', 'k3'] }).value).toEqual({
      ...base, notes: 'کارت به کارت', smsKeys: ['k1', 'k2'],
    });
    expect(validateTransfer({ ...base, fee: 5000 }).value.fee).toBe(5000);
  });

  it('refuses a transfer to the same account, no amount, a bad day or a fee above the amount', () => {
    expect(validateTransfer({ ...base, toAccountId: 'acc_1' }).error).toBeTruthy();
    expect(validateTransfer({ ...base, toAccountId: '' }).error).toBeTruthy();
    expect(validateTransfer({ ...base, amount: 0 }).error).toBeTruthy();
    expect(validateTransfer({ ...base, date: '1405/07/06' }).error).toBeTruthy();
    expect(validateTransfer({ ...base, fee: 3_000_000 }).error).toBeTruthy();
  });

  it('sums what moved in and out of each account (the fee stays with the bank)', () => {
    const by = summarizeTransfersByAccount([
      { ...base, fee: 10_000 },
      { fromAccountId: 'acc_2', toAccountId: 'acc_3', amount: 500_000, date: '2026-09-29' },
    ]);
    expect(by.get('acc_1')).toEqual({ in: 0, out: 2_000_000, count: 1 });
    expect(by.get('acc_2')).toEqual({ in: 1_990_000, out: 500_000, count: 2 });
    expect(by.get('acc_3')).toEqual({ in: 500_000, out: 0, count: 1 });
    expect([{ date: '2026-01-01' }, { date: '2026-02-01' }].sort(compareTransfers)[0].date).toBe('2026-02-01');
  });

  it('is its own encrypted kind, with the accounts feature', () => {
    expect(VAULT_RECORD_KINDS).toContain('transfer');
    expect(VAULT_KIND_FEATURES.transfer).toBe('bank_accounts');
  });
});

describe('a transfer from bank messages', () => {
  const msg = (fingerprint, direction, bankId, amount, date) => ({
    fingerprint, tx: { direction, bankId, amount, date, time: '10:00', key: `${bankId}|${direction}|${amount}|${date}` },
  });
  const accounts = [
    { id: 'acc_blu', name: 'بلو', bankId: 'blu', type: 'bank' },
    { id: 'acc_mellat', name: 'ملت', bankId: 'mellat', type: 'bank' },
  ];

  it('finds the other side: opposite direction, same amount, within a day', () => {
    const debit = msg('d', 'debit', 'blu', 2_000_000, '2026-09-28');
    const pending = [
      debit,
      msg('c1', 'credit', 'mellat', 2_000_000, '2026-09-29'),
      msg('c2', 'credit', 'mellat', 2_000_001, '2026-09-28'),
      msg('d2', 'debit', 'mellat', 2_000_000, '2026-09-28'),
    ];
    expect(findTransferCounterpart(debit, pending)?.fingerprint).toBe('c1');
    expect(findTransferCounterpart(debit, [debit, msg('c3', 'credit', 'mellat', 2_000_000, '2026-10-01')])).toBeNull();
  });

  it('the withdrawal\'s account is the source, the deposit\'s the destination; both messages are covered', () => {
    const debit = msg('d', 'debit', 'blu', 2_000_000, '2026-09-28');
    const credit = msg('c', 'credit', 'mellat', 2_000_000, '2026-09-28');
    const { draft, counterpart } = smsTransferDraft(credit, [debit, credit], accounts);
    expect(counterpart.fingerprint).toBe('d');
    expect(draft).toMatchObject({ fromAccountId: 'acc_blu', toAccountId: 'acc_mellat', amount: 2_000_000, date: '2026-09-28' });
    expect(draft.smsKeys).toEqual([credit.tx.key, debit.tx.key]);
  });

  it('alone, only its own side is known', () => {
    const debit = msg('d', 'debit', 'blu', 2_000_000, '2026-09-28');
    const { draft, counterpart } = smsTransferDraft(debit, [debit], accounts);
    expect(counterpart).toBeNull();
    expect(draft).toMatchObject({ fromAccountId: 'acc_blu', toAccountId: '', smsKeys: [debit.tx.key] });
  });
});

/**
 * smsDrafts.js — What a bank SMS read by the Android app becomes when recorded
 *
 * A withdrawal → an everyday expense (or an expense in a project); a deposit → an income, or someone's share of a shared
 * expense coming back (a reimbursement on that expense, ShareDepositSheet.jsx). The form opens filled in from the
 * message (amount in tomans, day, the matched account, a note with the bank and time) and the
 * user only picks the category.
 */

import { resolveBank } from '../../shared/banks/resolveBank.js';
import { matchSmsAccount } from '../../utils/bankSms.js';

const faTime = (time) => time.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);

function smsNote(tx) {
  const bank = resolveBank({ bankId: tx.bankId });
  return [`پیامک ${bank.shortName}`, tx.time && `ساعت ${faTime(tx.time)}`].filter(Boolean).join(' · ');
}

/** The expense form's draft for a withdrawal */
export function smsExpenseDraft(tx, accounts = []) {
  return {
    amount: Math.round(tx.amount),
    date: tx.date,
    accountId: matchSmsAccount(tx, accounts),
    notes: smsNote(tx),
    source: 'sms',
    bankId: tx.bankId,
    smsFingerprint: tx.fingerprint,
    smsKey: tx.key,
  };
}

/** A withdrawal going to a project: its title is required there, so it starts as «برداشت <bank>» */
export function smsProjectExpenseDraft(tx, accounts = []) {
  return { ...smsExpenseDraft(tx, accounts), title: `برداشت ${resolveBank({ bankId: tx.bankId }).shortName}` };
}

/** The income form's draft for a deposit */
export function smsIncomeDraft(tx) {
  const bank = resolveBank({ bankId: tx.bankId });
  return {
    title: `واریز ${bank.shortName}`,
    amount: Math.round(tx.amount),
    incomeDate: tx.date,
    notes: smsNote(tx),
    smsFingerprint: tx.fingerprint,
    smsKey: tx.key,
  };
}

/** The reimbursement a deposit adds to a shared expense («دنگ», in tomans) */
export function smsReimbursement(tx, accounts = []) {
  return {
    amount: Math.round(tx.amount),
    date: tx.date,
    accountId: matchSmsAccount(tx, accounts) || '',
    notes: smsNote(tx),
    source: 'sms',
    bankId: tx.bankId || '',
    smsKey: tx.key || '',
  };
}

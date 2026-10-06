/**
 * smsDrafts.js — What a bank SMS read by the Android app becomes when recorded
 *
 * A withdrawal → an everyday expense (or an expense in a project); a withdrawal or a deposit
 * between the user's own accounts → a transfer (smsTransferDraft), neither expense nor income; a deposit → an income, or someone's share of a shared
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

/** Interest paid by the bank: the message names it (e.g. Shahr's «سود» line) */
const INTEREST_RE = /^سود(\s|$)/;

/**
 * The income form's draft for a deposit: titled after what the message says it is (e.g. «سود
 * بانک شهر») or «واریز <bank>»; the bank's interest starts as «سود سرمایه‌گذاری»
 */
export function smsIncomeDraft(tx) {
  const bank = resolveBank({ bankId: tx.bankId });
  const desc = String(tx.description || '').trim();
  const interest = INTEREST_RE.test(desc);
  return {
    title: desc ? `${desc} ${bank.shortName}`.slice(0, 80) : `واریز ${bank.shortName}`,
    ...(interest ? { category: 'investment' } : {}),
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

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The other side of a transfer between the user's own accounts, still waiting: the opposite
 * direction, the same amount, within a day, another message
 * @param {object} item the message being recorded
 * @param {object[]} pending the waiting messages
 */
export function findTransferCounterpart(item, pending = []) {
  const { tx } = item;
  const opposite = tx.direction === 'debit' ? 'credit' : 'debit';
  const day = Date.parse(`${tx.date}T00:00:00Z`);
  return pending.find((p) => p.fingerprint !== item.fingerprint
    && p.tx?.direction === opposite
    && Math.round(p.tx.amount) === Math.round(tx.amount)
    && Math.abs(Date.parse(`${p.tx.date}T00:00:00Z`) - day) <= DAY_MS) || null;
}

/**
 * The transfer form's draft for a message (and the other side's message, when it waits too):
 * the withdrawal's account is the source, the deposit's the destination
 * @returns {{ draft: object, counterpart: object|null }}
 */
export function smsTransferDraft(item, pending = [], accounts = []) {
  const counterpart = findTransferCounterpart(item, pending);
  const debit = item.tx.direction === 'debit' ? item : counterpart;
  const credit = item.tx.direction === 'credit' ? item : counterpart;
  const accountOf = (msg) => (msg ? matchSmsAccount(msg.tx, accounts) || '' : '');
  return {
    counterpart,
    draft: {
      fromAccountId: accountOf(debit),
      toAccountId: accountOf(credit),
      amount: Math.round(item.tx.amount),
      // The withdrawal's day (the money left then)
      date: (debit || item).tx.date,
      notes: smsNote(item.tx),
      smsKeys: [item.tx.key, counterpart?.tx.key].filter(Boolean),
    },
  };
}

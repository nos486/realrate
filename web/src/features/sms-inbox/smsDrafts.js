/**
 * smsDrafts.js — What a bank SMS read by the Android app becomes when recorded
 *
 * A withdrawal → an everyday expense (or an expense in a project); a withdrawal or a deposit
 * between the user's own accounts → a transfer (smsTransferDraft), neither expense nor income; a
 * withdrawal and the deposit it paid into a bank credit → that credit's settlement
 * (smsCreditSettlementDraft: the debt settled, what was paid, the difference its fee); a deposit → an income, or someone's share of a shared
 * expense coming back (a reimbursement on that expense, ShareDepositSheet.jsx). The form opens filled in from the
 * message (amount in tomans, day, the matched account, a note with the bank and time) and the
 * user only picks the category.
 */

import { t } from '../../utils/i18n.js';
import { toPersianDigits } from '../../shared/utils/formatters.js';
import { resolveBank } from '../../shared/banks/resolveBank.js';
import { matchSmsAccount, smsCategoryOf } from '../../utils/bankSms.js';
import { SMS_DESCRIPTION_CATEGORIES } from '../../utils/bankSmsTemplates.js';
import { isCreditAccount } from '../../utils/accountDocument.js';

const faTime = (v) => toPersianDigits(v);

function smsNote(tx) {
  const bank = resolveBank({ bankId: tx.bankId });
  return [t('پیامک {bank}', { bank: bank.shortName }), tx.time && t('ساعت {time}', { time: faTime(tx.time) })].filter(Boolean).join(' · ');
}

/** The category a message starts in, from its own description (a rule of SMS_DESCRIPTION_CATEGORIES) */
function categoryOf(tx) {
  const category = smsCategoryOf(tx, SMS_DESCRIPTION_CATEGORIES);
  return category ? { category } : {};
}

/** The expense form's draft for a withdrawal */
export function smsExpenseDraft(tx, accounts = []) {
  return {
    ...categoryOf(tx),
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
  return { ...smsExpenseDraft(tx, accounts), title: t('برداشت {bank}', { bank: resolveBank({ bankId: tx.bankId }).shortName }) };
}

/**
 * The income form's draft for a deposit: titled after what the message says it is (its
 * description and the bank, e.g. «سود بانک شهر») or «واریز <bank>», in the category its
 * description points to, into the matched account
 */
export function smsIncomeDraft(tx, accounts = []) {
  const bank = resolveBank({ bankId: tx.bankId });
  const desc = String(tx.description || '').trim();
  return {
    title: desc ? `${desc} ${bank.shortName}`.slice(0, 80) : t('واریز {bank}', { bank: bank.shortName }),
    ...categoryOf(tx),
    amount: Math.round(tx.amount),
    incomeDate: tx.date,
    accountId: matchSmsAccount(tx, accounts),
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

/** The most a bank keeps as a transfer fee for the two messages to pair up on their own (tomans, and a share of the amount) */
export const TRANSFER_FEE_MAX = 100_000;
export const TRANSFER_FEE_MAX_SHARE = 0.01;

/** What the bank kept: the withdrawal less the deposit, or null when the pair cannot be a transfer with a fee */
function pairFee(debit, credit) {
  const out = Math.round(debit.tx.amount);
  const fee = out - Math.round(credit.tx.amount);
  return fee >= 0 && fee <= Math.min(TRANSFER_FEE_MAX, out * TRANSFER_FEE_MAX_SHARE) ? fee : null;
}

/** Messages of the opposite direction that are not `item` itself, whatever their amount (for picking by hand) */
export function oppositeMessages(item, pending = []) {
  const opposite = item.tx.direction === 'debit' ? 'credit' : 'debit';
  return pending.filter((p) => p.fingerprint !== item.fingerprint && p.tx?.direction === opposite);
}

/**
 * The other side of a transfer between the user's own accounts, still waiting: the opposite
 * direction within a day, another message, with the same amount or — the bank keeping a fee —
 * a deposit slightly below the withdrawal. The smallest fee wins, then the closest day.
 * @param {object} item the message being recorded
 * @param {object[]} pending the waiting messages
 */
export function findTransferCounterpart(item, pending = []) {
  const { tx } = item;
  const day = Date.parse(`${tx.date}T00:00:00Z`);
  let best = null;
  for (const p of oppositeMessages(item, pending)) {
    const gap = Math.abs(Date.parse(`${p.tx.date}T00:00:00Z`) - day);
    if (!(gap <= DAY_MS)) continue;
    const fee = tx.direction === 'debit' ? pairFee(item, p) : pairFee(p, item);
    if (fee === null) continue;
    if (!best || fee < best.fee || (fee === best.fee && gap < best.gap)) best = { p, fee, gap };
  }
  return best ? best.p : null;
}

/**
 * The transfer form's draft for a message and the other side's message (found among the waiting
 * ones, or `chosen` by hand): the withdrawal's account is the source, the deposit's the destination,
 * and what the deposit lacks of the withdrawal is the fee
 * @returns {{ draft: object, counterpart: object|null }}
 */
export function smsTransferDraft(item, pending = [], accounts = [], chosen = null) {
  const counterpart = chosen || findTransferCounterpart(item, pending);
  const debit = item.tx.direction === 'debit' ? item : counterpart;
  const credit = item.tx.direction === 'credit' ? item : counterpart;
  const accountOf = (msg) => (msg ? matchSmsAccount(msg.tx, accounts) || '' : '');
  const out = Math.round((debit || item).tx.amount);
  const fee = debit && credit ? Math.max(0, out - Math.round(credit.tx.amount)) : 0;
  return {
    counterpart,
    draft: {
      fromAccountId: accountOf(debit),
      toAccountId: accountOf(credit),
      amount: debit && credit ? Math.max(out, Math.round(credit.tx.amount)) : Math.round(item.tx.amount),
      ...(fee > 0 ? { fee } : {}),
      // The withdrawal's day (the money left then)
      date: (debit || item).tx.date,
      notes: smsNote(item.tx),
      smsKeys: [item.tx.key, counterpart?.tx.key].filter(Boolean),
    },
  };
}

/**
 * The most a credit's settlement may cost on top of the debt for its two messages to pair up on
 * their own (a share of the deposit): the bank's interest and fee, well above a transfer's fee
 */
export const CREDIT_SETTLEMENT_FEE_MAX_SHARE = 0.1;

/**
 * The other side of a credit's settlement, still waiting: the opposite direction within a day,
 * the withdrawal (what was paid) at least the deposit (the debt settled) and at most
 * CREDIT_SETTLEMENT_FEE_MAX_SHARE above it. The smallest difference wins, then the closest day.
 * @param {object} item the message being recorded
 * @param {object[]} pending the waiting messages
 */
export function findCreditSettlementCounterpart(item, pending = []) {
  const day = Date.parse(`${item.tx.date}T00:00:00Z`);
  let best = null;
  for (const p of oppositeMessages(item, pending)) {
    const gap = Math.abs(Date.parse(`${p.tx.date}T00:00:00Z`) - day);
    if (!(gap <= DAY_MS)) continue;
    const [debit, credit] = item.tx.direction === 'debit' ? [item, p] : [p, item];
    const deposit = Math.round(credit.tx.amount);
    const fee = Math.round(debit.tx.amount) - deposit;
    if (!(fee >= 0 && fee <= deposit * CREDIT_SETTLEMENT_FEE_MAX_SHARE)) continue;
    if (!best || fee < best.fee || (fee === best.fee && gap < best.gap)) best = { p, fee, gap };
  }
  return best ? best.p : null;
}

/**
 * The settlement form's draft for a message and the other side's message (found among the waiting
 * ones, or `chosen` by hand): the deposit is the debt settled, the withdrawal what was paid for it
 * (the difference the fee) from the withdrawal's account. The credit is the deposit's account when
 * it is one, else the user's only credit; with none of these the user picks it.
 * @returns {{ draft: { creditId: string, fromAccountId: string, settled: number, paid: number, date: string, smsKeys: string[] }, counterpart: object|null }}
 */
export function smsCreditSettlementDraft(item, pending = [], accounts = [], chosen = null) {
  const counterpart = chosen || findCreditSettlementCounterpart(item, pending);
  const debit = item.tx.direction === 'debit' ? item : counterpart;
  const credit = item.tx.direction === 'credit' ? item : counterpart;
  const accountOf = (msg) => (msg ? accounts.find((a) => a.id === matchSmsAccount(msg.tx, accounts)) : null);
  const credits = accounts.filter((a) => isCreditAccount(a) && !a.archived);
  const depositAccount = accountOf(credit);
  const payer = accountOf(debit);
  const paid = Math.round((debit || credit).tx.amount);
  return {
    counterpart,
    draft: {
      creditId: isCreditAccount(depositAccount) ? depositAccount.id : credits.length === 1 ? credits[0].id : '',
      fromAccountId: payer && !isCreditAccount(payer) ? payer.id : '',
      // Alone, the message is both (no fee) until the user says otherwise
      settled: credit ? Math.min(Math.round(credit.tx.amount), paid) : paid,
      paid,
      // The withdrawal's day (the money left then)
      date: (debit || item).tx.date,
      smsKeys: [item.tx.key, counterpart?.tx.key].filter(Boolean),
    },
  };
}

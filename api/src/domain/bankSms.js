/**
 * bankSms.js — Reads a bank's transaction SMS into a transaction (the engine)
 *
 * Each bank describes its messages declaratively in bankSmsTemplates.js; this file knows nothing
 * about any one bank. Adding a bank = one entry there + its sample messages in the tests (see
 * docs/BANK_SMS.md). Shared by the browser (paste an SMS, and the Android app reading them) and
 * the API, like the other domain modules; runs synchronously with no dependencies.
 *
 * Reading a message:
 *  1. normalizeSmsText: Persian/Arabic digits → ASCII, Arabic letters → Persian, invisible
 *     direction marks and spaces cleaned up, one trimmed line per line
 *  2. the templates of the bank (by sender, else every bank) are tried in order; the first whose
 *     `pattern` matches the whole normalized text wins
 *  3. the named groups it captured become the transaction (see BankSmsTransaction)
 *
 * A template's `pattern` uses these named groups (only `amount` is required):
 *   amount   the amount, digits with separators; may carry its sign ("397,500-", "-397,500")
 *   balance  the balance after it
 *   account  the account number (digits; masked digits like "123***4567" are fine)
 *   card     the card number (usually masked): its last 4 digits are kept
 *   date     "MM/DD", "YY/MM/DD" or "YYYY/MM/DD", Shamsi ("/", "-" or "." between, or none:
 *            "MMDD", "YYMMDD", "YYYYMMDD")
 *   time     "HH:MM"
 *   kind     a word naming the direction (برداشت / واریز / ...), mapped by `direction`
 *   desc     free text (the merchant, a terminal, ...)
 */

import { jalaliToGregorian, gregorianToJalali } from './loanCalculator.js';

/**
 * @typedef {object} BankSmsTemplate
 * @property {string} id               Unique, "<bank>-<what>" (e.g. "parsian-balance")
 * @property {RegExp} pattern          Matched against the whole normalized text (anchor it: ^…$)
 * @property {'rial'|'toman'} [unit]   Unit of amount/balance in the message (default rial)
 * @property {'sign'|'debit'|'credit'|{ debit?: string[], credit?: string[] }} [direction]
 *   'sign': from the amount's sign ("-" debit, "+" credit; default); fixed 'debit'/'credit'; or
 *   the words the `kind` group may hold for each
 */

/**
 * @typedef {object} BankSmsBank
 * @property {string} bankId           Standard bank id (config/banks.config.js)
 * @property {string[]} [senders]      Sender numbers/names the bank sends from (digits compared
 *   without "+98"/"0098"/"0" prefixes); the Android app reads only these senders
 * @property {BankSmsTemplate[]} templates
 */

/**
 * @typedef {object} BankSmsTransaction
 * @property {string} bankId
 * @property {string} templateId
 * @property {'debit'|'credit'} direction  debit = money out (an expense), credit = money in
 * @property {number} amount               tomans
 * @property {number|null} balance         tomans, when the message has it
 * @property {string} account              account number as written (digits and *), or ''
 * @property {string} accountLast4         last 4 digits of the account, or ''
 * @property {string} cardLast4            last 4 digits of the card, or ''
 * @property {string} date                 Gregorian YYYY-MM-DD ('' when the message has none)
 * @property {string} time                 HH:MM, or ''
 * @property {string} description
 * @property {string} fingerprint          same message text → same value
 * @property {string} key                  same transaction → same value, whatever the wording
 *   (smsTransactionKey): how a transaction already recorded is recognized
 */

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** One clean line per line: comparable digits, letters and spacing, whatever the phone sent */
export function normalizeSmsText(text) {
  return String(text ?? '')
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    // Direction marks, zero-width characters (not the ZWNJ of Persian words) and the BOM
    .replace(/[​‎‏‪-‮⁦-⁩﻿]/g, '')
    // Persian/Arabic separators and minus signs as ASCII
    .replace(/[٬،]/g, ',')
    .replace(/٫/g, '.')
    .replace(/[−‒–—]/g, '-')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

const GAP = '[\\s\\u200c]*';
/**
 * One-time passwords and login codes (same list as BankSmsPlugin.isSensitive on Android, which
 * already drops them before they reach the app): never read, stored or shown, even from a bank
 */
const SENSITIVE_RE = new RegExp(
  [
    `رمز${GAP}(دوم${GAP})?پویا`,
    `رمز${GAP}(یک${GAP}بار|موقت|عبور|ورود)`,
    `یک${GAP}بار${GAP}مصرف`,
    `کد${GAP}(تایید|تأیید|فعال${GAP}سازی|ورود|امنیتی|یک${GAP}بار)`,
    `\\b(otp|one[- ]?time|password|passcode|verification|login${GAP}code)\\b`,
  ].join('|'),
  'i',
);

export function isSensitiveSms(text) {
  return SENSITIVE_RE.test(String(text ?? '').replace(/ي/g, 'ی').replace(/ك/g, 'ک'));
}

/**
 * Sender digits without the Iranian prefixes ("+98", "0098", "98", "0"); a name in lower case
 * without spaces, dots, dashes or underscores — phones show the same sender as «Bank Shahr»,
 * «BankShahr» or «BANK-SHAHR»
 */
export function normalizeSender(sender) {
  const raw = String(sender ?? '').trim().toLowerCase();
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return raw.replace(/[\s._-]+/g, '');
  return digits.replace(/^(0098|98|0)/, '');
}

/** "397,500-" → { value: 397500, sign: '-' } */
function parseAmount(raw) {
  const text = String(raw ?? '');
  const sign = /-/.test(text) ? '-' : /\+/.test(text) ? '+' : '';
  const value = Number(text.replace(/[^\d.]/g, ''));
  return Number.isFinite(value) ? { value, sign } : null;
}

const toToman = (value, unit) => (unit === 'toman' ? value : value / 10);

function lastDigits(raw, count = 4) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length >= count ? digits.slice(-count) : '';
}

const pad = (n) => String(n).padStart(2, '0');

/**
 * The Gregorian day of a Shamsi date in a message. Without a year, the most recent such day
 * up to `today` (a message from 12/29 read on 01/02 is from last year).
 * @returns {string} YYYY-MM-DD, or '' when it is not a date
 */
export function smsDateToIso(raw, today = new Date()) {
  const text = String(raw ?? '');
  // Without separators: MMDD, YYMMDD or YYYYMMDD
  const compact = /^\d{4}$|^\d{6}$|^\d{8}$/.test(text) ? text.match(/^(\d{2,4}?)?(\d{2})(\d{2})$/) : null;
  const parts = (compact ? compact.slice(1).filter(Boolean) : text.split(/[/.-]/)).map((p) => Number(p));
  if (parts.some((p) => !Number.isInteger(p))) return '';
  let jy;
  let jm;
  let jd;
  if (parts.length === 2) [jm, jd] = parts;
  else if (parts.length === 3) [jy, jm, jd] = parts;
  else return '';
  if (jm < 1 || jm > 12 || jd < 1 || jd > 31) return '';

  const { jy: thisYear } = gregorianToJalali(today.getFullYear(), today.getMonth() + 1, today.getDate());
  if (jy === undefined) {
    jy = thisYear;
    const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const g = jalaliToGregorian(jy, jm, jd);
    // A day after today (a day of slack for time zones) is last year's
    if (`${g.year}-${pad(g.month)}-${pad(g.day)}` > addDays(todayIso, 1)) jy -= 1;
  } else if (jy < 100) {
    jy += 1400;
  }
  const g = jalaliToGregorian(jy, jm, jd);
  return `${g.year}-${pad(g.month)}-${pad(g.day)}`;
}

function addDays(iso, days) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** A short stable hash of the normalized message (FNV-1a, hex) */
export function smsFingerprint(text) {
  let hash = 0x811c9dc5;
  const normalized = normalizeSmsText(text);
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * A transaction's identity: bank, direction, amount (tomans), day and time. Two messages with the
 * same key are the same transaction; an expense or income recorded from one keeps it (`smsKey`).
 */
export function smsTransactionKey({ bankId, direction, amount, date, time }) {
  return [bankId, direction, Math.round(Number(amount) || 0), date || '', time || ''].join('|');
}

function resolveDirection(template, groups, sign) {
  const rule = template.direction || 'sign';
  if (rule === 'debit' || rule === 'credit') return rule;
  if (rule === 'sign') return sign === '-' ? 'debit' : sign === '+' ? 'credit' : null;
  const kind = String(groups.kind || '');
  if (rule.debit?.some((w) => kind.includes(w))) return 'debit';
  if (rule.credit?.some((w) => kind.includes(w))) return 'credit';
  return null;
}

/**
 * Read one message with one template
 * @returns {BankSmsTransaction|null}
 */
export function applyTemplate(bank, template, text, { today = new Date() } = {}) {
  const normalized = normalizeSmsText(text);
  const match = template.pattern.exec(normalized);
  if (!match?.groups) return null;
  const groups = match.groups;
  const amount = parseAmount(groups.amount);
  if (!amount || amount.value <= 0) return null;
  const direction = resolveDirection(template, groups, amount.sign);
  if (!direction) return null;
  const unit = template.unit || 'rial';
  const balance = groups.balance !== undefined ? parseAmount(groups.balance) : null;

  const tx = {
    bankId: bank.bankId,
    templateId: template.id,
    direction,
    amount: toToman(amount.value, unit),
    balance: balance ? toToman(balance.value, unit) * (balance.sign === '-' ? -1 : 1) : null,
    account: String(groups.account ?? '').replace(/[^\d*]/g, ''),
    accountLast4: lastDigits(groups.account),
    cardLast4: lastDigits(groups.card),
    date: groups.date ? smsDateToIso(groups.date, today) : '',
    time: /^\d{1,2}:\d{2}$/.test(groups.time || '') ? groups.time.padStart(5, '0') : '',
    description: String(groups.desc ?? '').trim(),
    fingerprint: smsFingerprint(text),
  };
  tx.key = smsTransactionKey(tx);
  return tx;
}

/** The banks that may have sent a message: by sender when it is known, else all of them */
export function banksForSender(banks, sender) {
  const from = normalizeSender(sender);
  if (!from) return banks;
  const matched = banks.filter((b) => (b.senders || []).some((s) => normalizeSender(s) === from));
  return matched.length ? matched : banks;
}

/**
 * What the Android app needs to tell a withdrawal or deposit from any other bank message without
 * this file (BankSmsPlugin / BankSmsReceiver, even with the app closed): per bank, its senders and
 * its templates' patterns. The native side matches the pattern sources, as Java regexes, on the
 * message normalized like normalizeSmsText — so a template must stay Java-compatible (named
 * groups, classes and quantifiers as used here; no JS-only syntax)
 * @param {BankSmsBank[]} banks
 * @returns {Array<{ senders: string[], patterns: string[] }>}
 */
export function nativeSmsRules(banks) {
  return banks
    .filter((b) => (b.senders || []).length && (b.templates || []).length)
    .map((b) => ({ senders: [...b.senders], patterns: b.templates.map((t) => t.pattern.source) }));
}

/**
 * Read a bank SMS
 * @param {string} text the message
 * @param {BankSmsBank[]} banks the templates (bankSmsTemplates.js)
 * @param {{ sender?: string, today?: Date }} [options]
 * @returns {BankSmsTransaction|null} null when no template reads it
 */
export function parseBankSms(text, banks, { sender = '', today = new Date() } = {}) {
  if (isSensitiveSms(text)) return null;
  for (const bank of banksForSender(banks, sender)) {
    for (const template of bank.templates) {
      const tx = applyTemplate(bank, template, text, { today });
      if (tx) return tx;
    }
  }
  return null;
}

/**
 * The category a transaction starts in, from its own description (SMS_DESCRIPTION_CATEGORIES in
 * bankSmsTemplates.js): the first rule of its direction with one of its words in the description,
 * as a whole word; '' when none applies
 * @param {{ direction: string, description?: string }} tx
 * @param {Array<{ direction: string, words: string[], category: string }>} rules
 */
export function smsCategoryOf(tx, rules = []) {
  const words = new Set(normalizeSmsText(tx?.description || '').split(/[\s،,.:؛-]+/).filter(Boolean));
  if (!words.size) return '';
  const rule = rules.find((r) => r.direction === tx.direction && (r.words || []).some((w) => words.has(normalizeSmsText(w))));
  return rule?.category || '';
}

/**
 * The user's account a transaction belongs to: the same bank and the same last 4 digits of the
 * account number or card; else the only account of that bank
 * @param {BankSmsTransaction} tx
 * @param {Array<{ id: string, bankId?: string, accountNumber?: string, cardLast4?: string, archived?: boolean }>} accounts
 * @returns {string} the account id, or ''
 */
export function matchSmsAccount(tx, accounts = []) {
  const ofBank = accounts.filter((a) => !a.archived && a.bankId === tx.bankId);
  const digitsOf = (a) => [lastDigits(a.accountNumber), String(a.cardLast4 || '')].filter(Boolean);
  const wanted = [tx.accountLast4, tx.cardLast4].filter(Boolean);
  const exact = ofBank.find((a) => digitsOf(a).some((d) => wanted.includes(d)));
  if (exact) return exact.id;
  return ofBank.length === 1 ? ofBank[0].id : '';
}

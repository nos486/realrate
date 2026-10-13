/**
 * bankStatement.js — Reads a bank's exported statement (an Excel sheet) into records (the engine)
 *
 * The same idea as bankSms.js, for a whole file of transactions at once: each bank describes its
 * statement declaratively in bankStatementTemplates.js and this file knows nothing about any one
 * bank. Shared by the browser (the import on the accounts page) and the tests; synchronous and
 * dependency-free. Nothing here touches storage or the screen.
 *
 * The steps:
 *  1. readStatement: the table's rows (strings) → transactions — the date (Shamsi → Gregorian),
 *     the amount in tomans, the direction, the balance, and what the description says the row is
 *     (`kind`) with the fields it names (card, account, sheba, name, terminal …). Rows that cannot
 *     be read are listed, never dropped silently.
 *  2. analyzeStatement: tells which rows belong together (a group = a kind + the other side:
 *     ten deposits from one account, the purchases at one terminal), which are the user's own
 *     accounts (a transfer, not an expense or income), which were reversed, which are already
 *     recorded (here, from an SMS, or by hand), and what each group most likely is.
 *  3. resolvePlan: lays the user's answers (per group, per row, a rule for small expenses) over
 *     the suggestions → what each row becomes and whether it is saved.
 *  4. buildRecords: the rows to save as expense, income and transfer inputs, marked
 *     `source: 'import'` and carrying the row's `importKey`, so a file imported twice records
 *     nothing twice.
 * The text of a statement can name other people: it stays in the browser and is saved only
 * inside the user's end-to-end encrypted records.
 */

import { jalaliToGregorian } from './loanCalculator.js';
import { isValidIsoDate } from './isoDate.js';
import { smsTransactionKey } from './bankSms.js';
import { BUILTIN_CATEGORIES } from './categoryDocument.js';
import { linkFieldsOf } from './statementLinks.js';
import {
  STATEMENT_BANK_BY_ID, STATEMENT_KINDS, STATEMENT_KEYWORD_RULES, STATEMENT_DIACRITICS, STATEMENT_SMALL_DEFAULT,
} from './bankStatementTemplates.js';

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const pad = (n) => String(n).padStart(2, '0');
const lastDigits = (raw, count = 4) => {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length >= count ? digits.slice(-count) : '';
};

/** Rows read from a file per call of the heavy steps never exceed this (a statement is a year of rows) */
export const STATEMENT_MAX_ROWS = 20000;

/**
 * One line of statement text the way the rules read it: ASCII digits, Persian letters (ي/ك → ی/ک),
 * no diacritics (پُل → پل), no invisible direction marks, single spaces
 * @param {unknown} text
 */
export function normalizeStatementText(text) {
  return String(text ?? '')
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ە|ۀ/g, 'ه')
    .replace(STATEMENT_DIACRITICS, '')
    .replace(/[​‎‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/[٬،]/g, ',')
    .replace(/[−‒–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A text compared loosely: no spaces, no ZWNJ, no punctuation (header cells, names) */
const squash = (text) => normalizeStatementText(text).replace(/[\s‌()[\]/\\\-_.:*]/g, '').toLowerCase();

/**
 * A date and time cell: Shamsi «1405/06/31 - 17:38:24» (also with dots or dashes, ' - ' between,
 * unpadded time parts) or a Gregorian «2026-09-22 10:00»
 * @param {unknown} value
 * @returns {{ date: string, time: string }|null} Gregorian YYYY-MM-DD and HH:MM:SS ('' without a time)
 */
export function parseStatementDateTime(value) {
  const text = normalizeStatementText(value);
  const m = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?:[\s-]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/.exec(text);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let date;
  if (year >= 1700) {
    date = `${year}-${pad(month)}-${pad(day)}`;
  } else {
    // A Shamsi month 7-12 has 30 days (the 12th, 29 or 30)
    if (month >= 7 && day > 30) return null;
    const g = jalaliToGregorian(year, month, day);
    date = `${g.year}-${pad(g.month)}-${pad(g.day)}`;
  }
  if (!isValidIsoDate(date)) return null;
  const [h, min, s] = [Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0)];
  if (h > 23 || min > 59 || s > 59) return null;
  return { date, time: m[4] === undefined ? '' : `${pad(h)}:${pad(min)}:${pad(s)}` };
}

/**
 * An amount cell: digits with separators, the sign on either side («- 9,200,000», «+ 1,000», a
 * doubled minus is one)
 * @param {unknown} raw
 * @returns {{ value: number, sign: '+'|'-'|'' }|null}
 */
export function parseStatementAmount(raw) {
  const text = normalizeStatementText(raw);
  if (!/\d/.test(text)) return null;
  const sign = text.includes('-') ? '-' : text.includes('+') ? '+' : '';
  const value = Number(text.replace(/[^\d.]/g, ''));
  return Number.isFinite(value) ? { value, sign } : null;
}

/**
 * Where the table starts and which column is which: the first row (of the first 40) whose cells
 * hold the bank's header words for the date, the description and the amount
 * @param {unknown[][]} rows
 * @param {import('./bankStatementTemplates.js').StatementBank} bank
 * @returns {{ headerRow: number, cols: Record<string, number> }|null}
 */
export function findStatementColumns(rows, bank) {
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const cells = (rows[r] || []).map(squash);
    const cols = {};
    for (const [key, word] of Object.entries(bank.columns)) {
      const index = cells.findIndex((cell) => cell && cell.includes(squash(word)));
      if (index >= 0) cols[key] = index;
    }
    if (cols.date !== undefined && cols.description !== undefined && cols.amount !== undefined) return { headerRow: r, cols };
  }
  return null;
}

/** Fields read from a description: trimmed, names cleaned of stars and spaces */
function cleanField(key, value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  // A merchant ends with the acquirer's code («به پرداخت ملت-581672031»): not part of its name
  if (key === 'merchant') return text.replace(/\s*-\s*\d{4,}$/, '').trim();
  return /name$/i.test(key) ? text.replace(/[*_]/g, ' ').replace(/\s+/g, ' ').trim() : text;
}

function readFields(rule, description) {
  const fields = {};
  for (const pattern of [].concat(rule.fields || [])) {
    const m = pattern.exec(description);
    if (!m?.groups) continue;
    for (const [key, value] of Object.entries(m.groups)) {
      if (value !== undefined && fields[key] === undefined) fields[key] = cleanField(key, value);
    }
  }
  return fields;
}

/** Which rule describes a row: the first of its direction whose `test` matches */
function matchRule(bank, direction, description) {
  return bank.rules.find((rule) => (!rule.direction || rule.direction === direction) && rule.test.test(description)) || null;
}

const partyTypeOf = (field) => {
  if (/card$/i.test(field)) return 'card';
  if (/account$/i.test(field)) return 'account';
  if (/name$/i.test(field)) return 'name';
  return field;
};

const maskCard = (card) => `${card.slice(0, 4)} •••• •••• ${card.slice(-4)}`;

/**
 * Who the other side of a row is, from the fields its rule names
 * @returns {{ type: string, value: string, key: string, name: string, label: string, short: string }|null}
 */
function partyOf(rule, fields, direction, description) {
  const keys = Array.isArray(rule?.party) ? rule.party : (rule?.party?.[direction] || []);
  const nameKeys = direction === 'debit' ? ['toName', 'name', 'fromName'] : ['fromName', 'name', 'toName'];
  const name = nameKeys.map((k) => fields[k]).find(Boolean) || '';
  for (const key of keys) {
    const value = fields[key];
    if (!value) continue;
    const type = partyTypeOf(key);
    // The other side's own fields: a card transfer names a person next to each card
    const label = {
      terminal: `${fields.merchant ? `${fields.merchant} · ` : ''}پایانه ${value}`,
      card: `کارت ${maskCard(value)}${name ? ` · ${name}` : ''}`,
      account: `حساب ${value}${name ? ` · ${name}` : ''}`,
      sheba: `${name || 'شبا'} · ${value.slice(0, 4)}…${value.slice(-4)}`,
      name: value,
      billId: `شناسه‌ی ${value}`,
      chequeNo: `چک ${value}`,
    }[type] || value;
    const short = name || { card: `کارت ${value.slice(-4)}`, account: `حساب ${value.slice(-4)}`, sheba: `شبا ${value.slice(-4)}`, terminal: fields.merchant || `پایانه ${value}` }[type] || value;
    return { type, value, key: `${type}:${value}`, name, label, short };
  }
  // A row no rule describes: grouped by the first words of its text, digits aside
  if (!rule || rule.kind === 'other') {
    const text = description.replace(/\d+/g, '#').split(' ').slice(0, 4).join(' ');
    if (text) return { type: 'text', value: text, key: `text:${text}`, name: '', label: text, short: text };
  }
  return null;
}

/**
 * Read a statement's table
 * @param {unknown[][]} rows the sheet's rows (cells as strings or numbers)
 * @param {string} bankId a key of STATEMENT_BANK_BY_ID
 * @returns {{ ok: boolean, error?: string, bankId?: string, transactions?: object[], skipped?: object[],
 *   period?: { from: string, to: string }, balanceMismatches?: number }}
 */
export function readStatement(rows, bankId) {
  const bank = STATEMENT_BANK_BY_ID[bankId];
  if (!bank) return { ok: false, error: 'این بانک هنوز پشتیبانی نمی‌شود.' };
  const table = findStatementColumns(rows || [], bank);
  if (!table) return { ok: false, error: `ستون‌های فایل «${bank.label}» پیدا نشد؛ مطمئن شوید فایل همان خروجی همراه بانک است و ویرایش نشده.` };
  const { headerRow, cols } = table;
  const transactions = [];
  const skipped = [];
  for (let r = headerRow + 1; r < rows.length && r - headerRow <= STATEMENT_MAX_ROWS; r++) {
    const row = rows[r] || [];
    const cell = (key) => (cols[key] === undefined ? '' : row[cols[key]]);
    const rawDate = cell('date');
    const rawAmount = cell('amount');
    const rawDescription = cell('description');
    // A blank row (the sheet's tail) is not a problem
    if (![rawDate, rawAmount, rawDescription].some((v) => String(v ?? '').trim())) continue;
    const when = parseStatementDateTime(rawDate);
    const amount = parseStatementAmount(rawAmount);
    if (!when) { skipped.push({ row: r + 1, reason: 'تاریخ خوانده نشد.' }); continue; }
    if (!amount || amount.value <= 0) { skipped.push({ row: r + 1, reason: 'مبلغ خوانده نشد.' }); continue; }

    const directionText = normalizeStatementText(cell('direction'));
    let direction = null;
    if (bank.directionWords.debit.some((w) => directionText.includes(w))) direction = 'debit';
    else if (bank.directionWords.credit.some((w) => directionText.includes(w))) direction = 'credit';
    else if (amount.sign) direction = amount.sign === '-' ? 'debit' : 'credit';
    if (!direction) { skipped.push({ row: r + 1, reason: 'واریز یا برداشت بودن مشخص نیست.' }); continue; }

    const toToman = (v) => (bank.unit === 'toman' ? v : v / 10);
    const balance = cols.balance === undefined ? null : parseStatementAmount(cell('balance'));
    const description = normalizeStatementText(rawDescription);
    const rule = matchRule(bank, direction, description);
    const fields = rule ? readFields(rule, description) : {};
    const kind = rule?.kind || 'other';
    const party = partyOf(rule, fields, direction, description);
    const tx = {
      id: `t${transactions.length + 1}`,
      row: r + 1,
      bankId,
      date: when.date,
      time: when.time,
      direction,
      amount: Math.round(toToman(amount.value)),
      balance: balance ? toToman(balance.value) * (balance.sign === '-' ? -1 : 1) : null,
      description,
      kind,
      ruleId: rule?.id || '',
      fields,
      party,
      groupKey: [direction, kind, party?.key || ''].join('|'),
    };
    if (tx.amount <= 0) { skipped.push({ row: r + 1, reason: 'مبلغ خوانده نشد.' }); continue; }
    tx.importKey = statementImportKey(tx);
    tx.smsKey = smsTransactionKey({ bankId, direction, amount: tx.amount, date: tx.date, time: tx.time.slice(0, 5) });
    transactions.push(tx);
  }
  if (!transactions.length) return { ok: false, error: 'هیچ تراکنشی در فایل پیدا نشد.', skipped };
  const dates = transactions.map((t) => t.date).sort();
  return {
    ok: true,
    bankId,
    transactions,
    skipped,
    period: { from: dates[0], to: dates[dates.length - 1] },
    balanceMismatches: countBalanceMismatches(transactions),
  };
}

/**
 * A row's identity: bank, day, time to the second, direction, amount and the balance after it —
 * the same row of the same file (or of an overlapping file) always has the same key. Kept on the
 * records made from it (`importKey`)
 */
export function statementImportKey(tx) {
  return ['imp', tx.bankId, tx.date, tx.time, tx.direction === 'debit' ? 'd' : 'c', tx.amount, tx.balance ?? ''].join('|');
}

/**
 * How many rows break the running balance (each row's balance = the one before + its amount),
 * which tells a statement with missing, edited or reordered rows. Rows come in the file's order,
 * newest or oldest first.
 */
export function countBalanceMismatches(transactions) {
  const withBalance = transactions.filter((t) => t.balance !== null);
  if (withBalance.length < 2) return 0;
  const newestFirst = withBalance[0].date >= withBalance[withBalance.length - 1].date;
  const chronological = newestFirst ? [...withBalance].reverse() : withBalance;
  let mismatches = 0;
  for (let i = 1; i < chronological.length; i++) {
    const t = chronological[i];
    const expected = chronological[i - 1].balance + (t.direction === 'credit' ? t.amount : -t.amount);
    if (Math.abs(expected - t.balance) > 0.5) mismatches++;
  }
  return mismatches;
}

const nameKey = (name) => squash(name);
/** Whether a description (or a name) holds one of the words, as whole words */
function hasWord(text, word) {
  const haystack = ` ${normalizeStatementText(text).replace(/‌/g, ' ')} `;
  return haystack.includes(` ${normalizeStatementText(word).replace(/‌/g, ' ')} `);
}

/**
 * The keyword rule (STATEMENT_KEYWORD_RULES) a row's own words fall under — its description's
 * and the other side's name — or null
 */
export function statementKeywordRule(tx, rules = STATEMENT_KEYWORD_RULES) {
  // The bank's boilerplate («از کانال اینترنت بانک») is not read: only a row no rule describes has
  // its description searched, otherwise the other side's name and the merchant
  const text = [tx.party?.name, tx.fields?.merchant, (!tx.ruleId || tx.kind === 'other') && tx.description].filter(Boolean).join(' ');
  return rules.find((r) => r.direction === tx.direction && r.words.some((w) => hasWord(text, w))) || null;
}

const sameAccount = (a, b) => Boolean(a) && Boolean(b) && lastDigits(a, 6) === lastDigits(b, 6) && lastDigits(a, 6) !== '';

/**
 * The user's own account a row's other side is, or '' — by the card's or account's last digits.
 * @param {object} party
 * @param {object[]} accounts the user's accounts (accountDocument.js)
 * @param {string} importAccountId the account the file is imported into (never its own other side)
 */
function accountOfParty(party, accounts, importAccountId) {
  if (!party) return '';
  const candidates = accounts.filter((a) => a.id !== importAccountId && !a.archived);
  if (party.type === 'card') {
    const last4 = lastDigits(party.value);
    return candidates.find((a) => a.cardLast4 && String(a.cardLast4) === last4)?.id || '';
  }
  if (party.type === 'account') {
    return candidates.find((a) => sameAccount(a.accountNumber, party.value) || (lastDigits(a.accountNumber) && lastDigits(a.accountNumber) === lastDigits(party.value)))?.id || '';
  }
  return '';
}

/**
 * What a row most likely is, before the user says anything
 * @returns {{ action: 'expense'|'income'|'transfer', category: string|null, title: string, accountId: string,
 *   confidence: 'high'|'medium'|'none', reason: string }}
 */
function suggestFor(tx, own) {
  const action = tx.direction === 'debit' ? 'expense' : 'income';
  const preset = STATEMENT_KINDS[tx.kind]?.[tx.direction] || null;
  if (tx.partyAccountId) {
    return { action: 'transfer', category: null, title: '', accountId: tx.partyAccountId, confidence: 'high', reason: 'own_account' };
  }
  if (tx.party && own.names.has(nameKey(tx.party.name)) && tx.party.name) {
    return { action: 'transfer', category: null, title: '', accountId: '', confidence: 'none', reason: 'own_name' };
  }
  if (preset?.confident) {
    return { action, category: preset.category, title: preset.title || '', accountId: '', confidence: 'high', reason: 'kind' };
  }
  const keyword = statementKeywordRule(tx);
  if (keyword) {
    return { action, category: keyword.category, title: keyword.title || preset?.title || '', accountId: '', confidence: 'medium', reason: 'keyword' };
  }
  return { action, category: preset?.category || null, title: preset?.title || '', accountId: '', confidence: 'none', reason: 'unknown' };
}

/**
 * The index of what is already recorded, for duplicate checks
 * @param {{ expenses?: object[], incomes?: object[], transfers?: object[] }} existing
 */
export function indexExisting({ expenses = [], incomes = [], transfers = [] } = {}) {
  const importKeys = new Set();
  const smsKeys = new Set();
  const byHand = new Map();
  const add = (kind, date, amount) => {
    const key = `${kind}|${date}|${Math.round(Number(amount) || 0)}`;
    byHand.set(key, (byHand.get(key) || 0) + 1);
  };
  for (const e of expenses) {
    if (e.importKey) importKeys.add(e.importKey);
    if (e.smsKey) smsKeys.add(e.smsKey);
    // Recorded by hand (or by another feature): one row of the same day and amount is probably it
    if (!e.importKey && !e.smsKey && (!e.currency || e.currency === 'IRT')) add('debit', e.date, e.amount);
  }
  for (const i of incomes) {
    if (i.importKey) importKeys.add(i.importKey);
    if (i.smsKey) smsKeys.add(i.smsKey);
    if (!i.importKey && !i.smsKey && (!i.currency || i.currency === 'IRT')) add('credit', i.incomeDate, i.amount);
  }
  for (const t of transfers) {
    for (const key of t.importKeys || []) importKeys.add(key);
    for (const key of t.smsKeys || []) smsKeys.add(key);
    if (!t.importKeys?.length && !t.smsKeys?.length) {
      add('debit', t.date, t.amount);
      add('credit', t.date, t.amount);
    }
  }
  return { importKeys, smsKeys, byHand };
}

/**
 * Group the rows, find what is the user's own, reversed or already recorded, and suggest what
 * each group is
 * @param {object[]} transactions readStatement's
 * @param {{ accounts?: object[], accountId?: string, existing?: object }} [context] the user's
 *   accounts, the account being imported into, and what is recorded (`indexExisting`'s input)
 */
export function analyzeStatement(transactions, { accounts = [], accountId = '', existing = null } = {}) {
  // The user's own cards, accounts and names, learned from the rows' own side
  const own = { cards: new Set(), accounts: new Set(), names: new Set() };
  const bankRules = new Map();
  for (const tx of transactions) {
    const rule = tx.ruleId ? findRuleById(tx.bankId, tx.ruleId, bankRules) : null;
    const self = rule?.self?.[tx.direction];
    if (!self) continue;
    if (self.card && tx.fields[self.card]) own.cards.add(tx.fields[self.card]);
    if (self.account && tx.fields[self.account]) own.accounts.add(tx.fields[self.account]);
    if (self.name && tx.fields[self.name]) own.names.add(nameKey(tx.fields[self.name]));
  }

  const index = existing ? indexExisting(existing) : null;
  const handLeft = index ? new Map(index.byHand) : null;
  // Rows already recorded are found oldest first, so a twin on a busy day is consumed in order
  const chronological = [...transactions].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const reversedIds = pairReversals(transactions);
  const duplicates = new Map();
  if (index) {
    for (const tx of chronological) {
      if (index.importKeys.has(tx.importKey) || index.smsKeys.has(tx.smsKey)) { duplicates.set(tx.id, 'exact'); continue; }
      const key = `${tx.direction}|${tx.date}|${tx.amount}`;
      if ((handLeft.get(key) || 0) > 0) { handLeft.set(key, handLeft.get(key) - 1); duplicates.set(tx.id, 'maybe'); }
    }
  }

  const rows = transactions.map((tx) => {
    const partyIsOwn = tx.party && ((tx.party.type === 'card' && own.cards.has(tx.party.value)) || (tx.party.type === 'account' && own.accounts.has(tx.party.value)));
    const enriched = {
      ...tx,
      partyAccountId: accountOfParty(tx.party, accounts, accountId),
      partyIsOwn: Boolean(partyIsOwn),
      duplicate: duplicates.get(tx.id) || null,
      reversed: reversedIds.has(tx.id),
    };
    enriched.suggestion = suggestFor(enriched, own);
    return enriched;
  });

  const groups = new Map();
  for (const tx of rows) {
    if (!groups.has(tx.groupKey)) {
      groups.set(tx.groupKey, {
        key: tx.groupKey,
        direction: tx.direction,
        kind: tx.kind,
        kindLabel: STATEMENT_KINDS[tx.kind]?.label || STATEMENT_KINDS.other.label,
        label: tx.party?.label || STATEMENT_KINDS[tx.kind]?.label || 'سایر',
        partyName: tx.party?.name || '',
        ids: [],
        count: 0,
        total: 0,
        firstDate: tx.date,
        lastDate: tx.date,
        suggestion: tx.suggestion,
        samples: [],
      });
    }
    const group = groups.get(tx.groupKey);
    group.ids.push(tx.id);
    group.count += 1;
    group.total += tx.amount;
    if (tx.date < group.firstDate) group.firstDate = tx.date;
    if (tx.date > group.lastDate) group.lastDate = tx.date;
    if (group.samples.length < 3) group.samples.push(tx.description.slice(0, 160));
    // One group, one answer: rows that disagree (a keyword in a note) make the whole group a question
    if (tx.suggestion.category !== group.suggestion.category || tx.suggestion.action !== group.suggestion.action) {
      group.suggestion = { ...group.suggestion, category: null, confidence: 'none', reason: 'mixed' };
    }
  }
  const list = [...groups.values()].sort((a, b) => b.total - a.total);
  for (const group of list) {
    group.needsAnswer = group.suggestion.confidence !== 'high';
    // Worth a question: several rows, or a big sum
    group.notable = group.count >= 2 || group.total >= STATEMENT_SMALL_DEFAULT.maxToman;
  }
  return {
    transactions: rows,
    groups: list,
    own: { cards: [...own.cards], accounts: [...own.accounts], hasNames: own.names.size > 0 },
  };
}

function findRuleById(bankId, ruleId, cache) {
  if (!cache.has(bankId)) cache.set(bankId, new Map((STATEMENT_BANK_BY_ID[bankId]?.rules || []).map((r) => [r.id, r])));
  return cache.get(bankId).get(ruleId);
}

/**
 * A reversal («برگشت سند …») cancels the purchase it names (the same retrieval number and
 * amount): both are left out. Returns the ids of the rows cancelled, both sides
 */
function pairReversals(transactions) {
  const ids = new Set();
  const purchases = new Map();
  for (const tx of transactions) {
    if (tx.direction === 'debit' && tx.fields.reference) {
      const key = `${tx.fields.reference}|${tx.amount}`;
      if (!purchases.has(key)) purchases.set(key, []);
      purchases.get(key).push(tx.id);
    }
  }
  for (const tx of transactions) {
    if (tx.kind !== 'reversal' || !tx.fields.reference) continue;
    const key = `${tx.fields.reference}|${tx.amount}`;
    const original = purchases.get(key)?.shift();
    if (original) { ids.add(tx.id); ids.add(original); }
  }
  return ids;
}

const builtinLabels = Object.fromEntries(['expense', 'income'].map((kind) => [kind, Object.fromEntries(BUILTIN_CATEGORIES[kind].map((c) => [c.value, c.label]))]));

/**
 * What every row becomes, the user's answers laid over the suggestions
 * Priority: the row's own override, the group's answer, a confident suggestion, the rule for small
 * expenses, then «سایر».
 * @param {object} analysis analyzeStatement's
 * @param {object} [options]
 * @param {Record<string, object>} [options.answers] by group key: `{ action, category, title, accountId }`
 * @param {Record<string, object>} [options.rowOverrides] by row id: the same
 * @param {{ enabled: boolean, maxToman: number, category: string }} [options.small] the rule for small expenses
 * @param {Record<string, boolean>} [options.include] by row id: the user's choice to save (or not) a row
 *   that would otherwise be left out (a probable duplicate) or kept
 * @param {string} [options.accountId] the account being imported into
 * @param {(kind: 'expense'|'income', value: string) => string} [options.labelOf] a category's name
 * @param {Record<string, object>} [options.links] by row id: the record it is linked to (statementLinks.js)
 */
export function resolvePlan(analysis, {
  answers = {}, rowOverrides = {}, small = { enabled: false, ...STATEMENT_SMALL_DEFAULT }, include = {}, accountId = '', labelOf = null, links = {},
} = {}) {
  const label = (kind, value) => (labelOf ? labelOf(kind, value) : builtinLabels[kind]?.[value]) || builtinLabels[kind]?.other || '';
  return analysis.transactions.map((tx) => {
    const suggestion = tx.suggestion;
    const baseAction = tx.direction === 'debit' ? 'expense' : 'income';
    let decision;
    let source;
    if (rowOverrides[tx.id]) {
      decision = { ...rowOverrides[tx.id] }; source = 'row';
    } else if (answers[tx.groupKey]) {
      decision = { ...answers[tx.groupKey] }; source = 'group';
    } else if (suggestion.confidence === 'high' || (suggestion.confidence === 'medium' && suggestion.category)) {
      decision = { ...suggestion }; source = 'suggestion';
    } else if (small.enabled && baseAction === 'expense' && tx.amount <= small.maxToman && suggestion.action !== 'transfer') {
      decision = { action: 'expense', category: small.category, title: suggestion.title || '' }; source = 'small';
    } else {
      // Unanswered and unknown: «سایر» (a probable transfer to oneself stays a plain expense/income until the user says)
      decision = { action: suggestion.action === 'transfer' ? baseAction : suggestion.action, category: suggestion.category || 'other', title: suggestion.title || '' };
      source = 'default';
    }
    // A transfer or a skip stays; anything else is an expense of a debit, an income of a credit
    if (decision.action !== 'transfer' && decision.action !== 'skip') decision.action = baseAction;
    if (decision.action === 'transfer') decision.accountId = decision.accountId || '';
    else decision.category = decision.action === 'skip' ? '' : (decision.category || 'other');
    const issue = decision.action === 'transfer' && !decision.accountId
      ? 'حساب مقابل انتقال را انتخاب کنید.'
      : decision.action === 'transfer' && decision.accountId === accountId ? 'حساب مقابل نمی‌تواند همین حساب باشد.' : '';

    let status = 'new';
    if (tx.reversed) status = 'reversed';
    else if (tx.duplicate === 'exact') status = 'duplicate';
    else if (tx.duplicate === 'maybe') status = 'maybe_duplicate';
    // New rows are saved; an already recorded, reversed or probably recorded one only if the user asks
    const autoInclude = status === 'new' && decision.action !== 'skip';
    const chosen = include[tx.id];
    const included = (chosen === undefined ? autoInclude : chosen && status !== 'duplicate') && decision.action !== 'skip' && !issue;
    return {
      tx,
      groupKey: tx.groupKey,
      decision: { ...decision, title: decision.title || '' },
      source,
      status,
      issue,
      included,
      title: recordTitle(tx, decision, label),
      link: links[tx.id] || null,
    };
  });
}

/** A record's title: the user's, else what the row says (a transfer names the other side), else the category's name */
export function recordTitle(tx, decision, label) {
  let title = decision.title;
  if (!title) {
    const preset = STATEMENT_KINDS[tx.kind]?.[tx.direction];
    if (preset?.title) {
      // «انتقال به» / «واریز از» take the other side's name; with none they are «انتقال» / «واریز»
      title = / (?:به|از)$/.test(preset.title)
        ? (tx.party?.short ? `${preset.title} ${tx.party.short}` : preset.title.replace(/ (?:به|از)$/, ''))
        : preset.title;
    } else if (decision.action === 'transfer') {
      title = tx.direction === 'debit' ? 'انتقال بین حساب‌ها' : 'دریافت از حساب خودم';
    } else {
      title = label(decision.action === 'income' ? 'income' : 'expense', decision.category);
    }
  }
  return title.slice(0, 120);
}

/** The note on a record: where it came from, the time, and the bank's own description */
function recordNotes(tx, bankLabel) {
  const head = [`ورودی از فایل ${bankLabel}`, tx.time && `ساعت ${tx.time.slice(0, 5)}`].filter(Boolean).join(' · ');
  return `${head}\n${tx.description}`.slice(0, 500);
}

/**
 * The records to save for the rows that are included
 * @param {object[]} plan resolvePlan's
 * @param {{ accountId: string, bankId: string, bankLabel?: string }} context the account imported into
 * @returns {{ expenses: object[], incomes: object[], transfers: object[] }}
 */
export function buildRecords(plan, { accountId, bankId, bankLabel = '' }) {
  const label = bankLabel || STATEMENT_BANK_BY_ID[bankId]?.label || '';
  const expenses = [];
  const incomes = [];
  const transfers = [];
  for (const row of plan) {
    if (!row.included) continue;
    const { tx, decision } = row;
    const base = { amount: tx.amount, currency: 'IRT', notes: recordNotes(tx, label), source: 'import', bankId, importKey: tx.importKey, ...linkFieldsOf(row.link) };
    if (decision.action === 'expense') {
      expenses.push({ ...base, title: row.title, category: decision.category, date: tx.date, accountId });
    } else if (decision.action === 'income') {
      incomes.push({ ...base, title: row.title, category: decision.category, incomeDate: tx.date, accountId });
    } else if (decision.action === 'transfer') {
      transfers.push({
        fromAccountId: tx.direction === 'debit' ? accountId : decision.accountId,
        toAccountId: tx.direction === 'debit' ? decision.accountId : accountId,
        amount: tx.amount,
        date: tx.date,
        notes: recordNotes(tx, label),
        importKeys: [tx.importKey],
      });
    }
  }
  return { expenses, incomes, transfers };
}

/**
 * Totals of a plan for the summary: rows and sums per action, what is left out and why
 * @param {object[]} plan resolvePlan's
 */
export function summarizePlan(plan) {
  const out = {
    expense: { count: 0, total: 0 }, income: { count: 0, total: 0 }, transfer: { count: 0, total: 0 },
    duplicate: 0, maybeDuplicate: 0, reversed: 0, skipped: 0, issues: 0,
  };
  for (const row of plan) {
    if (row.status === 'duplicate') out.duplicate++;
    else if (row.status === 'reversed' && !row.included) out.reversed++;
    else if (row.status === 'maybe_duplicate' && !row.included) out.maybeDuplicate++;
    if (row.issue && row.status === 'new') out.issues++;
    if (row.included) {
      const bucket = out[row.decision.action];
      if (bucket) { bucket.count++; bucket.total += row.tx.amount; }
    } else if (row.status === 'new' && row.decision.action === 'skip') out.skipped++;
  }
  return out;
}

/** The categories the picker offers for a decision's kind, built-in keys with their names (custom ones come from the user's list) */
export function statementCategoryOptions(kind) {
  return BUILTIN_CATEGORIES[kind].filter((c) => !c.retired).map((c) => ({ value: c.value, label: c.label }));
}

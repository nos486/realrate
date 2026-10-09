/**
 * expenseDocument.js — Expenses: sections (a project, ...) and the expenses recorded in them
 *
 * Both are end-to-end encrypted vault records ("expense_group" and "expense", the expense's
 * parent being its section), so validation runs in the browser; it lives here, shared, because the
 * planned server-side intake (bank SMS read by the Android app) will produce the same expense
 * shape.
 *
 * An expense is in tomans or in US dollars. The dollar's rate on its day comes from the daily
 * price history (`usdAt(date)`, web features/market/dailyHistory.js); an expense carries a rate of
 * its own (`usdRate`) only when it is the one the money actually changed hands at (paid from a
 * portfolio's dollars, bought into a portfolio) or one the user typed over the history's. Totals
 * in tomans use usdRate, else the day's rate, else today's.
 *
 * Section `type`: 'project' (a project, a trip, ...) or 'daily' — the one section per user that
 * holds everyday spending, each expense in a category (DAILY_EXPENSE_CATEGORIES) and shown
 * month by month.
 *
 * An expense may say which account paid it (`accountId`, an accountDocument.js account), and
 * whether it was funded by a loan (`loanId`, «تأمین از»; empty for the user's own money — see
 * loanFunding.js). A subscription's payment names the subscription (`subscriptionId`,
 * subscriptionDocument.js). A bank credit's fee or installment profit names the credit (`creditAccountId`,
 * creditAccount.js).
 * Budgets: a project section may carry a total `budget` (tomans); the daily section carries
 * `budgets`, a monthly budget per category plus `total` for the whole month.
 *
 * An expense read from a bank SMS (bankSms.js) has `source: 'sms'`, the bank's `bankId`, the
 * message's `smsFingerprint` and the transaction's `smsKey` (so it is not recorded twice).
 *
 * A dollar expense may be paid from a portfolio's dollars (`paidFrom: { portfolioId, portfolioName,
 * assetId, txId }`): the portfolio gets a «spend» transaction (`txId`) at the expense's rate
 * (web/src/shared/vault/portfolioFunds.js); such an expense has no account and no loan.
 *
 * Money put into an asset (`investedIn: { portfolioId, portfolioName, assetId, quantity, txId }`,
 * portfolioLink.js): the portfolio gets a «buy» transaction at the expense's tomans / quantity, so
 * it needs a toman value (a dollar expense its rate) and is never shared.
 *
 * A shared expense («دنگ», toman expenses only): the user paid `amount` for others too, and only `myShare` (same
 * currency) is theirs. Totals, categories, budgets and loan usage count `myShare`
 * (expenseInToman); the rest is owed back to the user. What comes back is kept on the expense
 * itself (`reimbursements`: amount, day, the account it reached, from an SMS too) — never as
 * income. `myShare: null` is an ordinary expense.
 */

import { dollarValueOf, summarizeDollarValues } from './dollarValue.js';
import { isValidIsoDate } from './isoDate.js';
import { validatePortfolioLink } from './portfolioLink.js';
import { jalaliToGregorian, getJalaliMonthLength, gregorianToJalali } from './loanCalculator.js';
import { isCategoryValue } from './categoryDocument.js';

export const EXPENSE_CURRENCIES = [
  { value: 'IRT', label: 'تومان', symbol: 'تومان' },
  { value: 'USD', label: 'دلار', symbol: '$' },
];

export const EXPENSE_GROUP_TYPES = ['project', 'daily'];

/** Name of the daily section, created the first time an everyday expense is recorded */
export const DAILY_GROUP_NAME = 'هزینه‌های روزمره';

/**
 * Built-in categories of everyday expenses (display icons and colors live in the web app). The
 * user can rename and hide them and add their own (`c_…`, categoryDocument.js)
 */
export const DAILY_EXPENSE_CATEGORIES = [
  { value: 'groceries', label: 'خوراک و خواربار' },
  { value: 'dining', label: 'رستوران و کافه' },
  { value: 'transport', label: 'رفت‌وآمد و سوخت' },
  { value: 'bills', label: 'قبوض و شارژ' },
  { value: 'housing', label: 'مسکن و اجاره' },
  { value: 'shopping', label: 'خرید و پوشاک' },
  { value: 'health', label: 'سلامت و درمان' },
  { value: 'education', label: 'آموزش' },
  { value: 'entertainment', label: 'تفریح و سفر' },
  { value: 'subscriptions', label: 'اینترنت و اشتراک‌ها' },
  { value: 'gifts', label: 'هدیه و خیریه' },
  { value: 'installments', label: 'پرداخت قسط' },
  { value: 'credit_fees', label: 'کارمزد و سود اعتبار' },
  { value: 'investment', label: 'سرمایه‌گذاری' },
  { value: 'cash_management', label: 'مدیریت نقدینگی' },
  { value: 'other', label: 'سایر' },
];

export const EXPENSE_SOURCES = ['manual', 'sms'];

export const EXPENSE_LIMITS = {
  nameLength: 80,
  titleLength: 120,
  notesLength: 500,
  categoryLength: 40,
  maxAmount: 1e15,
  reimbursementNotesLength: 200,
  maxReimbursements: 100,
  maxTags: 10,
  tagLength: 30,
};

/**
 * An expense's tags («برچسب»): free words the user groups a project's expenses by (e.g. «مصالح»,
 * «دستمزد», «طبقه دوم»). Trimmed, inner spaces collapsed, a leading «#» dropped, no repeats
 * (case-insensitive), at most EXPENSE_LIMITS.maxTags of at most tagLength characters.
 * @param {unknown} raw an array of words, or one string separated by commas
 * @returns {string[]}
 */
export function normalizeTags(raw) {
  const list = Array.isArray(raw) ? raw : String(raw ?? '').split(/[,،]/);
  const seen = new Set();
  const tags = [];
  for (const item of list) {
    const tag = String(item ?? '').replace(/^#+/, '').replace(/\s+/g, ' ').trim().slice(0, EXPENSE_LIMITS.tagLength);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= EXPENSE_LIMITS.maxTags) break;
  }
  return tags;
}

export const REIMBURSEMENT_SOURCES = ['manual', 'sms'];
/** Rounding slack when comparing amounts (dollar cents) */
const EPSILON = 1e-6;

const CURRENCY_VALUES = new Set(EXPENSE_CURRENCIES.map((c) => c.value));
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const text = (v) => String(v ?? '').trim();

/**
 * Validate & normalize an expense section
 * @returns {{ value?: object, error?: string }}
 */
export function validateExpenseGroup(body = {}) {
  const name = text(body.name);
  if (!name) return { error: 'نام بخش الزامی است.' };
  if (name.length > EXPENSE_LIMITS.nameLength) return { error: `نام بخش نباید بیشتر از ${EXPENSE_LIMITS.nameLength} کاراکتر باشد.` };
  const notes = text(body.notes);
  if (notes.length > EXPENSE_LIMITS.notesLength) return { error: `توضیحات نباید بیشتر از ${EXPENSE_LIMITS.notesLength} کاراکتر باشد.` };
  const type = EXPENSE_GROUP_TYPES.includes(body.type) ? body.type : 'project';

  // A project's total budget (tomans), or none
  const budget = parseBudget(body.budget);
  if (budget === undefined) return { error: 'بودجه باید عددی مثبت باشد.' };

  // The daily section's monthly budgets: per category and `total`
  const budgets = {};
  if (type === 'daily' && body.budgets && typeof body.budgets === 'object') {
    for (const [key, raw] of Object.entries(body.budgets)) {
      if (key !== 'total' && !isCategoryValue('expense', key)) continue;
      const amount = parseBudget(raw);
      if (amount === undefined) return { error: 'بودجه باید عددی مثبت باشد.' };
      if (amount !== null) budgets[key] = amount;
    }
  }

  return {
    value: {
      name,
      type,
      notes,
      archived: Boolean(body.archived),
      budget: type === 'project' ? budget : null,
      budgets,
    },
  };
}

/** A budget amount: a positive number, null for none, undefined when invalid */
function parseBudget(raw) {
  if (raw === null || raw === undefined || raw === '' || raw === 0) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= EXPENSE_LIMITS.maxAmount ? n : undefined;
}

/**
 * Validate & normalize an expense
 * @returns {{ value?: object, error?: string }}
 */
export function validateExpense(body = {}) {
  const groupId = text(body.groupId);
  if (!ID_RE.test(groupId)) return { error: 'بخش این هزینه مشخص نشده است.' };

  // An everyday expense left untitled (the form, «ثبت سریع», automatic SMS recording) is titled
  // after its category
  const title = text(body.title) || DAILY_EXPENSE_CATEGORIES.find((c) => c.value === body.category)?.label || '';
  if (!title) return { error: 'عنوان هزینه الزامی است.' };
  if (title.length > EXPENSE_LIMITS.titleLength) return { error: `عنوان نباید بیشتر از ${EXPENSE_LIMITS.titleLength} کاراکتر باشد.` };

  const currency = CURRENCY_VALUES.has(body.currency) ? body.currency : 'IRT';
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > EXPENSE_LIMITS.maxAmount) {
    return { error: 'مبلغ هزینه باید عددی مثبت باشد.' };
  }

  const date = text(body.date);
  if (!isValidIsoDate(date)) return { error: 'تاریخ هزینه نامعتبر است.' };

  // The dollar's toman rate on the expense's day (optional): a dollar expense's own rate, or for a
  // toman expense what it was worth in dollars then (expenseDollarValue)
  let usdRate = null;
  if (body.usdRate !== null && body.usdRate !== undefined && body.usdRate !== '' && Number(body.usdRate) !== 0) {
    usdRate = Number(body.usdRate);
    if (!Number.isFinite(usdRate) || usdRate <= 0 || usdRate > EXPENSE_LIMITS.maxAmount) {
      return { error: 'نرخ دلار باید عددی مثبت باشد.' };
    }
  }

  const notes = text(body.notes);
  if (notes.length > EXPENSE_LIMITS.notesLength) return { error: `یادداشت نباید بیشتر از ${EXPENSE_LIMITS.notesLength} کاراکتر باشد.` };
  // A known category (built-in or the user's own), or none (project expenses)
  const category = isCategoryValue('expense', body.category) ? body.category : '';
  const source = EXPENSE_SOURCES.includes(body.source) ? body.source : 'manual';
  const bankId = text(body.bankId).slice(0, 64);
  const accountId = ID_RE.test(text(body.accountId)) ? text(body.accountId) : '';
  const loanId = ID_RE.test(text(body.loanId)) ? text(body.loanId) : '';
  // The fee or installment profit of a bank credit (creditAccount.js): the credit it is for
  const creditAccountId = ID_RE.test(text(body.creditAccountId)) ? text(body.creditAccountId) : '';
  // A subscription's payment: the subscription it paid for
  const subscriptionId = ID_RE.test(text(body.subscriptionId)) ? text(body.subscriptionId) : '';
  const smsFingerprint = source === 'sms' && /^[0-9a-f]{8}$/.test(text(body.smsFingerprint)) ? text(body.smsFingerprint) : '';
  const smsKey = source === 'sms' ? text(body.smsKey).slice(0, 120) : '';

  // «دنگ» is for toman expenses only
  const shared = currency === 'IRT' ? validateShare(body, amount) : validateShare({ myShare: null, reimbursements: body.reimbursements }, amount);
  if (shared.error) return { error: currency === 'IRT' ? shared.error : 'دنگ فقط برای هزینه‌های تومانی است.' };
  const { myShare, reimbursements } = shared;

  const funding = validatePaidFrom(body.paidFrom, currency);
  if (funding.error) return { error: funding.error };
  const { paidFrom } = funding;
  if (paidFrom && !(usdRate > 0)) return { error: 'برای پرداخت از پورتفو، نرخ دلار روز هزینه لازم است.' };

  const invested = validatePortfolioLink(body.investedIn);
  if (invested.error) return { error: invested.error };
  const investedIn = invested.link;
  if (investedIn && currency !== 'IRT' && !(usdRate > 0)) return { error: 'برای افزودن به پورتفو، نرخ دلار روز هزینه لازم است.' };
  if (investedIn && myShare !== null) return { error: 'هزینه‌ای که به پورتفو اضافه می‌شود دنگ ندارد.' };

  return {
    value: {
      groupId, title, amount, currency, date, usdRate, notes, category, source, bankId,
      // Paid from a portfolio: no account, no loan
      accountId: paidFrom ? '' : accountId,
      loanId: paidFrom ? '' : loanId,
      ...(creditAccountId ? { creditAccountId } : {}),
      ...(subscriptionId ? { subscriptionId } : {}),
      smsFingerprint, smsKey, myShare, reimbursements, paidFrom, investedIn,
      tags: normalizeTags(body.tags),
    },
  };
}

/** The asset each currency may be paid with from a portfolio */
export const PAYABLE_ASSETS = { USD: 'usd' };

/**
 * Where a dollar expense was paid from in a portfolio, or null
 * @returns {{ paidFrom?: object|null, error?: string }}
 */
function validatePaidFrom(raw, currency) {
  if (!raw) return { paidFrom: null };
  const portfolioId = text(raw.portfolioId);
  const txId = text(raw.txId);
  const assetId = text(raw.assetId);
  if (!ID_RE.test(portfolioId) || !ID_RE.test(txId)) return { error: 'پورتفوی پرداخت نامعتبر است.' };
  if (PAYABLE_ASSETS[currency] !== assetId) return { error: 'این ارز از پورتفو پرداخت‌شدنی نیست.' };
  return { paidFrom: { portfolioId, portfolioName: text(raw.portfolioName).slice(0, EXPENSE_LIMITS.nameLength), assetId, txId } };
}

/**
 * A shared expense's part: `myShare` (null when not shared) and what has come back
 * @returns {{ myShare?: number|null, reimbursements?: object[], error?: string }}
 */
function validateShare(body, amount) {
  if (body.myShare === null || body.myShare === undefined || body.myShare === '') {
    if (Array.isArray(body.reimbursements) && body.reimbursements.length) {
      return { error: 'این هزینه دریافتی ثبت‌شده دارد؛ ابتدا دریافتی‌ها را حذف کنید.' };
    }
    return { myShare: null, reimbursements: [] };
  }
  const myShare = Number(body.myShare);
  if (!Number.isFinite(myShare) || myShare < 0 || myShare >= amount) {
    return { error: 'سهم شما باید از صفر تا کمتر از مبلغ کل باشد.' };
  }

  const list = Array.isArray(body.reimbursements) ? body.reimbursements : [];
  if (list.length > EXPENSE_LIMITS.maxReimbursements) return { error: 'تعداد دریافتی‌های این هزینه بیش از حد است.' };
  const reimbursements = [];
  for (const raw of list) {
    const { value, error } = validateReimbursement(raw);
    if (error) return { error };
    reimbursements.push(value);
  }
  const received = reimbursements.reduce((sum, r) => sum + r.amount, 0);
  if (received > amount - myShare + EPSILON) {
    return { error: 'جمع دریافتی‌ها از سهم دیگران بیشتر می‌شود.' };
  }
  reimbursements.sort((a, b) => a.date.localeCompare(b.date));
  return { myShare, reimbursements };
}

/**
 * Money that came back for a shared expense (in the expense's currency)
 * @returns {{ value?: object, error?: string }}
 */
export function validateReimbursement(body = {}) {
  const id = text(body.id);
  if (!ID_RE.test(id)) return { error: 'شناسه‌ی دریافتی نامعتبر است.' };
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > EXPENSE_LIMITS.maxAmount) {
    return { error: 'مبلغ دریافتی باید عددی مثبت باشد.' };
  }
  const date = text(body.date);
  if (!isValidIsoDate(date)) return { error: 'تاریخ دریافتی نامعتبر است.' };
  const notes = text(body.notes);
  if (notes.length > EXPENSE_LIMITS.reimbursementNotesLength) {
    return { error: `توضیح دریافتی نباید بیشتر از ${EXPENSE_LIMITS.reimbursementNotesLength} کاراکتر باشد.` };
  }
  const accountId = ID_RE.test(text(body.accountId)) ? text(body.accountId) : '';
  const source = REIMBURSEMENT_SOURCES.includes(body.source) ? body.source : 'manual';
  const bankId = source === 'sms' ? text(body.bankId).slice(0, 64) : '';
  const smsKey = source === 'sms' ? text(body.smsKey).slice(0, 120) : '';
  return { value: { id, amount, date, accountId, notes, source, bankId, smsKey } };
}

/** The expense is shared («دنگ»): only `myShare` of it is the user's */
export function isSharedExpense(expense) {
  return expense?.myShare !== null && expense?.myShare !== undefined && Number.isFinite(Number(expense.myShare));
}

/** The user's own part of an expense, in its currency (the whole amount when not shared) */
export function expenseShareAmount(expense) {
  return isSharedExpense(expense) ? Number(expense.myShare) : Number(expense.amount) || 0;
}

/**
 * What others owe back on a shared expense, in its currency
 * @returns {{ owed: number, received: number, remaining: number }} zeros when not shared
 */
export function expenseReceivable(expense) {
  if (!isSharedExpense(expense)) return { owed: 0, received: 0, remaining: 0 };
  const owed = Math.max(0, (Number(expense.amount) || 0) - Number(expense.myShare));
  const received = (expense.reimbursements || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const remaining = Math.max(0, owed - received);
  return { owed, received, remaining: remaining < EPSILON ? 0 : remaining };
}

/**
 * The dollar's rate (tomans) on an expense's day: its own `usdRate`, else the price history's
 * rate for its date; 0 when neither is known
 * @param {object} expense
 * @param {(isoDate: string) => number|null} [usdAt] the dollar's rate on a date (price history)
 */
export function expenseDayRate(expense, usdAt) {
  const own = Number(expense?.usdRate) || 0;
  if (own > 0) return own;
  const fromHistory = typeof usdAt === 'function' && expense?.date ? Number(usdAt(expense.date)) || 0 : 0;
  return fromHistory > 0 ? fromHistory : 0;
}

/** Converts an amount in the expense's currency to tomans (null: a dollar amount with no rate) */
function toToman(expense, value, usdToman, usdAt) {
  if (expense.currency !== 'USD') return value;
  const rate = expenseDayRate(expense, usdAt) || usdToman;
  return rate > 0 ? value * rate : null;
}

/**
 * Shared expenses' receivables in tomans: open ones (something still owed) first, oldest first
 * @returns {{ count: number, openCount: number, owedToman: number, receivedToman: number,
 *   remainingToman: number, open: object[] }}
 */
export function summarizeReceivables(expenses = [], { usdToman = 0, usdAt = null } = {}) {
  const summary = { count: 0, openCount: 0, owedToman: 0, receivedToman: 0, remainingToman: 0, open: [] };
  for (const e of expenses) {
    if (!isSharedExpense(e)) continue;
    const { owed, received, remaining } = expenseReceivable(e);
    summary.count++;
    summary.owedToman += toToman(e, owed, usdToman, usdAt) || 0;
    summary.receivedToman += toToman(e, received, usdToman, usdAt) || 0;
    if (remaining > 0) {
      summary.openCount++;
      summary.remainingToman += toToman(e, remaining, usdToman, usdAt) || 0;
      summary.open.push(e);
    }
  }
  summary.open.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return summary;
}

/** Newest first; the same day by the time it was recorded */
export function compareExpensesByDate(a, b) {
  return String(b.date).localeCompare(String(a.date)) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
}

/**
 * An expense in tomans — the user's own part of it (`myShare` of a shared expense): as recorded,
 * or a dollar amount at its day's rate (expenseDayRate), else today's rate
 * @returns {number|null} null for a dollar expense with no rate at all
 */
export function expenseInToman(expense, usdToman = 0, usdAt = null) {
  return toToman(expense, expenseShareAmount(expense), usdToman, usdAt);
}

/** What was actually paid, in tomans (the whole amount, shared or not) — e.g. to match a bank SMS */
export function expensePaidInToman(expense, usdToman = 0, usdAt = null) {
  return toToman(expense, Number(expense.amount) || 0, usdToman, usdAt);
}

/**
 * Totals of a list of expenses
 * @param {object[]} expenses
 * @param {{ usdToman?: number, usdAt?: Function }} [options] today's dollar rate, and the rate on a
 *   date (price history), for dollar expenses without a rate of their own
 * @returns {{ count: number, toman: number, usd: number, totalToman: number,
 *   usesTodayRate: boolean, unpricedUsd: number, firstDate: string, lastDate: string }}
 *   `toman` / `usd`: the sums per currency as recorded (the user's share of shared expenses);
 *   `totalToman`: everything in tomans;
 *   `usesTodayRate`: some dollar expense was converted at today's rate; `unpricedUsd`: dollars
 *   left out of `totalToman` because no rate is known
 */
export function summarizeExpenses(expenses = [], { usdToman = 0, usdAt = null } = {}) {
  const summary = { count: 0, toman: 0, usd: 0, totalToman: 0, usesTodayRate: false, unpricedUsd: 0, firstDate: '', lastDate: '' };
  for (const e of expenses) {
    summary.count++;
    const share = expenseShareAmount(e);
    if (e.currency === 'USD') {
      summary.usd += share;
      if (!expenseDayRate(e, usdAt) && usdToman > 0) summary.usesTodayRate = true;
    } else {
      summary.toman += share;
    }
    const inToman = expenseInToman(e, usdToman, usdAt);
    if (inToman === null) summary.unpricedUsd += share;
    else summary.totalToman += inToman;
    if (!summary.firstDate || e.date < summary.firstDate) summary.firstDate = e.date;
    if (!summary.lastDate || e.date > summary.lastDate) summary.lastDate = e.date;
  }
  return summary;
}

/**
 * What an expense (the user's own part) was in dollars, and what that costs at today's rate
 * (dollarValue.js): a dollar expense as it is; a toman expense through the dollar's rate on its
 * day (expenseDayRate)
 * @param {object} expense
 * @param {number} [usdToman] today's dollar rate
 * @param {(isoDate: string) => number|null} [usdAt] the dollar's rate on a date (price history)
 * @returns {{ usd: number, paidToman: number|null, todayToman: number|null, changePct: number|null }|null}
 *   null for a toman expense whose day's rate is unknown
 */
export function expenseDollarValue(expense, usdToman = 0, usdAt = null) {
  const share = expenseShareAmount(expense);
  const rate = expenseDayRate(expense, usdAt);
  if (expense.currency !== 'USD') return dollarValueOf(share, rate, usdToman);
  if (rate > 0) return dollarValueOf(share * rate, rate, usdToman);
  // Dollars whose toman cost is unknown: still dollars, worth today's tomans
  return share > 0 ? { usd: share, paidToman: null, todayToman: usdToman > 0 ? share * usdToman : null, changePct: null } : null;
}

/** The dollar view of a list of expenses (summarizeDollarValues of each one's expenseDollarValue) */
export function summarizeDollarValue(expenses = [], { usdToman = 0, usdAt = null } = {}) {
  return summarizeDollarValues(expenses.map((e) => expenseDollarValue(e, usdToman, usdAt)), usdToman);
}

/**
 * Per-tag totals in tomans (the user's share), largest first; an expense with several tags counts
 * under each, so the tags may add up to more than the total. Each tag also has its dollar view
 * (`dollar`: summarizeDollarValue of its expenses — what they were in dollars at each one's day
 * rate and what that costs at today's rate). `untagged`: the expenses without a tag.
 * @returns {{ tags: Array<{ tag: string, totalToman: number, count: number, dollar: object }>,
 *   untagged: { totalToman: number, count: number, dollar: object } }}
 */
export function summarizeByTag(expenses = [], { usdToman = 0, usdAt = null } = {}) {
  const byTag = new Map();
  const untaggedList = [];
  for (const e of expenses) {
    const tags = normalizeTags(e.tags);
    if (!tags.length) {
      untaggedList.push(e);
      continue;
    }
    for (const tag of tags) {
      const key = tag.toLowerCase();
      if (!byTag.has(key)) byTag.set(key, { tag, list: [] });
      byTag.get(key).list.push(e);
    }
  }
  const totalOf = (list) => list.reduce((sum, e) => sum + (expenseInToman(e, usdToman, usdAt) || 0), 0);
  const entryOf = (list) => ({ totalToman: totalOf(list), count: list.length, dollar: summarizeDollarValue(list, { usdToman, usdAt }) });
  return {
    tags: [...byTag.values()]
      .map(({ tag, list }) => ({ tag, ...entryOf(list) }))
      .sort((a, b) => b.totalToman - a.totalToman || a.tag.localeCompare(b.tag)),
    untagged: entryOf(untaggedList),
  };
}

/** Whether an expense carries a tag (case-insensitive) */
export const hasTag = (expense, tag) => normalizeTags(expense?.tags).some((t) => t.toLowerCase() === String(tag).toLowerCase());

/**
 * Per-category totals in tomans, largest first (expenses without a category count as 'other')
 * @returns {Array<{ category: string, totalToman: number, count: number }>}
 */
export function summarizeByCategory(expenses = [], { usdToman = 0, usdAt = null } = {}) {
  const byCategory = new Map();
  for (const e of expenses) {
    const key = e.category || 'other';
    const entry = byCategory.get(key) || { category: key, totalToman: 0, count: 0 };
    entry.totalToman += expenseInToman(e, usdToman, usdAt) || 0;
    entry.count++;
    byCategory.set(key, entry);
  }
  return [...byCategory.values()].sort((a, b) => b.totalToman - a.totalToman);
}

const pad = (n) => String(n).padStart(2, '0');
const isoOf = ({ year, month, day }) => `${year}-${pad(month)}-${pad(day)}`;

/**
 * The Gregorian days of a Shamsi month (inclusive), for filtering expenses by their date
 * @returns {{ from: string, to: string, days: number }}
 */
export function shamsiMonthRange(jy, jm) {
  const days = getJalaliMonthLength(jy, jm);
  return { from: isoOf(jalaliToGregorian(jy, jm, 1)), to: isoOf(jalaliToGregorian(jy, jm, days)), days };
}

/** The Shamsi month `delta` months away */
export function shiftShamsiMonth({ jy, jm }, delta) {
  const index = jy * 12 + (jm - 1) + delta;
  return { jy: Math.floor(index / 12), jm: (index % 12) + 1 };
}

/** The Shamsi month of a Gregorian YYYY-MM-DD day */
export function shamsiMonthOf(isoDay) {
  const [y, m, d] = String(isoDay).split('-').map(Number);
  const { jy, jm } = gregorianToJalali(y, m, d);
  return { jy, jm };
}

/**
 * Per-account totals in tomans, largest first (expenses without an account under '')
 * @returns {Array<{ accountId: string, totalToman: number, count: number }>}
 */
export function summarizeByAccount(expenses = [], { usdToman = 0, usdAt = null } = {}) {
  const byAccount = new Map();
  for (const e of expenses) {
    const key = e.accountId || '';
    const entry = byAccount.get(key) || { accountId: key, totalToman: 0, count: 0 };
    entry.totalToman += expenseInToman(e, usdToman, usdAt) || 0;
    entry.count++;
    byAccount.set(key, entry);
  }
  return [...byAccount.values()].sort((a, b) => b.totalToman - a.totalToman);
}

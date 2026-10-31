/**
 * netWorth.js — What the user owns minus what they owe, at the end of each Shamsi month, in
 * tomans and in dollars, and how it moved against the dollar
 *
 * Owned: every portfolio's value on that day (utils/portfolioHistory.js: each ledger's quantity at
 * that day's price) and the received cheques still open. Owed: the loans' installments not yet
 * paid by that day (with their interest, as the loans page counts the remaining balance) and the
 * issued cheques still open, and what the accounts that keep a balance held that day
 * (utils/accountBalance.js, each currency at its rate of the day; an account counts from the day
 * its balance was stated, as nothing before is known). A loan counts from its start date; a cheque
 * from the first entry of its tracking log, in the status the log gives it on that day.
 *
 * Pure: no React, no storage. Everything is decrypted and worked out in the browser.
 */

import { getChequeStatus } from '../../utils/chequeDocument.js';
import { accountBalanceOf, tracksBalance } from '../../utils/accountBalance.js';
import { currencyRateOn } from '../../utils/currencies.js';
import { formatShamsiMonth, formatShamsiYear, salaryMonthRange } from '../../shared/flow/flowYear.js';
import { PERSIAN_MONTHS } from '../portfolio/components/ShamsiDatePicker.jsx';

const isoDay = (value) => (/^\d{4}-\d{2}-\d{2}/.test(String(value || '')) ? String(value).slice(0, 10) : '');

/** The day before an ISO day */
export function previousDay(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * What a loan still owed at the end of `day`: its installments not paid by then (an installment
 * marked paid with no date counts as paid on its due date), plus the extra payments made after
 * that day (they lowered the schedule later). 0 before the loan's start date.
 * @param {object} loan - a loan view with `installments` and `extraPayments` (loanDocument.buildLoanView)
 * @param {string} day - YYYY-MM-DD
 */
export function loanDebtAt(loan, day) {
  const start = isoDay(loan?.startDate);
  if (!start || start > day) return 0;
  let owed = 0;
  for (const inst of loan.installments || []) {
    const paidOn = inst.isPaid ? isoDay(inst.paidDate) || isoDay(inst.dueDate) : '';
    if (!paidOn || paidOn > day) owed += Number(inst.totalAmount) || 0;
  }
  for (const extra of loan.extraPayments || []) {
    const paidOn = isoDay(extra.paymentDate);
    if (paidOn && paidOn > day) owed += Number(extra.amount) || 0;
  }
  return owed;
}

/** A cheque's status at the end of `day` from its tracking log; null before its first entry */
export function chequeStatusAt(cheque, day) {
  const log = (Array.isArray(cheque?.history) ? cheque.history : [])
    .filter((h) => isoDay(h.date))
    .sort((a, b) => isoDay(a.date).localeCompare(isoDay(b.date)));
  let status = null;
  for (const entry of log) {
    if (isoDay(entry.date) > day) break;
    status = entry.status;
  }
  // A cheque without a log counts from its issue date in its current status
  if (!log.length) {
    const from = isoDay(cheque?.issueDate) || isoDay(cheque?.createdAt);
    if (from && from <= day) status = cheque.status;
  }
  return status;
}

/**
 * The open cheques at the end of `day`: received ones are owed to the user, issued ones by them
 * @returns {{ receivable: number, payable: number }}
 */
export function chequesAt(cheques, day) {
  const out = { receivable: 0, payable: 0 };
  for (const cheque of cheques || []) {
    const status = chequeStatusAt(cheque, day);
    if (!status || !getChequeStatus(status).open) continue;
    out[cheque.direction === 'issued' ? 'payable' : 'receivable'] += Number(cheque.amount) || 0;
  }
  return out;
}

/** The accounts the net worth counts: those keeping a balance, not archived */
const countedAccounts = (accounts = []) => accounts.filter((a) => tracksBalance(a) && !a.archived && isoDay(a.balance.startDate));

/**
 * What the accounts held at the end of `day`, in tomans at that day's rates: each account from the
 * day its balance was stated on (0 before)
 * @param {object[]} accounts
 * @param {{ expenses?: object[], transfers?: object[], incomes?: object[] }} records - what moved them
 * @param {string} day - YYYY-MM-DD
 * @param {{ usdAt?: Function, rateAt?: Function }} [rates]
 */
export function accountsCashAt(accounts, records, day, rates = {}) {
  let total = 0;
  for (const account of countedAccounts(accounts)) {
    if (day < isoDay(account.balance.startDate)) continue;
    for (const [code, amount] of Object.entries(accountBalanceOf(account, records, day))) {
      total += amount * currencyRateOn(code, day, rates);
    }
  }
  return Math.round(total);
}

/** The first day anything counted existed: a portfolio's first day, a loan's start, a cheque's first entry, an account's stated balance */
export function firstNetWorthDay({ portfolioSeries, loans = [], cheques = [], accounts = [] }) {
  const days = [
    portfolioSeries?.days?.[0],
    ...countedAccounts(accounts).map((a) => isoDay(a.balance.startDate)),
    ...loans.map((l) => isoDay(l.startDate)),
    ...cheques.map((c) => (c.history || []).map((h) => isoDay(h.date)).filter(Boolean).sort()[0] || isoDay(c.issueDate)),
  ].filter(Boolean);
  return days.length ? days.sort()[0] : '';
}

/** A portfolio series' value on a day: 0 before it began, its last value after it ends */
export function seriesValueAt(series, day) {
  if (!series?.days?.length || day < series.days[0]) return 0;
  const last = series.days.length - 1;
  if (day >= series.days[last]) return series.toman[last] || 0;
  return series.toman[series.days.indexOf(day)] || 0;
}

/**
 * The net worth at the end of one day, split into what makes it up
 * @param {{ portfolioSeries: object|null, portfolioToday?: number, loans: object[], cheques: object[],
 *   accounts?: object[], accountRecords?: object, rateAt?: Function,
 *   usdAt?: (day: string) => number|null, today: string }} input
 *   portfolioToday: the portfolios' value at today's prices, for when no entry has a date (no series);
 *   accountRecords: the expenses, transfers and incomes that moved the accounts' balances
 * @returns {{ day: string, assets: number, cash: number, receivable: number, loans: number, payable: number,
 *   net: number, usdRate: number|null, usd: number|null }} assets: the portfolios and the accounts' cash
 */
export function netWorthAt(input, day) {
  const { portfolioSeries, portfolioToday = 0, loans = [], cheques = [], usdAt, rateAt, accounts = [], accountRecords = {} } = input;
  const cash = accounts.length ? accountsCashAt(accounts, accountRecords, day, { usdAt, rateAt }) : 0;
  const assets = (portfolioSeries ? seriesValueAt(portfolioSeries, day) : portfolioToday) + cash;
  const { receivable, payable } = chequesAt(cheques, day);
  const loanDebt = loans.reduce((sum, loan) => sum + loanDebtAt(loan, day), 0);
  const net = assets + receivable - loanDebt - payable;
  const rate = usdAt ? Number(usdAt(day)) || 0 : 0;
  return { day, assets, cash, receivable, loans: loanDebt, payable, net, usdRate: rate > 0 ? rate : null, usd: rate > 0 ? net / rate : null };
}

/**
 * A Shamsi year month by month: the net worth at the end of each month (today for this month),
 * and at the end of the year before as the starting point. A month that ended before anything
 * was recorded is null.
 * @param {object} input - as netWorthAt, with `today`
 * @param {number} jy
 * @param {{ throughMonth?: number, years?: number, starts?: string[] }} [options] years: how many
 *   years, `jy` the last; starts: the salary days, when months start (and end) there
 * @returns {{ start: object|null, months: Array<object>, end: object|null }}
 *   each month: { key, jy, jm, label, monthLabel, point: netWorthAt(...)|null }
 */
export function buildNetWorthYear(input, jy, { throughMonth = 12, years = 1, starts = [] } = {}) {
  const { today } = input;
  const span = Math.max(1, Math.floor(years) || 1);
  const firstYear = jy - span + 1;
  const first = firstNetWorthDay(input);
  const pointOn = (day) => (first && day >= first ? netWorthAt(input, day) : null);
  const yearStart = salaryMonthRange(firstYear, 1, starts).from;
  const startDay = previousDay(yearStart);
  const months = [];
  for (let y = firstYear; y <= jy; y++) {
    for (let jm = 1; jm <= (y === jy ? Math.min(12, Math.max(1, throughMonth)) : 12); jm++) {
      const { from, to } = salaryMonthRange(y, jm, starts);
      if (from > today) break;
      const day = to < today ? to : today;
      months.push({
        key: `${y}/${String(jm).padStart(2, '0')}`,
        jy: y,
        jm,
        label: formatShamsiMonth(y, jm),
        monthLabel: span === 1 ? (PERSIAN_MONTHS[jm - 1]?.label || '') : (jm === 1 ? formatShamsiYear(y) : ''),
        point: pointOn(day),
      });
    }
  }
  // Nothing before the year: the first month with data starts it
  const start = pointOn(startDay) || months.find((m) => m.point)?.point || null;
  const end = [...months].reverse().find((m) => m.point)?.point || null;
  return { start, months, end };
}

const pctChange = (from, to) => (Number.isFinite(from) && Number.isFinite(to) && from > 0 ? ((to - from) / from) * 100 : null);

/**
 * The year's move against the dollar, from the starting point to the end
 * @returns {{ change: number, pct: number|null, usdChange: number|null, usdPct: number|null,
 *   dollarPct: number|null, beatDollar: boolean|null }|null}
 *   pct: the net worth's change in tomans; usdPct: in dollars; dollarPct: the dollar's own rate;
 *   beatDollar: the net worth grew more than the dollar (null when either is unknown)
 */
export function compareWithDollar(start, end) {
  if (!start || !end) return null;
  const pct = pctChange(start.net, end.net);
  const dollarPct = pctChange(start.usdRate, end.usdRate);
  const usdChange = Number.isFinite(start.usd) && Number.isFinite(end.usd) ? end.usd - start.usd : null;
  return {
    change: end.net - start.net,
    pct,
    usdChange,
    usdPct: pctChange(start.usd, end.usd),
    dollarPct,
    beatDollar: pct !== null && dollarPct !== null ? pct > dollarPct : null,
  };
}

/** Each month's change since the starting point, of the net worth and of the dollar's rate (%) */
export function changeByMonth(year) {
  return year.months.map((m) => ({
    ...m,
    netPct: m.point && year.start ? pctChange(year.start.net, m.point.net) : null,
    dollarPct: m.point && year.start ? pctChange(year.start.usdRate, m.point.usdRate) : null,
  }));
}

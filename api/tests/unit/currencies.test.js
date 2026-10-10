/**
 * currencies.test.js — The currency table (domain/currencies.js: toman, dollar, euro, lira,
 * dirham) and money in it: an expense or an income in euros is tomans at its day's rate from the
 * price history (an older record's stored rate only for a day the history lacks), else today's — no
 * rate is ever stored; its dollars through the dollar's rate that day; totals per
 * currency (expenses, accounts, subscriptions); a portfolio pays it in that currency
 */
import { describe, it, expect } from 'vitest';
import {
  CURRENCY_CODES, normalizeCurrency, isForeignCurrency, currencyLabel, currencyAdjective, allowsDecimals, otherCurrenciesOf,
  currencyRateOn, currencyRateToday, formatMoney, formatCurrencyAmounts,
} from '../../src/domain/currencies.js';
import {
  validateExpense, expenseInToman, expenseCurrencyRate, expenseDollarValue, summarizeExpenses,
  summarizeByAccount, PAYABLE_ASSETS,
} from '../../src/domain/expenseDocument.js';
import { validateSubscription, subscriptionTotals } from '../../src/domain/subscriptionDocument.js';
import { validateIncome, incomeInToman, incomeDollarValue, summarizeIncomes } from '../../src/domain/incomeDocument.js';

const history = { eur: { '2026-03-01': 60_000 }, try: { '2026-03-01': 2_000 } };
const rates = {
  usdToman: 100_000,
  usdAt: (day) => ({ '2026-03-01': 90_000 })[day] ?? null,
  rateToday: (code) => ({ EUR: 65_000, TRY: 2_500, AED: 27_000 })[code] || 0,
  rateAt: (code, day) => history[code.toLowerCase()]?.[day] ?? null,
};
const base = { groupId: 'exg_1', title: 'هتل', amount: 100, currency: 'EUR', date: '2026-03-01' };

describe('the currency table', () => {
  it('has the toman, the dollar, the euro, the lira and the dirham, in that order', () => {
    expect(CURRENCY_CODES).toEqual(['IRT', 'USD', 'EUR', 'TRY', 'AED']);
    expect(normalizeCurrency('EUR')).toBe('EUR');
    expect(normalizeCurrency('XYZ')).toBe('IRT');
    expect(isForeignCurrency('AED')).toBe(true);
    expect(isForeignCurrency('IRT')).toBe(false);
    expect(currencyLabel('TRY')).toBe('لیر');
    expect(currencyAdjective('EUR')).toBe('یورویی');
    expect(allowsDecimals('EUR')).toBe(true);
    expect(allowsDecimals('IRT')).toBe(false);
    expect(otherCurrenciesOf([{ currency: 'USD' }, { currency: 'TRY' }, { currency: 'EUR' }, { currency: 'TRY' }, {}])).toEqual(['EUR', 'TRY']);
  });

  it('reads rates from the bag: the dollar\'s own pair, the others\' functions; the toman is 1', () => {
    expect(currencyRateOn('IRT', '2026-03-01', rates)).toBe(1);
    expect(currencyRateOn('USD', '2026-03-01', rates)).toBe(90_000);
    expect(currencyRateOn('EUR', '2026-03-01', rates)).toBe(60_000);
    expect(currencyRateOn('EUR', '2020-01-01', rates)).toBe(0);
    expect(currencyRateToday('EUR', rates)).toBe(65_000);
    expect(currencyRateToday('USD', rates)).toBe(100_000);
    expect(currencyRateToday('AED', {})).toBe(0);
  });

  it('formats money in its currency', () => {
    expect(formatMoney(25.5, 'EUR')).toBe(`${(25.5).toLocaleString('fa-IR')} یورو`);
    expect(formatMoney(150_000, 'IRT')).toBe(`${(150_000).toLocaleString('fa-IR')} تومان`);
    expect(formatCurrencyAmounts({ TRY: 1200, EUR: 250, AED: 0 })).toBe(`${(250).toLocaleString('fa-IR')} یورو · ${(1200).toLocaleString('fa-IR')} لیر`);
  });
});

describe('an expense in euros', () => {
  it('never stores a rate', () => {
    const { value } = validateExpense({ ...base, rate: 62_000, usdRate: 90_000 });
    expect(value.currency).toBe('EUR');
    expect(value).not.toHaveProperty('rate');
    expect(value).not.toHaveProperty('usdRate');
    expect(validateExpense({ ...base, currency: 'XYZ' }).value.currency).toBe('IRT');
  });

  it('is tomans at its day\'s rate (history), else an older stored one, else today\'s; null with none', () => {
    expect(expenseCurrencyRate(base, rates)).toBe(60_000);
    // The history wins over a rate an older record stored, which fills only a day it lacks
    expect(expenseInToman({ ...base, rate: 62_000 }, rates)).toBe(6_000_000);
    expect(expenseInToman({ ...base, rate: 62_000, date: '2020-01-01' }, rates)).toBe(6_200_000);
    expect(expenseInToman(base, rates)).toBe(6_000_000);
    expect(expenseInToman({ ...base, date: '2020-01-01' }, rates)).toBe(6_500_000);
    expect(expenseInToman(base, {})).toBeNull();
    // Lira the same way, from its own history
    expect(expenseInToman({ ...base, currency: 'TRY', amount: 1000 }, rates)).toBe(2_000_000);
  });

  it('is seen in dollars through the dollar\'s rate that day', () => {
    // 100 € × 60,000 = 6,000,000 tomans; at 90,000 a dollar ≈ 66.67 $, worth 6,666,667 today
    const value = expenseDollarValue(base, rates);
    expect(value.usd).toBeCloseTo(66.67, 1);
    expect(value.paidToman).toBe(6_000_000);
    expect(value.todayToman).toBeCloseTo(6_666_667, -1);
    expect(expenseDollarValue({ ...base, date: '2020-01-01' }, rates)).toBeNull();
  });

  it('is paid from euros in a portfolio (priced from the history when saved)', () => {
    expect(PAYABLE_ASSETS).toMatchObject({ USD: 'usd', EUR: 'eur', TRY: 'try', AED: 'aed' });
    const paidFrom = { portfolioId: 'pf_1', portfolioName: 'ارزی', assetId: 'eur', txId: 'txs_1' };
    expect(validateExpense({ ...base, paidFrom }).value.paidFrom).toMatchObject({ assetId: 'eur' });
    // Not with another currency's asset
    expect(validateExpense({ ...base, paidFrom: { ...paidFrom, assetId: 'usd' } }).error).toBeTruthy();
  });

  it('counts in the totals per currency, and what has no rate apart', () => {
    const list = [
      { ...base, amount: 100 },
      { ...base, currency: 'TRY', amount: 1000 },
      { ...base, currency: 'AED', amount: 50 },
      { ...base, currency: 'IRT', amount: 500_000 },
    ];
    const s = summarizeExpenses(list, rates);
    expect(s.byCurrency).toEqual({ EUR: 100, TRY: 1000, AED: 50, IRT: 500_000 });
    // The dirham has no rate for that day: today's
    expect(s.totalToman).toBe(6_000_000 + 2_000_000 + 1_350_000 + 500_000);
    expect(s.usesTodayRate).toBe(true);
    expect(summarizeExpenses(list, { ...rates, rateToday: () => 0 }).unpriced).toEqual({ AED: 50 });
  });

  it('shows on its account in euros', () => {
    const [account] = summarizeByAccount([{ ...base, accountId: 'acc_w' }, { ...base, amount: 20, accountId: 'acc_w' }, { ...base, currency: 'IRT', amount: 300_000, accountId: 'acc_w' }], rates);
    expect(account).toMatchObject({ accountId: 'acc_w', byCurrency: { EUR: 120, IRT: 300_000 }, totalToman: 7_200_000 + 300_000, count: 3 });
  });
});

describe('subscriptions in other currencies', () => {
  const sub = (fields) => validateSubscription({ name: 'x', amount: 10, cycleMonths: 1, startDate: '2026-01-01', ...fields }).value;

  it('keep their currency and count in tomans at today\'s rate', () => {
    expect(sub({ currency: 'EUR' }).currency).toBe('EUR');
    expect(sub({ currency: 'XYZ' }).currency).toBe('IRT');
    const t = subscriptionTotals([{ ...sub({ currency: 'EUR' }), id: 'a' }, { ...sub({ currency: 'TRY', amount: 300 }), id: 'b' }], { today: '2026-02-05', ...rates });
    expect(t.monthly).toMatchObject({ EUR: 10, TRY: 300, toman: 650_000 + 750_000 });
    expect(t.yearly.EUR).toBe(120);
  });
});

describe('an income in euros', () => {
  const income = { title: 'پروژه', amount: 1000, currency: 'EUR', incomeDate: '2026-03-01' };

  it('keeps its currency, never a rate, and links to toman-only records only in tomans', () => {
    expect(validateIncome(income).value).toMatchObject({ currency: 'EUR', amount: 1000 });
    expect(validateIncome({ ...income, rate: 5 }).value).not.toHaveProperty('rate');
    expect(validateIncome({ ...income, currency: 'XYZ' }).value.currency).toBe('IRT');
    // A cheque, a bank credit, a bank SMS are in tomans
    const linked = { ...income, category: 'credit_settlement', creditAccountId: 'acc_c', chequeId: 'chq_1', smsKey: 'k' };
    expect(validateIncome(linked).value).toMatchObject({ creditAccountId: '', chequeId: '' });
    expect(validateIncome(linked).value).not.toHaveProperty('smsKey');
    expect(validateIncome({ ...linked, currency: 'IRT' }).value).toMatchObject({ creditAccountId: 'acc_c', chequeId: 'chq_1', smsKey: 'k' });
  });

  it('is tomans at its day\'s rate (history), else today\'s, and in dollars through the dollar\'s that day', () => {
    expect(incomeInToman(income, rates)).toBe(60_000_000);
    expect(incomeInToman({ ...income, incomeDate: '2020-01-01' }, rates)).toBe(65_000_000);
    expect(incomeInToman(income, {})).toBeNull();
    expect(incomeInToman({ ...income, currency: 'IRT' }, {})).toBe(1000);
    expect(incomeDollarValue(income, rates).usd).toBeCloseTo(666.67, 1);
    expect(incomeDollarValue({ ...income, currency: 'USD', amount: 10 }, rates)).toMatchObject({ usd: 10, paidToman: 900_000 });
    const s = summarizeIncomes([income, { ...income, currency: 'IRT', amount: 5_000_000 }, { ...income, currency: 'AED', amount: 10 }], { ...rates, rateToday: () => 0 });
    expect(s).toEqual({ totalToman: 65_000_000, byCurrency: { EUR: 1000, IRT: 5_000_000, AED: 10 }, unpriced: { AED: 10 } });
  });
});

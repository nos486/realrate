/**
 * toolCalculators.js — The pure math of the calculation tools («ابزارهای محاسباتی»): loans and
 * deposits, gold at a goldsmith's price, currency conversion, the dowry (mahr) at today's value,
 * salary with tax and insurance, and the rent/deposit exchange
 *
 * Nothing here reads a price or a date: the page passes the live rates and the user's figures in,
 * and the yearly tables come from config/toolRates.js, so every function is testable and runs in
 * the Worker and the browser alike. Amounts are tomans; percents are plain numbers (7 = 7%).
 */

import { INFLATION_BY_YEAR, LAST_INFLATION_YEAR, PAYROLL } from '../config/toolRates.js';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const pos = (v) => Math.max(0, num(v));
const round = (v) => Math.round(v);

/** A yearly rate as its equivalent monthly rate (compound) */
const monthlyOf = (annualPct) => (1 + num(annualPct) / 100) ** (1 / 12) - 1;

/**
 * The fixed monthly payment of an amortized loan
 * @param {number} principal
 * @param {number} annualRatePct
 * @param {number} months
 */
export function monthlyPayment(principal, annualRatePct, months) {
  const p = pos(principal);
  const n = Math.floor(pos(months));
  if (!p || !n) return 0;
  const r = num(annualRatePct) / 100 / 12;
  return r === 0 ? p / n : (p * r) / (1 - (1 + r) ** -n);
}

/** The monthly rate at which `payment` paid `months` times is worth `received` today (bisection) */
function solveMonthlyRate(received, payment, months) {
  if (received <= 0 || payment <= 0 || months <= 0) return 0;
  const pv = (r) => (r === 0 ? payment * months : (payment * (1 - (1 + r) ** -months)) / r);
  let lo = 0;
  let hi = 1;
  if (pv(0) <= received) return 0;
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    if (pv(mid) > received) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * A loan: the installment, what it costs in all, what the fees add and what the cost is worth in
 * today's money when prices rise by `inflationPct` a year (a loan repaid with money that loses
 * value costs less than its face amount)
 * @param {{ principal: number, annualRatePct: number, months: number, feePct?: number, feeFixed?: number, inflationPct?: number }} input
 */
export function loanCost({ principal, annualRatePct, months, feePct = 0, feeFixed = 0, inflationPct = 0 }) {
  const p = pos(principal);
  const n = Math.floor(pos(months));
  if (!p || !n) return null;
  const payment = monthlyPayment(p, annualRatePct, n);
  const fee = p * (pos(feePct) / 100) + pos(feeFixed);
  const totalPaid = payment * n;
  const received = Math.max(0, p - fee);
  // The real price of the money: the rate that makes the payments equal what was actually received
  const monthlyEffective = solveMonthlyRate(received, payment, n);
  const effectiveAnnualPct = ((1 + monthlyEffective) ** 12 - 1) * 100;
  const mInfl = monthlyOf(inflationPct);
  let presentValue = 0;
  let balance = p;
  const r = num(annualRatePct) / 100 / 12;
  const schedule = [];
  for (let k = 1; k <= n; k += 1) {
    presentValue += payment / (1 + mInfl) ** k;
    const interest = balance * r;
    const principalPart = payment - interest;
    balance = Math.max(0, balance - principalPart);
    schedule.push({ index: k, payment: round(payment), interest: round(interest), principal: round(principalPart), balance: round(k === n ? 0 : balance) });
  }
  return {
    payment: round(payment),
    totalPaid: round(totalPaid),
    interest: round(totalPaid - p),
    fee: round(fee),
    received: round(received),
    totalCost: round(totalPaid - p + fee),
    effectiveAnnualPct: Number(effectiveAnnualPct.toFixed(2)),
    // What the repayments (and the fee) are worth today, against what was borrowed
    realCost: round(presentValue + fee - p),
    realRatePct: Number((((1 + effectiveAnnualPct / 100) / (1 + num(inflationPct) / 100) - 1) * 100).toFixed(2)),
    schedule,
  };
}

/**
 * A deposit's profit and what it is really worth after inflation
 * @param {{ principal: number, annualRatePct: number, months: number, compounding?: 'simple'|'monthly', inflationPct?: number }} input
 */
export function depositReturn({ principal, annualRatePct, months, compounding = 'simple', inflationPct = 0 }) {
  const p = pos(principal);
  const m = pos(months);
  if (!p || !m) return null;
  const rate = num(annualRatePct) / 100;
  const final = compounding === 'monthly' ? p * (1 + rate / 12) ** m : p * (1 + (rate * m) / 12);
  const years = m / 12;
  const realFinal = final / (1 + num(inflationPct) / 100) ** years;
  return {
    final: round(final),
    profit: round(final - p),
    // The final amount in today's purchasing power, and the gain (or loss) that is left
    realFinal: round(realFinal),
    realProfit: round(realFinal - p),
    realAnnualPct: Number((((realFinal / p) ** (1 / years) - 1) * 100).toFixed(2)),
  };
}

/**
 * Gold bought from a goldsmith: the metal at the day's price, the wage, the seller's profit (on
 * the metal and wage), and the VAT on the wage and profit only
 * @param {{ grams: number, pricePerGram: number, wagePct?: number, profitPct?: number, taxPct?: number }} input
 */
export function goldPurchase({ grams, pricePerGram, wagePct = 0, profitPct = 0, taxPct = 0 }) {
  const g = pos(grams);
  const price = pos(pricePerGram);
  if (!g || !price) return null;
  const metal = g * price;
  const wage = metal * (pos(wagePct) / 100);
  const profit = (metal + wage) * (pos(profitPct) / 100);
  const tax = (wage + profit) * (pos(taxPct) / 100);
  const total = metal + wage + profit + tax;
  return {
    metal: round(metal),
    wage: round(wage),
    profit: round(profit),
    tax: round(tax),
    total: round(total),
    perGram: round(total / g),
    overMetalPct: Number((((total - metal) / metal) * 100).toFixed(1)),
  };
}

/**
 * An amount in one unit as another, through their prices in tomans
 * @param {number} amount
 * @param {number} fromPrice - tomans per unit of the source (1 for the toman itself)
 * @param {number} toPrice - tomans per unit of the target
 * @returns {number|null}
 */
export function convertAmount(amount, fromPrice, toPrice) {
  const from = pos(fromPrice);
  const to = pos(toPrice);
  if (!from || !to) return null;
  return (num(amount) * from) / to;
}

/**
 * How many times prices grew between two Shamsi years (each year's average inflation compounds;
 * a year without a figure uses `assumedPct`)
 * @param {number} fromYear
 * @param {number} toYear
 * @param {number} [assumedPct]
 * @param {Record<number, number>} [table]
 */
export function inflationFactor(fromYear, toYear, assumedPct = INFLATION_BY_YEAR[LAST_INFLATION_YEAR], table = INFLATION_BY_YEAR) {
  const a = Math.floor(num(fromYear));
  const b = Math.floor(num(toYear));
  if (!a || !b || b <= a) return 1;
  let factor = 1;
  for (let y = a + 1; y <= b; y += 1) factor *= 1 + (Number.isFinite(table[y]) ? table[y] : num(assumedPct)) / 100;
  return factor;
}

/**
 * A dowry agreed in a past year at today's value (its amount grown with the inflation index), and
 * what it is in gold coins at today's coin price
 * @param {{ amount: number, marriageYear: number, currentYear: number, assumedPct?: number, coinPrice?: number }} input
 */
export function mahrToday({ amount, marriageYear, currentYear, assumedPct, coinPrice = 0 }) {
  const a = pos(amount);
  if (!a || !num(marriageYear) || !num(currentYear)) return null;
  const factor = inflationFactor(marriageYear, currentYear, assumedPct);
  const today = a * factor;
  const coins = pos(coinPrice) ? today / pos(coinPrice) : null;
  return { factor: Number(factor.toFixed(3)), today: round(today), coins: coins === null ? null : Number(coins.toFixed(2)) };
}

/** A dowry fixed in coins, in tomans at today's coin price */
export function mahrCoinsValue(coins, coinPrice) {
  const c = pos(coins);
  const price = pos(coinPrice);
  return c && price ? round(c * price) : null;
}

/** Tax on a monthly taxable pay through the progressive brackets */
export function monthlyTax(taxable, brackets = PAYROLL.taxBrackets) {
  let rest = pos(taxable);
  let prev = 0;
  let tax = 0;
  for (const { upTo, ratePct } of brackets) {
    const width = upTo === null ? rest : Math.min(rest, upTo - prev);
    if (width <= 0) break;
    tax += width * (ratePct / 100);
    rest -= width;
    prev = upTo ?? prev;
    if (rest <= 0) break;
  }
  return tax;
}

/**
 * A monthly pay: insurance, income tax, the net and what it costs the employer
 * @param {{ base: number, allowances?: number, minWage?: number, params?: typeof PAYROLL }} input
 */
export function salaryBreakdown({ base, allowances = 0, minWage, params = PAYROLL }) {
  const gross = pos(base) + pos(allowances);
  if (!gross) return null;
  const wage = pos(minWage) || params.minWageMonthly;
  const insurable = Math.min(gross, wage * params.insuranceCeilingMonths);
  const insurance = insurable * (params.insuranceWorkerPct / 100);
  const employerInsurance = insurable * (params.insuranceEmployerPct / 100);
  const taxable = Math.max(0, gross - insurance);
  const tax = monthlyTax(taxable, params.taxBrackets);
  return {
    gross: round(gross),
    insurance: round(insurance),
    tax: round(tax),
    net: round(gross - insurance - tax),
    employerInsurance: round(employerInsurance),
    employerCost: round(gross + employerInsurance),
  };
}

/**
 * The year-end bonus (eidi) and severance (sanavat) of a worker: the bonus is `eidiDays` of the base
 * wage for a full year (pro-rated by the months worked; the part above `eidiExemptDays` of the
 * minimum wage is taxable), the severance is a month of the last pay for each year of service
 * @param {{ base: number, lastPay?: number, monthsWorked?: number, serviceMonths?: number, minWage?: number, params?: typeof PAYROLL }} input
 */
export function eidiAndSanavat({ base, lastPay, monthsWorked = 12, serviceMonths = 0, minWage, params = PAYROLL }) {
  const b = pos(base);
  if (!b) return null;
  const wage = pos(minWage) || params.minWageMonthly;
  const months = Math.min(12, pos(monthsWorked));
  const eidi = (b / 30) * params.eidiDays * (months / 12);
  const exempt = (wage / 30) * params.eidiExemptDays * (months / 12);
  const taxableEidi = Math.max(0, eidi - exempt);
  const sanavat = (pos(lastPay) || b) * (pos(serviceMonths) / 12);
  return { eidi: round(eidi), eidiTaxable: round(taxableEidi), eidiTax: round(monthlyTax(taxableEidi, params.taxBrackets)), sanavat: round(sanavat) };
}

/**
 * Exchanging deposit and rent: each toman of deposit given up costs `annualRatePct / 12` percent
 * a month in rent. Either target (a new deposit or a new rent) gives the other.
 * @param {{ deposit: number, rent: number, annualRatePct: number, newDeposit?: number|null, newRent?: number|null }} input
 */
export function rentExchange({ deposit, rent, annualRatePct, newDeposit = null, newRent = null }) {
  const d = pos(deposit);
  const r = pos(rent);
  const rate = pos(annualRatePct);
  if (!rate || (!d && !r)) return null;
  const perToman = rate / 1200;
  const allDeposit = d + r / perToman;
  const allRent = r + d * perToman;
  let result = null;
  if (newDeposit !== null && newDeposit !== '') {
    const nd = pos(newDeposit);
    result = { deposit: round(nd), rent: round(Math.max(0, r + (d - nd) * perToman)) };
  } else if (newRent !== null && newRent !== '') {
    const nr = pos(newRent);
    result = { rent: round(nr), deposit: round(Math.max(0, d + (r - nr) / perToman)) };
  }
  return { allDeposit: round(allDeposit), allRent: round(allRent), result };
}

/** The most a rent may be raised to under a cap (percent) */
export function cappedRent(rent, maxIncreasePct) {
  return round(pos(rent) * (1 + pos(maxIncreasePct) / 100));
}

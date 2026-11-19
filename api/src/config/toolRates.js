/**
 * toolRates.js — The yearly figures the calculation tools (features/tools) work with: the central
 * bank's annual inflation, the labor-law and income-tax numbers of the payroll tool, and the
 * defaults of the gold and rent tools
 *
 * These are laws and statistics, not market prices, so they live here as plain tables: a new
 * year is a row, never a code change. The values are APPROXIMATE and must be checked against the
 * official publications (Central Bank of Iran price indices, the year's minimum-wage notice and
 * the tax brackets of the budget law) when a year is added; the tools say so on screen and let
 * the user override what matters (minimum wage, exemption).
 *
 * Shared with the web through a symlink: pure data, no Worker bindings.
 */

/**
 * Annual average inflation (percent), by Shamsi year: how much the year's average consumer price
 * index grew over the previous year's. Approximate, from the central bank's annual reports.
 */
export const INFLATION_BY_YEAR = {
  1390: 21.5,
  1391: 30.5,
  1392: 34.7,
  1393: 15.6,
  1394: 11.9,
  1395: 9.1,
  1396: 9.6,
  1397: 31.2,
  1398: 41.2,
  1399: 36.4,
  1400: 40.2,
  1401: 45.8,
  1402: 44.6,
  1403: 32.5,
};

/** The latest year the table has; later years use the rate the user assumes (default: this one's) */
export const LAST_INFLATION_YEAR = Math.max(...Object.keys(INFLATION_BY_YEAR).map(Number));

/**
 * Payroll figures (monthly amounts in tomans), approximate for the year named in `year`
 * - insurance: the worker's share and the employer's (20% + 3% unemployment) of the insurable pay,
 *   which stops at `insuranceCeilingMonths` times the minimum monthly wage
 * - tax: progressive brackets on the monthly taxable pay (`upTo` null = no limit); the first is the
 *   exempt part
 */
export const PAYROLL = {
  year: 1404,
  minWageMonthly: 10_390_000,
  insuranceCeilingMonths: 7,
  insuranceWorkerPct: 7,
  insuranceEmployerPct: 23,
  eidiDays: 60,
  eidiExemptDays: 90,
  taxBrackets: [
    { upTo: 12_000_000, ratePct: 0 },
    { upTo: 20_000_000, ratePct: 10 },
    { upTo: 32_000_000, ratePct: 15 },
    { upTo: 48_000_000, ratePct: 20 },
    { upTo: 80_000_000, ratePct: 25 },
    { upTo: null, ratePct: 30 },
  ],
};

/** Defaults of the gold price tool (percent): the goldsmith's wage, the seller's profit and the VAT on both */
export const GOLD_DEFAULTS = { wagePct: 10, profitPct: 7, taxPct: 10 };

/** Default yearly rate (percent) turning a deposit into monthly rent and back */
export const RENT_DEFAULTS = { annualRatePct: 30, maxIncreasePct: 25 };

/**
 * loanCalculator.js — Pure Loan & Amortization Calculations
 *
 * Provides:
 * 1. calculateFixedInstallmentAmount — Fast computation of fixed installment amount (PMT)
 * 2. generateAmortizationSchedule — Full schedule with interest/principal breakdown,
 *    calendar day clamping (no overflow to next month), exact principal reconciliation,
 *    and guaranteed zero final balance.
 *
 * Installment due dates are computed by adding months in the JALALI (Persian) calendar,
 * not the Gregorian one — this matches how real Iranian bank loans work (same day of the
 * Persian month every installment). Computing in Gregorian and only converting to Jalali
 * for display would make the displayed day-of-month silently drift, since Jalali and
 * Gregorian months have different lengths.
 */

/**
 * Converts a Gregorian (year, month, day) into its Jalali (Persian) equivalent.
 * Uses the platform's ICU Persian calendar (already relied on elsewhere in this codebase
 * for Shamsi display) as the source of truth, instead of a hand-rolled leap-year algorithm.
 *
 * @param {number} year
 * @param {number} month - 1..12
 * @param {number} day
 * @returns {{ jy: number, jm: number, jd: number }}
 */
export function gregorianToJalali(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZone: 'UTC',
  }).formatToParts(date);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return {
    jy: parseInt(map.year, 10),
    jm: parseInt(map.month, 10),
    jd: parseInt(map.day, 10),
  };
}

const _jalaliNewYearCache = new Map();

/**
 * Finds the Gregorian (year, month, day) of Farvardin 1 (Jalali New Year) for a given Jalali year.
 * Nowruz always falls within March 19–22 (Gregorian); the exact day is found by searching that
 * window with gregorianToJalali as the oracle. Memoized since it is a pure function of jy alone.
 *
 * @param {number} jy
 * @returns {{ year: number, month: number, day: number }}
 */
function findJalaliNewYearInGregorian(jy) {
  if (_jalaliNewYearCache.has(jy)) return _jalaliNewYearCache.get(jy);

  for (const gy of [jy + 621, jy + 622]) {
    for (let day = 18; day <= 23; day++) {
      const j = gregorianToJalali(gy, 3, day);
      if (j.jy === jy && j.jm === 1 && j.jd === 1) {
        const result = { year: gy, month: 3, day };
        _jalaliNewYearCache.set(jy, result);
        return result;
      }
    }
  }
  throw new Error(`Could not locate Jalali New Year for year ${jy}`);
}

function addDaysToGregorian(year, month, day, days) {
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + days);
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

/**
 * Number of days in a given Jalali month (1..12), correctly accounting for leap years
 * (Esfand/month 12 has 29 or 30 days).
 *
 * @param {number} jy
 * @param {number} jm - 1..12
 * @returns {number}
 */
export function getJalaliMonthLength(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  // Month 12 (Esfand): ask the oracle whether day 366 of the year still belongs to this
  // Jalali year (leap, 30 days) or has already rolled into next year's Farvardin (29 days).
  const ny = findJalaliNewYearInGregorian(jy);
  const cand = addDaysToGregorian(ny.year, ny.month, ny.day, 365);
  const j = gregorianToJalali(cand.year, cand.month, cand.day);
  return (j.jy === jy && j.jm === 12 && j.jd === 30) ? 30 : 29;
}

/**
 * Converts a Jalali (year, month, day) into its Gregorian equivalent.
 *
 * @param {number} jy
 * @param {number} jm - 1..12
 * @param {number} jd
 * @returns {{ year: number, month: number, day: number }}
 */
export function jalaliToGregorian(jy, jm, jd) {
  const ny = findJalaliNewYearInGregorian(jy);
  let dayOffset = 0;
  for (let m = 1; m < jm; m++) {
    dayOffset += m <= 6 ? 31 : 30;
  }
  dayOffset += jd - 1;
  return addDaysToGregorian(ny.year, ny.month, ny.day, dayOffset);
}

/**
 * Parse an ISO date or YYYY-MM-DD string into year, month, day parts.
 *
 * @param {string|Date} dateInput
 * @returns {{ year: number, month: number, day: number, hasTime: boolean, raw: string }}
 */
export function parseDateParts(dateInput) {
  if (typeof dateInput === 'string') {
    const match = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return {
        year: parseInt(match[1], 10),
        month: parseInt(match[2], 10), // 1..12
        day: parseInt(match[3], 10),
        hasTime: dateInput.includes('T'),
        raw: dateInput,
      };
    }
  }

  const d = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(d.getTime())) {
    const now = new Date();
    return {
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
      day: now.getUTCDate(),
      hasTime: false,
      raw: '',
    };
  }

  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hasTime: typeof dateInput === 'string' && dateInput.includes('T'),
    raw: typeof dateInput === 'string' ? dateInput : d.toISOString(),
  };
}

/**
 * Compute the clamped due date for installment i (i * intervalMonths from start date).
 * Clamps days to the maximum days of the target month (e.g., Jan 31 + 1 month -> Feb 28/29).
 *
 * @param {{ year: number, month: number, day: number, hasTime: boolean, raw: string }} parsedStart
 * @param {number} i - 1-indexed installment number
 * @param {number} intervalMonths - Months between installments
 * @returns {string} Formatted ISO date (YYYY-MM-DD or full ISO if original had time)
 */
export function computeClampedDueDate(parsedStart, i, intervalMonths) {
  const startJalali = gregorianToJalali(parsedStart.year, parsedStart.month, parsedStart.day);

  const totalMonths = (startJalali.jm - 1) + (i * intervalMonths);
  const targetJy = startJalali.jy + Math.floor(totalMonths / 12);
  const targetJm = ((totalMonths % 12) + 12) % 12 + 1; // 1..12

  const maxDay = getJalaliMonthLength(targetJy, targetJm);
  const targetJd = Math.min(startJalali.jd, maxDay);

  const greg = jalaliToGregorian(targetJy, targetJm, targetJd);

  const yStr = String(greg.year).padStart(4, '0');
  const mStr = String(greg.month).padStart(2, '0');
  const dStr = String(greg.day).padStart(2, '0');
  const dateStr = `${yStr}-${mStr}-${dStr}`;

  if (parsedStart.hasTime && typeof parsedStart.raw === 'string' && parsedStart.raw.includes('T')) {
    const timePart = parsedStart.raw.split('T')[1];
    return `${dateStr}T${timePart}`;
  }
  return dateStr;
}

/**
 * Calculate the fixed periodic installment amount using the standard amortization formula.
 *
 * For annualRatePct > 0:
 *   r = (annualRatePct / 100) * (intervalMonths / 12)
 *   PMT = P * [r * (1 + r)^n] / [(1 + r)^n - 1]
 * For annualRatePct == 0 (zero-interest / قرض‌الحسنه):
 *   PMT = P / n
 *
 * @param {object} params
 * @param {number} params.principal - Principal loan amount (اصل وام)
 * @param {number} params.annualRatePct - Annual interest rate percentage (درصد سود سالانه)
 * @param {number} params.installmentCount - Total number of installments (تعداد اقساط)
 * @param {number} [params.intervalMonths=1] - Frequency interval in months (فاصله اقساط به ماه)
 * @returns {number} Fixed installment amount rounded to integer
 */
export function calculateFixedInstallmentAmount({
  principal,
  annualRatePct = 0,
  installmentCount,
  intervalMonths = 1,
}) {
  const p = Number(principal) || 0;
  const n = parseInt(installmentCount, 10) || 0;
  const rate = Number(annualRatePct) || 0;
  const interval = parseInt(intervalMonths, 10) || 1;

  if (p <= 0 || n <= 0) return 0;
  if (rate <= 0) {
    return Math.round(p / n);
  }

  // Periodic interest rate
  const r = (rate / 100) * (interval / 12);
  if (r <= 0) {
    return Math.round(p / n);
  }

  const factor = Math.pow(1 + r, n);
  const pmt = p * ((r * factor) / (factor - 1));
  return Math.round(pmt);
}

/**
 * Simulates installment #1 (a custom amount) followed by `remainingCount` standard fixed
 * installments at a given annual rate, mirroring exactly what dbCreateLoan's customFirstInstallment
 * path and computeEffectiveSchedule's recalculateFromBalance would produce for that rate.
 *
 * @param {number} principal
 * @param {number} firstInstallmentAmount
 * @param {number} remainingCount
 * @param {number} annualRatePct
 * @param {number} intervalMonths
 * @returns {{ balanceAfterFirst: number, subsequentAmount: number }}
 */
function simulateSubsequentInstallment(principal, firstInstallmentAmount, remainingCount, annualRatePct, intervalMonths) {
  const r = annualRatePct > 0 ? (annualRatePct / 100) * (intervalMonths / 12) : 0;
  const interest1 = r > 0 ? Math.round(principal * r) : 0;
  let principal1 = firstInstallmentAmount - interest1;
  if (principal1 < 0) principal1 = 0;
  if (principal1 > principal) principal1 = principal;
  const balanceAfterFirst = principal - principal1;

  const subsequentAmount = calculateFixedInstallmentAmount({
    principal: balanceAfterFirst,
    annualRatePct,
    installmentCount: remainingCount,
    intervalMonths,
  });

  return { balanceAfterFirst, subsequentAmount };
}

/**
 * Reverse-engineers the annual interest rate implied by a known repayment pattern: a custom
 * first installment followed by a uniform amount for the remaining installments (e.g. "month 1
 * was 12,000,000, every month after that is 3,000,000 for a 120-month loan — what's the rate?").
 *
 * There is no closed-form solution for uneven cash flows, so this finds the rate numerically via
 * bisection over simulateSubsequentInstallment, which reuses the exact same rounding-aware formula
 * generateAmortizationSchedule/dbCreateLoan already use — so the returned rate reproduces the real
 * schedule the app would generate, not just a continuous-math approximation.
 *
 * @param {object} params
 * @param {number} params.principal
 * @param {number} params.installmentCount - Total installment count (must be >= 2)
 * @param {number} params.firstInstallmentAmount
 * @param {number} params.subsequentInstallmentAmount - The known, uniform amount for installments 2..N
 * @param {number} [params.intervalMonths=1]
 * @returns {{ annualRatePct: number, subsequentAmount: number, remainingCount: number }}
 */
export function solveAnnualRateFromKnownPayments({
  principal,
  installmentCount,
  firstInstallmentAmount,
  subsequentInstallmentAmount,
  intervalMonths = 1,
}) {
  const p = Number(principal) || 0;
  const n = parseInt(installmentCount, 10) || 0;
  const a1 = Number(firstInstallmentAmount) || 0;
  const a2 = Number(subsequentInstallmentAmount) || 0;
  const interval = parseInt(intervalMonths, 10) || 1;

  if (p <= 0) {
    throw new Error('مبلغ اصل وام باید عددی بزرگتر از صفر باشد.');
  }
  if (n < 2) {
    throw new Error('این محاسبه به حداقل ۲ قسط (قسط اول و حداقل یک قسط بعدی) نیاز دارد.');
  }
  if (a1 <= 0 || a2 <= 0) {
    throw new Error('مبلغ قسط اول و مبلغ اقساط بعدی باید عددی بزرگتر از صفر باشند.');
  }
  if (a1 >= p) {
    throw new Error('مبلغ قسط اول نمی‌تواند از (یا برابر با) کل اصل وام بیشتر باشد.');
  }

  const remainingCount = n - 1;
  const f = (ratePct) => simulateSubsequentInstallment(p, a1, remainingCount, ratePct, interval).subsequentAmount - a2;

  // Even at 0% (قرض‌الحسنه) the implied installment already meets or exceeds the target — rate is 0%.
  if (f(0) >= 0) {
    const zero = simulateSubsequentInstallment(p, a1, remainingCount, 0, interval);
    return { annualRatePct: 0, subsequentAmount: zero.subsequentAmount, remainingCount };
  }

  let lo = 0;
  let hi = 500; // 500% annual ceiling — comfortably beyond any real-world loan
  let fHi = f(hi);
  let expansions = 0;
  while (fHi < 0 && expansions < 20) {
    hi *= 2;
    fHi = f(hi);
    expansions++;
  }
  if (fHi < 0) {
    throw new Error('برای این ترکیب از مبلغ اقساط، نرخ سود معتبری پیدا نشد. لطفاً مقادیر را بررسی کنید.');
  }

  for (let i = 0; i < 100 && hi - lo > 1e-6; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid; else hi = mid;
  }

  const annualRatePct = Math.round(((lo + hi) / 2) * 100) / 100;
  const finalSim = simulateSubsequentInstallment(p, a1, remainingCount, annualRatePct, interval);
  return { annualRatePct, subsequentAmount: finalSim.subsequentAmount, remainingCount };
}

/**
 * Generate full amortization schedule for a loan.
 *
 * @param {object} params
 * @param {number} params.principal - Principal loan amount
 * @param {number} params.annualRatePct - Annual interest rate percentage (0 for قرض‌الحسنه)
 * @param {number} params.installmentCount - Total number of installments
 * @param {string} params.startDateIso - Loan start date (ISO or YYYY-MM-DD)
 * @param {number} [params.intervalMonths=1] - Interval in months (default 1)
 * @returns {Array<{
 *   installmentNumber: number,
 *   dueDateIso: string,
 *   principalPortion: number,
 *   interestPortion: number,
 *   totalAmount: number,
 *   remainingBalanceAfter: number
 * }>}
 */

/**
 * Reverse-engineers the annual interest rate implied by a known TOTAL repayment amount for a
 * standard equal-installment loan (principal + total interest, e.g. "I'm borrowing 100,000,000
 * and I know I have to pay back 123,000,000 in total over 24 months — what's the rate?"). Unlike
 * solveAnnualRateFromKnownPayments (uneven first+subsequent payments), every installment here is
 * assumed equal, so this reduces to: find the rate whose calculateFixedInstallmentAmount matches
 * totalRepayment / installmentCount. Uses bisection since PMT has no closed-form inverse in rate.
 *
 * @param {object} params
 * @param {number} params.principal
 * @param {number} params.installmentCount
 * @param {number} params.totalRepayment - The full amount expected to be repaid (principal + interest)
 * @param {number} [params.intervalMonths=1]
 * @returns {{ annualRatePct: number, installmentAmount: number }}
 */
export function solveAnnualRateFromTotalRepayment({
  principal,
  installmentCount,
  totalRepayment,
  intervalMonths = 1,
}) {
  const p = Number(principal) || 0;
  const n = parseInt(installmentCount, 10) || 0;
  const total = Number(totalRepayment) || 0;
  const interval = parseInt(intervalMonths, 10) || 1;

  if (p <= 0) {
    throw new Error('مبلغ اصل وام باید عددی بزرگتر از صفر باشد.');
  }
  if (n <= 0) {
    throw new Error('تعداد اقساط باید عددی بزرگتر از صفر باشد.');
  }
  if (total < p) {
    throw new Error('کل مبلغ قابل بازپرداخت نمی‌تواند کمتر از مبلغ اصل وام باشد.');
  }

  const targetInstallment = total / n;
  const f = (ratePct) =>
    calculateFixedInstallmentAmount({ principal: p, annualRatePct: ratePct, installmentCount: n, intervalMonths: interval }) -
    targetInstallment;

  if (f(0) >= 0) {
    // Target is already met (or exceeded) at 0% — rate can only be 0%, never negative.
    return {
      annualRatePct: 0,
      installmentAmount: calculateFixedInstallmentAmount({ principal: p, annualRatePct: 0, installmentCount: n, intervalMonths: interval }),
    };
  }

  let lo = 0;
  let hi = 500;
  let fHi = f(hi);
  let expansions = 0;
  while (fHi < 0 && expansions < 20) {
    hi *= 2;
    fHi = f(hi);
    expansions++;
  }
  if (fHi < 0) {
    throw new Error('برای این مبلغ کل بازپرداخت، نرخ سود معتبری پیدا نشد. لطفاً مقادیر را بررسی کنید.');
  }

  for (let i = 0; i < 100 && hi - lo > 1e-6; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid; else hi = mid;
  }

  const annualRatePct = Math.round(((lo + hi) / 2) * 100) / 100;
  const installmentAmount = calculateFixedInstallmentAmount({ principal: p, annualRatePct, installmentCount: n, intervalMonths: interval });
  return { annualRatePct, installmentAmount };
}

/**
 * Recalculate amortization schedule starting from an arbitrary balance and installment offset.
 *
 * @param {object} params
 * @param {number} params.anchorBalance - Current remaining balance to amortize
 * @param {number} [params.anchorInstallmentNumber=0] - Preceding installment number (e.g., number of already paid installments)
 * @param {number} params.remainingCount - Number of remaining installments to distribute over
 * @param {number} [params.annualRatePct=0] - Annual interest rate percentage
 * @param {number} [params.intervalMonths=1] - Frequency interval in months
 * @param {string} params.startDateIso - Original loan start date
 * @returns {Array<{
 *   installmentNumber: number,
 *   dueDateIso: string,
 *   principalPortion: number,
 *   interestPortion: number,
 *   totalAmount: number,
 *   remainingBalanceAfter: number
 * }>}
 */
export function recalculateFromBalance({
  anchorBalance,
  anchorInstallmentNumber = 0,
  remainingCount,
  annualRatePct = 0,
  intervalMonths = 1,
  startDateIso,
  loanId = '',
}) {
  const p = Number(anchorBalance) || 0;
  const n = parseInt(remainingCount, 10) || 0;
  const rate = Number(annualRatePct) || 0;
  const interval = parseInt(intervalMonths, 10) || 1;
  const anchor = parseInt(anchorInstallmentNumber, 10) || 0;

  if (p <= 0 || n <= 0) return [];

  const parsedStart = parseDateParts(startDateIso);
  const fixedInstallment = calculateFixedInstallmentAmount({
    principal: p,
    annualRatePct: rate,
    installmentCount: n,
    intervalMonths: interval,
  });

  const r = rate > 0 ? (rate / 100) * (interval / 12) : 0;
  const schedule = [];
  let remainingBalance = p;

  for (let k = 1; k <= n; k++) {
    const installmentNumber = anchor + k;
    const dueDateIso = computeClampedDueDate(parsedStart, installmentNumber, interval);
    const instId = loanId ? `inst_${loanId}_${installmentNumber}` : `inst_${installmentNumber}`;

    if (k === n) {
      // Last installment reconciles remaining principal to guarantee exact zero balance
      const interestPortion = r > 0 ? Math.round(remainingBalance * r) : 0;
      const principalPortion = remainingBalance;
      const totalAmount = principalPortion + interestPortion;
      remainingBalance = 0;

      schedule.push({
        id: instId,
        installmentNumber,
        dueDate: dueDateIso,
        dueDateIso,
        principalPortion,
        interestPortion,
        totalAmount,
        remainingBalanceAfter: 0,
        isPaid: false,
        paidDate: '',
        paidAmount: 0,
        isManualOverride: false,
      });
    } else {
      const interestPortion = r > 0 ? Math.round(remainingBalance * r) : 0;
      let principalPortion = fixedInstallment - interestPortion;

      if (principalPortion < 0) {
        principalPortion = 0;
      }
      if (principalPortion > remainingBalance) {
        principalPortion = remainingBalance;
      }

      const totalAmount = principalPortion + interestPortion;
      remainingBalance = remainingBalance - principalPortion;

      schedule.push({
        id: instId,
        installmentNumber,
        dueDate: dueDateIso,
        dueDateIso,
        principalPortion,
        interestPortion,
        totalAmount,
        remainingBalanceAfter: remainingBalance,
        isPaid: false,
        paidDate: '',
        paidAmount: 0,
        isManualOverride: false,
      });
    }
  }

  return schedule;
}

/**
 * Generate full amortization schedule for a loan.
 * Accepts either { principal, annualRatePct, ... } or full loan model { principalAmount, annualInterestRate, ... }.
 *
 * @param {object} params
 * @returns {Array<object>}
 */
export function generateAmortizationSchedule(params = {}) {
  const principal = Number(params.principal ?? params.principalAmount ?? 0);
  const annualRatePct = Number(params.annualRatePct ?? params.annualInterestRate ?? 0);
  const installmentCount = parseInt(params.installmentCount ?? 0, 10);
  const startDateIso = params.startDateIso || params.startDate || '';
  const intervalMonths = parseInt(params.intervalMonths ?? 1, 10);
  const loanId = params.id || params.loanId || '';

  return recalculateFromBalance({
    anchorBalance: principal,
    anchorInstallmentNumber: 0,
    remainingCount: installmentCount,
    annualRatePct,
    intervalMonths,
    startDateIso,
    loanId,
  });
}

/**
 * Calculate payoff schedule with a fixed installment amount ("کاهش تعداد اقساط" / Reduce Term).
 * Simulates month-by-month payment until balance reaches exactly 0.
 *
 * @param {object} params
 * @param {number} params.remainingBalance - Current remaining balance
 * @param {number} params.fixedInstallmentAmount - Target fixed installment amount per period
 * @param {number} [params.annualRatePct=0] - Annual interest rate percentage
 * @param {number} [params.intervalMonths=1] - Frequency interval in months
 * @param {string} params.startDateIso - Original loan start date
 * @param {number} [params.anchorInstallmentNumber=0] - Number of already elapsed installments
 * @param {string} [params.loanId=''] - Optional loan ID for generating deterministic installment IDs
 * @returns {Array<object>}
 */
export function calculatePayoffScheduleFixedAmount({
  remainingBalance,
  fixedInstallmentAmount,
  annualRatePct = 0,
  intervalMonths = 1,
  startDateIso,
  anchorInstallmentNumber = 0,
  loanId = '',
}) {
  let balance = Number(remainingBalance) || 0;
  const pmt = Number(fixedInstallmentAmount) || 0;
  const rate = Number(annualRatePct) || 0;
  const interval = parseInt(intervalMonths, 10) || 1;
  const anchor = parseInt(anchorInstallmentNumber, 10) || 0;

  if (balance <= 0) return [];
  if (pmt <= 0) {
    throw new Error("مبلغ قسط ثابت باید بزرگتر از صفر باشد.");
  }

  const r = rate > 0 ? (rate / 100) * (interval / 12) : 0;

  // Validate that payment exceeds initial period interest to avoid infinite loop
  const initialInterest = r > 0 ? Math.round(balance * r) : 0;
  if (r > 0 && pmt <= initialInterest) {
    throw new Error("مبلغ قسط ثابت کمتر یا مساوی بهره دوره‌ای است و وام هرگز تسویه نخواهد شد.");
  }

  const parsedStart = parseDateParts(startDateIso);
  const schedule = [];
  const MAX_ITERATIONS = 1200; // 100 years safety cap
  let iteration = 0;

  while (balance > 0) {
    iteration++;
    if (iteration > MAX_ITERATIONS) {
      throw new Error("تعداد اقساط محاسبه‌شده از سقف مجاز (۱۲۰۰ قسط) فراتر رفت.");
    }

    const installmentNumber = anchor + iteration;
    const dueDateIso = computeClampedDueDate(parsedStart, installmentNumber, interval);
    const instId = loanId ? `inst_${loanId}_${installmentNumber}` : `inst_${installmentNumber}`;
    const interestPortion = r > 0 ? Math.round(balance * r) : 0;

    let principalPortion = pmt - interestPortion;
    if (principalPortion <= 0 && balance > 0) {
      throw new Error("مبلغ قسط ثابت کمتر یا مساوی بهره دوره‌ای است و وام هرگز تسویه نخواهد شد.");
    }

    let remainingBalanceAfter = 0;
    let totalAmount = pmt;

    if (principalPortion >= balance) {
      // Clamped final installment
      principalPortion = balance;
      totalAmount = principalPortion + interestPortion;
      balance = 0;
      remainingBalanceAfter = 0;
    } else {
      balance = balance - principalPortion;
      remainingBalanceAfter = balance;
    }

    schedule.push({
      id: instId,
      installmentNumber,
      dueDate: dueDateIso,
      dueDateIso,
      principalPortion,
      interestPortion,
      totalAmount,
      remainingBalanceAfter,
      isPaid: false,
      paidDate: '',
      paidAmount: 0,
      isManualOverride: false,
    });
  }

  return schedule;
}

/**
 * Apply the loan's optional annual fee (کارمزد سالانه) on top of an already-computed schedule.
 * The fee is charged once per full year elapsed since the loan start, added to whichever pending
 * installment is the first to reach that anniversary (e.g. installment #12 for a monthly loan,
 * #4 for a quarterly loan). It is a pure surcharge on `totalAmount` — it does not participate in
 * the principal/interest amortization math and never changes `remainingBalanceAfter`.
 *
 * Paid installments (frozen, already reflect whatever fee applied when they were paid) and
 * manually-overridden pending installments (the user's explicit chosen total) are left untouched.
 *
 * @param {Array<object>} schedule
 * @param {object} loan
 * @returns {Array<object>}
 */
export function applyAnnualFee(schedule, loan) {
  const feeAmount = Number(loan?.annualFeeAmount ?? loan?.annual_fee_amount ?? 0);
  const intervalMonths = parseInt(loan?.intervalMonths ?? loan?.interval_months ?? 1, 10) || 1;

  return schedule.map((inst) => {
    if (feeAmount > 0 && !inst.isPaid && !inst.isManualOverride) {
      const monthsBefore = (inst.installmentNumber - 1) * intervalMonths;
      const monthsAfter = inst.installmentNumber * intervalMonths;
      const crossings = Math.floor(monthsAfter / 12) - Math.floor(monthsBefore / 12);
      if (crossings > 0) {
        const feePortion = feeAmount * crossings;
        return {
          ...inst,
          feePortion,
          totalAmount: inst.totalAmount + feePortion,
        };
      }
    }
    return inst;
  });
}

/**
 * Compute the effective amortization schedule dynamically from a loan definition,
 * its recorded installment states (overrides, payments), and extra payments.
 *
 * @param {object} params
 * @param {object} params.loan
 * @param {Array<object>} [params.installmentStates=[]]
 * @param {Array<object>} [params.extraPayments=[]]
 * @returns {Array<object>}
 */
export function computeEffectiveSchedule({
  loan,
  installmentStates = [],
  extraPayments = [],
}) {
  if (!loan) return [];

  const principal = Number(loan.principalAmount ?? loan.principal ?? 0);
  const annualRatePct = Number(loan.annualInterestRate ?? loan.annualRatePct ?? 0);
  const installmentCount = parseInt(loan.installmentCount ?? 0, 10);
  const intervalMonths = parseInt(loan.intervalMonths ?? 1, 10);
  const startDateIso = loan.startDate || loan.startDateIso || '';
  const loanId = loan.id || loan.loanId || '';

  if (principal <= 0 || installmentCount <= 0) {
    return [];
  }

  // "Distributed" loans (built via distributeInstallmentAmounts — see that function's docstring)
  // store a fully-materialized row for EVERY pending installment, whose principal/interest split
  // is not derived from real declining-balance math. The cascade logic below (Step A) always
  // recomputes an override's principal/interest from the actual balance flowing into it, which
  // is essential for the ordinary single-override lifecycle but would silently corrupt a
  // distributed schedule's blended-ratio split on every read. So distributed loans take a
  // completely separate, trust-the-stored-row read path and never reach the cascade below.
  if ((loan.scheduleMode || loan.schedule_mode) === 'distributed') {
    const distStatesMap = new Map();
    for (const s of installmentStates) {
      const num = parseInt(s.installmentNumber ?? s.installment_number ?? 0, 10);
      if (num > 0) distStatesMap.set(num, s);
    }
    const baseline = generateAmortizationSchedule(loan);
    const schedule = [];
    for (let num = 1; num <= installmentCount; num++) {
      const state = distStatesMap.get(num);
      const baseItem = baseline[num - 1];
      if (state) {
        schedule.push({
          id: state.id || (loanId ? `inst_${loanId}_${num}` : `inst_${num}`),
          installmentNumber: num,
          dueDate: state.dueDate || state.due_date || (baseItem ? baseItem.dueDate : ''),
          dueDateIso: state.dueDate || state.due_date || (baseItem ? baseItem.dueDateIso : ''),
          principalPortion: Number(state.principalPortion ?? state.principal_portion ?? 0),
          interestPortion: Number(state.interestPortion ?? state.interest_portion ?? 0),
          totalAmount: Number(state.totalAmount ?? state.total_amount ?? 0),
          remainingBalanceAfter: Number(state.remainingBalanceAfter ?? state.remaining_balance_after ?? 0),
          isPaid: Boolean(state.isPaid ?? state.is_paid),
          paidDate: state.paidDate || state.paid_date || '',
          paidAmount: Number(state.paidAmount ?? state.paid_amount ?? 0),
          isManualOverride: Boolean(state.isManualOverride ?? state.is_manual_override),
        });
      } else if (baseItem) {
        // Defensive fallback only — a well-formed distributed loan always has a stored row for
        // every pending installment.
        schedule.push({ ...baseItem, isPaid: false, paidDate: '', paidAmount: 0, isManualOverride: false });
      }
    }
    return applyAnnualFee(schedule, loan);
  }

  const r = annualRatePct > 0 ? (annualRatePct / 100) * (intervalMonths / 12) : 0;

  // Index installmentStates by installmentNumber
  const statesMap = new Map();
  for (const s of installmentStates) {
    const num = parseInt(s.installmentNumber ?? s.installment_number ?? 0, 10);
    if (num > 0) {
      statesMap.set(num, s);
    }
  }

  // Group extraPayments by anchorInstallmentNumber
  const epByAnchor = new Map();
  for (const ep of extraPayments) {
    const anchor = parseInt(ep.anchorInstallmentNumber ?? ep.anchor_installment_number ?? 0, 10);
    if (!epByAnchor.has(anchor)) {
      epByAnchor.set(anchor, []);
    }
    epByAnchor.get(anchor).push(ep);
  }

  // 1. Check if there are contiguous paid installments starting from installment 1
  let contiguousPaidCount = 0;
  while (statesMap.has(contiguousPaidCount + 1)) {
    const st = statesMap.get(contiguousPaidCount + 1);
    if (Boolean(st.isPaid ?? st.is_paid)) {
      contiguousPaidCount++;
    } else {
      break;
    }
  }

  let schedule = [];
  let loopStartK = 1;

  if (contiguousPaidCount > 0) {
    const baseSchedule = generateAmortizationSchedule(loan);
    const paidSlice = [];
    for (let k = 1; k <= contiguousPaidCount; k++) {
      const state = statesMap.get(k);
      const baseItem = baseSchedule[k - 1];
      paidSlice.push({
        id: state.id || (baseItem ? baseItem.id : (loanId ? `inst_${loanId}_${k}` : `inst_${k}`)),
        installmentNumber: k,
        dueDate: state.dueDate || state.due_date || (baseItem ? baseItem.dueDate : ''),
        dueDateIso: state.dueDate || state.due_date || (baseItem ? baseItem.dueDateIso : ''),
        principalPortion: Number(state.principalPortion ?? state.principal_portion ?? (baseItem ? baseItem.principalPortion : 0)),
        interestPortion: Number(state.interestPortion ?? state.interest_portion ?? (baseItem ? baseItem.interestPortion : 0)),
        totalAmount: Number(state.totalAmount ?? state.total_amount ?? (baseItem ? baseItem.totalAmount : 0)),
        remainingBalanceAfter: Number(state.remainingBalanceAfter ?? state.remaining_balance_after ?? (baseItem ? baseItem.remainingBalanceAfter : 0)),
        isPaid: true,
        paidDate: state.paidDate || state.paid_date || '',
        paidAmount: Number(state.paidAmount ?? state.paid_amount ?? (baseItem ? baseItem.totalAmount : 0)),
        isManualOverride: Boolean(state.isManualOverride ?? state.is_manual_override),
      });
    }

    // Remaining principal must be derived from the CURRENT loan.principalAmount (so it responds
    // correctly to dbUpdateLoan changing the principal after installments were already paid),
    // minus what was actually paid via installments, minus any extra (lump-sum) payments whose
    // anchor already falls within the paid prefix (those already reduced the debt but are never
    // reflected in any installment's own principalPortion, so they must be subtracted explicitly).
    const alreadyPaidPrincipal = paidSlice.reduce((sum, inst) => sum + inst.principalPortion, 0);
    const absorbedExtraPayments = extraPayments
      .filter((ep) => {
        const anchor = parseInt(ep.anchorInstallmentNumber ?? ep.anchor_installment_number ?? 0, 10);
        return anchor < contiguousPaidCount;
      })
      .reduce((sum, ep) => sum + (Number(ep.amount) || 0), 0);
    const remainingPrincipal = Math.max(0, principal - alreadyPaidPrincipal - absorbedExtraPayments);
    const remainingCount = Math.max(0, installmentCount - contiguousPaidCount);

    if (remainingCount > 0 && remainingPrincipal > 0) {
      const remainingSchedule = recalculateFromBalance({
        anchorBalance: remainingPrincipal,
        anchorInstallmentNumber: contiguousPaidCount,
        remainingCount,
        annualRatePct,
        intervalMonths,
        startDateIso,
        loanId,
      });
      schedule = paidSlice.concat(remainingSchedule);
    } else {
      schedule = paidSlice;
    }

    loopStartK = contiguousPaidCount + 1;
  } else {
    // Generate baseline schedule
    schedule = generateAmortizationSchedule(loan);

    // If no events exist, return baseline schedule directly
    if (
      (!installmentStates || installmentStates.length === 0) &&
      (!extraPayments || extraPayments.length === 0)
    ) {
      return applyAnnualFee(schedule, loan);
    }

    // Handle anchor 0 extra payments if any
    if (epByAnchor.has(0)) {
      for (const ep of epByAnchor.get(0)) {
        const epAmount = Number(ep.amount ?? 0);
        const resultingBal = ep.resultingBalance !== undefined && ep.resultingBalance !== null
          ? Number(ep.resultingBalance)
          : Math.max(0, principal - epAmount);

        if (resultingBal === 0) {
          return [];
        }

        const mode = (ep.reductionMode ?? ep.reduction_mode) === 'reduce_term' ? 'reduce_term' : 'reduce_amount';
        if (mode === 'reduce_term') {
          const initialFixed = calculateFixedInstallmentAmount({
            principal,
            annualRatePct,
            installmentCount,
            intervalMonths,
          });
          schedule = calculatePayoffScheduleFixedAmount({
            remainingBalance: resultingBal,
            fixedInstallmentAmount: initialFixed,
            annualRatePct,
            intervalMonths,
            startDateIso,
            anchorInstallmentNumber: 0,
            loanId,
          });
        } else {
          schedule = recalculateFromBalance({
            anchorBalance: resultingBal,
            anchorInstallmentNumber: 0,
            remainingCount: installmentCount,
            annualRatePct,
            intervalMonths,
            startDateIso,
            loanId,
          });
        }
      }
    }
  }

  // Process installment by installment: k = 1, 2, ...
  for (let k = 1; k <= schedule.length; k++) {
    const instIndex = k - 1;
    const currentInst = schedule[instIndex];
    if (!currentInst) break;

    const state = statesMap.get(k);

    // Step A: Check for manual override at installment k (only for pending installments)
    const isOverride = Boolean(state?.isManualOverride ?? state?.is_manual_override);
    if (isOverride && k > contiguousPaidCount) {
      const balanceBefore = k === 1
        ? principal
        : schedule[k - 2].remainingBalanceAfter;

      const desiredTotal = Number(state.totalAmount ?? state.total_amount);
      const interestPortion = r > 0 ? Math.round(balanceBefore * r) : 0;
      let principalPortion = desiredTotal - interestPortion;
      if (principalPortion < 0) principalPortion = 0;
      if (principalPortion > balanceBefore) principalPortion = balanceBefore;

      const totalAmount = principalPortion + interestPortion;
      const remainingBalanceAfter = balanceBefore - principalPortion;

      schedule[instIndex] = {
        ...currentInst,
        id: state.id || currentInst.id,
        principalPortion,
        interestPortion,
        totalAmount,
        remainingBalanceAfter,
        isManualOverride: true,
      };

      const remainingCount = schedule.length - k;
      if (remainingCount > 0) {
        if (remainingBalanceAfter === 0) {
          schedule = schedule.slice(0, k);
          break;
        } else {
          const subsequent = recalculateFromBalance({
            anchorBalance: remainingBalanceAfter,
            anchorInstallmentNumber: k,
            remainingCount,
            annualRatePct,
            intervalMonths,
            startDateIso,
            loanId,
          });
          schedule = schedule.slice(0, k).concat(subsequent);
        }
      }
    }

    // Step B: Check for extra payments anchored at k.
    // Guard against re-applying a "stale" extra payment whose anchor is now behind the
    // contiguous paid prefix: its effect is already baked into the real stored values of
    // whatever installments were paid after it. Re-applying it here would re-derive the tail
    // from the wrong (earlier) balance, corrupting everything after the paid prefix.
    if (epByAnchor.has(k) && k >= contiguousPaidCount) {
      for (const ep of epByAnchor.get(k)) {
        const balanceAtK = schedule[instIndex].remainingBalanceAfter;
        const epAmount = Number(ep.amount ?? 0);
        const resultingBal = ep.resultingBalance !== undefined && ep.resultingBalance !== null
          ? Number(ep.resultingBalance)
          : Math.max(0, balanceAtK - epAmount);

        if (resultingBal === 0) {
          schedule = schedule.slice(0, k);
          break;
        }

        const mode = (ep.reductionMode ?? ep.reduction_mode) === 'reduce_term' ? 'reduce_term' : 'reduce_amount';
        if (mode === 'reduce_term') {
          // Keep the fixed installment amount from before this extra payment
          let fixedAmount = 0;
          if (schedule[k] && schedule[k].totalAmount > 0) {
            fixedAmount = schedule[k].totalAmount;
          } else {
            fixedAmount = calculateFixedInstallmentAmount({
              principal,
              annualRatePct,
              installmentCount,
              intervalMonths,
            });
          }

          const subsequent = calculatePayoffScheduleFixedAmount({
            remainingBalance: resultingBal,
            fixedInstallmentAmount: fixedAmount,
            annualRatePct,
            intervalMonths,
            startDateIso,
            anchorInstallmentNumber: k,
            loanId,
          });
          schedule = schedule.slice(0, k).concat(subsequent);
        } else {
          // 'reduce_amount'
          const remainingCount = Math.max(1, schedule.length - k);
          const subsequent = recalculateFromBalance({
            anchorBalance: resultingBal,
            anchorInstallmentNumber: k,
            remainingCount,
            annualRatePct,
            intervalMonths,
            startDateIso,
            loanId,
          });
          schedule = schedule.slice(0, k).concat(subsequent);
        }
      }
      if (schedule.length <= k) {
        break;
      }
    }
  }

  // Step C: Apply metadata (paid status, dates, etc.) from statesMap
  for (let i = 0; i < schedule.length; i++) {
    const inst = schedule[i];
    const state = statesMap.get(inst.installmentNumber);
    if (state) {
      if (state.id) {
        inst.id = state.id;
      }
      if (Boolean(state.isPaid ?? state.is_paid)) {
        inst.isPaid = true;
        inst.paidDate = state.paidDate || state.paid_date || '';
        inst.paidAmount = Number(state.paidAmount ?? state.paid_amount ?? inst.totalAmount);
        if (state.principalPortion !== undefined || state.principal_portion !== undefined) {
          inst.principalPortion = Number(state.principalPortion ?? state.principal_portion);
        }
        if (state.interestPortion !== undefined || state.interest_portion !== undefined) {
          inst.interestPortion = Number(state.interestPortion ?? state.interest_portion);
        }
        if (state.totalAmount !== undefined || state.total_amount !== undefined) {
          inst.totalAmount = Number(state.totalAmount ?? state.total_amount);
        }
        if (state.remainingBalanceAfter !== undefined || state.remaining_balance_after !== undefined) {
          inst.remainingBalanceAfter = Number(state.remainingBalanceAfter ?? state.remaining_balance_after);
        }
      }
      if (Boolean(state.isManualOverride ?? state.is_manual_override)) {
        inst.isManualOverride = true;
      }
    }
    // Ensure all standard fields exist
    inst.dueDate = inst.dueDate || inst.dueDateIso;
    inst.dueDateIso = inst.dueDateIso || inst.dueDate;
    inst.isPaid = Boolean(inst.isPaid);
    inst.paidDate = inst.paidDate || '';
    inst.paidAmount = Number(inst.paidAmount || 0);
    inst.isManualOverride = Boolean(inst.isManualOverride);
  }

  return applyAnnualFee(schedule, loan);
}

/**
 * Distributes a full installmentCount-length schedule where some installments have a known,
 * fixed amount (already paid, or manually specified by the user) and every other pending
 * installment splits whatever is left of the loan's expected total repayment EQUALLY among
 * themselves — a simple, position-independent "divide what's left" model.
 *
 * This is deliberately different from computeEffectiveSchedule's cascade (Step A), which can
 * only reflow installments AFTER a touched one, since real declining-balance interest is
 * causal (installment 30's balance cannot depend on installment 31 onward). That model is
 * still the right one for the ongoing pay/override lifecycle. This function is for planning
 * or bulk-editing every remaining installment's amount at once — e.g. "I know installment 1
 * is 12,000,000 and installment 60 is 3,000,000, split the other 58 evenly" — where the
 * un-pinned installments are not meant to carry a "true" monthly balance calculation at all.
 *
 * Because the split totals aren't derived from a real running balance, the principal/interest
 * breakdown for touched and auto-divided installments is only an estimate: a single blended
 * ratio (loan principal ÷ the loan's baseline total repayment under its stated rate) is applied
 * to every installment's total. Already-paid installments are used exactly as recorded and are
 * never touched. Rounding is reconciled onto the LAST pending installment so the sum of every
 * installment's principalPortion always equals the loan's principal exactly.
 *
 * @param {object} params
 * @param {object} params.loan - { principalAmount, annualInterestRate, installmentCount, intervalMonths, startDate, id? }
 * @param {Array<object>} [params.paidInstallments=[]] - Already-paid installments (a contiguous
 *   prefix starting at #1), used as-is and excluded from redistribution.
 * @param {Object<number, number>} [params.knownAmounts={}] - installmentNumber -> user-specified
 *   totalAmount for pending installments the user has explicitly set.
 * @param {number} [params.totalRepaymentOverride] - When given, this exact figure (principal +
 *   interest) is used as the pool to divide instead of the loan's rate-derived formula total —
 *   for "I know my total repayment is exactly X, split it evenly" rather than "solve a rate".
 * @param {number} [params.principalOverride] - When given, this replaces `loan.principalAmount`
 *   as the figure every installment's principalPortion (paid + pending combined) must sum to.
 *   Needed because `loan.principalAmount` never changes when an extra (lump-sum) payment is
 *   applied to a formula-mode loan — the actual remaining principal still owed is lower than the
 *   raw field. Callers should pass the sum of the CURRENT (pre-redistribution) schedule's
 *   installments' principalPortion, which already nets out extra payments correctly.
 * @returns {Array<object>} Full installmentCount-length schedule, same shape as computeEffectiveSchedule's output
 */
export function distributeInstallmentAmounts({ loan, paidInstallments = [], knownAmounts = {}, totalRepaymentOverride, principalOverride }) {
  const principal = Number(loan.principalAmount ?? loan.principal ?? 0);
  const effectivePrincipal = principalOverride !== undefined && principalOverride !== null
    ? Number(principalOverride)
    : principal;
  const installmentCount = parseInt(loan.installmentCount ?? 0, 10);
  const loanId = loan.id || loan.loanId || '';

  if (principal <= 0 || installmentCount <= 0) return [];

  const baseline = generateAmortizationSchedule(loan);
  // When the user supplies an explicit known total repayment (rather than deriving it from the
  // loan's rate), that number IS the pool — not the rate-based formula total. This is what makes
  // e.g. "I know my bank total is exactly 151,187,328, split it evenly over 12" reconcile exactly
  // to that figure, instead of round-tripping through a notional back-solved rate first.
  const baselineTotalRepayment = totalRepaymentOverride !== undefined && totalRepaymentOverride !== null
    ? Number(totalRepaymentOverride)
    : baseline.reduce((sum, i) => sum + i.totalAmount, 0);

  if (totalRepaymentOverride !== undefined && totalRepaymentOverride !== null && baselineTotalRepayment < effectivePrincipal) {
    throw new Error('مبلغ کل بازپرداخت نمی‌تواند کمتر از مبلغ اصل وام باشد.');
  }

  const paidByNumber = new Map();
  for (const p of paidInstallments) {
    const num = parseInt(p.installmentNumber ?? p.installment_number, 10);
    if (num >= 1) paidByNumber.set(num, p);
  }
  const paidTotal = paidInstallments.reduce((sum, p) => sum + Number(p.totalAmount ?? p.total_amount ?? 0), 0);

  const knownEntries = Object.entries(knownAmounts)
    .map(([num, amt]) => [parseInt(num, 10), Number(amt)])
    .filter(([num, amt]) => num >= 1 && num <= installmentCount && amt > 0 && !paidByNumber.has(num));
  const knownByNumber = new Map(knownEntries);
  const touchedTotal = knownEntries.reduce((sum, [, amt]) => sum + amt, 0);

  // Untouched installment numbers, in ascending order.
  const untouchedNumbers = [];
  for (let num = 1; num <= installmentCount; num++) {
    if (!paidByNumber.has(num) && !knownByNumber.has(num)) untouchedNumbers.push(num);
  }
  const untouchedCount = untouchedNumbers.length;
  const leftoverPool = baselineTotalRepayment - paidTotal - touchedTotal;

  if (untouchedCount > 0 && leftoverPool < 0) {
    throw new Error('مجموع مبالغ واردشده از کل مبلغ قابل بازپرداخت وام بیشتر است.');
  }

  // Assign each untouched installment's totalAmount so their SUM is EXACTLY leftoverPool — not
  // just each individually rounded, which can drift the grand total by a few toman across many
  // installments (this is what let a known total like 151,187,328 come back slightly off). The
  // last untouched installment (by position) absorbs whatever rounding remainder is left.
  const perUntouchedTotal = untouchedCount > 0 ? Math.round(leftoverPool / untouchedCount) : 0;
  const untouchedTotalByNumber = new Map();
  untouchedNumbers.forEach((num, idx) => {
    const isLastUntouched = idx === untouchedNumbers.length - 1;
    untouchedTotalByNumber.set(
      num,
      isLastUntouched ? leftoverPool - perUntouchedTotal * (untouchedCount - 1) : perUntouchedTotal
    );
  });

  const principalRatio = baselineTotalRepayment > 0 ? effectivePrincipal / baselineTotalRepayment : 1;

  const schedule = [];
  let runningBalance = effectivePrincipal;
  let lastPendingIndex = -1;

  for (let num = 1; num <= installmentCount; num++) {
    const baseItem = baseline[num - 1];
    const instId = loanId ? `inst_${loanId}_${num}` : `inst_${num}`;

    if (paidByNumber.has(num)) {
      const p = paidByNumber.get(num);
      const principalPortion = Number(p.principalPortion ?? p.principal_portion ?? 0);
      runningBalance = p.remainingBalanceAfter !== undefined
        ? Number(p.remainingBalanceAfter)
        : runningBalance - principalPortion;

      schedule.push({
        id: p.id || instId,
        installmentNumber: num,
        dueDate: p.dueDate || p.due_date || (baseItem ? baseItem.dueDate : ''),
        dueDateIso: p.dueDate || p.due_date || (baseItem ? baseItem.dueDateIso : ''),
        principalPortion,
        interestPortion: Number(p.interestPortion ?? p.interest_portion ?? 0),
        totalAmount: Number(p.totalAmount ?? p.total_amount ?? 0),
        remainingBalanceAfter: runningBalance,
        isPaid: true,
        paidDate: p.paidDate || p.paid_date || '',
        paidAmount: Number(p.paidAmount ?? p.paid_amount ?? p.totalAmount ?? 0),
        isManualOverride: Boolean(p.isManualOverride ?? p.is_manual_override),
      });
      continue;
    }

    const totalAmount = knownByNumber.has(num) ? knownByNumber.get(num) : untouchedTotalByNumber.get(num);
    let principalPortion = Math.round(totalAmount * principalRatio);
    if (principalPortion < 0) principalPortion = 0;
    if (principalPortion > runningBalance) principalPortion = runningBalance;
    let interestPortion = totalAmount - principalPortion;
    if (interestPortion < 0) interestPortion = 0;

    runningBalance -= principalPortion;

    schedule.push({
      id: instId,
      installmentNumber: num,
      dueDate: baseItem ? baseItem.dueDate : '',
      dueDateIso: baseItem ? baseItem.dueDateIso : '',
      principalPortion,
      interestPortion,
      totalAmount,
      remainingBalanceAfter: runningBalance,
      isPaid: false,
      paidDate: '',
      paidAmount: 0,
      isManualOverride: true,
    });
    lastPendingIndex = schedule.length - 1;
  }

  // Reconcile principal rounding onto the last pending installment's principal/interest SPLIT
  // only — shifting `diff` between principalPortion and interestPortion, never touching
  // totalAmount, which must stay exactly what was specified or evenly divided above. Paid
  // installments are historical/frozen and must never be adjusted.
  const sumPrincipal = schedule.reduce((sum, i) => sum + i.principalPortion, 0);
  const diff = effectivePrincipal - sumPrincipal;
  if (diff !== 0 && lastPendingIndex >= 0) {
    const inst = schedule[lastPendingIndex];
    inst.principalPortion += diff;
    inst.interestPortion -= diff;
    inst.remainingBalanceAfter = Math.max(0, inst.remainingBalanceAfter - diff);
  }

  return schedule;
}


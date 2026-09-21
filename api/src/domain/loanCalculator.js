/**
 * loanCalculator.js — Pure Loan & Amortization Calculations
 *
 * Provides:
 * 1. calculateFixedInstallmentAmount — Fast computation of fixed installment amount (PMT)
 * 2. generateAmortizationSchedule — Full schedule with interest/principal breakdown,
 *    calendar day clamping (no overflow to next month), exact principal reconciliation,
 *    and guaranteed zero final balance.
 */

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
  const totalMonths = (parsedStart.month - 1) + (i * intervalMonths);
  const targetYear = parsedStart.year + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12 + 1; // 1..12

  // Get max days in target month (day 0 of targetMonth gives last day of previous 0-indexed month)
  const daysInMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const targetDay = Math.min(parsedStart.day, daysInMonth);

  const yStr = String(targetYear).padStart(4, '0');
  const mStr = String(targetMonth).padStart(2, '0');
  const dStr = String(targetDay).padStart(2, '0');
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

    if (k === n) {
      // Last installment reconciles remaining principal to guarantee exact zero balance
      const interestPortion = r > 0 ? Math.round(remainingBalance * r) : 0;
      const principalPortion = remainingBalance;
      const totalAmount = principalPortion + interestPortion;
      remainingBalance = 0;

      schedule.push({
        installmentNumber,
        dueDateIso,
        principalPortion,
        interestPortion,
        totalAmount,
        remainingBalanceAfter: 0,
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
        installmentNumber,
        dueDateIso,
        principalPortion,
        interestPortion,
        totalAmount,
        remainingBalanceAfter: remainingBalance,
      });
    }
  }

  return schedule;
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
export function generateAmortizationSchedule({
  principal,
  annualRatePct = 0,
  installmentCount,
  startDateIso,
  intervalMonths = 1,
}) {
  return recalculateFromBalance({
    anchorBalance: principal,
    anchorInstallmentNumber: 0,
    remainingCount: installmentCount,
    annualRatePct,
    intervalMonths,
    startDateIso,
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
 * @returns {Array<{
 *   installmentNumber: number,
 *   dueDateIso: string,
 *   principalPortion: number,
 *   interestPortion: number,
 *   totalAmount: number,
 *   remainingBalanceAfter: number
 * }>}
 */
export function calculatePayoffScheduleFixedAmount({
  remainingBalance,
  fixedInstallmentAmount,
  annualRatePct = 0,
  intervalMonths = 1,
  startDateIso,
  anchorInstallmentNumber = 0,
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
      installmentNumber,
      dueDateIso,
      principalPortion,
      interestPortion,
      totalAmount,
      remainingBalanceAfter,
    });
  }

  return schedule;
}


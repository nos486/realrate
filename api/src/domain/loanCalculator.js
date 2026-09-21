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
export function generateAmortizationSchedule({
  principal,
  annualRatePct = 0,
  installmentCount,
  startDateIso,
  intervalMonths = 1,
}) {
  const p = Number(principal) || 0;
  const n = parseInt(installmentCount, 10) || 0;
  const rate = Number(annualRatePct) || 0;
  const interval = parseInt(intervalMonths, 10) || 1;

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

  for (let i = 1; i <= n; i++) {
    const dueDateIso = computeClampedDueDate(parsedStart, i, interval);

    if (i === n) {
      // Last installment reconciles remaining principal to guarantee exact zero balance
      const interestPortion = r > 0 ? Math.round(remainingBalance * r) : 0;
      const principalPortion = remainingBalance;
      const totalAmount = principalPortion + interestPortion;
      remainingBalance = 0;

      schedule.push({
        installmentNumber: i,
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
        installmentNumber: i,
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

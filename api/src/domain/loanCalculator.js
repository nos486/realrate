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


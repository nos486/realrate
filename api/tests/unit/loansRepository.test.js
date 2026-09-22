import { describe, it, expect, beforeEach } from 'vitest';
import {
  dbCreateLoan,
  dbGetUserLoans,
  dbGetLoanById,
  dbUpdateLoan,
  dbDeleteLoan,
  dbMarkInstallmentPaid,
  dbMarkInstallmentPaidCascade,
  dbUnmarkInstallmentPaid,
  dbSetInstallmentAmount,
  dbAddExtraPayment,
  dbGetLoanExtraPayments,
} from '../../src/repositories/loans.repository.js';

function createMockD1() {
  const loansStore = new Map();
  const installmentsStore = new Map();
  const extraPaymentsStore = new Map();

  function makeStatement(query) {
    const q = query.trim();
    let boundArgs = [];

    const stmt = {
      bind(...args) {
        boundArgs = args;
        return stmt;
      },
      async run() {
        if (q.startsWith('CREATE') || q.startsWith('DROP') || q.startsWith('ALTER')) {
          return { success: true };
        }
        if (q.startsWith('INSERT INTO loans')) {
          const [
            id, user_id, title, lender_name, principal_amount,
            annual_interest_rate, installment_count, interval_months,
            start_date, annual_fee_amount, notes, created_at, updated_at
          ] = boundArgs;
          loansStore.set(id, {
            id, user_id, title, lender_name, principal_amount,
            annual_interest_rate, installment_count, interval_months,
            start_date, annual_fee_amount: annual_fee_amount || 0, notes, created_at, updated_at
          });
          return { meta: { changes: 1 } };
        }
        if (q.startsWith('INSERT INTO loan_installment_states') || q.startsWith('INSERT INTO loan_installments')) {
          if (boundArgs.length === 15) {
            const [
              id, loan_id, user_id, installment_number, due_date,
              principal_portion, interest_portion, total_amount,
              remaining_balance_after, is_paid, paid_date, paid_amount,
              is_manual_override, created_at, updated_at
            ] = boundArgs;
            installmentsStore.set(id, {
              id, loan_id, user_id, installment_number, due_date,
              principal_portion, interest_portion, total_amount,
              remaining_balance_after, is_paid, paid_date, paid_amount,
              is_manual_override: is_manual_override || 0,
              created_at, updated_at,
            });
          } else if (boundArgs.length === 13) {
            const [
              id, loan_id, user_id, installment_number, due_date,
              principal_portion, interest_portion, total_amount,
              remaining_balance_after, paid_date, paid_amount,
              created_at, updated_at
            ] = boundArgs;
            installmentsStore.set(id, {
              id, loan_id, user_id, installment_number, due_date,
              principal_portion, interest_portion, total_amount,
              remaining_balance_after, is_paid: 1, paid_date, paid_amount,
              is_manual_override: 0,
              created_at, updated_at,
            });
          } else if (boundArgs.length === 10) {
            const [
              id, loan_id, user_id, due_date,
              principal_portion, interest_portion, total_amount,
              remaining_balance_after, created_at, updated_at
            ] = boundArgs;
            installmentsStore.set(id, {
              id, loan_id, user_id, installment_number: 1, due_date,
              principal_portion, interest_portion, total_amount,
              remaining_balance_after, is_paid: 0, paid_date: '', paid_amount: 0,
              is_manual_override: 1,
              created_at, updated_at,
            });
          } else if (boundArgs.length === 11) {
            const [
              id, loan_id, user_id, installment_number, due_date,
              principal_portion, interest_portion, total_amount,
              remaining_balance_after, created_at, updated_at
            ] = boundArgs;
            installmentsStore.set(id, {
              id, loan_id, user_id, installment_number, due_date,
              principal_portion, interest_portion, total_amount,
              remaining_balance_after, is_paid: 0, paid_date: '', paid_amount: 0,
              is_manual_override: 1,
              created_at, updated_at,
            });
          }
          return { meta: { changes: 1 } };
        }
        if (q.startsWith('INSERT INTO loan_extra_payments')) {
          if (boundArgs.length >= 10) {
            const [
              id, loan_id, user_id, amount, payment_date,
              reduction_mode, notes, anchor_installment_number,
              resulting_balance, resulting_installment_count,
              created_at
            ] = boundArgs;
            extraPaymentsStore.set(id, {
              id, loan_id, user_id, amount, payment_date,
              reduction_mode, notes,
              anchor_installment_number: anchor_installment_number || 0,
              resulting_balance: resulting_balance || 0,
              resulting_installment_count: resulting_installment_count || null,
              created_at: created_at || new Date().toISOString(),
            });
          } else {
            const [
              id, loan_id, user_id, amount, payment_date,
              reduction_mode, notes, created_at
            ] = boundArgs;
            extraPaymentsStore.set(id, {
              id, loan_id, user_id, amount, payment_date,
              reduction_mode, notes,
              anchor_installment_number: 0,
              resulting_balance: 0,
              resulting_installment_count: null,
              created_at
            });
          }
          return { meta: { changes: 1 } };
        }
        if (q.includes('UPDATE loans SET installment_count = ?')) {
          const [newCount, updatedAt, loanId, userId] = boundArgs;
          const existing = loansStore.get(loanId);
          if (existing && existing.user_id === userId) {
            loansStore.set(loanId, {
              ...existing,
              installment_count: newCount,
              updated_at: updatedAt,
            });
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        }
        if (q.startsWith('UPDATE loans')) {
          const [
            newTitle, newLender, newPrincipal, newRate,
            newCount, newInterval, newStartDate, newAnnualFeeAmount, newNotes,
            nowIso, loanId, userId
          ] = boundArgs;
          const existing = loansStore.get(loanId);
          if (existing && existing.user_id === userId) {
            loansStore.set(loanId, {
              ...existing,
              title: newTitle,
              lender_name: newLender,
              principal_amount: newPrincipal,
              annual_interest_rate: newRate,
              installment_count: newCount,
              interval_months: newInterval,
              start_date: newStartDate,
              annual_fee_amount: newAnnualFeeAmount || 0,
              notes: newNotes,
              updated_at: nowIso,
            });
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        }
        if ((q.includes('DELETE FROM loan_installment_states') || q.includes('DELETE FROM loan_installments')) && q.includes('is_paid = 0')) {
          const [loanId, userId] = boundArgs;
          for (const [id, inst] of installmentsStore.entries()) {
            if (inst.loan_id === loanId && inst.user_id === userId && (inst.is_paid === 0 || !inst.is_paid)) {
              installmentsStore.delete(id);
            }
          }
          return { meta: { changes: 1 } };
        }
        if ((q.includes('DELETE FROM loan_installment_states') || q.includes('DELETE FROM loan_installments')) && q.includes('WHERE id = ? AND user_id = ?')) {
          const [id, userId] = boundArgs;
          const existing = installmentsStore.get(id);
          if (existing && existing.user_id === userId) {
            installmentsStore.delete(id);
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        }
        if ((q.includes('DELETE FROM loan_installment_states') || q.includes('DELETE FROM loan_installments')) && q.includes('WHERE loan_id = ? AND user_id = ?')) {
          const [loanId, userId] = boundArgs;
          for (const [id, inst] of installmentsStore.entries()) {
            if (inst.loan_id === loanId && inst.user_id === userId) {
              installmentsStore.delete(id);
            }
          }
          return { meta: { changes: 1 } };
        }
        if (q.includes('DELETE FROM loan_extra_payments') && q.includes('WHERE loan_id = ? AND user_id = ?')) {
          const [loanId, userId] = boundArgs;
          for (const [id, ep] of extraPaymentsStore.entries()) {
            if (ep.loan_id === loanId && ep.user_id === userId) {
              extraPaymentsStore.delete(id);
            }
          }
          return { meta: { changes: 1 } };
        }
        if (q.startsWith('DELETE FROM loans')) {
          const [loanId, userId] = boundArgs;
          const existing = loansStore.get(loanId);
          if (existing && existing.user_id === userId) {
            loansStore.delete(loanId);
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        }
        if ((q.startsWith('UPDATE loan_installment_states') || q.startsWith('UPDATE loan_installments')) && q.includes('is_manual_override = 1')) {
          let principalPortion, interestPortion, totalAmount, remainingBalanceAfter, nowIso, installmentId, loanId, userId;
          if (boundArgs.length === 8) {
            [principalPortion, interestPortion, totalAmount, remainingBalanceAfter, nowIso, installmentId, loanId, userId] = boundArgs;
          } else {
            [principalPortion, interestPortion, totalAmount, remainingBalanceAfter, nowIso, installmentId, userId] = boundArgs;
          }
          const existing = installmentsStore.get(installmentId);
          if (existing && existing.user_id === userId && (!loanId || existing.loan_id === loanId)) {
            installmentsStore.set(installmentId, {
              ...existing,
              principal_portion: principalPortion,
              interest_portion: interestPortion,
              total_amount: totalAmount,
              remaining_balance_after: remainingBalanceAfter,
              is_manual_override: 1,
              updated_at: nowIso,
            });
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        }
        if ((q.startsWith('UPDATE loan_installment_states') || q.startsWith('UPDATE loan_installments')) && q.includes('is_paid = 1')) {
          let paidDate, paidAmount, updatedAt, installmentId, loanId, userId;
          if (boundArgs.length === 6) {
            [paidDate, paidAmount, updatedAt, installmentId, loanId, userId] = boundArgs;
          } else {
            [paidDate, paidAmount, updatedAt, installmentId, userId] = boundArgs;
          }
          const existing = installmentsStore.get(installmentId);
          if (existing && existing.user_id === userId && (!loanId || existing.loan_id === loanId)) {
            installmentsStore.set(installmentId, {
              ...existing,
              is_paid: 1,
              paid_date: paidDate,
              paid_amount: paidAmount,
              updated_at: updatedAt,
            });
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        }
        if ((q.startsWith('UPDATE loan_installment_states') || q.startsWith('UPDATE loan_installments')) && q.includes('is_paid = 0')) {
          const [updatedAt, installmentId, userId] = boundArgs;
          const existing = installmentsStore.get(installmentId);
          if (existing && existing.user_id === userId) {
            installmentsStore.set(installmentId, {
              ...existing,
              is_paid: 0,
              paid_date: '',
              paid_amount: 0,
              updated_at: updatedAt,
            });
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        }
        return { meta: { changes: 0 } };
      },
      async first() {
        if (q.includes('FROM loans') && q.includes('WHERE id = ? AND user_id = ?')) {
          const [loanId, userId] = boundArgs;
          const loan = loansStore.get(loanId);
          if (loan && loan.user_id === userId) return loan;
          return null;
        }
        if ((q.includes('FROM loan_installment_states') || q.includes('FROM loan_installments')) && q.includes('WHERE loan_id = ? AND user_id = ? AND installment_number = ?')) {
          const [loanId, userId, instNum] = boundArgs;
          for (const inst of installmentsStore.values()) {
            if (inst.loan_id === loanId && inst.user_id === userId && inst.installment_number === Number(instNum)) {
              return inst;
            }
          }
          return null;
        }
        if ((q.includes('FROM loan_installment_states') || q.includes('FROM loan_installments')) && q.includes('(id = ? OR installment_number = ?) AND user_id = ?')) {
          const [installmentId, instNum, userId] = boundArgs;
          for (const inst of installmentsStore.values()) {
            if (inst.user_id === userId && (inst.id === installmentId || inst.installment_number === Number(instNum))) {
              return inst;
            }
          }
          return null;
        }
        if ((q.includes('FROM loan_installment_states') || q.includes('FROM loan_installments')) && q.includes('WHERE id = ? AND loan_id = ? AND user_id = ?')) {
          const [installmentId, loanId, userId] = boundArgs;
          const inst = installmentsStore.get(installmentId);
          if (inst && inst.loan_id === loanId && inst.user_id === userId) return inst;
          return null;
        }
        if ((q.includes('FROM loan_installment_states') || q.includes('FROM loan_installments')) && q.includes('WHERE id = ? AND user_id = ?')) {
          const [installmentId, userId] = boundArgs;
          const inst = installmentsStore.get(installmentId);
          if (inst && inst.user_id === userId) return inst;
          return null;
        }
        return null;
      },
      async all() {
        if (q.includes('FROM loans') && q.includes('WHERE user_id = ?')) {
          const [userId] = boundArgs;
          const results = [];
          for (const loan of loansStore.values()) {
            if (loan.user_id === userId) {
              results.push(loan);
            }
          }
          return { results };
        }
        if ((q.includes('FROM loan_installment_states') || q.includes('FROM loan_installments')) && q.includes('WHERE user_id = ?')) {
          const [userId] = boundArgs;
          const results = [];
          for (const inst of installmentsStore.values()) {
            if (inst.user_id === userId) {
              results.push(inst);
            }
          }
          results.sort((a, b) => a.installment_number - b.installment_number);
          return { results };
        }
        if ((q.includes('FROM loan_installment_states') || q.includes('FROM loan_installments')) && q.includes('WHERE loan_id = ? AND user_id = ?')) {
          const [loanId, userId] = boundArgs;
          const results = [];
          for (const inst of installmentsStore.values()) {
            if (inst.loan_id === loanId && inst.user_id === userId) {
              results.push(inst);
            }
          }
          results.sort((a, b) => a.installment_number - b.installment_number);
          return { results };
        }
        if (q.includes('FROM loan_extra_payments') && q.includes('WHERE loan_id = ? AND user_id = ?')) {
          const [loanId, userId] = boundArgs;
          const results = [];
          for (const ep of extraPaymentsStore.values()) {
            if (ep.loan_id === loanId && ep.user_id === userId) {
              results.push(ep);
            }
          }
          results.sort((a, b) => (b.payment_date || '').localeCompare(a.payment_date || '') || (b.created_at || '').localeCompare(a.created_at || ''));
          return { results };
        }
        if (q.includes('FROM loan_extra_payments') && q.includes('WHERE user_id = ?')) {
          const [userId] = boundArgs;
          const results = [];
          for (const ep of extraPaymentsStore.values()) {
            if (ep.user_id === userId) {
              results.push(ep);
            }
          }
          return { results };
        }
        return { results: [] };
      }
    };
    return stmt;
  }

  return {
    _loansStore: loansStore,
    _installmentsStore: installmentsStore,
    _extraPaymentsStore: extraPaymentsStore,
    prepare(q) {
      return makeStatement(q);
    },
    async batch(statements) {
      const results = [];
      for (const stmt of statements) {
        results.push(await stmt.run());
      }
      return results;
    }
  };
}

describe('Loans Repository D1 Operations', () => {
  let mockEnv;

  beforeEach(() => {
    mockEnv = { DB: createMockD1() };
  });

  it('creates a loan without inserting any installment rows into loan_installment_states', async () => {
    const loan = await dbCreateLoan(mockEnv, 'user_1', {
      title: 'وام مسکن',
      lenderName: 'بانک مسکن',
      principalAmount: 12000000,
      annualInterestRate: 0,
      installmentCount: 12,
      startDate: '2026-01-31',
    });

    expect(loan).toBeDefined();
    expect(loan.id).toMatch(/^loan_/);
    expect(loan.title).toBe('وام مسکن');
    expect(loan.principalAmount).toBe(12000000);
    expect(loan.installments).toHaveLength(12);

    // D1 storage check: exactly 1 row in loans, 0 rows in loan_installment_states
    expect(mockEnv.DB._loansStore.size).toBe(1);
    expect(mockEnv.DB._installmentsStore.size).toBe(0);

    // Verify day clamping on installment dates (Jalali calendar: start 2026-01-31 = 1404-11-11)
    expect(loan.installments[0].dueDate).toBe('2026-03-02'); // Jalali 1404-12-11
    expect(loan.installments[1].dueDate).toBe('2026-03-31'); // Jalali 1405-01-11

    // Retrieve by ID
    const fetched = await dbGetLoanById(mockEnv, 'user_1', loan.id);
    expect(fetched).toBeDefined();
    expect(fetched.title).toBe('وام مسکن');
    expect(fetched.installments).toHaveLength(12);
  });

  it('creates a loan with customFirstInstallmentAmount and inserts only 1 override row into loan_installment_states', async () => {
    const loan = await dbCreateLoan(mockEnv, 'user_1', {
      title: 'وام خرید کالا با قسط اول متفاوت',
      principalAmount: 10000000,
      annualInterestRate: 0,
      installmentCount: 5,
      startDate: '2026-01-01',
      customFirstInstallmentAmount: 4000000,
    });

    expect(loan).toBeDefined();
    expect(mockEnv.DB._loansStore.size).toBe(1);
    // Exactly 1 override state row inserted
    expect(mockEnv.DB._installmentsStore.size).toBe(1);

    const storedOverride = Array.from(mockEnv.DB._installmentsStore.values())[0];
    expect(storedOverride.installment_number).toBe(1);
    expect(storedOverride.is_manual_override).toBe(1);
    expect(storedOverride.is_paid).toBe(0);
    expect(storedOverride.total_amount).toBe(4000000);

    // Generated schedule reflects custom first installment + remaining 4 re-amortized
    expect(loan.installments).toHaveLength(5);
    expect(loan.installments[0].totalAmount).toBe(4000000);
    expect(loan.installments[0].isManualOverride).toBe(true);
    expect(loan.installments[1].totalAmount).toBe(1500000);
  });

  it('retrieves user loans with accurate aggregate counts and next due installment (No N+1)', async () => {
    const loan = await dbCreateLoan(mockEnv, 'user_1', {
      title: 'وام خودرو',
      principalAmount: 30000000,
      annualInterestRate: 0,
      installmentCount: 3,
      startDate: '2026-04-10',
    });

    // Mark first installment as paid
    const firstInst = loan.installments[0];
    await dbMarkInstallmentPaid(mockEnv, 'user_1', firstInst.id, {
      paidDate: '2026-05-10',
      paidAmount: 10000000,
    });

    const loansList = await dbGetUserLoans(mockEnv, 'user_1');
    expect(loansList).toHaveLength(1);

    const item = loansList[0];
    expect(item.id).toBe(loan.id);
    expect(item.totalCount).toBe(3);
    expect(item.paidCount).toBe(1);
    expect(item.remainingBalance).toBe(20000000); // 2 remaining installments of 10M each

    // Next due should be installment 2
    expect(item.nextDueInstallment).toBeDefined();
    expect(item.nextDueInstallment.installmentNumber).toBe(2);
  });

  it('marks and unmarks an installment as paid: deletes simple payment row, preserves override row on unmark', async () => {
    const loan = await dbCreateLoan(mockEnv, 'user_1', {
      title: 'وام تحصیلی',
      principalAmount: 5000000,
      annualInterestRate: 0,
      installmentCount: 5,
      startDate: '2026-01-01',
    });

    expect(mockEnv.DB._installmentsStore.size).toBe(0);

    // 1. Mark installment 1 as paid -> inserts 1 row in loan_installment_states
    const inst1 = loan.installments[0];
    const paid = await dbMarkInstallmentPaid(mockEnv, 'user_1', inst1.id, {
      paidDate: '2026-02-01',
      paidAmount: 1000000,
    });

    expect(paid).toBeDefined();
    expect(paid.isPaid).toBe(true);
    expect(paid.paidDate).toBe('2026-02-01');
    expect(paid.paidAmount).toBe(1000000);
    expect(mockEnv.DB._installmentsStore.size).toBe(1);

    // 2. Unmark installment 1 (no override) -> DELETES row from DB
    const unpaid = await dbUnmarkInstallmentPaid(mockEnv, 'user_1', inst1.id);
    expect(unpaid).toBeDefined();
    expect(unpaid.isPaid).toBe(false);
    expect(unpaid.paidDate).toBe('');
    expect(unpaid.paidAmount).toBe(0);
    expect(mockEnv.DB._installmentsStore.size).toBe(0);

    // 3. Set manual override on installment 2 -> inserts 1 override row
    const inst2 = loan.installments[1];
    await dbSetInstallmentAmount(mockEnv, 'user_1', loan.id, inst2.id, 2000000);
    expect(mockEnv.DB._installmentsStore.size).toBe(1);
    const overrideBefore = Array.from(mockEnv.DB._installmentsStore.values())[0];
    expect(overrideBefore.is_manual_override).toBe(1);
    expect(overrideBefore.is_paid).toBe(0);

    // 4. Mark overridden installment 2 as paid -> updates existing row
    const paidOverride = await dbMarkInstallmentPaid(mockEnv, 'user_1', inst2.id, {
      paidDate: '2026-03-01',
      paidAmount: 2000000,
    });
    expect(paidOverride.isPaid).toBe(true);
    expect(mockEnv.DB._installmentsStore.size).toBe(1);

    // 5. Unmark overridden installment 2 -> DOES NOT DELETE row, resets is_paid=0 and keeps override
    const unmarkOverride = await dbUnmarkInstallmentPaid(mockEnv, 'user_1', inst2.id);
    expect(unmarkOverride.isPaid).toBe(false);
    expect(unmarkOverride.isManualOverride).toBe(true);
    expect(mockEnv.DB._installmentsStore.size).toBe(1);
    const overrideAfter = Array.from(mockEnv.DB._installmentsStore.values())[0];
    expect(overrideAfter.is_manual_override).toBe(1);
    expect(overrideAfter.is_paid).toBe(0);
  });

  it('CRITICAL: updates loan financial params and rebuilds ONLY pending installments while paid installments remain untouched', async () => {
    // 1. Create a loan with 4 installments of 1,000,000 each (principal = 4,000,000, 0% interest)
    const loan = await dbCreateLoan(mockEnv, 'user_1', {
      title: 'وام آزمایش تغییر اقساط',
      principalAmount: 4000000,
      annualInterestRate: 0,
      installmentCount: 4,
      startDate: '2026-01-01',
    });

    // 2. Mark installment 1 and installment 2 as PAID
    const inst1 = loan.installments[0];
    const inst2 = loan.installments[1];
    await dbMarkInstallmentPaid(mockEnv, 'user_1', inst1.id, {
      paidDate: '2026-02-01',
      paidAmount: 1000000,
    });
    await dbMarkInstallmentPaid(mockEnv, 'user_1', inst2.id, {
      paidDate: '2026-03-01',
      paidAmount: 1000000,
    });

    // Total principal already paid = 2,000,000
    // 3. User updates loan: new principal = 8,000,000 and total installmentCount = 5
    // Remaining principal to amortize = 8,000,000 - 2,000,000 = 6,000,000
    // Remaining installments = 5 - 2 = 3 installments (installments 3, 4, 5)
    const updated = await dbUpdateLoan(mockEnv, 'user_1', loan.id, {
      principalAmount: 8000000,
      installmentCount: 5,
    });

    expect(updated).toBeDefined();
    expect(updated.principalAmount).toBe(8000000);
    expect(updated.installmentCount).toBe(5);
    expect(updated.installments).toHaveLength(5);

    // Paid installments MUST REMAIN UNTOUCHED
    expect(updated.installments[0].id).toBe(inst1.id);
    expect(updated.installments[0].isPaid).toBe(true);
    expect(updated.installments[0].paidDate).toBe('2026-02-01');
    expect(updated.installments[0].principalPortion).toBe(1000000);

    expect(updated.installments[1].id).toBe(inst2.id);
    expect(updated.installments[1].isPaid).toBe(true);
    expect(updated.installments[1].paidDate).toBe('2026-03-01');
    expect(updated.installments[1].principalPortion).toBe(1000000);

    // Pending installments (3, 4, 5) must be rebuilt to amortize remaining 6,000,000
    expect(updated.installments[2].installmentNumber).toBe(3);
    expect(updated.installments[2].isPaid).toBe(false);

    expect(updated.installments[3].installmentNumber).toBe(4);
    expect(updated.installments[3].isPaid).toBe(false);

    expect(updated.installments[4].installmentNumber).toBe(5);
    expect(updated.installments[4].isPaid).toBe(false);
    expect(updated.installments[4].remainingBalanceAfter).toBe(0);

    // Total principal of all 5 installments must equal exactly 8,000,000
    const totalPrincipal = updated.installments.reduce(
      (sum, item) => sum + item.principalPortion,
      0
    );
    expect(totalPrincipal).toBe(8000000);
  });

  it('deletes a loan and cascades deletion to all installments', async () => {
    const loan = await dbCreateLoan(mockEnv, 'user_1', {
      title: 'وام برای حذف',
      principalAmount: 1000000,
      installmentCount: 2,
      startDate: '2026-01-01',
    });

    const deleted = await dbDeleteLoan(mockEnv, 'user_1', loan.id);
    expect(deleted).toBe(true);

    const fetched = await dbGetLoanById(mockEnv, 'user_1', loan.id);
    const list = await dbGetUserLoans(mockEnv, 'user_1');
    expect(list).toHaveLength(0);
  });

  it('E2E Full Lifecycle Scenario: 100,000,000 Tomans, 18%, 12 installments, pay 2, update rate, verify summary & paid persistence, cascade delete', async () => {
    // 1. Create loan (100,000,000, 18%, 12 installments)
    const loan = await dbCreateLoan(mockEnv, 'user_1', {
      title: 'وام خرید کالا تستی',
      lenderName: 'بانک ملی',
      principalAmount: 100000000,
      annualInterestRate: 18,
      installmentCount: 12,
      intervalMonths: 1,
      startDate: '2026-01-01',
    });

    expect(loan.id).toBeDefined();
    expect(loan.installments).toHaveLength(12);

    // Verify schedule: sum of principalPortion === 100,000,000, final remaining balance === 0
    const sumPrincipal = loan.installments.reduce((sum, inst) => sum + inst.principalPortion, 0);
    expect(sumPrincipal).toBe(100000000);
    expect(loan.installments[11].remainingBalanceAfter).toBe(0);

    // Verify summary via dbGetUserLoans
    let userLoans = await dbGetUserLoans(mockEnv, 'user_1');
    expect(userLoans).toHaveLength(1);
    expect(userLoans[0].paidCount).toBe(0);
    expect(userLoans[0].totalCount).toBe(12);
    expect(userLoans[0].remainingBalance).toBeGreaterThan(100000000); // principal + interest

    // 2. Mark first two installments as paid
    const inst1 = loan.installments[0];
    const inst2 = loan.installments[1];
    await dbMarkInstallmentPaid(mockEnv, 'user_1', inst1.id, {
      paidDate: '2026-02-01',
      paidAmount: inst1.totalAmount,
    });
    await dbMarkInstallmentPaid(mockEnv, 'user_1', inst2.id, {
      paidDate: '2026-03-01',
      paidAmount: inst2.totalAmount,
    });

    // 3. Verify updated summary (paidCount = 2, remaining balance reduced)
    userLoans = await dbGetUserLoans(mockEnv, 'user_1');
    expect(userLoans[0].paidCount).toBe(2);
    expect(userLoans[0].remainingBalance).toBe(
      loan.installments.slice(2).reduce((sum, inst) => sum + inst.totalAmount, 0)
    );

    // 4. Edit loan: change interest rate from 18% to 23%
    const updated = await dbUpdateLoan(mockEnv, 'user_1', loan.id, {
      annualInterestRate: 23,
    });
    expect(updated.annualInterestRate).toBe(23);
    expect(updated.installments).toHaveLength(12);

    // The first 2 paid installments MUST BE UNTOUCHED
    expect(updated.installments[0].id).toBe(inst1.id);
    expect(updated.installments[0].isPaid).toBe(true);
    expect(updated.installments[0].paidDate).toBe('2026-02-01');
    expect(updated.installments[0].principalPortion).toBe(inst1.principalPortion);
    expect(updated.installments[0].interestPortion).toBe(inst1.interestPortion);

    expect(updated.installments[1].id).toBe(inst2.id);
    expect(updated.installments[1].isPaid).toBe(true);
    expect(updated.installments[1].paidDate).toBe('2026-03-01');
    expect(updated.installments[1].principalPortion).toBe(inst2.principalPortion);
    expect(updated.installments[1].interestPortion).toBe(inst2.interestPortion);

    // Installments 3-12 are recalculated with new rate (23%) and amortize remaining principal
    const totalPrincipalAfterUpdate = updated.installments.reduce(
      (sum, inst) => sum + inst.principalPortion,
      0
    );
    expect(totalPrincipalAfterUpdate).toBe(100000000);
    expect(updated.installments[11].remainingBalanceAfter).toBe(0);

    // Installment 3 interest portion with 23% rate should be higher than it was at 18%
    expect(updated.installments[2].interestPortion).toBeGreaterThan(loan.installments[2].interestPortion);

    // 5. Delete loan and verify cascade
    const deleteResult = await dbDeleteLoan(mockEnv, 'user_1', loan.id);
    expect(deleteResult).toBe(true);

    const loanAfterDelete = await dbGetLoanById(mockEnv, 'user_1', loan.id);
    expect(loanAfterDelete).toBeNull();

    const loansListAfterDelete = await dbGetUserLoans(mockEnv, 'user_1');
    expect(loansListAfterDelete).toHaveLength(0);
  });

  describe('dbUpdateLoan guard rails against paid-history-contradicting edits', () => {
    async function createAndPayTwo() {
      const loan = await dbCreateLoan(mockEnv, 'user_1', {
        title: 'وام آزمایش گارد ادیت',
        principalAmount: 4000000,
        annualInterestRate: 0,
        installmentCount: 4,
        startDate: '2026-01-01',
      });
      await dbMarkInstallmentPaid(mockEnv, 'user_1', loan.installments[0].id, {
        paidDate: '2026-02-01',
        paidAmount: 1000000,
      });
      await dbMarkInstallmentPaid(mockEnv, 'user_1', loan.installments[1].id, {
        paidDate: '2026-03-01',
        paidAmount: 1000000,
      });
      return loan;
    }

    it('rejects reducing installmentCount below the number of already-paid installments', async () => {
      const loan = await createAndPayTwo();
      await expect(
        dbUpdateLoan(mockEnv, 'user_1', loan.id, { installmentCount: 1 })
      ).rejects.toThrow(/تعداد اقساط جدید/);

      // Loan must remain unchanged after the rejected edit
      const unchanged = await dbGetLoanById(mockEnv, 'user_1', loan.id);
      expect(unchanged.installmentCount).toBe(4);
    });

    it('rejects reducing principalAmount below the principal already paid', async () => {
      const loan = await createAndPayTwo();
      // 2,000,000 of principal already paid (2 installments x 1,000,000)
      await expect(
        dbUpdateLoan(mockEnv, 'user_1', loan.id, { principalAmount: 1500000 })
      ).rejects.toThrow(/مبلغ اصل وام جدید/);

      const unchanged = await dbGetLoanById(mockEnv, 'user_1', loan.id);
      expect(unchanged.principalAmount).toBe(4000000);
    });

    it('rejects changing startDate once at least one installment has been paid', async () => {
      const loan = await createAndPayTwo();
      await expect(
        dbUpdateLoan(mockEnv, 'user_1', loan.id, { startDate: '2026-06-01' })
      ).rejects.toThrow(/تاریخ شروع وام/);

      const unchanged = await dbGetLoanById(mockEnv, 'user_1', loan.id);
      expect(unchanged.startDate).toBe('2026-01-01');
    });

    it('still allows increasing principalAmount/installmentCount after paid installments (regression)', async () => {
      const loan = await createAndPayTwo();
      const updated = await dbUpdateLoan(mockEnv, 'user_1', loan.id, {
        principalAmount: 8000000,
        installmentCount: 5,
      });
      expect(updated.principalAmount).toBe(8000000);
      expect(updated.installmentCount).toBe(5);
    });

    it('allows any edit (including startDate) before any installment has been paid', async () => {
      const loan = await dbCreateLoan(mockEnv, 'user_1', {
        title: 'وام بدون پرداخت',
        principalAmount: 4000000,
        installmentCount: 4,
        startDate: '2026-01-01',
      });
      const updated = await dbUpdateLoan(mockEnv, 'user_1', loan.id, {
        principalAmount: 1000000,
        installmentCount: 1,
        startDate: '2026-06-01',
      });
      expect(updated.principalAmount).toBe(1000000);
      expect(updated.installmentCount).toBe(1);
      expect(updated.startDate).toBe('2026-06-01');
    });
  });

  describe('annualFeeAmount (کارمزد سالانه) persistence', () => {
    it('persists annualFeeAmount on create and reflects it in the computed schedule', async () => {
      const loan = await dbCreateLoan(mockEnv, 'user_1', {
        title: 'وام با کارمزد سالانه',
        principalAmount: 12000000,
        annualInterestRate: 0,
        installmentCount: 12,
        startDate: '2026-01-01',
        annualFeeAmount: 500000,
      });

      expect(loan.annualFeeAmount).toBe(500000);
      expect(loan.installments[11].feePortion).toBe(500000);
      expect(loan.installments[11].totalAmount).toBe(loan.installments[10].totalAmount + 500000);
    });

    it('defaults annualFeeAmount to 0 when not provided (backward compatible)', async () => {
      const loan = await dbCreateLoan(mockEnv, 'user_1', {
        title: 'وام بدون کارمزد',
        principalAmount: 12000000,
        installmentCount: 12,
        startDate: '2026-01-01',
      });
      expect(loan.annualFeeAmount).toBe(0);
      expect(loan.installments.every((i) => !i.feePortion)).toBe(true);
    });

    it('updates annualFeeAmount via dbUpdateLoan without requiring other financial params to change', async () => {
      const loan = await dbCreateLoan(mockEnv, 'user_1', {
        title: 'وام برای ویرایش کارمزد',
        principalAmount: 12000000,
        installmentCount: 12,
        startDate: '2026-01-01',
      });
      const updated = await dbUpdateLoan(mockEnv, 'user_1', loan.id, {
        annualFeeAmount: 300000,
      });
      expect(updated.annualFeeAmount).toBe(300000);
      expect(updated.installments[11].feePortion).toBe(300000);
    });
  });

  describe('dbCreateLoan with bulk customInstallments (سفارشی‌سازی تک‌تک اقساط)', () => {
    it('applies custom amounts only to the specified installments, keeping the sparse storage model', async () => {
      const loan = await dbCreateLoan(mockEnv, 'user_1', {
        title: 'وام با اقساط سفارشی',
        principalAmount: 12000000,
        annualInterestRate: 0,
        installmentCount: 12,
        startDate: '2026-01-01',
        customInstallments: [
          { installmentNumber: 1, totalAmount: 2000000 },
          { installmentNumber: 6, totalAmount: 500000 },
        ],
      });

      expect(loan.installments).toHaveLength(12);
      expect(loan.installments[0].totalAmount).toBe(2000000);
      expect(loan.installments[0].isManualOverride).toBe(true);
      expect(loan.installments[5].totalAmount).toBe(500000);
      expect(loan.installments[5].isManualOverride).toBe(true);

      // Only the 2 customized installments should have persisted state rows (sparse model)
      expect(mockEnv.DB._installmentsStore.size).toBe(2);

      // Total principal across the whole schedule must still equal the loan principal exactly
      const sumPrincipal = loan.installments.reduce((sum, i) => sum + i.principalPortion, 0);
      expect(sumPrincipal).toBe(12000000);
      expect(loan.installments[11].remainingBalanceAfter).toBe(0);
    });

    it('composes multiple custom installments in ascending order (each reflows off the previous)', async () => {
      const loan = await dbCreateLoan(mockEnv, 'user_1', {
        title: 'وام با چند قسط سفارشی',
        principalAmount: 10000000,
        annualInterestRate: 0,
        installmentCount: 5,
        startDate: '2026-01-01',
        // Passed out of order on purpose — dbCreateLoan must sort ascending before applying.
        customInstallments: [
          { installmentNumber: 3, totalAmount: 4000000 },
          { installmentNumber: 1, totalAmount: 1000000 },
        ],
      });

      expect(loan.installments[0].totalAmount).toBe(1000000);
      expect(loan.installments[2].totalAmount).toBe(4000000);
      const sumPrincipal = loan.installments.reduce((sum, i) => sum + i.principalPortion, 0);
      expect(sumPrincipal).toBe(10000000);
      expect(loan.installments[4].remainingBalanceAfter).toBe(0);
    });

    it('customInstallments for installment #1 supersedes customFirstInstallmentAmount when both are given', async () => {
      const loan = await dbCreateLoan(mockEnv, 'user_1', {
        title: 'وام تداخل قسط اول',
        principalAmount: 6000000,
        installmentCount: 3,
        startDate: '2026-01-01',
        customFirstInstallmentAmount: 999999,
        customInstallments: [{ installmentNumber: 1, totalAmount: 3000000 }],
      });
      expect(loan.installments[0].totalAmount).toBe(3000000);
      // Only 1 override row should exist, not 2 competing ones
      expect(mockEnv.DB._installmentsStore.size).toBe(1);
    });

    it('rejects an installment number outside the valid range', async () => {
      await expect(
        dbCreateLoan(mockEnv, 'user_1', {
          title: 'وام نامعتبر',
          principalAmount: 1000000,
          installmentCount: 3,
          startDate: '2026-01-01',
          customInstallments: [{ installmentNumber: 5, totalAmount: 100000 }],
        })
      ).rejects.toThrow(/خارج از بازه معتبر/);

      // No loan row should have been left behind by the rejected create
      const list = await dbGetUserLoans(mockEnv, 'user_1');
      expect(list.find((l) => l.title === 'وام نامعتبر')).toBeUndefined();
    });

    it('rejects a non-positive custom installment amount', async () => {
      await expect(
        dbCreateLoan(mockEnv, 'user_1', {
          title: 'وام مبلغ نامعتبر',
          principalAmount: 1000000,
          installmentCount: 3,
          startDate: '2026-01-01',
          customInstallments: [{ installmentNumber: 1, totalAmount: 0 }],
        })
      ).rejects.toThrow(/باید عددی بزرگتر از صفر/);
    });

    it('rejects a custom last-installment amount that would leave the loan unamortized, without persisting anything', async () => {
      await expect(
        dbCreateLoan(mockEnv, 'user_1', {
          title: 'وام تسویه‌نشده',
          principalAmount: 300000000,
          annualInterestRate: 4,
          installmentCount: 120,
          startDate: '2026-01-01',
          customInstallments: [
            { installmentNumber: 1, totalAmount: 12000000 },
            { installmentNumber: 120, totalAmount: 2000000 }, // far below what's actually owed by then
          ],
        })
      ).rejects.toThrow(/تسویه نمی‌شود/);

      // No loan row should have been left behind by the rejected create
      const list = await dbGetUserLoans(mockEnv, 'user_1');
      expect(list.find((l) => l.title === 'وام تسویه‌نشده')).toBeUndefined();
    });

    it('accepts a custom first+last combination that fully reconciles to zero', async () => {
      const loan = await dbCreateLoan(mockEnv, 'user_1', {
        title: 'وام تسویه‌شده با اقساط اول و آخر سفارشی',
        principalAmount: 300000000,
        annualInterestRate: 4,
        installmentCount: 120,
        startDate: '2026-01-01',
        customInstallments: [{ installmentNumber: 1, totalAmount: 12000000 }],
      });
      const lastInst = loan.installments[loan.installments.length - 1];
      expect(loan.installments[0].totalAmount).toBe(12000000);
      // Untouched middle installments are auto-divided uniformly by the cascade
      expect(loan.installments[1].totalAmount).toBe(loan.installments[59].totalAmount);
      expect(lastInst.remainingBalanceAfter).toBe(0);
    });
  });

  describe('dbSetInstallmentAmount (ویرایش مبلغ یک قسط)', () => {
    it('refuses to edit an already paid installment with meaningful error message', async () => {
      const loan = await dbCreateLoan(mockEnv, 'user_1', {
        title: 'وام خرید کالا',
        principalAmount: 12000000,
        annualInterestRate: 0,
        installmentCount: 12,
        startDate: '2026-01-01',
      });

      const firstInst = loan.installments[0];
      await dbMarkInstallmentPaid(mockEnv, 'user_1', firstInst.id, { paidDate: '2026-01-15' });

      // Attempt to edit paid installment
      await expect(
        dbSetInstallmentAmount(mockEnv, 'user_1', loan.id, firstInst.id, 2000000)
      ).rejects.toThrow('امکان ویرایش قسط پرداخت‌شده وجود ندارد');
    });

    it('updates unpaid installment amount, sets isManualOverride=1, and recalculates subsequent installments', async () => {
      const loan = await dbCreateLoan(mockEnv, 'user_1', {
        title: 'وام قرض‌الحسنه',
        principalAmount: 12000000,
        annualInterestRate: 0,
        installmentCount: 12,
        startDate: '2026-01-01',
      });

      // Default installments: 1,000,000 each
      expect(loan.installments[0].totalAmount).toBe(1000000);

      // Increase installment 1 to 3,000,000
      const result = await dbSetInstallmentAmount(mockEnv, 'user_1', loan.id, loan.installments[0].id, 3000000);
      expect(result.actualTotalAmount).toBe(3000000);
      expect(result.installment.isManualOverride).toBe(true);
      expect(result.installment.totalAmount).toBe(3000000);
      expect(result.installment.remainingBalanceAfter).toBe(9000000);

      // Remaining 11 installments should amortize remaining 9,000,000 equally (~818,182 each)
      const updatedLoan = result.loan;
      expect(updatedLoan.installments).toHaveLength(12);
      expect(updatedLoan.installments[1].isManualOverride).toBe(false);
      expect(updatedLoan.installments[1].totalAmount).toBe(Math.round(9000000 / 11));

      // Final remaining balance should be 0
      expect(updatedLoan.installments[11].remainingBalanceAfter).toBe(0);
      const totalPrincipal = updatedLoan.installments.reduce((sum, inst) => sum + inst.principalPortion, 0);
      expect(totalPrincipal).toBe(12000000);
    });
  });

  describe('dbAddExtraPayment (پرداخت مازاد/یکجا)', () => {
    it('records extra payment and reduces installment amounts in reduce_amount mode', async () => {
      const loan = await dbCreateLoan(mockEnv, 'user_1', {
        title: 'وام با سود',
        principalAmount: 60000000,
        annualInterestRate: 18,
        installmentCount: 12,
        startDate: '2026-01-01',
      });

      const initialFirstInstAmount = loan.installments[0].totalAmount;

      // Add extra payment of 20,000,000
      const result = await dbAddExtraPayment(mockEnv, 'user_1', loan.id, {
        amount: 20000000,
        paymentDate: '2026-01-15',
        reductionMode: 'reduce_amount',
        notes: 'پاداش پایان سال',
      });

      expect(result.success).toBe(true);
      expect(result.fullyPaidOff).toBe(false);
      expect(result.extraPayment.amount).toBe(20000000);
      expect(result.extraPayment.reductionMode).toBe('reduce_amount');

      // Subsequent installment amounts should be lower than original
      expect(result.loan.installments[0].totalAmount).toBeLessThan(initialFirstInstAmount);
      expect(result.loan.installmentCount).toBe(12);
      expect(result.loan.installments[11].remainingBalanceAfter).toBe(0);

      // Verify listing of extra payments
      const epList = await dbGetLoanExtraPayments(mockEnv, 'user_1', loan.id);
      expect(epList).toHaveLength(1);
      expect(epList[0].amount).toBe(20000000);
      expect(epList[0].notes).toBe('پاداش پایان سال');
    });

    it('records extra payment and reduces loan term in reduce_term mode', async () => {
      const loan = await dbCreateLoan(mockEnv, 'user_1', {
        title: 'وام مسکن',
        principalAmount: 120000000,
        annualInterestRate: 18,
        installmentCount: 24,
        startDate: '2026-01-01',
      });

      // Add lump sum payment of 60,000,000 (half the loan)
      const result = await dbAddExtraPayment(mockEnv, 'user_1', loan.id, {
        amount: 60000000,
        paymentDate: '2026-01-15',
        reductionMode: 'reduce_term',
      });

      expect(result.success).toBe(true);
      expect(result.fullyPaidOff).toBe(false);
      // New installment count must be strictly less than original 24
      expect(result.loan.installmentCount).toBeLessThan(24);
      expect(result.loan.installments.length).toBeLessThan(24);
      expect(result.loan.installments[result.loan.installments.length - 1].remainingBalanceAfter).toBe(0);
    });

    it('handles extra payment exceeding remaining balance and fully pays off the loan', async () => {
      const loan = await dbCreateLoan(mockEnv, 'user_1', {
        title: 'وام تسویه کامل',
        principalAmount: 10000000,
        annualInterestRate: 12,
        installmentCount: 10,
        startDate: '2026-01-01',
      });

      // Extra payment larger than total principal
      const result = await dbAddExtraPayment(mockEnv, 'user_1', loan.id, {
        amount: 15000000,
        paymentDate: '2026-01-10',
      });

      expect(result.success).toBe(true);
      expect(result.fullyPaidOff).toBe(true);
      // All pending installments should be cleared
      expect(result.loan.installments).toHaveLength(0);
      expect(result.loan.installmentCount).toBe(0);
    });
  });

  describe('dbMarkInstallmentPaidCascade', () => {
    it('marks target installment and all prior unpaid installments as paid, leaving subsequent installments unpaid', async () => {
      // 1. Create a loan with 12 installments
      const loan = await dbCreateLoan(mockEnv, 'user_1', {
        title: 'وام ۱۲ ماهه آبشار',
        principalAmount: 12000000,
        annualInterestRate: 0,
        installmentCount: 12,
        startDate: '2026-01-01',
      });

      expect(loan.installments).toHaveLength(12);

      // 2. Pick installment #8 (index 7)
      const targetInst = loan.installments[7];
      expect(targetInst.installmentNumber).toBe(8);

      // 3. Mark installment #8 as paid with cascade
      const res = await dbMarkInstallmentPaidCascade(mockEnv, 'user_1', loan.id, targetInst.id, {
        paidDate: '2026-08-15',
        paidAmount: targetInst.totalAmount,
      });

      expect(res.installment.id).toBe(targetInst.id);
      expect(res.installment.isPaid).toBe(true);
      expect(res.installment.paidDate).toBe('2026-08-15');
      expect(res.cascadedCount).toBe(7);
      expect(res.cascadedInstallments).toHaveLength(7);

      // 4. Fetch the full loan and verify installments 1-7, 8, and 9-12
      const fullLoan = await dbGetLoanById(mockEnv, 'user_1', loan.id);
      expect(fullLoan.installments).toHaveLength(12);

      for (let num = 1; num <= 7; num++) {
        const inst = fullLoan.installments[num - 1];
        expect(inst.installmentNumber).toBe(num);
        expect(inst.isPaid).toBe(true);
        expect(inst.paidDate).toBe(inst.dueDate);
        expect(inst.paidAmount).toBe(inst.totalAmount);
      }

      const paidTarget = fullLoan.installments[7];
      expect(paidTarget.installmentNumber).toBe(8);
      expect(paidTarget.isPaid).toBe(true);
      expect(paidTarget.paidDate).toBe('2026-08-15');

      for (let num = 9; num <= 12; num++) {
        const inst = fullLoan.installments[num - 1];
        expect(inst.installmentNumber).toBe(num);
        expect(inst.isPaid).toBe(false);
      }
    });

    it('throws an error if the target installment is already marked as paid', async () => {
      const loan = await dbCreateLoan(mockEnv, 'user_1', {
        title: 'وام تست خطا',
        principalAmount: 6000000,
        annualInterestRate: 0,
        installmentCount: 6,
        startDate: '2026-01-01',
      });

      const firstInst = loan.installments[0];
      // Mark it as paid first
      await dbMarkInstallmentPaid(mockEnv, 'user_1', firstInst.id, {
        paidDate: '2026-01-10',
      });

      // Attempting to cascade pay an already-paid installment should throw
      await expect(
        dbMarkInstallmentPaidCascade(mockEnv, 'user_1', loan.id, firstInst.id, {
          paidDate: '2026-01-15',
        })
      ).rejects.toThrow('این قسط قبلاً پرداخت شده است.');
    });
  });

  describe('Phase 4: 60-Month Comprehensive Lifecycle Verification (تست جامع وام ۶۰ ماهه)', () => {
    it('executes full manual test scenario: create 60mo -> verify 1 loan row 0 installment rows -> pay 2 -> override 1 -> extra payments both modes -> verify complete schedules against manual calculations', async () => {
      // 1. Create a 60-month loan: 300,000,000 Tomans, 23% interest, 60 installments
      const loan = await dbCreateLoan(mockEnv, 'user_60', {
        title: 'وام ۶۰ ماهه توسعه کسب‌وکار',
        lenderName: 'بانک ملت',
        principalAmount: 300000000,
        annualInterestRate: 23,
        installmentCount: 60,
        intervalMonths: 1,
        startDate: '2026-01-01',
      });

      // Verification Step 1: D1 row counts
      expect(mockEnv.DB._loansStore.size).toBe(1);
      expect(mockEnv.DB._installmentsStore.size).toBe(0);
      expect(mockEnv.DB._extraPaymentsStore.size).toBe(0);

      // Verify computed schedule length & mathematical convergence
      expect(loan.installments).toHaveLength(60);
      const monthlyRate = (23 / 100) * (1 / 12);
      const expectedPmt = Math.round(
        (300000000 * monthlyRate * Math.pow(1 + monthlyRate, 60)) /
          (Math.pow(1 + monthlyRate, 60) - 1)
      );
      // Installment 1 total amount should match standard PMT formula (within rounding)
      expect(Math.abs(loan.installments[0].totalAmount - expectedPmt)).toBeLessThanOrEqual(2);
      // Final installment must perfectly close balance to 0
      expect(loan.installments[59].remainingBalanceAfter).toBe(0);
      expect(loan.remainingBalance).toBe(loan.installments.reduce((sum, i) => sum + i.totalAmount, 0));

      // 2. Pay 2 installments (installment 1 and 2)
      const inst1 = loan.installments[0];
      const inst2 = loan.installments[1];
      await dbMarkInstallmentPaid(mockEnv, 'user_60', inst1.id, {
        paidDate: '2026-02-01',
        paidAmount: inst1.totalAmount,
      });
      await dbMarkInstallmentPaid(mockEnv, 'user_60', inst2.id, {
        paidDate: '2026-03-01',
        paidAmount: inst2.totalAmount,
      });

      // Verification Step 2: D1 has exactly 2 rows in loan_installment_states
      expect(mockEnv.DB._installmentsStore.size).toBe(2);
      const loanAfter2Paid = await dbGetLoanById(mockEnv, 'user_60', loan.id);
      expect(loanAfter2Paid.paidCount).toBe(2);
      expect(loanAfter2Paid.installments[0].isPaid).toBe(true);
      expect(loanAfter2Paid.installments[1].isPaid).toBe(true);
      expect(loanAfter2Paid.installments[2].isPaid).toBe(false);

      // 3. Override 1 installment: installment 5 to 15,000,000 Tomans
      const inst5 = loanAfter2Paid.installments[4];
      const overrideRes = await dbSetInstallmentAmount(mockEnv, 'user_60', loan.id, inst5.id, 15000000);
      expect(overrideRes.installment.isManualOverride).toBe(true);
      expect(overrideRes.installment.totalAmount).toBe(15000000);

      // Verification Step 3: D1 has exactly 3 rows in loan_installment_states (2 paid + 1 override)
      expect(mockEnv.DB._installmentsStore.size).toBe(3);
      const loanAfterOverride = await dbGetLoanById(mockEnv, 'user_60', loan.id);
      expect(loanAfterOverride.installments[4].totalAmount).toBe(15000000);
      expect(loanAfterOverride.installments[4].isManualOverride).toBe(true);
      expect(loanAfterOverride.installments[59].remainingBalanceAfter).toBe(0);

      // 4. Extra payment in reduce_amount mode: 20,000,000 Tomans at installment 2
      const epAmountRes = await dbAddExtraPayment(mockEnv, 'user_60', loan.id, {
        amount: 20000000,
        paymentDate: '2026-03-15',
        reductionMode: 'reduce_amount',
        notes: 'واریز پاداش نوروزی',
      });
      expect(epAmountRes.success).toBe(true);
      expect(mockEnv.DB._extraPaymentsStore.size).toBe(1);
      // Installment states table MUST STILL have only 3 rows
      expect(mockEnv.DB._installmentsStore.size).toBe(3);

      const loanAfterEpAmount = await dbGetLoanById(mockEnv, 'user_60', loan.id);
      expect(loanAfterEpAmount.installmentCount).toBe(60);
      expect(loanAfterEpAmount.installments).toHaveLength(60);
      // Amounts of non-overridden pending installments should now be lower than original PMT
      expect(loanAfterEpAmount.installments[2].totalAmount).toBeLessThan(expectedPmt);
      expect(loanAfterEpAmount.installments[59].remainingBalanceAfter).toBe(0);

      // 5. Extra payment in reduce_term mode: pay installment 3 & 4 then add lump sum 50,000,000
      await dbMarkInstallmentPaid(mockEnv, 'user_60', loanAfterEpAmount.installments[2].id, {
        paidDate: '2026-04-01',
      });
      await dbMarkInstallmentPaid(mockEnv, 'user_60', loanAfterEpAmount.installments[3].id, {
        paidDate: '2026-05-01',
      });
      expect(mockEnv.DB._installmentsStore.size).toBe(5);

      const epTermRes = await dbAddExtraPayment(mockEnv, 'user_60', loan.id, {
        amount: 50000000,
        paymentDate: '2026-05-15',
        reductionMode: 'reduce_term',
        notes: 'تسویه بخشی از اصل وام',
      });
      expect(epTermRes.success).toBe(true);
      expect(mockEnv.DB._extraPaymentsStore.size).toBe(2);

      const loanAfterEpTerm = await dbGetLoanById(mockEnv, 'user_60', loan.id);
      expect(loanAfterEpTerm.installmentCount).toBeLessThan(60);
      expect(loanAfterEpTerm.installments.length).toBeLessThan(60);
      const finalInst = loanAfterEpTerm.installments[loanAfterEpTerm.installments.length - 1];
      expect(finalInst.remainingBalanceAfter).toBe(0);

      // Summary via dbGetUserLoans matches exactly
      const userLoans = await dbGetUserLoans(mockEnv, 'user_60');
      expect(userLoans).toHaveLength(1);
      expect(userLoans[0].paidCount).toBe(4);
      expect(userLoans[0].totalCount).toBe(loanAfterEpTerm.installments.length);
      expect(userLoans[0].nextDueInstallment.installmentNumber).toBe(5);
    });
  });
});



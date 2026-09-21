import { describe, it, expect, beforeEach } from 'vitest';
import {
  dbCreateLoan,
  dbGetUserLoans,
  dbGetLoanById,
  dbUpdateLoan,
  dbDeleteLoan,
  dbMarkInstallmentPaid,
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
            start_date, notes, created_at, updated_at
          ] = boundArgs;
          loansStore.set(id, {
            id, user_id, title, lender_name, principal_amount,
            annual_interest_rate, installment_count, interval_months,
            start_date, notes, created_at, updated_at
          });
          return { meta: { changes: 1 } };
        }
        if (q.startsWith('INSERT INTO loan_installments')) {
          const [
            id, loan_id, user_id, installment_number, due_date,
            principal_portion, interest_portion, total_amount,
            remaining_balance_after, is_paid, paid_date, paid_amount,
            created_at, updated_at, is_manual_override
          ] = boundArgs;
          installmentsStore.set(id, {
            id, loan_id, user_id, installment_number, due_date,
            principal_portion, interest_portion, total_amount,
            remaining_balance_after, is_paid, paid_date, paid_amount,
            created_at, updated_at,
            is_manual_override: is_manual_override || 0,
          });
          return { meta: { changes: 1 } };
        }
        if (q.startsWith('INSERT INTO loan_extra_payments')) {
          const [
            id, loan_id, user_id, amount, payment_date,
            reduction_mode, notes, created_at
          ] = boundArgs;
          extraPaymentsStore.set(id, {
            id, loan_id, user_id, amount, payment_date,
            reduction_mode, notes, created_at
          });
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
            newCount, newInterval, newStartDate, newNotes,
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
              notes: newNotes,
              updated_at: nowIso,
            });
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        }
        if (q.includes('DELETE FROM loan_installments') && q.includes('installment_number > ?')) {
          const [loanId, userId, anchorNumber] = boundArgs;
          for (const [id, inst] of installmentsStore.entries()) {
            if (
              inst.loan_id === loanId &&
              inst.user_id === userId &&
              inst.installment_number > anchorNumber &&
              (inst.is_paid === 0 || !inst.is_paid)
            ) {
              installmentsStore.delete(id);
            }
          }
          return { meta: { changes: 1 } };
        }
        if (q.includes('DELETE FROM loan_installments') && q.includes('is_paid = 0')) {
          const [loanId, userId] = boundArgs;
          for (const [id, inst] of installmentsStore.entries()) {
            if (inst.loan_id === loanId && inst.user_id === userId && (inst.is_paid === 0 || !inst.is_paid)) {
              installmentsStore.delete(id);
            }
          }
          return { meta: { changes: 1 } };
        }
        if (q.startsWith('DELETE FROM loan_installments') && !q.includes('is_paid = 0')) {
          const [loanId, userId] = boundArgs;
          for (const [id, inst] of installmentsStore.entries()) {
            if (inst.loan_id === loanId && inst.user_id === userId) {
              installmentsStore.delete(id);
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
        if (q.startsWith('UPDATE loan_installments') && q.includes('is_manual_override = 1')) {
          const [
            principalPortion,
            interestPortion,
            totalAmount,
            remainingBalanceAfter,
            nowIso,
            installmentId,
            loanId,
            userId,
          ] = boundArgs;
          const existing = installmentsStore.get(installmentId);
          if (existing && existing.user_id === userId && existing.loan_id === loanId) {
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
        if (q.startsWith('UPDATE loan_installments') && q.includes('is_paid = 1')) {
          const [paidDate, paidAmount, updatedAt, installmentId, userId] = boundArgs;
          const existing = installmentsStore.get(installmentId);
          if (existing && existing.user_id === userId) {
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
        if (q.startsWith('UPDATE loan_installments') && q.includes('is_paid = 0')) {
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
        if (q.includes('FROM loan_installments') && q.includes('WHERE id = ? AND user_id = ?')) {
          const [installmentId, userId] = boundArgs;
          const inst = installmentsStore.get(installmentId);
          if (inst && inst.user_id === userId) return inst;
          return null;
        }
        return null;
      },
      async all() {
        if (q.includes('FROM loans l') && q.includes('GROUP BY l.id')) {
          const [userId] = boundArgs;
          const results = [];
          for (const loan of loansStore.values()) {
            if (loan.user_id === userId) {
              let totalCount = 0;
              let paidCount = 0;
              let remainingBalance = 0;
              for (const inst of installmentsStore.values()) {
                if (inst.loan_id === loan.id) {
                  totalCount++;
                  if (inst.is_paid === 1) {
                    paidCount++;
                  } else {
                    remainingBalance += (Number(inst.total_amount) || 0);
                  }
                }
              }
              results.push({
                ...loan,
                totalCount,
                paidCount,
                remainingBalance,
              });
            }
          }
          return { results };
        }
        if (q.includes('FROM loan_installments') && q.includes('WHERE user_id = ? AND is_paid = 0')) {
          const [userId] = boundArgs;
          const results = [];
          for (const inst of installmentsStore.values()) {
            if (inst.user_id === userId && (inst.is_paid === 0 || !inst.is_paid)) {
              results.push(inst);
            }
          }
          results.sort((a, b) => a.installment_number - b.installment_number);
          return { results };
        }
        if (q.includes('FROM loan_installments') && q.includes('WHERE loan_id = ? AND user_id = ?')) {
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
        return { results: [] };
      }
    };
    return stmt;
  }

  return {
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

  it('creates a loan and batch-inserts full amortization installments', async () => {
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

    // Verify day clamping on installment dates
    expect(loan.installments[0].dueDate).toBe('2026-02-28');
    expect(loan.installments[1].dueDate).toBe('2026-03-31');

    // Retrieve by ID
    const fetched = await dbGetLoanById(mockEnv, 'user_1', loan.id);
    expect(fetched).toBeDefined();
    expect(fetched.title).toBe('وام مسکن');
    expect(fetched.installments).toHaveLength(12);
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

  it('marks and unmarks an installment as paid', async () => {
    const loan = await dbCreateLoan(mockEnv, 'user_1', {
      title: 'وام تحصیلی',
      principalAmount: 5000000,
      annualInterestRate: 0,
      installmentCount: 5,
      startDate: '2026-01-01',
    });

    const inst = loan.installments[0];
    const paid = await dbMarkInstallmentPaid(mockEnv, 'user_1', inst.id, {
      paidDate: '2026-02-01',
      paidAmount: 1000000,
    });

    expect(paid).toBeDefined();
    expect(paid.isPaid).toBe(true);
    expect(paid.paidDate).toBe('2026-02-01');
    expect(paid.paidAmount).toBe(1000000);

    // Unmark
    const unpaid = await dbUnmarkInstallmentPaid(mockEnv, 'user_1', inst.id);
    expect(unpaid).toBeDefined();
    expect(unpaid.isPaid).toBe(false);
    expect(unpaid.paidDate).toBe('');
    expect(unpaid.paidAmount).toBe(0);
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
});



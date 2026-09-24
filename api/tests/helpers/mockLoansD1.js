/**
 * In-memory D1 stand-in for the loans repository (understands exactly the SQL it issues).
 * Shared by the repository tests and the loan-document parity tests.
 */
export function createMockD1() {
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
            id, user_id, title, lender_name, bank_id, principal_amount,
            annual_interest_rate, installment_count, interval_months,
            start_date, annual_fee_amount, schedule_mode, notes, created_at, updated_at
          ] = boundArgs;
          if (loansStore.has(id)) {
            throw new Error(`D1_ERROR: UNIQUE constraint failed: loans.id: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_PRIMARYKEY)`);
          }
          loansStore.set(id, {
            id, user_id, title, lender_name, bank_id, principal_amount,
            annual_interest_rate, installment_count, interval_months,
            start_date, annual_fee_amount: annual_fee_amount || 0,
            schedule_mode: schedule_mode || 'formula', notes, created_at, updated_at
          });
          return { meta: { changes: 1 } };
        }
        if (q.startsWith('INSERT INTO loan_installment_states') || q.startsWith('INSERT INTO loan_installments')) {
          // Mirror real SQLite's PRIMARY KEY enforcement — a plain Map.set would silently
          // overwrite a colliding id instead of failing loudly like the real D1 database does.
          const insertedId = boundArgs[0];
          if (installmentsStore.has(insertedId)) {
            throw new Error(`D1_ERROR: UNIQUE constraint failed: loan_installment_states.id: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_PRIMARYKEY)`);
          }
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
        if (q.includes("UPDATE loans SET schedule_mode = 'distributed'")) {
          const [updatedAt, loanId, userId] = boundArgs;
          const existing = loansStore.get(loanId);
          if (existing && existing.user_id === userId) {
            loansStore.set(loanId, {
              ...existing,
              schedule_mode: 'distributed',
              updated_at: updatedAt,
            });
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        }
        if (q.startsWith('UPDATE loans')) {
          const [
            newTitle, newLender, newBankId, newPrincipal, newRate,
            newCount, newInterval, newStartDate, newAnnualFeeAmount, newScheduleMode, newNotes,
            nowIso, loanId, userId
          ] = boundArgs;
          const existing = loansStore.get(loanId);
          if (existing && existing.user_id === userId) {
            loansStore.set(loanId, {
              ...existing,
              title: newTitle,
              lender_name: newLender,
              bank_id: newBankId,
              principal_amount: newPrincipal,
              annual_interest_rate: newRate,
              installment_count: newCount,
              interval_months: newInterval,
              start_date: newStartDate,
              annual_fee_amount: newAnnualFeeAmount || 0,
              schedule_mode: newScheduleMode || 'formula',
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
        if ((q.includes('FROM loan_installment_states') || q.includes('FROM loan_installments')) && q.includes('(id = ? OR (installment_number = ? AND loan_id = ?)) AND user_id = ?')) {
          const [installmentId, instNum, loanId, userId] = boundArgs;
          for (const inst of installmentsStore.values()) {
            if (
              inst.user_id === userId &&
              (inst.id === installmentId || (inst.installment_number === Number(instNum) && inst.loan_id === loanId))
            ) {
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
          // Honour the query's ORDER BY direction like real SQLite does
          const dir = q.includes('payment_date ASC') ? 1 : -1;
          results.sort((a, b) => dir * ((a.payment_date || '').localeCompare(b.payment_date || '') || (a.created_at || '').localeCompare(b.created_at || '')));
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
          results.sort((a, b) => (a.payment_date || '').localeCompare(b.payment_date || '') || (a.created_at || '').localeCompare(b.created_at || ''));
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

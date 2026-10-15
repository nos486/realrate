/**
 * loansRepository.test.js — Reading and deleting the older plaintext loans (D1, here on SQLite):
 * a stored loan reads back as the same document the vault keeps, with the schedule and totals
 * of the one loan engine (buildLoanView / summarizeLoan), whatever the number of loans
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { sqliteD1 } from '../helpers/sqliteD1.js';
import { resetD1SchemaCache } from '../../src/repositories/d1Schema.js';
import { ensureSchema } from '../../src/repositories/schema.repository.js';
import {
  dbGetUserLoans,
  dbGetLoanById,
  dbGetLoanDocument,
  dbGetLoanExtraPayments,
  dbDeleteLoan,
} from '../../src/repositories/loans.repository.js';
import {
  createLoanDoc,
  buildLoanView,
  summarizeLoan,
  markInstallmentPaidDoc,
  addExtraPaymentDoc,
  bulkDistributeInstallmentsDoc,
} from '../../src/domain/loanDocument.js';

/** Store a loan document in the plaintext tables, as the server once did */
async function storeLoan(env, userId, doc) {
  await ensureSchema(env);
  const { loan } = doc;
  const statements = [
    env.DB.prepare(`INSERT INTO loans (id, user_id, title, lender_name, bank_id, principal_amount, annual_interest_rate,
      installment_count, interval_months, start_date, annual_fee_amount, schedule_mode, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      loan.id, userId, loan.title, loan.lenderName, loan.bankId, loan.principalAmount, loan.annualInterestRate,
      loan.installmentCount, loan.intervalMonths, loan.startDate, loan.annualFeeAmount, loan.scheduleMode, loan.notes,
      loan.createdAt, loan.updatedAt),
    ...doc.states.map((s) => env.DB.prepare(`INSERT INTO loan_installment_states (id, loan_id, user_id, installment_number,
      due_date, principal_portion, interest_portion, total_amount, remaining_balance_after, is_paid, paid_date, paid_amount,
      is_manual_override, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      s.id, loan.id, userId, s.installmentNumber, s.dueDate, s.principalPortion, s.interestPortion, s.totalAmount,
      s.remainingBalanceAfter, s.isPaid, s.paidDate, s.paidAmount, s.isManualOverride, s.createdAt, s.updatedAt)),
    ...doc.extraPayments.map((p) => env.DB.prepare(`INSERT INTO loan_extra_payments (id, loan_id, user_id, amount, payment_date,
      reduction_mode, notes, anchor_installment_number, resulting_balance, resulting_installment_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      p.id, loan.id, userId, p.amount, p.paymentDate, p.reductionMode, p.notes, p.anchorInstallmentNumber,
      p.resultingBalance, p.resultingInstallmentCount, p.createdAt)),
  ];
  await env.DB.batch(statements);
}

/** A formula loan with two paid installments and two extra payments */
function formulaLoan(id, createdAt) {
  let doc = createLoanDoc({
    id, title: 'وام مسکن', bankId: 'maskan', principalAmount: 120_000_000, annualInterestRate: 18,
    installmentCount: 24, startDate: '2026-01-15', annualFeeAmount: 500_000, notes: 'یادداشت',
  }, { now: createdAt });
  doc = markInstallmentPaidDoc(doc, '1', { paidDate: '2026-02-15' }).doc;
  doc = markInstallmentPaidDoc(doc, '2', { paidDate: '2026-03-15', paidAmount: 6_500_000 }).doc;
  doc = addExtraPaymentDoc(doc, { amount: 10_000_000, paymentDate: '2026-03-20', notes: 'پاداش' }).doc;
  doc = addExtraPaymentDoc(doc, { amount: 5_000_000, paymentDate: '2026-04-01', reductionMode: 'reduce_term' }).doc;
  return doc;
}

/** A distributed loan (a known total repayment, then a bulk re-plan) */
function distributedLoan(id, createdAt) {
  let doc = createLoanDoc({ id, title: 'قرض', principalAmount: 9_000_000, installmentCount: 4, startDate: '2026-01-01', totalRepaymentAmount: 10_000_000 }, { now: createdAt });
  doc = markInstallmentPaidDoc(doc, '2').doc;
  return bulkDistributeInstallmentsDoc(doc, { 3: 1_000_000 });
}

describe('loans repository (plaintext loans, read and delete)', () => {
  let env;
  beforeEach(() => {
    resetD1SchemaCache();
    env = { DB: sqliteD1() };
  });
  afterEach(() => env.DB.close());

  it('reads a stored loan back as the same document and view', async () => {
    const doc = formulaLoan('loan_a', '2026-01-10T08:00:00.000Z');
    await storeLoan(env, 'u1', doc);
    expect(await dbGetLoanDocument(env, 'u1', 'loan_a')).toEqual(doc);
    expect(await dbGetLoanById(env, 'u1', 'loan_a')).toEqual(buildLoanView(doc));
  });

  it('reads a distributed loan\'s stored schedule unchanged', async () => {
    const doc = distributedLoan('loan_d', '2026-01-10T08:00:00.000Z');
    await storeLoan(env, 'u1', doc);
    expect(await dbGetLoanById(env, 'u1', 'loan_d')).toEqual(buildLoanView(doc));
  });

  it('lists the user\'s loans with their totals, newest first, in three queries', async () => {
    const older = formulaLoan('loan_a', '2026-01-10T08:00:00.000Z');
    const newer = distributedLoan('loan_d', '2026-02-10T08:00:00.000Z');
    await storeLoan(env, 'u1', older);
    await storeLoan(env, 'u1', newer);
    await storeLoan(env, 'u2', formulaLoan('loan_other', '2026-03-01T08:00:00.000Z'));

    const before = env.DB.queries;
    expect(await dbGetUserLoans(env, 'u1')).toEqual([summarizeLoan(newer), summarizeLoan(older)]);
    expect(env.DB.queries - before).toBe(3);
  });

  it('lists the extra payments newest first', async () => {
    await storeLoan(env, 'u1', formulaLoan('loan_a', '2026-01-10T08:00:00.000Z'));
    expect((await dbGetLoanExtraPayments(env, 'u1', 'loan_a')).map((p) => p.amount)).toEqual([5_000_000, 10_000_000]);
    expect(await dbGetLoanExtraPayments(env, 'u1', 'missing')).toEqual([]);
  });

  it('finds nothing for another user or a missing loan', async () => {
    await storeLoan(env, 'u1', formulaLoan('loan_a', '2026-01-10T08:00:00.000Z'));
    expect(await dbGetLoanById(env, 'u2', 'loan_a')).toBeNull();
    expect(await dbGetLoanDocument(env, 'u1', 'missing')).toBeNull();
    expect(await dbGetUserLoans(env, 'u3')).toEqual([]);
  });

  it('deletes a loan with its installment states and extra payments, and only that loan', async () => {
    await storeLoan(env, 'u1', formulaLoan('loan_a', '2026-01-10T08:00:00.000Z'));
    await storeLoan(env, 'u1', distributedLoan('loan_d', '2026-02-10T08:00:00.000Z'));
    expect(await dbDeleteLoan(env, 'u1', 'loan_a')).toBe(true);
    expect((await dbGetUserLoans(env, 'u1')).map((l) => l.id)).toEqual(['loan_d']);
    const left = (sql) => env.DB.prepare(sql).bind('loan_a').first('n');
    expect(await left('SELECT COUNT(*) AS n FROM loan_installment_states WHERE loan_id = ?')).toBe(0);
    expect(await left('SELECT COUNT(*) AS n FROM loan_extra_payments WHERE loan_id = ?')).toBe(0);
  });
});

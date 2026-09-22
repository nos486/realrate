import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/auth.js', () => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock('../../src/repositories/index.js', () => ({
  dbGetUserLoans: vi.fn(),
  dbGetLoanById: vi.fn(),
  dbCreateLoan: vi.fn(),
  dbUpdateLoan: vi.fn(),
  dbDeleteLoan: vi.fn(),
  dbMarkInstallmentPaid: vi.fn(),
  dbUnmarkInstallmentPaid: vi.fn(),
  dbBulkDistributeInstallments: vi.fn(),
  dbAddExtraPayment: vi.fn(),
  dbGetLoanExtraPayments: vi.fn(),
}));

import { getAuthenticatedUser } from '../../src/lib/auth.js';
import {
  dbGetUserLoans,
  dbGetLoanById,
  dbCreateLoan,
  dbUpdateLoan,
  dbDeleteLoan,
  dbMarkInstallmentPaid,
  dbUnmarkInstallmentPaid,
  dbBulkDistributeInstallments,
  dbAddExtraPayment,
  dbGetLoanExtraPayments,
} from '../../src/repositories/index.js';
import {
  handleGetLoans,
  handleCreateLoan,
  handleGetLoan,
  handleUpdateLoan,
  handleDeleteLoan,
  handleUpdateInstallment,
  handleBulkDistributeInstallments,
  handleAddExtraPayment,
  handleGetLoanExtraPayments,
} from '../../src/handlers/loanRoutes.js';

describe('Loan Routes Handlers (هندلرهای API وام‌ها)', () => {
  const mockEnv = {};

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication Enforcement', () => {
    it('throws unauthorized AppError when user is not authenticated', async () => {
      getAuthenticatedUser.mockResolvedValue(null);

      const req = new Request('https://realrate.ir/api/loans');
      await expect(handleGetLoans(req, mockEnv)).rejects.toThrow();
    });
  });

  describe('GET /api/loans', () => {
    it('returns user loans list', async () => {
      getAuthenticatedUser.mockResolvedValue({ userId: 'u_1' });
      dbGetUserLoans.mockResolvedValue([
        { id: 'loan_1', title: 'وام مسکن', totalCount: 12, paidCount: 2, remainingBalance: 10000000 },
      ]);

      const req = new Request('https://realrate.ir/api/loans');
      const res = await handleGetLoans(req, mockEnv);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.count).toBe(1);
      expect(json.loans[0].title).toBe('وام مسکن');
    });
  });

  describe('POST /api/loans', () => {
    it('validates required fields', async () => {
      getAuthenticatedUser.mockResolvedValue({ userId: 'u_1' });

      const req = new Request('https://realrate.ir/api/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '' }),
      });

      await expect(handleCreateLoan(req, mockEnv)).rejects.toThrow();
    });

    it('creates loan successfully with status 201', async () => {
      getAuthenticatedUser.mockResolvedValue({ userId: 'u_1' });
      dbCreateLoan.mockResolvedValue({ id: 'loan_new', title: 'وام کارآفرینی' });

      const req = new Request('https://realrate.ir/api/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'وام کارآفرینی',
          principalAmount: 50000000,
          installmentCount: 24,
        }),
      });

      const res = await handleCreateLoan(req, mockEnv);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.loan.id).toBe('loan_new');
    });
  });

  describe('GET /api/loans/:id', () => {
    it('returns loan by id with installments', async () => {
      getAuthenticatedUser.mockResolvedValue({ userId: 'u_1' });
      dbGetLoanById.mockResolvedValue({ id: 'loan_1', title: 'وام ۱', installments: [] });

      const req = new Request('https://realrate.ir/api/loans/loan_1');
      const res = await handleGetLoan(req, mockEnv, { loanId: 'loan_1' });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.loan.id).toBe('loan_1');
    });

    it('throws not found if loan does not exist', async () => {
      getAuthenticatedUser.mockResolvedValue({ userId: 'u_1' });
      dbGetLoanById.mockResolvedValue(null);

      const req = new Request('https://realrate.ir/api/loans/loan_999');
      await expect(handleGetLoan(req, mockEnv, { loanId: 'loan_999' })).rejects.toThrow();
    });
  });

  describe('PUT /api/loans/:id', () => {
    it('updates loan', async () => {
      getAuthenticatedUser.mockResolvedValue({ userId: 'u_1' });
      dbUpdateLoan.mockResolvedValue({ id: 'loan_1', title: 'عنوان جدید' });

      const req = new Request('https://realrate.ir/api/loans/loan_1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'عنوان جدید' }),
      });

      const res = await handleUpdateLoan(req, mockEnv, { loanId: 'loan_1' });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.loan.title).toBe('عنوان جدید');
    });
  });

  describe('DELETE /api/loans/:id', () => {
    it('deletes loan', async () => {
      getAuthenticatedUser.mockResolvedValue({ userId: 'u_1' });
      dbDeleteLoan.mockResolvedValue(true);

      const req = new Request('https://realrate.ir/api/loans/loan_1', { method: 'DELETE' });
      const res = await handleDeleteLoan(req, mockEnv, { loanId: 'loan_1' });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });

  describe('PUT /api/loans/:id/installments/:installmentId', () => {
    it('marks installment as paid when isPaid is true', async () => {
      getAuthenticatedUser.mockResolvedValue({ userId: 'u_1' });
      dbMarkInstallmentPaid.mockResolvedValue({ id: 'inst_1', isPaid: true, paidDate: '2026-03-01' });

      const req = new Request('https://realrate.ir/api/loans/l_1/installments/inst_1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPaid: true, paidDate: '2026-03-01', paidAmount: 1000000 }),
      });

      const res = await handleUpdateInstallment(req, mockEnv, { loanId: 'l_1', installmentId: 'inst_1' });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.installment.isPaid).toBe(true);
      expect(dbMarkInstallmentPaid).toHaveBeenCalledWith(mockEnv, 'u_1', 'inst_1', {
        paidDate: '2026-03-01',
        paidAmount: 1000000,
        loanId: 'l_1',
      });
    });

    it('unmarks installment when isPaid is false', async () => {
      getAuthenticatedUser.mockResolvedValue({ userId: 'u_1' });
      dbUnmarkInstallmentPaid.mockResolvedValue({ id: 'inst_1', isPaid: false });

      const req = new Request('https://realrate.ir/api/loans/l_1/installments/inst_1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPaid: false }),
      });

      const res = await handleUpdateInstallment(req, mockEnv, { loanId: 'l_1', installmentId: 'inst_1' });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.installment.isPaid).toBe(false);
      expect(dbUnmarkInstallmentPaid).toHaveBeenCalledWith(mockEnv, 'u_1', 'inst_1', 'l_1');
    });
  });

  describe('PUT /api/loans/:id/installments/bulk', () => {
    it('re-plans installments and returns the updated loan', async () => {
      getAuthenticatedUser.mockResolvedValue({ userId: 'u_1' });
      dbBulkDistributeInstallments.mockResolvedValue({ id: 'l_1', scheduleMode: 'distributed' });

      const req = new Request('https://realrate.ir/api/loans/l_1/installments/bulk', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ knownAmounts: { 1: 2000000, 6: 500000 } }),
      });

      const res = await handleBulkDistributeInstallments(req, mockEnv, { loanId: 'l_1' });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.loan.scheduleMode).toBe('distributed');
      expect(dbBulkDistributeInstallments).toHaveBeenCalledWith(mockEnv, 'u_1', 'l_1', { 1: 2000000, 6: 500000 }, undefined);
    });

    it('passes totalRepaymentAmount through to dbBulkDistributeInstallments', async () => {
      getAuthenticatedUser.mockResolvedValue({ userId: 'u_1' });
      dbBulkDistributeInstallments.mockResolvedValue({ id: 'l_1', scheduleMode: 'distributed' });

      const req = new Request('https://realrate.ir/api/loans/l_1/installments/bulk', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ knownAmounts: {}, totalRepaymentAmount: 151187328 }),
      });

      await handleBulkDistributeInstallments(req, mockEnv, { loanId: 'l_1' });
      expect(dbBulkDistributeInstallments).toHaveBeenCalledWith(mockEnv, 'u_1', 'l_1', {}, 151187328);
    });
  });

  describe('POST /api/loans/:id/extra-payments', () => {
    it('records extra payment and returns 201', async () => {
      getAuthenticatedUser.mockResolvedValue({ userId: 'u_1' });
      dbAddExtraPayment.mockResolvedValue({
        success: true,
        fullyPaidOff: false,
        extraPayment: { id: 'ep_1', amount: 5000000, reductionMode: 'reduce_amount' },
        loan: { id: 'l_1' },
      });

      const req = new Request('https://realrate.ir/api/loans/l_1/extra-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 5000000,
          paymentDate: '2026-03-01',
          reductionMode: 'reduce_amount',
          notes: 'تسویه بخشی از بدهی',
        }),
      });

      const res = await handleAddExtraPayment(req, mockEnv, { loanId: 'l_1' });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.extraPayment.amount).toBe(5000000);
      expect(dbAddExtraPayment).toHaveBeenCalledWith(mockEnv, 'u_1', 'l_1', {
        amount: 5000000,
        paymentDate: '2026-03-01',
        reductionMode: 'reduce_amount',
        notes: 'تسویه بخشی از بدهی',
      });
    });

    it('validates amount and paymentDate', async () => {
      getAuthenticatedUser.mockResolvedValue({ userId: 'u_1' });

      const req = new Request('https://realrate.ir/api/loans/l_1/extra-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 0 }),
      });

      await expect(handleAddExtraPayment(req, mockEnv, { loanId: 'l_1' })).rejects.toThrow();
    });
  });

  describe('GET /api/loans/:id/extra-payments', () => {
    it('returns extra payments list for a loan', async () => {
      getAuthenticatedUser.mockResolvedValue({ userId: 'u_1' });
      dbGetLoanExtraPayments.mockResolvedValue([
        { id: 'ep_1', amount: 5000000, paymentDate: '2026-03-01' },
      ]);

      const req = new Request('https://realrate.ir/api/loans/l_1/extra-payments');
      const res = await handleGetLoanExtraPayments(req, mockEnv, { loanId: 'l_1' });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.count).toBe(1);
      expect(json.extraPayments[0].id).toBe('ep_1');
    });
  });
});

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
} from '../../src/repositories/index.js';
import {
  handleGetLoans,
  handleCreateLoan,
  handleGetLoan,
  handleUpdateLoan,
  handleDeleteLoan,
  handleUpdateInstallment,
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
      expect(dbUnmarkInstallmentPaid).toHaveBeenCalledWith(mockEnv, 'u_1', 'inst_1');
    });
  });
});

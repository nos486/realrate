/**
 * loanRoutes.test.js — The loan routes left on the server: reading and deleting the older
 * plaintext loans (every loan write is refused by lib/encryptionGate.js before a handler runs)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/auth.js', () => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock('../../src/repositories/index.js', () => ({
  dbGetUserLoans: vi.fn(),
  dbGetLoanById: vi.fn(),
  dbDeleteLoan: vi.fn(),
  dbGetLoanExtraPayments: vi.fn(),
}));

import { getAuthenticatedUser } from '../../src/lib/auth.js';
import {
  dbGetUserLoans,
  dbGetLoanById,
  dbDeleteLoan,
  dbGetLoanExtraPayments,
} from '../../src/repositories/index.js';
import {
  handleGetLoans,
  handleGetLoan,
  handleDeleteLoan,
  handleGetLoanExtraPayments,
} from '../../src/handlers/loanRoutes.js';

describe('Loan routes: reading and deleting the older plaintext loans', () => {
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

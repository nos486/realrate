import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/auth.js', () => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock('../../src/repositories/index.js', () => ({
  dbGetUserIncomes: vi.fn(),
  dbCreateIncome: vi.fn(),
  dbUpdateIncome: vi.fn(),
  dbDeleteIncome: vi.fn(),
}));

import { getAuthenticatedUser } from '../../src/lib/auth.js';
import {
  dbGetUserIncomes,
  dbCreateIncome,
  dbUpdateIncome,
  dbDeleteIncome,
} from '../../src/repositories/index.js';
import {
  handleGetIncomes,
  handleCreateIncome,
  handleUpdateIncome,
  handleDeleteIncome,
  parseIncomeInput,
} from '../../src/handlers/incomeRoutes.js';

const jsonRequest = (method, body, path = '/api/incomes') =>
  new Request(`https://realrate.ir${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const validBody = {
  title: 'حقوق مهر',
  category: 'salary',
  amount: 45000000,
  incomeDate: '2026-09-22',
  notes: 'با اضافه‌کاری',
};

describe('Income Routes Handlers (هندلرهای API درآمدها)', () => {
  const mockEnv = {};

  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ userId: 'u_1' });
  });

  describe('Authentication Enforcement', () => {
    it('rejects unauthenticated requests', async () => {
      getAuthenticatedUser.mockResolvedValue(null);
      await expect(handleGetIncomes(new Request('https://realrate.ir/api/incomes'), mockEnv)).rejects.toThrow();
      expect(dbGetUserIncomes).not.toHaveBeenCalled();
    });
  });

  describe('parseIncomeInput', () => {
    it('trims and normalizes a valid body', () => {
      expect(parseIncomeInput({ ...validBody, title: '  حقوق مهر  ' })).toEqual(validBody);
    });

    it('falls back to "other" for unknown categories', () => {
      expect(parseIncomeInput({ ...validBody, category: 'lottery' }).category).toBe('other');
    });

    it.each([
      ['missing title', { ...validBody, title: '   ' }],
      ['zero amount', { ...validBody, amount: 0 }],
      ['negative amount', { ...validBody, amount: -10 }],
      ['non-numeric amount', { ...validBody, amount: 'abc' }],
      ['shamsi date', { ...validBody, incomeDate: '1405/07/01' }],
      ['invalid ISO date', { ...validBody, incomeDate: '2026-13-45' }],
      ['too long title', { ...validBody, title: 'x'.repeat(121) }],
    ])('rejects %s', (_label, body) => {
      expect(() => parseIncomeInput(body)).toThrow();
    });
  });

  describe('GET /api/incomes', () => {
    it('returns the user incomes list', async () => {
      dbGetUserIncomes.mockResolvedValue([{ id: 'inc_1', ...validBody }]);

      const res = await handleGetIncomes(new Request('https://realrate.ir/api/incomes'), mockEnv);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toMatchObject({ success: true, count: 1 });
      expect(dbGetUserIncomes).toHaveBeenCalledWith(mockEnv, 'u_1');
    });
  });

  describe('POST /api/incomes', () => {
    it('creates an income with normalized input', async () => {
      dbCreateIncome.mockResolvedValue({ id: 'inc_1', ...validBody });

      const res = await handleCreateIncome(jsonRequest('POST', validBody), mockEnv);
      expect(res.status).toBe(201);
      expect(dbCreateIncome).toHaveBeenCalledWith(mockEnv, 'u_1', validBody);
      expect((await res.json()).income.id).toBe('inc_1');
    });

    it('does not persist invalid input', async () => {
      await expect(handleCreateIncome(jsonRequest('POST', { ...validBody, amount: 0 }), mockEnv)).rejects.toThrow();
      expect(dbCreateIncome).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/incomes/:id', () => {
    it('updates an existing income', async () => {
      dbUpdateIncome.mockResolvedValue({ id: 'inc_1', ...validBody, amount: 50000000 });

      const res = await handleUpdateIncome(
        jsonRequest('PUT', { ...validBody, amount: 50000000 }, '/api/incomes/inc_1'),
        mockEnv,
        { incomeId: 'inc_1' }
      );
      expect(res.status).toBe(200);
      expect(dbUpdateIncome).toHaveBeenCalledWith(mockEnv, 'u_1', 'inc_1', { ...validBody, amount: 50000000 });
    });

    it('returns not found when the income does not belong to the user', async () => {
      dbUpdateIncome.mockResolvedValue(null);
      await expect(
        handleUpdateIncome(jsonRequest('PUT', validBody, '/api/incomes/inc_x'), mockEnv, { incomeId: 'inc_x' })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('DELETE /api/incomes/:id', () => {
    it('deletes an income', async () => {
      dbDeleteIncome.mockResolvedValue(true);
      const res = await handleDeleteIncome(
        new Request('https://realrate.ir/api/incomes/inc_1', { method: 'DELETE' }),
        mockEnv,
        { incomeId: 'inc_1' }
      );
      expect(res.status).toBe(200);
      expect(dbDeleteIncome).toHaveBeenCalledWith(mockEnv, 'u_1', 'inc_1');
    });

    it('returns not found when nothing was deleted', async () => {
      dbDeleteIncome.mockResolvedValue(false);
      await expect(
        handleDeleteIncome(new Request('https://realrate.ir/api/incomes/inc_x', { method: 'DELETE' }), mockEnv, { incomeId: 'inc_x' })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});

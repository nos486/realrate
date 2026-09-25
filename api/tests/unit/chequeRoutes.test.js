import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/auth.js', () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock('../../src/repositories/index.js', () => ({
  dbGetUserCheques: vi.fn(),
  dbCreateCheque: vi.fn(),
  dbUpdateCheque: vi.fn(),
  dbDeleteCheque: vi.fn(),
}));

import { getAuthenticatedUser } from '../../src/lib/auth.js';
import { dbGetUserCheques, dbCreateCheque, dbUpdateCheque, dbDeleteCheque } from '../../src/repositories/index.js';
import {
  handleGetCheques,
  handleCreateCheque,
  handleUpdateCheque,
  handleDeleteCheque,
} from '../../src/handlers/chequeRoutes.js';

const jsonRequest = (method, body, path = '/api/cheques') =>
  new Request(`https://realrate.ir${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const validBody = {
  direction: 'issued',
  amount: 25000000,
  dueDate: '2026-11-01',
  counterparty: 'فروشگاه لوازم',
  history: [{ status: 'pending', date: '2026-09-25', note: '' }],
};

describe('cheque routes', () => {
  const env = {};

  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ userId: 'u_1' });
  });

  it('requires a signed-in user', async () => {
    getAuthenticatedUser.mockResolvedValue(null);
    await expect(handleGetCheques(new Request('https://realrate.ir/api/cheques'), env)).rejects.toMatchObject({ statusCode: 401 });
    expect(dbGetUserCheques).not.toHaveBeenCalled();
  });

  it('lists the user cheques', async () => {
    dbGetUserCheques.mockResolvedValue([{ id: 'chq_1' }]);
    const res = await handleGetCheques(new Request('https://realrate.ir/api/cheques'), env);
    expect(await res.json()).toMatchObject({ success: true, count: 1 });
    expect(dbGetUserCheques).toHaveBeenCalledWith(env, 'u_1');
  });

  it('creates a normalized cheque', async () => {
    dbCreateCheque.mockImplementation(async (_env, _user, data) => ({ id: 'chq_1', ...data }));
    const res = await handleCreateCheque(jsonRequest('POST', validBody), env);
    expect(res.status).toBe(201);
    const [, userId, data] = dbCreateCheque.mock.calls[0];
    expect(userId).toBe('u_1');
    expect(data).toMatchObject({ direction: 'issued', status: 'pending', amount: 25000000, sayadId: '', bankId: '' });
  });

  it('never persists an invalid cheque', async () => {
    await expect(handleCreateCheque(jsonRequest('POST', { ...validBody, status: 'deposited' }), env))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(handleCreateCheque(jsonRequest('POST', { ...validBody, dueDate: '' }), env))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(dbCreateCheque).not.toHaveBeenCalled();
  });

  it('updates status and log, or 404s for someone else\'s cheque', async () => {
    const body = {
      ...validBody,
      status: 'cleared',
      history: [...validBody.history, { status: 'cleared', date: '2026-11-01', note: 'پاس شد' }],
    };
    dbUpdateCheque.mockResolvedValueOnce({ id: 'chq_1', ...body });
    const res = await handleUpdateCheque(jsonRequest('PUT', body, '/api/cheques/chq_1'), env, { chequeId: 'chq_1' });
    expect(res.status).toBe(200);
    expect(dbUpdateCheque.mock.calls[0][3].history).toHaveLength(2);

    dbUpdateCheque.mockResolvedValueOnce(null);
    await expect(handleUpdateCheque(jsonRequest('PUT', body, '/api/cheques/x'), env, { chequeId: 'x' }))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('deletes a cheque', async () => {
    dbDeleteCheque.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const del = (id) => handleDeleteCheque(new Request(`https://realrate.ir/api/cheques/${id}`, { method: 'DELETE' }), env, { chequeId: id });
    expect((await del('chq_1')).status).toBe(200);
    await expect(del('chq_x')).rejects.toMatchObject({ statusCode: 404 });
  });
});

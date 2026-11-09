/**
 * aiCreate.test.js — The `create` intent of the AI assistant: what makes a cheque or subscription form
 * complete, saving it and taking it back
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const createCheque = vi.fn(async (data) => ({ cheque: { id: 'chq_1', ...data } }));
const deleteCheque = vi.fn(async () => {});
const saveSubscription = vi.fn(async (data) => ({ subscription: { id: 'sub_1', ...data } }));
const deleteSubscription = vi.fn(async () => {});
vi.mock('../../../web/src/shared/vault/vaultCheques.js', () => ({ createCheque: (...a) => createCheque(...a), deleteCheque: (...a) => deleteCheque(...a) }));
vi.mock('../../../web/src/shared/vault/vaultSubscriptions.js', () => ({ saveSubscription: (...a) => saveSubscription(...a), deleteSubscription: (...a) => deleteSubscription(...a) }));

import { createReady, applyCreate, undoCreate } from '../../../web/src/features/ai/aiCreate.js';

const cheque = (data = {}) => ({ type: 'cheque', data: { direction: 'received', counterparty: 'علی', amount: 5000000, dueDate: '2026-12-01', ...data } });
const subscription = (data = {}) => ({ type: 'subscription', data: { name: 'اینترنت', amount: 200000, cycleMonths: 1, startDate: '2026-11-09', autoRenew: true, ...data } });

beforeEach(() => vi.clearAllMocks());

describe('createReady', () => {
  it('needs the required fields, and an amount above zero', () => {
    expect(createReady(cheque())).toBe(true);
    expect(createReady(cheque({ amount: 0 }))).toBe(false);
    expect(createReady(cheque({ counterparty: ' ' }))).toBe(false);
    expect(createReady(subscription({ name: '' }))).toBe(false);
    expect(createReady({ type: 'loan', data: {} })).toBe(false);
  });
});

describe('applyCreate / undoCreate', () => {
  it('saves a cheque and deletes it on undo', async () => {
    const done = await applyCreate(cheque());
    expect(createCheque).toHaveBeenCalledWith(cheque().data);
    await undoCreate(done);
    expect(deleteCheque).toHaveBeenCalledWith('chq_1');
  });
  it('saves a subscription and deletes it on undo', async () => {
    const done = await applyCreate(subscription());
    expect(saveSubscription).toHaveBeenCalledWith(subscription().data);
    await undoCreate(done);
    expect(deleteSubscription).toHaveBeenCalledWith('sub_1');
  });
});

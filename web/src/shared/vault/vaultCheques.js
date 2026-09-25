/**
 * vaultCheques.js — Cheques of an end-to-end encrypted account
 *
 * Same functions and response shapes as the cheques REST API (features/cheques/api/chequeApi.js),
 * with each cheque stored as one encrypted vault record. Validation is the same shared
 * utils/chequeDocument.js the server uses, so both paths accept exactly the same data.
 */

import { validateChequeInput, compareChequesByDue } from '../../utils/chequeDocument.js';
import { todayIso } from '../utils/dates.js';
import { listVaultRecords, putVaultRecord, deleteVaultRecord } from './vaultApi.js';
import { encryptVaultRecord, decryptVaultRecord } from './vaultStore.js';

const KIND = 'cheque';

class ChequeValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function parse(body) {
  const { value, error } = validateChequeInput(body, { today: todayIso() });
  if (error) throw new ChequeValidationError(error);
  return value;
}

function newChequeId() {
  return `chq_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

let cheques = new Map();

async function save(cheque) {
  await putVaultRecord(KIND, cheque.id, await encryptVaultRecord(cheque));
  cheques.set(cheque.id, cheque);
  return cheque;
}

export function clearVaultChequesCache() {
  cheques = new Map();
}

export async function getCheques() {
  const res = await listVaultRecords(KIND);
  const next = new Map();
  for (const record of res?.records || []) {
    const cheque = await decryptVaultRecord(record.payload);
    if (cheque?.id) next.set(record.id, cheque);
    else console.warn('Skipped a cheque that could not be decrypted:', record.id);
  }
  cheques = next;
  const list = [...cheques.values()].sort(compareChequesByDue);
  return { success: true, count: list.length, cheques: list };
}

export async function createCheque(chequeData) {
  const now = new Date().toISOString();
  const cheque = { id: newChequeId(), ...parse(chequeData), createdAt: now, updatedAt: now };
  return { success: true, cheque: await save(cheque) };
}

export async function updateCheque(chequeId, chequeData) {
  if (!cheques.has(chequeId)) await getCheques();
  const existing = cheques.get(chequeId);
  if (!existing) throw new ChequeValidationError('چک مورد نظر یافت نشد.', 404);
  const cheque = { ...existing, ...parse(chequeData), updatedAt: new Date().toISOString() };
  return { success: true, cheque: await save(cheque) };
}

export async function deleteCheque(chequeId) {
  await deleteVaultRecord(KIND, chequeId);
  cheques.delete(chequeId);
  return { success: true };
}

/**
 * chequeApi.js — Cheques Feature API Calls
 *
 * Plaintext accounts use the REST API; with account-wide end-to-end encryption on, cheques are
 * encrypted vault records handled in the browser (same signatures and response shapes).
 */

import { httpClient } from '../../../shared/api/httpClient.js';
import { routeThroughVault } from '../../../shared/vault/vaultRouting.js';
import * as vaultCheques from '../../../shared/vault/vaultCheques.js';

/**
 * @typedef {object} ChequeInput
 * @property {'received'|'issued'} direction
 * @property {string} status - see CHEQUE_STATUSES in utils/chequeDocument.js
 * @property {number} amount - Toman
 * @property {string} dueDate - Gregorian ISO date (YYYY-MM-DD)
 * @property {string} [issueDate]
 * @property {string} counterparty - drawer (received) or payee (issued)
 * @property {string} [bankId]
 * @property {string} [bankName]
 * @property {string} [chequeNumber]
 * @property {string} [sayadId] - 16 digits
 * @property {string} [notes]
 * @property {Array<{status: string, date: string, note: string}>} [history] - tracking log
 */

const getChequesRest = () => httpClient.get('/api/cheques');

/** @param {ChequeInput} chequeData */
const createChequeRest = (chequeData) => httpClient.post('/api/cheques', chequeData);

/** @param {string} chequeId @param {ChequeInput} chequeData */
function updateChequeRest(chequeId, chequeData) {
  if (!chequeId) throw new Error('شناسه چک الزامی است');
  return httpClient.put(`/api/cheques/${encodeURIComponent(chequeId)}`, chequeData);
}

/** @param {string} chequeId */
function deleteChequeRest(chequeId) {
  if (!chequeId) throw new Error('شناسه چک الزامی است');
  return httpClient.delete(`/api/cheques/${encodeURIComponent(chequeId)}`);
}

export const {
  getCheques,
  createCheque,
  updateCheque,
  deleteCheque,
} = routeThroughVault(
  {
    getCheques: getChequesRest,
    createCheque: createChequeRest,
    updateCheque: updateChequeRest,
    deleteCheque: deleteChequeRest,
  },
  vaultCheques
);

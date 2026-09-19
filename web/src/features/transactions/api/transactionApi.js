/**
 * transactionApi.js — API client for portfolio transactions
 */

import { httpClient } from '../../../shared/api/httpClient.js';

export async function getTransactions(portfolioId) {
  if (!portfolioId) return { success: true, transactions: [] };
  return httpClient.get(`/api/portfolios/${encodeURIComponent(portfolioId)}/transactions`);
}

export async function createTransaction(portfolioId, transactionData) {
  if (!portfolioId) throw new Error("شناسه پورتفو الزامی است.");
  return httpClient.post(`/api/portfolios/${encodeURIComponent(portfolioId)}/transactions`, transactionData);
}

export async function updateTransaction(portfolioId, transactionId, transactionData) {
  if (!portfolioId || !transactionId) throw new Error("شناسه پورتفو و تراکنش الزامی است.");
  return httpClient.put(
    `/api/portfolios/${encodeURIComponent(portfolioId)}/transactions?id=${encodeURIComponent(transactionId)}`,
    transactionData
  );
}

export async function deleteTransaction(portfolioId, transactionId) {
  if (!portfolioId || !transactionId) throw new Error("شناسه پورتفو و تراکنش الزامی است.");
  return httpClient.delete(
    `/api/portfolios/${encodeURIComponent(portfolioId)}/transactions?id=${encodeURIComponent(transactionId)}`
  );
}

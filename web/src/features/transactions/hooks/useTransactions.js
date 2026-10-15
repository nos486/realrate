/**
 * useTransactions.js — A portfolio's transactions, end-to-end encrypted
 *
 * Every transaction is a vault record of its portfolio, encrypted with the portfolio's own key
 * (unwrapped by the account vault: usePortfolioVaultKey). Decrypted and encrypted here only.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  resolveAssetDisplayName,
  resolveAssetUnit,
  resolveCategory,
} from '../../../config/sourceRegistry.js';
import { useAuth } from '../../auth/index.js';
import { usePortfolioVaultKey } from '../../../shared/vault/usePortfolioVaultKey.js';
import {
  listPortfolioTransactions,
  savePortfolioTransaction,
  deletePortfolioTransactionRecord,
} from '../../../shared/vault/vaultPortfolioItems.js';
import { t } from '../../../utils/i18n.js';

/** Display fields shown with every transaction (from the asset id) */
function withDisplayFields(tx) {
  const cat = resolveCategory(tx.assetId, tx.assetType);
  return {
    ...tx,
    assetName: resolveAssetDisplayName(tx.assetId, tx),
    assetType: cat,
    category: cat,
    unit: resolveAssetUnit(tx.assetId, tx),
  };
}

/** The stored fields of a transaction from a form */
function payloadOf(txData) {
  return {
    assetId: txData.assetId,
    transactionType: txData.transactionType || 'buy',
    quantity: Number(txData.quantity) || 0,
    unitPrice: Number(txData.unitPrice) || 0,
    transactionDate: txData.transactionDate || '',
    notes: txData.notes || '',
    referenceAssetId: txData.referenceAssetId || '',
    referenceQuantity: Number(txData.referenceQuantity) || 0,
  };
}

/**
 * @param {object|null} activePortfolio
 * @param {CryptoKey|null} [externalVaultKey] the portfolio's key, when the caller has it already
 * @param {{ from?: string, enabled?: boolean }} [options] from: only transactions dated on or
 *   after it (YYYY-MM-DD; filtered on the server); enabled: false loads nothing
 */
export function useTransactions(activePortfolio, externalVaultKey = null, { from = '', enabled = true } = {}) {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const portfolioId = activePortfolio?.id || null;
  const { key: accountKey } = usePortfolioVaultKey(activePortfolio);
  const activeVaultKey = portfolioId ? (externalVaultKey || accountKey) : null;
  const isVaultLocked = Boolean(portfolioId && !activeVaultKey);

  // Only the newest fetch may write state: a slow response for a portfolio the user already
  // switched away from must not overwrite the current one's transactions.
  const fetchSeqRef = useRef(0);
  const loadedPortfolioIdRef = useRef(null);

  const fetchTransactions = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    const isStale = () => seq !== fetchSeqRef.current;

    if (!user || !portfolioId || !enabled || !activeVaultKey) {
      loadedPortfolioIdRef.current = null;
      setTransactions([]);
      setLoadingTransactions(false);
      return;
    }

    // Don't keep showing the previous portfolio's rows while the new one loads
    if (loadedPortfolioIdRef.current !== portfolioId) {
      setTransactions([]);
    }

    try {
      setLoadingTransactions(true);
      const list = await listPortfolioTransactions(activePortfolio, activeVaultKey, from ? { from } : {});
      if (isStale()) return;
      loadedPortfolioIdRef.current = portfolioId;
      setTransactions(list.map(withDisplayFields));
    } catch (err) {
      if (isStale()) return;
      console.error('Failed to fetch transactions:', err);
      setTransactions([]);
    } finally {
      if (!isStale()) setLoadingTransactions(false);
    }
  }, [user, portfolioId, activeVaultKey, activePortfolio, from, enabled]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const requireKey = () => {
    if (isVaultLocked) throw new Error(t('پورتفو قفل است، ابتدا آن را باز کنید.'));
  };

  const addTransaction = async (txData) => {
    requireKey();
    if (!portfolioId) return null;
    setSubmitting(true);
    try {
      const res = await savePortfolioTransaction(activePortfolio, activeVaultKey, null, {
        ...payloadOf(txData),
        createdAt: txData.createdAt || new Date().toISOString(),
      });
      if (res?.success) {
        await fetchTransactions();
        return res.transaction;
      }
      return null;
    } finally {
      setSubmitting(false);
    }
  };

  const updateTransaction = async (id, txData) => {
    requireKey();
    if (!portfolioId || !id) return null;
    setSubmitting(true);
    try {
      const existing = transactions.find((tx) => tx.id === id);
      const res = await savePortfolioTransaction(activePortfolio, activeVaultKey, id, {
        ...payloadOf(txData),
        createdAt: existing?.createdAt,
      });
      if (res?.success) {
        await fetchTransactions();
        return res.transaction;
      }
      return null;
    } finally {
      setSubmitting(false);
    }
  };

  const deleteTransaction = async (id) => {
    requireKey();
    if (!portfolioId || !id) return false;
    setDeletingId(id);
    try {
      const res = await deletePortfolioTransactionRecord(portfolioId, id);
      if (res?.success) {
        setTransactions((prev) => prev.filter((tx) => tx.id !== id));
        return true;
      }
      return false;
    } finally {
      setDeletingId(null);
    }
  };

  return {
    transactions,
    loadingTransactions,
    submitting,
    deletingId,
    activeVaultKey,
    isVaultLocked,
    fetchTransactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
  };
}

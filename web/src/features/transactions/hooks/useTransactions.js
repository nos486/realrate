/**
 * useTransactions.js — Hook for managing portfolio transactions with Zero-Knowledge E2EE
 *
 * Encrypts transaction details before saving to the Cloudflare D1 backend.
 * Decrypts transactions client-side using the active vault key derived from PBKDF2.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getTransactions,
  createTransaction,
  updateTransaction as apiUpdateTransaction,
  deleteTransaction as apiDeleteTransaction,
} from '../api/transactionApi.js';
import {
  e2eeEncrypt,
  e2eeDecrypt,
  deriveE2eeKey,
  verifyE2eeKey,
  getVaultPassphraseFromSession,
} from '../../../lib/e2ee.js';
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
import { markLegacyVaultUnlocked } from '../../../shared/vault/vaultStore.js';
import { toIsoDay } from '../../../shared/vault/vaultRecordMeta.js';

/** Display fields shown with every transaction (from the asset id) */
export function withDisplayFields(tx) {
  const cat = resolveCategory(tx.assetId, tx.assetType);
  return {
    ...tx,
    assetName: resolveAssetDisplayName(tx.assetId, tx),
    assetType: cat,
    category: cat,
    unit: resolveAssetUnit(tx.assetId, tx),
  };
}

/**
 * @param {object|null} activePortfolio
 * @param {CryptoKey|null} [externalVaultKey]
 * @param {{ from?: string, enabled?: boolean }} [options] from: only transactions dated on or
 *   after it (YYYY-MM-DD; filtered on the server for encrypted portfolios); enabled: false loads nothing
 */
export function useTransactions(activePortfolio, externalVaultKey = null, { from = '', enabled = true } = {}) {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  // Counts saved changes (add / edit / delete), for views that fetch the same data another way
  const [changeCount, setChangeCount] = useState(0);

  // Key restored from the session-cached passphrase when the caller has none. It is tagged
  // with the portfolio it belongs to, so switching portfolios can never reuse another
  // portfolio's key (which would encrypt new transactions with the wrong key).
  const [restoredVault, setRestoredVault] = useState({ portfolioId: null, key: null });

  const portfolioId = activePortfolio?.id || null;
  // Portfolios under the account-wide vault get their key from it
  const { accountManaged, key: accountKey } = usePortfolioVaultKey(activePortfolio);
  const isE2eePortfolio = Boolean(portfolioId && (activePortfolio?.isE2ee || accountManaged));
  const restoredKey =
    isE2eePortfolio &&
    restoredVault.portfolioId === portfolioId &&
    // Locking the vault clears the cached passphrase — honour that immediately
    getVaultPassphraseFromSession(portfolioId)
      ? restoredVault.key
      : null;
  const activeVaultKey = isE2eePortfolio ? (externalVaultKey || accountKey || restoredKey) : null;
  const isVaultLocked = Boolean(isE2eePortfolio && !activeVaultKey);

  // Try to restore the vault key from session storage if the portfolio is E2EE
  useEffect(() => {
    if (!isE2eePortfolio || externalVaultKey || accountKey || restoredVault.portfolioId === portfolioId) return;

    const cachedPass = getVaultPassphraseFromSession(portfolioId);
    if (!cachedPass || !activePortfolio.e2eeSalt || !activePortfolio.e2eeVerifier) return;

    let cancelled = false;
    deriveE2eeKey(cachedPass, activePortfolio.e2eeSalt)
      .then(async (derivedKey) => {
        const valid = await verifyE2eeKey(derivedKey, activePortfolio.e2eeVerifier);
        if (valid && !cancelled) {
          setRestoredVault({ portfolioId, key: derivedKey });
          markLegacyVaultUnlocked();
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activePortfolio, portfolioId, isE2eePortfolio, externalVaultKey, accountKey, restoredVault.portfolioId]);

  // Only the newest fetch may write state: a slow response for a portfolio the user already
  // switched away from must not overwrite the current one's transactions.
  const fetchSeqRef = useRef(0);
  const loadedPortfolioIdRef = useRef(null);

  // Fetch and decrypt transactions
  const fetchTransactions = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    const isStale = () => seq !== fetchSeqRef.current;

    if (!user || !portfolioId || !enabled) {
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

      // Account vault: every transaction is an encrypted vault record of this portfolio
      if (accountManaged && activeVaultKey) {
        const list = await listPortfolioTransactions(activePortfolio, activeVaultKey, from ? { from } : {});
        if (isStale()) return;
        loadedPortfolioIdRef.current = portfolioId;
        setTransactions(list.map(withDisplayFields));
        return;
      }

      const res = await getTransactions(portfolioId);
      if (isStale()) return;

      if (res && res.success && Array.isArray(res.transactions)) {
        const rawList = res.transactions;

        const decryptedList = await Promise.all(
          rawList.map(async (tx) => {
            const rawCipher = tx.encryptedPayload || tx.encrypted_payload || '';
            if (typeof rawCipher === 'string' && rawCipher.startsWith('enc:e2ee:v1:')) {
              if (activeVaultKey) {
                const dec = await e2eeDecrypt(activeVaultKey, rawCipher);
                if (dec && typeof dec === 'object') {
                  return {
                    ...tx,
                    ...dec,
                    isEncrypted: true,
                    rawEncrypted: rawCipher,
                  };
                }
              }
              // If vault locked, keep basic metadata but flag as encrypted
              return {
                ...tx,
                isEncrypted: true,
                isLocked: true,
                rawEncrypted: rawCipher,
              };
            }

            // Unencrypted / plaintext JSON payload (for non-E2EE portfolios)
            if (typeof rawCipher === 'string') {
              try {
                const parsed = JSON.parse(rawCipher);
                return { ...tx, ...parsed, isEncrypted: false };
              } catch {
                return { ...tx, isEncrypted: false };
              }
            } else if (typeof rawCipher === 'object') {
              return { ...tx, ...rawCipher, isEncrypted: false };
            }

            return tx;
          })
        );

        if (isStale()) return;
        loadedPortfolioIdRef.current = portfolioId;

        if (isE2eePortfolio && !activeVaultKey) {
          setTransactions([]);
        } else {
          const inRange = from
            ? decryptedList.filter((tx) => toIsoDay(tx.transactionDate || tx.date) >= from)
            : decryptedList;
          setTransactions(inRange.map((tx) => (tx.isLocked ? tx : withDisplayFields(tx))));
        }
      } else {
        loadedPortfolioIdRef.current = portfolioId;
        setTransactions([]);
      }
    } catch (err) {
      if (isStale()) return;
      console.error('Failed to fetch transactions:', err);
      setTransactions([]);
    } finally {
      if (!isStale()) setLoadingTransactions(false);
    }
  }, [user, portfolioId, isE2eePortfolio, activeVaultKey, accountManaged, activePortfolio, from, enabled]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Add transaction
  const addTransaction = async (txData) => {
    if (isVaultLocked) {
      throw new Error("پورتفو قفل است، ابتدا آن را باز کنید.");
    }
    if (!activePortfolio?.id) return null;
    setSubmitting(true);
    try {
      const payloadData = {
        assetId: txData.assetId,
        transactionType: txData.transactionType || 'buy',
        quantity: Number(txData.quantity) || 0,
        unitPrice: Number(txData.unitPrice) || 0,
        transactionDate: txData.transactionDate || '',
        notes: txData.notes || '',
        referenceAssetId: txData.referenceAssetId || '',
        referenceQuantity: Number(txData.referenceQuantity) || 0,
      };

      let res;
      if (accountManaged && activeVaultKey) {
        res = await savePortfolioTransaction(activePortfolio, activeVaultKey, null, {
          ...payloadData,
          createdAt: txData.createdAt || new Date().toISOString(),
        });
      } else {
        const encryptedPayload = isE2eePortfolio && activeVaultKey
          ? await e2eeEncrypt(activeVaultKey, payloadData)
          : JSON.stringify(payloadData);
        res = await createTransaction(activePortfolio.id, {
          encryptedPayload,
          createdAt: txData.createdAt || new Date().toISOString(),
        });
      }

      if (res && res.success) {
        await fetchTransactions();
        setChangeCount((n) => n + 1);
        return res.transaction;
      }
      return null;
    } finally {
      setSubmitting(false);
    }
  };

  // Update transaction
  const updateTransaction = async (id, txData) => {
    if (isVaultLocked) {
      throw new Error("پورتفو قفل است، ابتدا آن را باز کنید.");
    }
    if (!activePortfolio?.id || !id) return null;
    setSubmitting(true);
    try {
      const payloadData = {
        assetId: txData.assetId,
        transactionType: txData.transactionType || 'buy',
        quantity: Number(txData.quantity) || 0,
        unitPrice: Number(txData.unitPrice) || 0,
        transactionDate: txData.transactionDate || '',
        notes: txData.notes || '',
        referenceAssetId: txData.referenceAssetId || '',
        referenceQuantity: Number(txData.referenceQuantity) || 0,
      };

      let res;
      if (accountManaged && activeVaultKey) {
        const existing = transactions.find((t) => t.id === id);
        res = await savePortfolioTransaction(activePortfolio, activeVaultKey, id, {
          ...payloadData,
          createdAt: existing?.createdAt,
        });
      } else {
        const encryptedPayload = isE2eePortfolio && activeVaultKey
          ? await e2eeEncrypt(activeVaultKey, payloadData)
          : JSON.stringify(payloadData);
        res = await apiUpdateTransaction(activePortfolio.id, id, { encryptedPayload });
      }

      if (res && res.success) {
        await fetchTransactions();
        setChangeCount((n) => n + 1);
        return res.transaction;
      }
      return null;
    } finally {
      setSubmitting(false);
    }
  };

  // Delete transaction
  const deleteTransaction = async (id) => {
    if (isVaultLocked) {
      throw new Error("پورتفو قفل است، ابتدا آن را باز کنید.");
    }
    if (!activePortfolio?.id || !id) return false;
    setDeletingId(id);
    try {
      const res = accountManaged
        ? await deletePortfolioTransactionRecord(activePortfolio.id, id)
        : await apiDeleteTransaction(activePortfolio.id, id);
      if (res && res.success) {
        setTransactions((prev) => prev.filter((t) => t.id !== id));
        setChangeCount((n) => n + 1);
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
    changeCount,
    fetchTransactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
  };
}

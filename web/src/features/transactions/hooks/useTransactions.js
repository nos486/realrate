/**
 * useTransactions.js — Hook for managing portfolio transactions with Zero-Knowledge E2EE
 *
 * Encrypts transaction details before saving to the Cloudflare D1 backend.
 * Decrypts transactions client-side using the active vault key derived from PBKDF2.
 */

import { useState, useEffect, useCallback } from 'react';
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
import { useAuth } from '../../auth/index.js';

export function useTransactions(activePortfolio, externalVaultKey = null) {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Internal vault key state if not provided externally
  const [internalVaultKey, setInternalVaultKey] = useState(null);

  const activeVaultKey = externalVaultKey || internalVaultKey;
  const isVaultLocked = Boolean(
    activePortfolio?.isE2ee && activePortfolio?.id && !activeVaultKey
  );

  // Try to restore vault key from session storage if portfolio is E2EE
  useEffect(() => {
    if (externalVaultKey) {
      setInternalVaultKey(externalVaultKey);
      return;
    }

    if (activePortfolio?.isE2ee && activePortfolio?.id && !internalVaultKey) {
      const cachedPass = getVaultPassphraseFromSession(activePortfolio.id);
      if (cachedPass && activePortfolio.e2eeSalt && activePortfolio.e2eeVerifier) {
        deriveE2eeKey(cachedPass, activePortfolio.e2eeSalt)
          .then(async (derivedKey) => {
            const valid = await verifyE2eeKey(derivedKey, activePortfolio.e2eeVerifier);
            if (valid) {
              setInternalVaultKey(derivedKey);
            }
          })
          .catch(() => {});
      }
    }
  }, [activePortfolio, externalVaultKey, internalVaultKey]);

  // Fetch and decrypt transactions
  const fetchTransactions = useCallback(async () => {
    if (!user || !activePortfolio?.id) {
      setTransactions([]);
      setLoadingTransactions(false);
      return;
    }

    try {
      setLoadingTransactions(true);
      const res = await getTransactions(activePortfolio.id);

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

        if (activePortfolio?.isE2ee && !activeVaultKey) {
          setTransactions([]);
        } else {
          setTransactions(decryptedList);
        }
      } else {
        setTransactions([]);
      }
    } catch (err) {
      console.error('Failed to fetch transactions:', err);
      setTransactions([]);
    } finally {
      setLoadingTransactions(false);
    }
  }, [user, activePortfolio?.id, activeVaultKey]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Add transaction
  const addTransaction = async (txData) => {
    if (!activePortfolio?.id) return null;
    setSubmitting(true);
    try {
      const payloadData = {
        assetId: txData.assetId,
        assetName: txData.assetName,
        assetType: txData.assetType || 'custom',
        unit: txData.unit || 'واحد',
        transactionType: txData.transactionType || 'buy',
        quantity: Number(txData.quantity) || 0,
        unitPrice: Number(txData.unitPrice) || 0,
        transactionDate: txData.transactionDate || '',
        notes: txData.notes || '',
      };

      let encryptedPayload;
      if (activePortfolio.isE2ee && activeVaultKey) {
        encryptedPayload = await e2eeEncrypt(activeVaultKey, payloadData);
      } else {
        encryptedPayload = JSON.stringify(payloadData);
      }

      const res = await createTransaction(activePortfolio.id, {
        encryptedPayload,
        createdAt: txData.createdAt || new Date().toISOString(),
      });

      if (res && res.success) {
        await fetchTransactions();
        return res.transaction;
      }
      return null;
    } finally {
      setSubmitting(false);
    }
  };

  // Update transaction
  const updateTransaction = async (id, txData) => {
    if (!activePortfolio?.id || !id) return null;
    setSubmitting(true);
    try {
      const payloadData = {
        assetId: txData.assetId,
        assetName: txData.assetName,
        assetType: txData.assetType || 'custom',
        unit: txData.unit || 'واحد',
        transactionType: txData.transactionType || 'buy',
        quantity: Number(txData.quantity) || 0,
        unitPrice: Number(txData.unitPrice) || 0,
        transactionDate: txData.transactionDate || '',
        notes: txData.notes || '',
      };

      let encryptedPayload;
      if (activePortfolio.isE2ee && activeVaultKey) {
        encryptedPayload = await e2eeEncrypt(activeVaultKey, payloadData);
      } else {
        encryptedPayload = JSON.stringify(payloadData);
      }

      const res = await apiUpdateTransaction(activePortfolio.id, id, {
        encryptedPayload,
      });

      if (res && res.success) {
        await fetchTransactions();
        return res.transaction;
      }
      return null;
    } finally {
      setSubmitting(false);
    }
  };

  // Delete transaction
  const deleteTransaction = async (id) => {
    if (!activePortfolio?.id || !id) return false;
    setDeletingId(id);
    try {
      const res = await apiDeleteTransaction(activePortfolio.id, id);
      if (res && res.success) {
        setTransactions((prev) => prev.filter((t) => t.id !== id));
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
    setInternalVaultKey,
    fetchTransactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
  };
}

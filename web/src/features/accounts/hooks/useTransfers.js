/**
 * useTransfers.js — Money moved between the user's own accounts, and changes to it
 *
 * Loads the transfers of a date range ({ from, to }, inclusive YYYY-MM-DD) — nothing without the
 * `bank_accounts` feature or while the vault is locked.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../auth/index.js';
import { useVault } from '../../../shared/vault/useVault.js';
import { useFeature } from '../../../shared/features/useFeature.js';
import { compareTransfers } from '../../../utils/transferDocument.js';
import * as api from '../../../shared/vault/vaultTransfers.js';

export function useTransfers(range = {}) {
  const { user } = useAuth();
  const enabled = useFeature('bank_accounts');
  const { status: vaultStatus, epoch: vaultEpoch } = useVault();
  const vaultLocked = vaultStatus === 'locked';
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const { from = '', to = '' } = range;

  const fetchTransfers = useCallback(async () => {
    if (!user || !enabled || vaultLocked) {
      setTransfers([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      setTransfers((await api.getTransfers({ from, to })).transfers);
    } catch (err) {
      setError(err.message || 'خطا در بارگذاری انتقال‌ها');
    } finally {
      setLoading(false);
    }
    // vaultEpoch: reload after unlocking
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, enabled, vaultLocked, vaultEpoch, from, to]);

  useEffect(() => {
    fetchTransfers();
  }, [fetchTransfers]);

  /** Errors are re-thrown so the open form can show them */
  const saveTransfer = useCallback(async (input, existing = null) => {
    setSubmitting(true);
    try {
      const { transfer } = await api.saveTransfer(input, existing);
      setTransfers((prev) => [...prev.filter((t) => t.id !== transfer.id), transfer].sort(compareTransfers));
      return transfer;
    } finally {
      setSubmitting(false);
    }
  }, []);

  const deleteTransfer = useCallback(async (id) => {
    await api.deleteTransfer(id);
    setTransfers((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { transfers, loading, submitting, error, fetchTransfers, saveTransfer, deleteTransfer };
}

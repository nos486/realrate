/**
 * usePortfolioLayout.js — Hook to load, save and manage custom portfolio category layouts
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  loadPortfolioLayout,
  savePortfolioLayoutRecord,
  deletePortfolioLayoutRecord,
} from '../../../shared/vault/vaultPortfolioLayout.js';
import { normalizePortfolioLayout } from '../portfolioLayoutModel.js';

const SAVE_DELAY_MS = 600;

export function usePortfolioLayout(portfolio, activeVaultKey, isVaultLocked) {
  const portfolioId = portfolio?.id || null;
  const [layout, setLayoutState] = useState(null);
  const [recordId, setRecordId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saveError, setSaveError] = useState('');

  const timerRef = useRef(null);
  const pendingRef = useRef(undefined);
  const recordIdRef = useRef(null);

  useEffect(() => {
    recordIdRef.current = recordId;
  }, [recordId]);

  // Load layout when portfolio or vault key changes
  useEffect(() => {
    if (!portfolioId || !activeVaultKey || isVaultLocked) {
      setLayoutState(null);
      setRecordId(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setSaveError('');

    loadPortfolioLayout(portfolioId, activeVaultKey)
      .then((res) => {
        if (cancelled) return;
        setLayoutState(res.layout);
        setRecordId(res.recordId);
      })
      .catch((err) => {
        if (cancelled) return;
        setSaveError(err.message || 'خطا در دریافت چیدمان دسته‌ها');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [portfolioId, activeVaultKey, isVaultLocked]);

  const flush = useCallback(async () => {
    clearTimeout(timerRef.current);
    const next = pendingRef.current;
    if (next === undefined) return;
    pendingRef.current = undefined;

    if (!portfolioId || !activeVaultKey) return;

    try {
      if (next === null) {
        if (recordIdRef.current) {
          await deletePortfolioLayoutRecord(recordIdRef.current);
          setRecordId(null);
        }
      } else {
        const res = await savePortfolioLayoutRecord(portfolioId, activeVaultKey, next, recordIdRef.current);
        if (res?.recordId) setRecordId(res.recordId);
      }
      setSaveError('');
    } catch (err) {
      setSaveError(err.message || 'ذخیره چیدمان دسته‌بندی‌ها ناموفق بود.');
    }
  }, [portfolioId, activeVaultKey]);

  // Flush pending changes on unmount or before portfolio changes
  useEffect(() => () => {
    if (pendingRef.current !== undefined) {
      flush();
    }
  }, [flush]);

  const setLayout = useCallback((next) => {
    const clean = next ? normalizePortfolioLayout(next) : null;
    setLayoutState(clean);
    pendingRef.current = clean;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, SAVE_DELAY_MS);
  }, [flush]);

  const resetLayout = useCallback(async () => {
    clearTimeout(timerRef.current);
    pendingRef.current = undefined;
    setLayoutState(null);
    if (recordIdRef.current) {
      try {
        await deletePortfolioLayoutRecord(recordIdRef.current);
      } catch {
        // Ignored
      }
      setRecordId(null);
    }
  }, []);

  return {
    layout,
    isCustomized: Boolean(layout && layout.groups && layout.groups.length > 0),
    loading,
    saveError,
    setLayout,
    resetLayout,
    flush,
  };
}

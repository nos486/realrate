/**
 * useDashboardLayout.js — The signed-in user's widget dashboard (the home page layout)
 *
 * The layout is one encrypted vault record (utils/dashboardLayout.js), read once the vault is
 * open; an edit shows at once, is kept in this browser (so the page keeps its arrangement while
 * the vault is locked) and is saved shortly after as the encrypted record. `widgets` is the list
 * of the screen being arranged (the wide screen's, or the app frame's); a screen never arranged
 * gets the default.
 */

import { t } from '../../utils/i18n.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/index.js';
import { useVault } from '../../shared/vault/useVault.js';
import { listVaultRecords, deleteVaultRecord } from '../../shared/vault/vaultApi.js';
import { putRecord } from '../../shared/vault/vaultRecordMeta.js';
import { encryptVaultRecord, decryptVaultRecord } from '../../shared/vault/vaultStore.js';
import {
  DASHBOARD_RECORD_KIND,
  DASHBOARD_RECORD_ID,
  sanitizeDashboard,
  widgetsOf,
  withScreen,
  hasSavedScreen,
} from '../../utils/dashboardLayout.js';

const CACHE_PREFIX = 'realrate_dashboard_';
const SAVE_DELAY_MS = 700;

function readCache(userId) {
  try {
    return sanitizeDashboard(JSON.parse(localStorage.getItem(CACHE_PREFIX + userId) || 'null'));
  } catch {
    return null;
  }
}

function writeCache(userId, dashboard) {
  try {
    if (dashboard) localStorage.setItem(CACHE_PREFIX + userId, JSON.stringify(dashboard));
    else localStorage.removeItem(CACHE_PREFIX + userId);
  } catch {
    // Storage full or blocked: the encrypted record still applies
  }
}

/**
 * @param {'wide'|'desktop'|'tablet'|'mobile'} screen - the list being shown and arranged (one per column count)
 */
export function useDashboardLayout(screen) {
  const { user } = useAuth();
  const { status: vaultStatus, epoch } = useVault();
  const userId = user?.id || null;
  const unlocked = vaultStatus === 'unlocked';
  const [state, setState] = useState(() => ({ userId, dashboard: userId ? readCache(userId) : null }));
  const [saveError, setSaveError] = useState('');
  const timerRef = useRef(null);
  // Set while an edit is waiting to be saved: a read finishing meanwhile must not overwrite it
  const pendingRef = useRef(undefined);
  // Set by the first edit of this visit: the stored copy a read brings is older than the edit
  const editedRef = useRef(false);

  const dashboard = state.userId === userId ? state.dashboard : (userId ? readCache(userId) : null);

  useEffect(() => {
    if (!userId || !unlocked) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await listVaultRecords(DASHBOARD_RECORD_KIND, { silent: true });
        const record = (res?.records || []).find((r) => r.id === DASHBOARD_RECORD_ID) || res?.records?.[0];
        if (cancelled || editedRef.current || !record) return;
        const plain = await decryptVaultRecord(record.payload);
        const stored = sanitizeDashboard(plain);
        if (cancelled || editedRef.current || !stored) return;
        writeCache(userId, stored);
        setState({ userId, dashboard: stored });
      } catch {
        // Offline or not readable: the copy kept in this browser applies
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, unlocked, epoch]);

  const flush = useCallback(async () => {
    clearTimeout(timerRef.current);
    const next = pendingRef.current;
    if (next === undefined) return;
    pendingRef.current = undefined;
    try {
      if (next === null) {
        await deleteVaultRecord(DASHBOARD_RECORD_KIND, DASHBOARD_RECORD_ID, { silent: true }).catch((err) => {
          if (err?.status !== 404) throw err;
        });
      } else {
        const record = { id: DASHBOARD_RECORD_ID, ...next };
        await putRecord(DASHBOARD_RECORD_KIND, DASHBOARD_RECORD_ID, await encryptVaultRecord(record), record, { silent: true });
      }
      setSaveError('');
    } catch (err) {
      setSaveError(err?.message || t('ذخیره چیدمان صفحه اصلی ناموفق بود.'));
    }
  }, []);

  // Whatever is pending is saved when leaving the page
  useEffect(() => () => {
    if (pendingRef.current !== undefined) flush();
  }, [flush]);

  const commit = useCallback((next) => {
    editedRef.current = true;
    setState({ userId, dashboard: next });
    writeCache(userId, next);
    pendingRef.current = next;
    clearTimeout(timerRef.current);
    // The vault must be open to encrypt: the edit waits (and is kept in the browser meanwhile)
    if (unlocked) timerRef.current = setTimeout(flush, SAVE_DELAY_MS);
  }, [userId, unlocked, flush]);

  // An edit made while the vault was locked is saved once it opens
  useEffect(() => {
    if (unlocked && pendingRef.current !== undefined) flush();
  }, [unlocked, flush]);

  const widgets = widgetsOf(dashboard, screen);

  return {
    widgets,
    /** Replace this screen's widgets */
    setWidgets: (next) => commit(withScreen(dashboard, screen, next)),
    /** Back to the default arrangement of this screen */
    resetScreen: () => {
      const rest = { ...dashboard, [screen]: null };
      commit(hasSavedScreen(rest) ? { ...rest, updatedAt: new Date().toISOString() } : null);
    },
    isCustomized: Boolean(dashboard?.[screen]),
    saveError,
  };
}

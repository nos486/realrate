import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { listCustomBanks, createCustomBank, deleteCustomBank } from './bankApi.js';

/**
 * The user's custom banks, fetched once and shared by every component that needs them
 * (loan form, loans list, chart — and bank accounts later).
 */
let state = { banks: [], loaded: false, loading: false, error: null };
let inflight = null;
// Bumped on reset so a request started for the previous user can't repopulate the cache
let generation = 0;
const listeners = new Set();

function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function load(force = false) {
  if (inflight || (state.loaded && !force)) return inflight;
  const gen = generation;
  setState({ loading: true, error: null });
  inflight = listCustomBanks()
    .then((res) => {
      if (gen === generation) setState({ banks: Array.isArray(res?.banks) ? res.banks : [], loaded: true });
    })
    .catch((err) => {
      if (gen === generation) setState({ error: err.message || 'خطا در دریافت بانک‌های سفارشی' });
    })
    .finally(() => {
      if (gen !== generation) return;
      inflight = null;
      setState({ loading: false });
    });
  return inflight;
}

/** The user's custom banks, loading them first if needed (for non-React callers) */
export async function ensureCustomBanks() {
  if (!state.loaded) await load();
  return state.banks;
}

/** Drop the cache (e.g. on logout) so the next user starts clean */
export function resetCustomBanks() {
  generation++;
  inflight = null;
  state = { banks: [], loaded: false, loading: false, error: null };
  listeners.forEach((fn) => fn());
}

export function useCustomBanks() {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => state);

  useEffect(() => {
    load();
  }, []);

  const addBank = useCallback(async (name) => {
    const res = await createCustomBank(name);
    const bank = res?.bank;
    if (bank && !state.banks.some((b) => b.id === bank.id)) {
      setState({ banks: [...state.banks, bank] });
    }
    return bank;
  }, []);

  const removeBank = useCallback(async (id) => {
    await deleteCustomBank(id);
    setState({ banks: state.banks.filter((b) => b.id !== id) });
  }, []);

  return {
    customBanks: snapshot.banks,
    loading: snapshot.loading,
    error: snapshot.error,
    addBank,
    removeBank,
    reload: () => load(true),
  };
}

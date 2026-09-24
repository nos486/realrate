import { useSyncExternalStore } from 'react';
import { subscribeVault, getVaultState } from './vaultStore.js';

/**
 * Account vault state for React: `{ status, vault, error, epoch }`.
 * status: 'idle' | 'loading' | 'off' | 'locked' | 'unlocked' | 'error'.
 * `epoch` changes whenever encrypted data may look different (unlock, lock, migration) —
 * include it in data-fetching dependencies.
 */
export function useVault() {
  return useSyncExternalStore(subscribeVault, getVaultState, getVaultState);
}

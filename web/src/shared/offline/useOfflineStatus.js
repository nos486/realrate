import { useSyncExternalStore } from 'react';
import { subscribeOffline, getOfflineState } from './offlineSync.js';

/** Connection and sync state for the UI: { active, ready, online, syncing, pending, lastSyncAt } */
export function useOfflineStatus() {
  return useSyncExternalStore(subscribeOffline, getOfflineState, getOfflineState);
}

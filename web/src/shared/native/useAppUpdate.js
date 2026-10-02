import { useEffect, useState } from 'react';
import { getAppUpdateState, getAppUpdateSettings, APP_UPDATE_EVENT } from './appUpdate.js';

/** The app update's state and settings, kept up to date (Android app) */
export function useAppUpdate() {
  const [snapshot, setSnapshot] = useState(() => ({ ...getAppUpdateState(), settings: getAppUpdateSettings() }));
  useEffect(() => {
    const refresh = () => setSnapshot({ ...getAppUpdateState(), settings: getAppUpdateSettings() });
    window.addEventListener(APP_UPDATE_EVENT, refresh);
    return () => window.removeEventListener(APP_UPDATE_EVENT, refresh);
  }, []);
  return snapshot;
}

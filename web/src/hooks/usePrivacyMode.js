import { useState, useEffect } from 'react';

const STORAGE_KEY = 'realrate_hide_values';
const CHANGE_EVENT = 'realrate_privacy_change';

function readHideValues() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Turn the app-wide "hide values" mode on or off. Persists the choice and notifies every
 * mounted usePrivacyMode() consumer.
 * @param {boolean} hideValues
 */
export function setPrivacyMode(hideValues) {
  try {
    localStorage.setItem(STORAGE_KEY, String(hideValues));
  } catch {
    // Storage unavailable (private mode) — the in-memory event below still syncs this tab
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { hideValues } }));
}

/**
 * usePrivacyMode — follows the app-wide "hide values" toggle (see setPrivacyMode) so amounts
 * can be masked with "****". Stays in sync across components (custom event) and tabs (storage).
 * @returns {boolean} hideValues
 */
export function usePrivacyMode() {
  const [hideValues, setHideValues] = useState(readHideValues);

  useEffect(() => {
    const handleChange = (e) => {
      if (typeof e?.detail?.hideValues === 'boolean') {
        setHideValues(e.detail.hideValues);
      } else {
        setHideValues(readHideValues());
      }
    };
    window.addEventListener(CHANGE_EVENT, handleChange);
    window.addEventListener('storage', handleChange);
    return () => {
      window.removeEventListener(CHANGE_EVENT, handleChange);
      window.removeEventListener('storage', handleChange);
    };
  }, []);

  return hideValues;
}

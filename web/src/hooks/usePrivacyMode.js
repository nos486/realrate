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
 * usePrivacyMode — follows the app-wide "hide values" toggle (set from the Header) so amounts
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

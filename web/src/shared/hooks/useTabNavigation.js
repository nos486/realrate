/**
 * useTabNavigation.js — Moving between the app's top-level tabs like a native app
 *
 * From the home page a tab is a step forward (back returns home). Between tabs the current one
 * is replaced, so back still returns home instead of walking through every tab visited. The home
 * tab goes back to the home page's history entry rather than stacking another copy. So back from
 * home leaves the app.
 *
 * The home page's place in history is the router's entry index (history.state.idx), kept in
 * sessionStorage so it survives the page remounting between routes.
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { afterLeavingOverlayEntries } from './useBackToClose.js';

const HOME_INDEX_KEY = 'realrate_home_history_index';
const historyIndex = () => Number(window.history.state?.idx) || 0;

function readHomeIndex() {
  try {
    const raw = sessionStorage.getItem(HOME_INDEX_KEY);
    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
}

function writeHomeIndex(index) {
  try {
    sessionStorage.setItem(HOME_INDEX_KEY, String(index));
  } catch {
    // Without it the home tab replaces the page instead of going back
  }
}

/**
 * @param {boolean} onHome whether the home tab is the one showing
 * @param {string} homePath the home tab's path
 * @returns {(path: string) => void} go to a tab's path
 */
export function useTabNavigation(onHome, homePath) {
  const navigate = useNavigate();
  return useCallback((path) => {
    afterLeavingOverlayEntries(() => {
      const here = historyIndex();
      if (path === homePath) {
        const home = readHomeIndex();
        if (home !== null && home < here) navigate(home - here);
        else navigate(path, { replace: true });
      } else if (onHome) {
        writeHomeIndex(here);
        navigate(path);
      } else {
        navigate(path, { replace: true });
      }
    });
  }, [navigate, onHome, homePath]);
}

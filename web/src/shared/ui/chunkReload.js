/**
 * chunkReload.js — A lazy page whose file is gone (a new version was deployed while the app was
 * open): reload the app once to fetch the new version (shared/ui/ErrorBoundary.jsx)
 */

const RELOADED_KEY = 'realrate_chunk_reload';

/** A lazy chunk that couldn't be loaded (the browsers word it differently) */
export const isChunkLoadError = (error) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk/i
    .test(String(error?.message || error));

/** The app has been running fine for a while: a later missing chunk may reload again */
export function forgetChunkReload() {
  try {
    sessionStorage.removeItem(RELOADED_KEY);
  } catch { /* storage unavailable */ }
}

/** Reload once for a missing chunk (not again and again if the new version fails too) */
export function reloadOnceForNewVersion() {
  try {
    if (sessionStorage.getItem(RELOADED_KEY)) return false;
    sessionStorage.setItem(RELOADED_KEY, '1');
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

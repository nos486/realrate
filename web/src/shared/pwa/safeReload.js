/**
 * safeReload.js — Reload the page for a new version only when nothing the user is doing is lost
 *
 * Used by the web version check (versionCheck.js) and by the Android web bundle (webBundle.js).
 * A reload is held back while a dialog is open or a text field has focus; it is tried again when
 * the focus leaves a field, when the page goes to the background or comes back, and after a click
 * (a dialog may just have closed). No timers poll for the right moment.
 */

const EDITABLE = 'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=range]), textarea, select, [contenteditable=""], [contenteditable="true"]';
const OPEN_DIALOG = 'dialog[open], [role="dialog"], [aria-modal="true"]';

/** True when a reload now would not lose unsaved input */
export function isSafeToReload(doc = typeof document === 'undefined' ? null : document) {
  if (!doc) return false;
  if (doc.querySelector(OPEN_DIALOG)) return false;
  const active = doc.activeElement;
  return !(active && active !== doc.body && active.matches?.(EDITABLE));
}

let waiting = null;
const RETRY_EVENTS = ['focusout', 'visibilitychange', 'click'];

/**
 * Runs `reload` as soon as it is safe (now, or at the next chance). Calling again while one is
 * waiting is a no-op.
 * @param {() => void} reload
 * @returns {boolean} true when it ran right away
 */
export function reloadWhenSafe(reload) {
  if (typeof document === 'undefined') return false;
  if (isSafeToReload()) {
    reload();
    return true;
  }
  if (waiting) return false;
  const attempt = () => {
    if (!isSafeToReload()) return;
    stop();
    reload();
  };
  // The new focus / closed dialog settles after the event, so look just after it
  const onEvent = () => setTimeout(attempt, 300);
  const stop = () => {
    RETRY_EVENTS.forEach((name) => document.removeEventListener(name, onEvent, true));
    waiting = null;
  };
  waiting = stop;
  RETRY_EVENTS.forEach((name) => document.addEventListener(name, onEvent, true));
  return false;
}

/** For tests */
export function cancelWaitingReload() {
  waiting?.();
}

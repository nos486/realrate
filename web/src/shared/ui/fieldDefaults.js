/**
 * fieldDefaults.js — Browser-hint defaults shared by every text field (Input, TextField).
 *
 * `autoFocus` must not pop the keyboard on a phone (it is honoured only with a fine pointer, i.e.
 * desktop). Nothing else is forced: `autocomplete="off"` / `spellcheck` hints change how Android
 * keyboards compose text (the typed word shows only once it is finished), so a field passes them
 * only when it sets them itself.
 */

/**
 * True when the primary pointer is fine (mouse/trackpad) — safe to focus a field on mount.
 * @returns {boolean}
 */
export function canAutoFocus() {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;
  } catch {
    return false;
  }
}

/**
 * Default attributes for a text field; explicit props always win.
 * @param {{ autoFocus?: boolean }} props
 * @returns {{ autoFocus: boolean }}
 */
export function fieldDefaults({ autoFocus } = {}) {
  return { autoFocus: Boolean(autoFocus) && canAutoFocus() };
}

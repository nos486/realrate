/**
 * fieldDefaults.js — Browser-hint defaults shared by every text field (Input, TextField).
 *
 * Web Interface Guidelines: non-auth fields opt out of password-manager prompts
 * (`autocomplete="off"`), codes/emails/URLs skip spellcheck, and `autoFocus` must not pop the
 * keyboard on a phone (it is honoured only with a fine pointer, i.e. desktop).
 */

/** Field types whose value is not natural language, so spellcheck only adds noise. */
const NO_SPELLCHECK_TYPES = new Set(['email', 'url', 'tel', 'number', 'password']);

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
 * Default hint attributes for a text field; explicit props always win.
 * @param {{ type?: string, autoComplete?: string, spellCheck?: boolean, autoFocus?: boolean }} props
 * @returns {{ autoComplete: string, spellCheck: boolean, autoFocus: boolean }}
 */
export function fieldDefaults({ type = 'text', autoComplete, spellCheck, autoFocus } = {}) {
  return {
    autoComplete: autoComplete ?? 'off',
    spellCheck: spellCheck ?? !NO_SPELLCHECK_TYPES.has(type),
    autoFocus: Boolean(autoFocus) && canAutoFocus(),
  };
}

/**
 * scrollLock.js — Stops the page behind an overlay from scrolling, for any number of overlays
 *
 * Overlays open and close in any order (a form's modal closes while the limit prompt over it is
 * still open). Each saving "what the overflow was" and putting it back left the page locked when
 * they closed out of order, so the lock is counted: the page is locked while at least one overlay
 * holds it and gets its own overflow back when the last one lets go.
 */

let holders = 0;
let savedOverflow = '';

/**
 * Lock the page's scrolling
 * @returns {() => void} releases this lock (safe to call twice)
 */
export function lockBodyScroll() {
  if (typeof document === 'undefined') return () => {};
  if (holders === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  holders++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders = Math.max(0, holders - 1);
    if (holders === 0) document.body.style.overflow = savedOverflow;
  };
}

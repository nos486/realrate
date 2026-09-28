/**
 * useBackToClose.js — The phone's back button closes what is open on top (a modal, the side
 * menu, a picker) instead of leaving the page, like a native app
 *
 * Opening an overlay adds a history entry for the same URL (a copy of the current state, so
 * the router sees no navigation) tagged with the overlay's id. Back pops it and the overlay
 * closes. An overlay closed any other way (its × button, Escape, a choice) takes its entry out
 * with a silent step back, so the next back press leaves the page as expected. Silent steps are
 * counted, so a navigation that steps off an overlay's entry at the same moment (a tab chosen
 * from the side menu) does not step back twice; an entry left behind anyway (a dead one) is
 * skipped when back passes over it.
 *
 * Overlays stack: back closes the one opened last.
 */

import { useEffect, useRef } from 'react';

/** Overlays that are open, oldest first: { id, close } */
const live = [];
// Increasing across reloads too: entries left in history by an earlier load stay below new ones
let nextId = Date.now();
let listening = false;
// Steps back we started ourselves, whose popstate must not close anything
let silentBacks = 0;
// Overlays opened while a silent step back is on its way: their entry is added once it lands (a
// step back resolves its target when started, so an entry pushed meanwhile would be skipped)
const waitingToPush = [];

function pushEntry(entry) {
  window.history.pushState({ ...(window.history.state || {}), __overlay: entry.id }, '');
}

function goBackSilently() {
  silentBacks++;
  window.history.back();
}

const overlayIdOf = (state) => Number(state?.__overlay) || 0;

function handlePopState(event) {
  if (silentBacks > 0) {
    silentBacks--;
    if (silentBacks === 0) waitingToPush.splice(0).forEach(pushEntry);
    return;
  }
  const arrivedAt = overlayIdOf(event.state);
  // Every open overlay whose entry is now ahead of us was just backed out of: close it
  for (let i = live.length - 1; i >= 0; i--) {
    if (live[i].id > arrivedAt) {
      const [entry] = live.splice(i, 1);
      entry.close();
    }
  }
  // Landed on the entry of an overlay closed some other way: it shows the same page as the entry
  // before it, so go on back — the press still did one visible thing
  if (arrivedAt && !live.some((e) => e.id === arrivedAt)) {
    window.history.back();
  }
}

function ensureListening() {
  if (listening || typeof window === 'undefined') return;
  window.addEventListener('popstate', handlePopState);
  listening = true;
}

/**
 * @param {boolean} isOpen whether the overlay is showing
 * @param {() => void} onClose closes it (called when back is pressed while it is on top)
 */
export function useBackToClose(isOpen, onClose) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return undefined;
    ensureListening();
    const entry = { id: nextId++, close: () => onCloseRef.current?.() };
    live.push(entry);
    if (silentBacks > 0) waitingToPush.push(entry);
    else pushEntry(entry);
    return () => {
      const index = live.indexOf(entry);
      if (index >= 0) live.splice(index, 1);
      const waiting = waitingToPush.indexOf(entry);
      if (waiting >= 0) {
        // Closed before its entry was added: nothing in history to take out
        waitingToPush.splice(waiting, 1);
        return;
      }
      // Closed another way while its entry is current: take the entry out, unless a step back
      // (a navigation leaving the overlay) is already on its way
      if (overlayIdOf(window.history.state) === entry.id && silentBacks === 0) goBackSilently();
    };
  }, [isOpen]);
}

/** Whether the current history entry belongs to an overlay (open or already closed) */
export function isOnOverlayEntry() {
  return typeof window !== 'undefined' && overlayIdOf(window.history.state) > 0;
}

/**
 * Run `fn` once history is back on a page entry (off any overlay's): a navigation that should
 * replace the current page (e.g. switching tabs) must not replace an overlay's entry and leave
 * the page it covered behind in history
 */
export function afterLeavingOverlayEntries(fn) {
  if (!isOnOverlayEntry()) {
    fn();
    return;
  }
  const onPop = () => {
    // Several overlays' entries (nested, or left behind): keep stepping back to the page's
    if (isOnOverlayEntry()) {
      goBackSilently();
      return;
    }
    window.removeEventListener('popstate', onPop);
    fn();
  };
  window.addEventListener('popstate', onPop);
  goBackSilently();
}

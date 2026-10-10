/**
 * calendarMode.js — Which calendar the date pickers show: Shamsi (default) or Gregorian
 *
 * A per-viewer preference (this browser only): switching it in one picker switches every
 * picker on the page, and it is remembered for the next visit. It changes only how a date is
 * shown and picked — the stored dates are the same either way.
 */

import { useSyncExternalStore } from 'react';

export const CALENDAR_SHAMSI = 'shamsi';
export const CALENDAR_GREGORIAN = 'gregorian';

/** The calendars a picker can switch between, in the order they are offered */
export const CALENDAR_OPTIONS = [
  { value: CALENDAR_SHAMSI, label: 'شمسی' },
  { value: CALENDAR_GREGORIAN, label: 'میلادی' },
];

const STORAGE_KEY = 'realrate_calendar_mode';
const listeners = new Set();

function normalize(mode) {
  return mode === CALENDAR_GREGORIAN ? CALENDAR_GREGORIAN : CALENDAR_SHAMSI;
}

function read() {
  try {
    return normalize(localStorage.getItem(STORAGE_KEY));
  } catch {
    return CALENDAR_SHAMSI;
  }
}

let current = read();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  const onStorage = (e) => {
    if (e.key !== STORAGE_KEY) return;
    current = normalize(e.newValue);
    listener();
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

/** @returns {'shamsi'|'gregorian'} the calendar the pickers currently show */
export function getCalendarMode() {
  return current;
}

/**
 * Switch every date picker to a calendar and remember the choice.
 * @param {'shamsi'|'gregorian'} mode
 */
export function setCalendarMode(mode) {
  current = normalize(mode);
  try {
    localStorage.setItem(STORAGE_KEY, current);
  } catch {
    // Blocked storage: kept for this visit only
  }
  emit();
}

/** @returns {['shamsi'|'gregorian', (mode: string) => void]} the current calendar and its setter */
export function useCalendarMode() {
  const mode = useSyncExternalStore(subscribe, getCalendarMode, getCalendarMode);
  return [mode, setCalendarMode];
}

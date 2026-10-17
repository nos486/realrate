/**
 * salaryStore.js — The days the user received salary, which start their «ماه حقوقی» months
 *
 * One encrypted vault record ("salary_month", utils/salaryMonth.js), loaded once the vault is open
 * (useSalaryMonths) and held here. Which month the pages show (the salary's or the calendar's) is
 * a per-device choice kept in localStorage. A change is announced with SALARY_EVENT.
 */

import {
  SALARY_RECORD_KIND,
  SALARY_RECORD_ID,
  validateSalaryMonths,
} from '../../utils/salaryMonth.js';
import { listVaultRecords } from '../vault/vaultApi.js';
import { putRecord } from '../vault/vaultRecordMeta.js';
import { encryptVaultRecord, decryptVaultRecord } from '../vault/vaultStore.js';

export const SALARY_EVENT = 'realrate:salary';
const VIEW_KEY = 'realrate_month_view';

let starts = []; // marked days, newest first
let loadedFor = null; // the vault epoch it was loaded in
let loading = null;

function notify() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SALARY_EVENT));
}

/** The marked days, newest first */
export const listSalaryStarts = () => starts;

/** 'salary' (months start at the salary) or 'calendar'; the salary's by default */
export function getMonthView() {
  try {
    return localStorage.getItem(VIEW_KEY) === 'calendar' ? 'calendar' : 'salary';
  } catch {
    return 'salary';
  }
}

export function setMonthView(view) {
  try {
    localStorage.setItem(VIEW_KEY, view === 'calendar' ? 'calendar' : 'salary');
  } catch {
    // Blocked storage: the choice lasts until the page reloads
  }
  notify();
}

/** Load the record (once per vault opening) */
export function loadSalaryMonths(epoch = 0) {
  if (loadedFor === epoch && !loading) return Promise.resolve(starts);
  if (loading) return loading;
  loading = (async () => {
    try {
      const res = await listVaultRecords(SALARY_RECORD_KIND);
      const record = (res?.records || []).find((r) => r.id === SALARY_RECORD_ID) || res?.records?.[0];
      const plain = record ? await decryptVaultRecord(record.payload) : null;
      starts = plain ? validateSalaryMonths(plain).value?.starts || [] : [];
      loadedFor = epoch;
      notify();
    } catch (err) {
      console.warn('Loading salary days failed:', err);
    } finally {
      loading = null;
    }
    return starts;
  })();
  return loading;
}

/** Forget the days (signed out or vault locked) */
export function resetSalaryMonths() {
  starts = [];
  loadedFor = null;
  notify();
}

/** Save the whole list of marked days */
export async function saveSalaryStarts(days) {
  const { value, error } = validateSalaryMonths({ starts: days });
  if (error) throw new Error(error);
  const record = { id: SALARY_RECORD_ID, ...value, updatedAt: new Date().toISOString() };
  await putRecord(SALARY_RECORD_KIND, SALARY_RECORD_ID, await encryptVaultRecord(record), record);
  starts = value.starts;
  notify();
  return starts;
}

export const addSalaryStart = (day) => saveSalaryStarts([...starts, day]);
export const removeSalaryStart = (day) => saveSalaryStarts(starts.filter((d) => d !== day));

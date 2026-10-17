/**
 * useSalaryMonths.js — The salary days and the month view, kept up to date for a page
 *
 * `activeStarts` is what month ranges take (utils/salaryMonth.js): the marked days while the
 * salary view is on, none (calendar months) otherwise.
 */

import { useEffect, useMemo, useState } from 'react';
import { useVault } from '../vault/useVault.js';
import {
  SALARY_EVENT, loadSalaryMonths, resetSalaryMonths, listSalaryStarts, getMonthView, setMonthView,
  addSalaryStart, removeSalaryStart,
} from './salaryStore.js';

export function useSalaryMonths() {
  const { status, epoch } = useVault();
  const [, setVersion] = useState(0);
  useEffect(() => {
    const refresh = () => setVersion((v) => v + 1);
    window.addEventListener(SALARY_EVENT, refresh);
    return () => window.removeEventListener(SALARY_EVENT, refresh);
  }, []);
  useEffect(() => {
    if (status === 'unlocked') loadSalaryMonths(epoch);
    else if (status === 'locked') resetSalaryMonths();
  }, [status, epoch]);
  const starts = listSalaryStarts();
  const view = getMonthView();
  // A stable array while nothing changed, so ranges memoized on it are not recomputed
  const key = starts.join(',');
  const activeStarts = useMemo(() => (view === 'salary' ? starts : []), [view, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { starts, view, activeStarts, setView: setMonthView, add: addSalaryStart, remove: removeSalaryStart };
}

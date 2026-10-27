/**
 * legendSelection.js — Selectable chart legends: tapping a legend item hides / shows its series
 *
 * Every chart with a legend (donut, pie, stacked and paired bars) keeps the hidden series here
 * and leaves them out of its marks and totals. The last visible series can't be hidden, so a
 * chart never goes blank. `legendItemProps` makes the legend row a toggle button (click, Enter,
 * Space) with the shared on / off look (styles/chart-legend.css).
 */

import { useCallback, useMemo, useState } from 'react';
import { t } from '../../utils/i18n.js';

/**
 * The hidden series of one chart.
 * @param {string[]} keys  The chart's series keys, in legend order
 * @returns {{ hidden: Set<string>, isHidden: (key: string) => boolean, toggle: (key: string) => void,
 *   reset: () => void, anyHidden: boolean, visibleKeys: string[] }}
 */
export function useLegendSelection(keys) {
  const [hiddenState, setHidden] = useState(() => new Set());
  // Keys no longer in the chart (another period, another filter) don't count
  const hidden = useMemo(() => new Set(keys.filter((k) => hiddenState.has(k))), [keys, hiddenState]);
  const visibleKeys = useMemo(() => keys.filter((k) => !hidden.has(k)), [keys, hidden]);

  const toggle = useCallback(
    (key) =>
      setHidden((prev) => {
        const next = new Set([...prev].filter((k) => keys.includes(k)));
        if (next.has(key)) next.delete(key);
        else if (keys.some((k) => k !== key && !next.has(k))) next.add(key);
        return next;
      }),
    [keys],
  );
  const reset = useCallback(() => setHidden(new Set()), []);

  return { hidden, isHidden: (key) => hidden.has(key), toggle, reset, anyHidden: hidden.size > 0, visibleKeys };
}

/**
 * Props that make a legend row (any element) a toggle for its series.
 * @param {ReturnType<typeof useLegendSelection>} selection
 * @param {string} key
 * @param {string} label  The series' name, for screen readers
 */
export function legendItemProps(selection, key, label) {
  const off = selection.isHidden(key);
  return {
    role: 'button',
    tabIndex: 0,
    'aria-pressed': !off,
    'data-legend': off ? 'off' : 'on',
    title: off ? t('نمایش {label}', { label }) : t('پنهان کردن {label}', { label }),
    onClick: () => selection.toggle(key),
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selection.toggle(key);
      }
    },
  };
}

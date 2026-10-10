/**
 * useTradeDayPrice.js — Fills an asset's toman price for a trade's day: today's live price, or the
 * day's close from the price history for a past day (features/market/dailyHistory.js)
 *
 * Used by ReferenceAssetInputs: the asset a trade was paid with. Its price is not stored: it
 * makes the trade's own unit price (what the asset cost, a fact of the trade), which is. A price
 * the user typed is kept until the asset or the trade's date
 * changes; an edited record (autoFill false) keeps its saved price until then too. Without history
 * for that day the live price stands in, and `source` says so.
 */

import { useEffect, useRef, useState } from 'react';
import { priceOnDay } from '../../market/dailyHistory.js';
import { shamsiToGregorian } from '../components/ShamsiDatePicker.jsx';
import { todayIso } from '../../../shared/utils/dates.js';
import { resolveReferencePriceToman } from '../utils/holdingHelpers.js';

/** A form's date (Shamsi as typed, or ISO) → YYYY-MM-DD, or '' */
export function tradeDayIso(date) {
  const s = String(date || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return shamsiToGregorian(s) || '';
}

/**
 * @param {{ assetId: string|null, tradeDate?: string, autoFill?: boolean, pricing: object,
 *   onPrice: (value: string) => void }} options
 * @returns {{ source: null|'live'|'loading'|'history'|'missing', markEdited: () => void,
 *   markAuto: () => void, refill: () => void }}
 */
export function useTradeDayPrice({ assetId, tradeDate = '', autoFill = true, pricing, onPrice }) {
  const day = tradeDayIso(tradeDate);
  const edited = useRef(!autoFill);
  const prevAsset = useRef(assetId || null);
  const prevDay = useRef(day);
  const [source, setSource] = useState(null);
  const [round, setRound] = useState(0);
  const onPriceRef = useRef(onPrice);
  onPriceRef.current = onPrice;

  useEffect(() => {
    if (!assetId) {
      prevAsset.current = null;
      setSource(null);
      return undefined;
    }
    // An asset set from outside (the record being edited) arrives with its date: keep its price
    if (assetId !== prevAsset.current) {
      edited.current = !autoFill;
      prevAsset.current = assetId;
      prevDay.current = day;
    }
    // The trade's date changed: its price, over a typed one
    if (day !== prevDay.current) {
      prevDay.current = day;
      edited.current = false;
    }
    if (edited.current) return undefined;

    const live = resolveReferencePriceToman(assetId, pricing?.priceMap, pricing?.itemMap);
    if (!day || day >= todayIso()) {
      if (live > 0) onPriceRef.current(String(live));
      setSource(live > 0 ? 'live' : null);
      return undefined;
    }
    let cancelled = false;
    setSource('loading');
    priceOnDay(assetId, day).then((value) => {
      if (cancelled || edited.current) return;
      if (value > 0) {
        onPriceRef.current(String(Math.round(value)));
        setSource('history');
      } else {
        if (live > 0) onPriceRef.current(String(live));
        setSource('missing');
      }
    });
    return () => {
      cancelled = true;
    };
    // Re-runs when prices refresh too, so a pick made before the first load still fills
  }, [assetId, day, autoFill, pricing?.priceMap, pricing?.itemMap, round]);

  return {
    source,
    /** The user typed a price: keep it */
    markEdited: () => {
      edited.current = true;
      setSource(null);
    },
    /** A newly picked asset: fill it, also when editing */
    markAuto: (id) => {
      edited.current = false;
      prevAsset.current = id;
      prevDay.current = day;
    },
    /** The refresh button: the day's price again */
    refill: () => {
      edited.current = false;
      setRound((n) => n + 1);
    },
  };
}

/** The line under the price field: where the price came from */
export function tradeDayPriceNote(source) {
  if (source === 'loading') return 'در حال خواندن قیمت آن روز…';
  if (source === 'history') return 'قیمت همان روز، از تاریخچه قیمت';
  if (source === 'missing') return 'قیمت آن روز در تاریخچه نیست؛ قیمت امروز گذاشته شد.';
  return '';
}

/**
 * homeAssets.js — Turn a layout's asset id into what a home card shows, for ANY market asset
 * (gold, coin, currency, crypto, bourse symbol, fund, ...).
 *
 * The price is always the price book's (tomans, the same number everywhere). Gold and coins also
 * carry the calculator's analysis (intrinsic value and bubble at the rates the user entered).
 * A dollar-priced asset (the ounce, oil) shows its dollar price, or — when its card is set to
 * "toman" in the layout — its toman price, with the toman day range, change and chart.
 * What else a card shows comes from its settings in the layout (utils/cardMetrics.js): its main
 * figure (the last price or an average) and a full card's slots — values of the asset itself or of
 * a linked asset (a coin's bubble), all read off the price book.
 */

import { assetOf } from '../market/priceBookAssets.js';
import { ownPriceOf, formatPrice } from '../market/assetPrice.js';
import { usdSeriesKey } from '../../utils/priceBook.js';
import {
  CARD_METRICS,
  MAIN_METRICS,
  cardSlotsOf,
  slotOptionsOf,
  linkedItemId,
  metricValue,
  parseSlotKey,
} from '../../utils/cardMetrics.js';
import { parseFormula, evaluateFormula, formatFormula, formatFormulaValue } from '../../utils/cardFormula.js';

/**
 * Lookup tables built once per data refresh
 * @param {{ itemMap?: object, analysis?: object[] }} data
 */
export function buildAssetIndex({ itemMap = {}, analysis = [] }) {
  return {
    itemMap: itemMap || {},
    analysisById: new Map((analysis || []).map((a) => [String(a.id).toLowerCase(), a])),
  };
}

const tehranDayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' });

/**
 * Today's low / high / first price from the book (only when they are today's, Tehran time)
 * @param {object} params - the item's params
 * @param {object} [range] - where the range is: the params themselves, or a dollar-priced
 *   asset's toman range (`params.toman`)
 */
function dayRangeOf(params, range = params, today = tehranDayFormat.format(new Date())) {
  if (!params || !range || params.day !== today) return null;
  const low = Number(range.dayLow);
  const high = Number(range.dayHigh);
  if (!(low > 0) || !(high > 0)) return null;
  return { low, high, open: Number(range.dayOpen) || null };
}

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * A card's slots as shown: each one's label, the linked asset's name (a slot of a linked asset)
 * and its value; a slot whose value isn't there now shows a dash
 * @param {object} asset - the card's book asset
 * @param {string[]} keys - slot keys
 */
function resolveSlots(asset, keys, index, display) {
  const slots = [];
  for (const key of keys) {
    const parsed = parseSlotKey(key);
    if (!parsed) continue;
    const linkedId = parsed.link ? linkedItemId(asset.id, parsed.link) : null;
    const item = parsed.link ? (linkedId ? assetOf(index.itemMap, linkedId) : null) : asset;
    if (parsed.link && !item) continue;
    const def = CARD_METRICS[parsed.metric];
    const value = metricValue(item, parsed.metric, {
      analysis: index.analysisById.get(item.id) || null,
      display: parsed.link ? null : display,
    });
    slots.push({
      key,
      label: def.label,
      kind: def.kind,
      window: def.window || null,
      linkedName: parsed.link ? item.name : '',
      ...(value || { value: null }),
    });
  }
  return slots;
}

/**
 * A card's main figure when it isn't the last price (an average), else null; `mainMissing` when
 * the chosen average isn't there yet (a newer item)
 */
function resolveMain(asset, main, display) {
  if (!main || main === 'price') return { main: null, mainMissing: '' };
  const value = metricValue(asset, main, { display });
  if (!value) return { main: null, mainMissing: CARD_METRICS[main]?.label || '' };
  return { main: { key: main, label: CARD_METRICS[main].label, window: CARD_METRICS[main].window, ...value }, mainMissing: '' };
}

/**
 * @returns {{ id: string, found: boolean, name?: string, code?: string, flag?: string,
 *   category?: string, badge?: string, price?: number|null, unit?: string, perUnit?: string,
 *   note?: string, sourceName?: string, changePercent?: number|null, stale?: boolean,
 *   staleSince?: string|null, analysis?: object|null, dayRange?: { low: number, high: number, open: number|null }|null,
 *   searchText?: string, usdPriced?: boolean, display?: 'usd'|'toman'|null, updatedAt?: string|null,
 *   main?: object|null, mainMissing?: string, slots?: Array<object> }}
 * @param {string} id
 * @param {object} index - buildAssetIndex()
 * @param {'usd'|'toman'} [display] - how the card shows a dollar-priced asset (the layout's)
 * @param {{ main?: string, slots?: string[] }} [card] - the card's settings (the layout's `cards`)
 */
export function resolveHomeAsset(id, index, display, card = null) {
  const asset = assetOf(index.itemMap, id);
  if (!asset) return { id, found: false };
  const analysis = index.analysisById.get(asset.id) || null;
  // Its own price: a dollar-priced asset (the ounce, oil) in dollars, the rest in tomans
  const own = ownPriceOf(asset);
  const usdPriced = own.currency === 'usd';
  const base = {
    id: asset.id,
    found: true,
    name: asset.name,
    code: String(asset.code || asset.symbol || '').toUpperCase(),
    flag: asset.flag || '',
    category: asset.category || '',
    badge: asset.badge || '',
    price: num(own.value),
    currency: own.currency,
    // تومان, or دلار for a dollar-priced asset; `perUnit` is what one unit is (گرم, اونس, بشکه, …)
    unit: own.unit,
    perUnit: asset.unit || '',
    // The history its chart reads: a dollar-priced asset's dollar closes (`${id}@usd`)
    seriesId: own.currency === 'usd' ? usdSeriesKey(asset.id) : asset.id,
    note: asset.subText || '',
    sourceName: asset.sourceName || '',
    changePercent: num(asset.changePercent),
    stale: Boolean(asset.stale),
    staleSince: asset.staleSince || asset.updatedAt || null,
    analysis,
    dayRange: dayRangeOf(asset.params),
    searchText: asset.searchText || String(asset.name || '').toLowerCase(),
    // A dollar-priced asset's card can be set to show it in tomans (the layout's `display`)
    usdPriced,
    display: usdPriced ? 'usd' : null,
  };
  const shownIn = usdPriced && display === 'toman' && own.toman > 0 ? 'toman' : null;
  const extras = {
    // When its source last gave it (the card says «۳۰ دقیقه پیش»)
    updatedAt: asset.updatedAt || null,
    ...resolveMain(asset, card?.main, shownIn),
    // Chosen slots show a dash while a value isn't there; the default ones only what they have
    slots: resolveSlots(asset, cardSlotsOf(card?.slots, analysis), index, shownIn)
      .filter((slot) => Array.isArray(card?.slots) || slot.value !== null),
  };
  if (!shownIn) return { ...base, ...extras };
  // In tomans: the toman price large, the dollar one under it; the toman range, change
  // (`params.toman`, kept by the sync) and history (the item's own id)
  const toman = asset.params?.toman || null;
  return {
    ...base,
    ...extras,
    display: 'toman',
    price: own.toman,
    currency: 'toman',
    unit: 'تومان',
    seriesId: asset.id,
    note: `≈ ${formatPrice(own.value, 'usd')} دلار`,
    changePercent: num(toman?.changePercent),
    dayRange: dayRangeOf(asset.params, toman),
  };
}

/**
 * What a card can be set to show (the card settings): its main figures (the last price, and each
 * average it has) and its slot options — its own metrics and its linked assets', with the
 * linked asset's name
 * @param {string} id
 * @param {object} index - buildAssetIndex()
 * @param {'usd'|'toman'|null} [display] - a dollar-priced asset shown in tomans
 */
export function cardOptionsOf(id, index, display = null) {
  const asset = assetOf(index.itemMap, id);
  if (!asset) return { main: [], slots: [] };
  const shownIn = display === 'toman' ? 'toman' : null;
  const main = MAIN_METRICS
    .map((key) => ({ key, label: CARD_METRICS[key].label, ...(metricValue(asset, key, { display: shownIn }) || { value: null }) }))
    .filter((m) => m.key === 'price' || m.value !== null);
  const slots = slotOptionsOf(asset.id, (linkedId) => assetOf(index.itemMap, linkedId), {
    analysisOf: (linkedId) => index.analysisById.get(linkedId) || null,
    display: shownIn,
  }).map((o) => ({ ...o, linkedName: o.linkedId ? assetOf(index.itemMap, o.linkedId)?.name || o.linkedId : '' }));
  return { main, slots };
}

/**
 * A card the user built with a formula (utils/cardFormula.js): its value at the book's prices
 * (tomans), its formula as read ("x / (y - x)") with which asset each letter is, and when it was
 * last updated — as fresh as its stalest asset
 * @param {string} id - the card's id (fx_…)
 * @param {{ name: string, expr: string, vars: Record<string, string>, format: string }} formula
 * @param {object} index - buildAssetIndex()
 */
export function resolveFormulaCard(id, formula, index) {
  const parsed = parseFormula(formula?.expr);
  if (!parsed.ok) return { id, found: false };
  const vars = parsed.vars.map((key) => {
    const asset = assetOf(index.itemMap, formula.vars?.[key]);
    return {
      key,
      id: asset?.id || formula.vars?.[key] || '',
      name: asset?.name || formula.vars?.[key] || '',
      price: Number(asset?.price) > 0 ? Number(asset.price) : null,
      updatedAt: asset?.updatedAt || null,
      stale: Boolean(asset?.stale),
    };
  });
  const value = evaluateFormula(parsed.tree, Object.fromEntries(vars.map((v) => [v.key, v.price])));
  const times = vars.map((v) => Date.parse(v.updatedAt || '')).filter(Number.isFinite);
  return {
    id,
    found: true,
    name: formula.name,
    formula: { tree: parsed.tree, expr: parsed.expr, text: formatFormula(parsed.expr), format: formula.format, stats: formula.stats || null, vars },
    value,
    valueText: formatFormulaValue(value, formula.format),
    updatedAt: times.length ? new Date(Math.min(...times)).toISOString() : null,
    stale: vars.some((v) => v.stale),
    staleSince: null,
    searchText: [formula.name, ...vars.map((v) => v.name)].join(' ').toLowerCase(),
    slots: [],
  };
}

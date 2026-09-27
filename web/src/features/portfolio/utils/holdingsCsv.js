/**
 * holdingsCsv.js — The portfolio's CSV file: writing it (CsvExportButton) and reading it back
 * (CsvImportButton). Both sides use the same headers, so an exported file imports again.
 */

import { parseInputNumber, resolveAssetDisplayName } from './holdingHelpers.js';
import { CANONICAL_ASSET_REGISTRY } from '../../../utils/financialSpecs.js';

/**
 * The portfolio as CSV text (UTF-8 BOM, CRLF rows). CsvImportButton reads the same headers back,
 * so an exported file can be imported again.
 */
export function buildHoldingsCsv(items = []) {
  const headers = [
    'نام دارایی',
    'دسته‌بندی',
    'نوع',
    'مقدار',
    'واحد',
    'قیمت خرید (تومان)',
    'سرمایه اولیه (تومان)',
    'ارزش روز واحد (تومان)',
    'ارزش روز کل (تومان)',
    'سود/زیان (تومان)',
    'درصد بازدهی',
    'تاریخ خرید',
    'یادداشت',
    'شناسه سیستمی',
    'منبع',
    'دارایی مرجع (پرداخت/تهاتر)',
    'شناسه دارایی مرجع',
    'مقدار دارایی مرجع',
    'دارایی مقایسه',
    'شناسه دارایی مقایسه',
    'قیمت دارایی مقایسه در روز خرید (تومان)',
    'ارزش امروز در صورت خرید دارایی مقایسه (تومان)'
  ];

  const escapeCSV = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = items.map((item) => {
    const row = [
      escapeCSV(item.assetName || item.name || item.assetId),
      escapeCSV(item.category || item.assetType || 'سفارشی'),
      escapeCSV(item.assetType || item.category || 'custom'),
      escapeCSV(item.amount),
      escapeCSV(item.unit),
      escapeCSV(item.hasBuyPrice ? item.buyPrice : ''),
      escapeCSV(item.hasBuyPrice ? item.itemCost : ''),
      escapeCSV(item.unitRealPrice),
      escapeCSV(item.itemRealVal),
      escapeCSV(item.hasBuyPrice ? item.itemPnl : ''),
      escapeCSV(item.hasBuyPrice && item.itemPnlPct !== null && item.itemPnlPct !== undefined ? item.itemPnlPct.toFixed(1) + '%' : ''),
      escapeCSV(item.buyDate || ''),
      escapeCSV(item.notes || ''),
      escapeCSV(item.assetId || ''),
      escapeCSV(item.source === 'transactions' ? 'تراکنش‌ها' : 'دستی'),
      escapeCSV(item.referenceAssetId ? resolveAssetDisplayName(item.referenceAssetId) : ''),
      escapeCSV(item.referenceAssetId || ''),
      escapeCSV(item.referenceAssetId && item.referenceQuantity > 0 ? item.referenceQuantity : ''),
      escapeCSV(item.compareAssetId ? resolveAssetDisplayName(item.compareAssetId) : ''),
      escapeCSV(item.compareAssetId || ''),
      escapeCSV(item.compareAssetId && item.comparePriceToman > 0 ? item.comparePriceToman : ''),
      escapeCSV(item.comparePnlInfo ? Math.round(item.comparePnlInfo.compareCurrentValue) : '')
    ];
    return row.join(',');
  });

  return '\uFEFF' + [headers.map(escapeCSV).join(','), ...rows].join('\r\n');
}

// Column headers must mirror buildHoldingsCsv exactly so the exported file round-trips.
export const HEADERS = {
  name: 'نام دارایی',
  category: 'دسته‌بندی',
  amount: 'مقدار',
  buyPrice: 'قیمت خرید (تومان)',
  currentPrice: 'ارزش روز واحد (تومان)',
  buyDate: 'تاریخ خرید',
  notes: 'یادداشت',
  assetId: 'شناسه سیستمی',
  source: 'منبع',
  referenceAssetId: 'شناسه دارایی مرجع',
  referenceQuantity: 'مقدار دارایی مرجع',
  compareAssetId: 'شناسه دارایی مقایسه',
  comparePriceToman: 'قیمت دارایی مقایسه در روز خرید (تومان)',
};

// Exact-name → canonical assetId lookup, used only as a best-effort fallback for CSVs
// that predate the "شناسه سیستمی" column (or were hand-edited without it).
const NAME_TO_ID = (() => {
  const map = new Map();
  Object.values(CANONICAL_ASSET_REGISTRY).forEach((spec) => {
    if (spec && spec.name && spec.id && !map.has(spec.name)) {
      map.set(spec.name, spec.id);
    }
  });
  return map;
})();

// RFC4180-ish CSV parser: handles quoted fields, "" escaped quotes, and embedded newlines/commas.
export function parseCsvText(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const len = text.length;
  while (i < len) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (c === '\r') {
      i += 1;
      continue;
    }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function buildRows(headerIndex, dataRows) {
  const get = (row, key) => {
    const i = headerIndex[HEADERS[key]];
    return i !== undefined && row[i] !== undefined ? String(row[i]) : '';
  };
  const hasSourceCol = headerIndex[HEADERS.source] !== undefined;

  return dataRows
    .map((row, i) => {
      if (row.length === 0 || (row.length === 1 && !row[0].trim())) return null;

      const name = get(row, 'name').trim();
      const source = get(row, 'source').trim();
      const amount = parseInputNumber(get(row, 'amount'));

      if (!name && (amount === null || amount === undefined)) return null;

      if (hasSourceCol && source.includes('تراکنش')) {
        return { status: 'skipped', name: name || `ردیف ${i + 2}` };
      }

      if (!amount || amount <= 0) {
        return { status: 'invalid', name: name || `ردیف ${i + 2}` };
      }

      let assetId = get(row, 'assetId').trim();
      let isFallback = false;
      if (!assetId) {
        const matchedId = name ? NAME_TO_ID.get(name) : null;
        if (matchedId) {
          assetId = matchedId;
        } else {
          assetId = `custom_${Date.now()}_${i}`;
          isFallback = true;
        }
      }

      const buyPrice = parseInputNumber(get(row, 'buyPrice')) || 0;
      const customPrice = parseInputNumber(get(row, 'currentPrice')) || 0;
      const buyDate = get(row, 'buyDate').trim();
      let notes = get(row, 'notes').trim();
      if (isFallback && name) {
        notes = notes ? `${notes} — نام اصلی: ${name}` : `نام اصلی: ${name}`;
      }

      // Paid/swapped with another asset (see ReferenceAssetInputs) — buyPrice above already
      // reflects the resulting Toman cost basis, so these are just carried through verbatim
      // for display/editing; nothing needs to be recomputed.
      const referenceAssetIdRaw = get(row, 'referenceAssetId').trim();
      const referenceQuantityRaw = parseInputNumber(get(row, 'referenceQuantity'));
      const hasReference = Boolean(referenceAssetIdRaw) && referenceQuantityRaw > 0;
      // "What if I had bought this instead" (see CompareAssetInputs)
      const compareAssetIdRaw = get(row, 'compareAssetId').trim();
      const comparePriceRaw = parseInputNumber(get(row, 'comparePriceToman'));
      const hasCompare = Boolean(compareAssetIdRaw) && comparePriceRaw > 0;

      return {
        status: isFallback ? 'custom' : 'ok',
        name: name || assetId,
        holding: {
          assetId,
          amount,
          buyPrice,
          buyDate,
          notes,
          customPrice,
          referenceAssetId: hasReference ? referenceAssetIdRaw : '',
          referenceQuantity: hasReference ? referenceQuantityRaw : 0,
          compareAssetId: hasCompare ? compareAssetIdRaw : '',
          comparePriceToman: hasCompare ? Math.round(comparePriceRaw) : 0,
        },
      };
    })
    .filter(Boolean);
}

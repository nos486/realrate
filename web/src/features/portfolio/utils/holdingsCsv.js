/**
 * holdingsCsv.js — The portfolio's CSV file: writing it (CsvExportButton) and reading it back
 * (CsvImportButton). Both sides use the same headers, so an exported file imports again.
 *
 * One row per entry of each asset's ledger (utils/assetLedger.js), in date order: «خرید» (a
 * purchase with a price), «موجودی» (one without), «فروش» and «پرداخت هزینه» (an expense paid
 * with the asset), with what is left of each purchase and each entry's own profit or loss.
 * Reading it back: purchases and holdings become the buy side's records, sales become sales;
 * expense payments are skipped — they belong to their expenses (the full backup restores them).
 * Files of older versions (one row per manual holding, no «نوع ثبت») still import.
 */

import { parseInputNumber, resolveAssetDisplayName } from './holdingHelpers.js';
import { CANONICAL_ASSET_REGISTRY } from '../../../utils/financialSpecs.js';

const KIND_LABEL = { buy: 'خرید', holding: 'موجودی', sell: 'فروش', spend: 'پرداخت هزینه' };
const kindOfEntry = (entry) => (entry.kind === 'manual' ? (entry.price > 0 ? 'buy' : 'holding') : entry.kind);

export const LEDGER_HEADERS = [
  'نوع ثبت',
  'نام دارایی',
  'شناسه سیستمی',
  'دسته‌بندی',
  'واحد',
  'مقدار',
  'قیمت واحد (تومان)',
  'تاریخ',
  'یادداشت',
  'قیمت دستی دارایی (تومان)',
  'مانده از این خرید',
  'سود/زیان این ثبت (تومان)',
  'ارزش روز واحد (تومان)',
  'دارایی مرجع (پرداخت/تهاتر)',
  'شناسه دارایی مرجع',
  'مقدار دارایی مرجع',
  'دارایی مقایسه',
  'شناسه دارایی مقایسه',
  'قیمت دارایی مقایسه در روز خرید (تومان)',
];

const escapeCSV = (val) => {
  if (val === null || val === undefined) return '""';
  return `"${String(val).replace(/"/g, '""')}"`;
};

/**
 * The portfolio as CSV text (UTF-8 BOM, CRLF rows): every entry of every asset's ledger
 * @param {object[]} assets buildAssetLedgers(...).assets
 */
export function buildHoldingsCsv(assets = []) {
  const rows = [];
  for (const asset of assets) {
    // What each purchase realized when sales and spends took from it
    const realizedByLot = new Map();
    for (const e of asset.entries || []) {
      for (const c of e.consumed || []) if (c.pnl !== null) realizedByLot.set(c.lotId, (realizedByLot.get(c.lotId) || 0) + c.pnl);
    }
    for (const entry of asset.entries || []) {
      const kind = kindOfEntry(entry);
      const record = entry.record || {};
      const incoming = kind === 'buy' || kind === 'holding';
      let pnl = '';
      if (incoming && entry.price > 0) {
        const open = entry.remaining > 0 ? entry.remaining * ((asset.unitRealPrice || 0) - entry.price) : 0;
        pnl = Math.round(open + (realizedByLot.get(entry.id) || 0));
      } else if (!incoming && entry.pnl !== null && entry.pnl !== undefined) {
        pnl = Math.round(entry.pnl);
      }
      const hasReference = record.referenceAssetId && Number(record.referenceQuantity) > 0;
      // The compared asset's price is read from the history by date; a typed one is exported
      const hasCompare = Boolean(record.compareAssetId);
      rows.push([
        KIND_LABEL[kind] || kind,
        asset.assetName || asset.assetId,
        asset.assetId || '',
        asset.category || asset.assetType || 'custom',
        asset.unit || '',
        entry.qty,
        entry.price > 0 ? entry.price : '',
        entry.date || '',
        kind === 'spend' ? '' : (record.notes || ''),
        Number(record.customPrice || record.currentPrice) > 0 ? Number(record.customPrice || record.currentPrice) : '',
        incoming ? entry.remaining : '',
        pnl,
        asset.unitRealPrice || '',
        hasReference ? resolveAssetDisplayName(record.referenceAssetId) : '',
        hasReference ? record.referenceAssetId : '',
        hasReference ? record.referenceQuantity : '',
        hasCompare ? resolveAssetDisplayName(record.compareAssetId) : '',
        hasCompare ? record.compareAssetId : '',
        hasCompare && Number(record.comparePriceToman) > 0 ? record.comparePriceToman : '',
      ].map(escapeCSV).join(','));
    }
  }
  return '\uFEFF' + [LEDGER_HEADERS.map(escapeCSV).join(','), ...rows].join('\r\n');
}

// Each field's column: this version's header first, then older versions'
export const HEADERS = {
  kind: ['نوع ثبت'],
  name: ['نام دارایی'],
  category: ['دسته‌بندی'],
  amount: ['مقدار'],
  price: ['قیمت واحد (تومان)', 'قیمت خرید (تومان)'],
  customPrice: ['قیمت دستی دارایی (تومان)'],
  currentPrice: ['ارزش روز واحد (تومان)'],
  date: ['تاریخ', 'تاریخ خرید'],
  notes: ['یادداشت'],
  assetId: ['شناسه سیستمی'],
  source: ['منبع'],
  referenceAssetId: ['شناسه دارایی مرجع'],
  referenceQuantity: ['مقدار دارایی مرجع'],
  compareAssetId: ['شناسه دارایی مقایسه'],
  comparePriceToman: ['قیمت دارایی مقایسه در روز خرید (تومان)'],
};

/** Whether a file is of this version (one row per ledger entry) */
export const isLedgerFile = (headerIndex) => headerIndex[HEADERS.kind[0]] !== undefined;

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
    const i = HEADERS[key].map((h) => headerIndex[h]).find((idx) => idx !== undefined);
    return i !== undefined && row[i] !== undefined ? String(row[i]) : '';
  };
  const ledger = isLedgerFile(headerIndex);
  const hasSourceCol = headerIndex[HEADERS.source[0]] !== undefined;
  const kindOf = (label) => Object.keys(KIND_LABEL).find((k) => KIND_LABEL[k] === label.trim()) || null;

  return dataRows
    .map((row, i) => {
      if (row.length === 0 || (row.length === 1 && !row[0].trim())) return null;

      const name = get(row, 'name').trim();
      const amount = parseInputNumber(get(row, 'amount'));
      if (!name && (amount === null || amount === undefined)) return null;
      const label = name || `ردیف ${i + 2}`;

      // This version: the entry's kind; older files: every row is a manual holding (rows that
      // were computed from transactions are skipped)
      let kind = 'buy';
      if (ledger) {
        kind = kindOf(get(row, 'kind'));
        if (!kind) return { status: 'invalid', name: label };
        if (kind === 'spend') return { status: 'skipped', name: label };
      } else if (hasSourceCol && get(row, 'source').includes('تراکنش')) {
        return { status: 'skipped', name: label };
      }

      if (!amount || amount <= 0) return { status: 'invalid', name: label };

      let assetId = get(row, 'assetId').trim();
      let isFallback = false;
      if (!assetId) {
        const matchedId = name ? NAME_TO_ID.get(name) : null;
        if (matchedId) assetId = matchedId;
        else {
          assetId = `custom_${Date.now()}_${i}`;
          isFallback = true;
        }
      }

      const price = parseInputNumber(get(row, 'price')) || 0;
      const date = get(row, 'date').trim();
      let notes = get(row, 'notes').trim();
      if (isFallback && name) notes = notes ? `${notes} — نام اصلی: ${name}` : `نام اصلی: ${name}`;
      // Paid / swapped with another asset, and "what if I had bought this instead": carried as they are
      const referenceAssetIdRaw = get(row, 'referenceAssetId').trim();
      const referenceQuantityRaw = parseInputNumber(get(row, 'referenceQuantity'));
      const hasReference = Boolean(referenceAssetIdRaw) && referenceQuantityRaw > 0;
      const compareAssetIdRaw = get(row, 'compareAssetId').trim();
      const comparePriceRaw = parseInputNumber(get(row, 'comparePriceToman'));
      const hasCompare = Boolean(compareAssetIdRaw);

      if (kind === 'sell') {
        if (!(price > 0) || !date) return { status: 'invalid', name: label };
        return {
          status: isFallback ? 'custom' : 'ok',
          kind: 'sell',
          name: label,
          transaction: {
            assetId,
            transactionType: 'sell',
            quantity: amount,
            unitPrice: price,
            transactionDate: date,
            notes,
            referenceAssetId: hasReference ? referenceAssetIdRaw : '',
            referenceQuantity: hasReference ? referenceQuantityRaw : 0,
          },
        };
      }

      // A personal asset's own price (older files: the day's unit value)
      const customPrice = parseInputNumber(get(row, ledger ? 'customPrice' : 'currentPrice')) || 0;
      return {
        status: isFallback ? 'custom' : 'ok',
        kind: 'buy',
        name: label,
        holding: {
          assetId,
          amount,
          buyPrice: price,
          buyDate: date,
          notes,
          customPrice,
          referenceAssetId: hasReference ? referenceAssetIdRaw : '',
          referenceQuantity: hasReference ? referenceQuantityRaw : 0,
          compareAssetId: hasCompare ? compareAssetIdRaw : '',
          comparePriceToman: hasCompare && comparePriceRaw > 0 ? Math.round(comparePriceRaw) : 0,
        },
      };
    })
    .filter(Boolean);
}

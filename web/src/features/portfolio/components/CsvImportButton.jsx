import React, { useState, useRef } from 'react';
import { Upload, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import Modal from '../../../shared/ui/Modal.jsx';
import { parseInputNumber } from '../utils/holdingHelpers.js';
import { CANONICAL_ASSET_REGISTRY } from '../../../utils/financialSpecs.js';

// Column headers must mirror CsvExportButton.jsx exactly so the exported file round-trips.
const HEADERS = {
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
function parseCsvText(text) {
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

function buildRows(headerIndex, dataRows) {
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
        },
      };
    })
    .filter(Boolean);
}

export default function CsvImportButton({ addHolding, disabled = false }) {
  const fileInputRef = useRef(null);
  const [step, setStep] = useState(null); // null | 'preview' | 'importing' | 'done'
  const [parsedRows, setParsedRows] = useState([]);
  const [hasSourceCol, setHasSourceCol] = useState(true);
  const [parseError, setParseError] = useState('');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState({ success: 0, failed: 0, failedNames: [] });

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setParseError('');
    setParsedRows([]);
    try {
      const text = await file.text();
      const clean = text.replace(/^﻿/, '');
      const table = parseCsvText(clean).filter(
        (r) => r.length > 0 && !(r.length === 1 && !r[0].trim())
      );
      if (table.length < 2) {
        setParseError('فایل خالی است یا هیچ ردیف داده‌ای ندارد.');
        setStep('preview');
        return;
      }
      const [headerRow, ...dataRows] = table;
      const headerIndex = {};
      headerRow.forEach((h, i) => {
        headerIndex[h.trim()] = i;
      });
      setHasSourceCol(headerIndex[HEADERS.source] !== undefined);
      setParsedRows(buildRows(headerIndex, dataRows));
      setStep('preview');
    } catch (err) {
      setParseError('خطا در خواندن فایل: ' + (err.message || ''));
      setStep('preview');
    }
  };

  const importable = parsedRows.filter((r) => r.status === 'ok' || r.status === 'custom');
  const skippedCount = parsedRows.filter((r) => r.status === 'skipped').length;
  const invalidCount = parsedRows.filter((r) => r.status === 'invalid').length;
  const customFallbackCount = parsedRows.filter((r) => r.status === 'custom').length;

  const handleStartImport = async () => {
    setStep('importing');
    setProgress({ done: 0, total: importable.length });
    let success = 0;
    const failedNames = [];
    for (let i = 0; i < importable.length; i++) {
      const row = importable[i];
      try {
        const res = await addHolding(row.holding);
        if (res) {
          success += 1;
        } else {
          failedNames.push(row.name);
        }
      } catch {
        failedNames.push(row.name);
      }
      setProgress({ done: i + 1, total: importable.length });
    }
    setResult({ success, failed: failedNames.length, failedNames });
    setStep('done');
  };

  const handleClose = () => {
    setStep(null);
    setParsedRows([]);
    setParseError('');
    setResult({ success: 0, failed: 0, failedNames: [] });
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <button
        type="button"
        className="btn-import-csv icon-only"
        onClick={handleButtonClick}
        title="درون‌ریزی اقلام پورتفو از فایل CSV"
        aria-label="ورودی CSV"
        disabled={disabled}
      >
        <Upload size={15} strokeWidth={2} />
      </button>

      <Modal
        isOpen={step !== null}
        onClose={step === 'importing' ? undefined : handleClose}
        title="درون‌ریزی از فایل CSV"
        icon={<Upload size={18} />}
        maxWidth="480px"
        footer={
          step === 'preview' ? (
            <div className="modal-actions">
              <button type="button" className="btn-cancel" onClick={handleClose}>
                انصراف
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={importable.length === 0}
                onClick={handleStartImport}
              >
                درون‌ریزی {importable.length.toLocaleString('fa-IR')} قلم
              </button>
            </div>
          ) : step === 'done' ? (
            <div className="modal-actions">
              <button type="button" className="btn-primary" onClick={handleClose}>
                بستن
              </button>
            </div>
          ) : null
        }
      >
        {step === 'preview' && (
          <div className="csv-import-preview">
            {parseError ? (
              <div className="csv-import-error">
                <AlertTriangle size={16} />
                <span>{parseError}</span>
              </div>
            ) : (
              <>
                <p>خلاصه فایل انتخاب‌شده:</p>
                <ul className="csv-import-summary-list">
                  <li>
                    <CheckCircle2 size={14} className="ok-icon" />
                    <span>{importable.length.toLocaleString('fa-IR')} قلم آماده درون‌ریزی</span>
                  </li>
                  {customFallbackCount > 0 && (
                    <li>
                      <AlertTriangle size={14} className="warn-icon" />
                      <span>
                        {customFallbackCount.toLocaleString('fa-IR')} مورد بدون شناسه سیستمی
                        شناخته‌شده — به‌صورت دارایی «سفارشی» وارد می‌شوند (نام اصلی در یادداشت ذخیره
                        می‌شود)
                      </span>
                    </li>
                  )}
                  {skippedCount > 0 && (
                    <li>
                      <XCircle size={14} className="skip-icon" />
                      <span>
                        {skippedCount.toLocaleString('fa-IR')} مورد که از روی تراکنش‌ها محاسبه شده
                        بود و مورد مستقلی نیست، نادیده گرفته شد
                      </span>
                    </li>
                  )}
                  {invalidCount > 0 && (
                    <li>
                      <XCircle size={14} className="skip-icon" />
                      <span>
                        {invalidCount.toLocaleString('fa-IR')} ردیف نامعتبر (بدون مقدار) نادیده
                        گرفته شد
                      </span>
                    </li>
                  )}
                </ul>
                {!hasSourceCol && (
                  <div className="csv-import-warning-note">
                    این فایل ستون «منبع» را ندارد (خروجی نسخه‌های قدیمی‌تر). اگر اقلام محاسبه‌شده از
                    تراکنش‌ها هم در آن بوده باشد، ممکن است پس از درون‌ریزی به‌صورت تکراری دیده شوند.
                  </div>
                )}
                {importable.length === 0 && (
                  <div className="csv-import-warning-note">
                    هیچ قلم قابل درون‌ریزی‌ای در این فایل یافت نشد.
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {step === 'importing' && (
          <div className="csv-import-progress">
            <div className="spinner-glow"></div>
            <p>
              در حال درون‌ریزی... ({progress.done.toLocaleString('fa-IR')} از{' '}
              {progress.total.toLocaleString('fa-IR')})
            </p>
          </div>
        )}

        {step === 'done' && (
          <div className="csv-import-result">
            <p>
              <CheckCircle2 size={16} className="ok-icon" />
              <span>{result.success.toLocaleString('fa-IR')} قلم با موفقیت اضافه شد.</span>
            </p>
            {result.failed > 0 && (
              <>
                <p>
                  <AlertTriangle size={16} className="warn-icon" />
                  <span>{result.failed.toLocaleString('fa-IR')} مورد با خطا مواجه شد:</span>
                </p>
                <ul className="csv-import-fail-list">
                  {result.failedNames.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

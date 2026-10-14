import { intlLocale, t } from '../../utils/i18n.js';
import React, { useState, useRef } from 'react';
import { Upload, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import Modal from './Modal.jsx';
import { parseCsvText } from '../utils/csv.js';

/**
 * GenericCsvImportButton — feature-agnostic "import from CSV" flow (parse → preview
 * → import with progress → result summary). Any feature supplies its own header map,
 * per-row parser, and the async call that actually creates one record; this component
 * only owns the file-picking / preview / progress UI shared by all of them.
 *
 * @param {(row: string[], headerIndex: object, rowIndex: number) => ({status: 'ok'|'invalid'|'skipped', name: string, data?: object} | null)} parseRow
 * @param {(data: object) => Promise<any>} onImportRow - resolves truthy on success
 * @param {string} itemLabel - e.g. "قلم" | "وام" | "درآمد", used in preview/progress copy
 * @param {() => void} [onFinished] - after the last row (e.g. reload the list once)
 * @param {boolean} [disabled]
 */
export default function GenericCsvImportButton({
  parseRow,
  onImportRow,
  itemLabel = t('قلم'),
  onFinished,
  disabled = false,
}) {
  const fileInputRef = useRef(null);
  const [step, setStep] = useState(null); // null | 'preview' | 'importing' | 'done'
  const [parsedRows, setParsedRows] = useState([]);
  const [parseError, setParseError] = useState('');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState({ success: 0, failed: 0, failedNames: [] });

  const handleButtonClick = () => fileInputRef.current?.click();

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
        setParseError(t('فایل خالی است یا هیچ ردیف داده‌ای ندارد.'));
        setStep('preview');
        return;
      }
      const [headerRow, ...dataRows] = table;
      const headerIndex = {};
      headerRow.forEach((h, i) => {
        headerIndex[h.trim()] = i;
      });
      const rows = dataRows
        .map((row, i) => {
          if (row.length === 0 || (row.length === 1 && !row[0].trim())) return null;
          return parseRow(row, headerIndex, i);
        })
        .filter(Boolean);
      setParsedRows(rows);
      setStep('preview');
    } catch (err) {
      setParseError(t('خطا در خواندن فایل: {error}', { error: err.message || '' }));
      setStep('preview');
    }
  };

  const importable = parsedRows.filter((r) => r.status === 'ok');
  const skippedCount = parsedRows.filter((r) => r.status === 'skipped').length;
  const invalidCount = parsedRows.filter((r) => r.status === 'invalid').length;

  const handleStartImport = async () => {
    setStep('importing');
    setProgress({ done: 0, total: importable.length });
    let success = 0;
    const failedNames = [];
    for (let i = 0; i < importable.length; i++) {
      const row = importable[i];
      try {
        const res = await onImportRow(row.data);
        if (res) success += 1;
        else failedNames.push(row.name);
      } catch {
        failedNames.push(row.name);
      }
      setProgress({ done: i + 1, total: importable.length });
    }
    setResult({ success, failed: failedNames.length, failedNames });
    setStep('done');
    if (success > 0) onFinished?.();
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
        title={t('درون‌ریزی {item} از فایل CSV', { item: t(itemLabel) })}
        aria-label={t('ورودی CSV')}
        disabled={disabled}
      >
        <Upload size={15} strokeWidth={2} />
      </button>

      <Modal
        isOpen={step !== null}
        onClose={step === 'importing' ? undefined : handleClose}
        title={t('درون‌ریزی از فایل CSV')}
        icon={<Upload size={18} />}
        maxWidth="480px"
        footer={
          step === 'preview' ? (
            <div className="modal-actions">
              <button type="button" className="btn-cancel" onClick={handleClose}>
                {t('انصراف')}
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={importable.length === 0}
                onClick={handleStartImport}
              >
                {t('درون‌ریزی {n} {item}', { n: importable.length.toLocaleString(intlLocale()), item: t(itemLabel) })}
              </button>
            </div>
          ) : step === 'done' ? (
            <div className="modal-actions">
              <button type="button" className="btn-primary" onClick={handleClose}>
                {t('بستن')}
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
                <p>{t('خلاصه فایل انتخاب‌شده:')}</p>
                <ul className="csv-import-summary-list">
                  <li>
                    <CheckCircle2 size={14} className="ok-icon" />
                    <span>{t('{n} {item} آماده درون‌ریزی', { n: importable.length.toLocaleString(intlLocale()), item: t(itemLabel) })}</span>
                  </li>
                  {skippedCount > 0 && (
                    <li>
                      <XCircle size={14} className="skip-icon" />
                      <span>{t('{n} مورد نادیده گرفته شد', { n: skippedCount.toLocaleString(intlLocale()) })}</span>
                    </li>
                  )}
                  {invalidCount > 0 && (
                    <li>
                      <XCircle size={14} className="skip-icon" />
                      <span>{t('{n} ردیف نامعتبر نادیده گرفته شد', { n: invalidCount.toLocaleString(intlLocale()) })}</span>
                    </li>
                  )}
                </ul>
                {importable.length === 0 && (
                  <div className="csv-import-warning-note">
                    {t('هیچ {item} قابل درون‌ریزی‌ای در این فایل یافت نشد.', { item: t(itemLabel) })}
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
              {t('در حال درون‌ریزی... ({done} از {total})', { done: progress.done.toLocaleString(intlLocale()), total: progress.total.toLocaleString(intlLocale()) })}
            </p>
          </div>
        )}

        {step === 'done' && (
          <div className="csv-import-result">
            <p>
              <CheckCircle2 size={16} className="ok-icon" />
              <span>{t('{n} {item} با موفقیت اضافه شد.', { n: result.success.toLocaleString(intlLocale()), item: t(itemLabel) })}</span>
            </p>
            {result.failed > 0 && (
              <>
                <p>
                  <AlertTriangle size={16} className="warn-icon" />
                  <span>{t('{n} مورد با خطا مواجه شد:', { n: result.failed.toLocaleString(intlLocale()) })}</span>
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

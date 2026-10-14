/**
 * CsvImportButton.jsx — Read a portfolio CSV back (utils/holdingsCsv.js): purchases and holdings
 * become the buy side's records, sales become sales; expense payments are skipped.
 */
import { intlLocale, t, plural } from '../../../utils/i18n.js';
import React, { useState, useRef } from 'react';
import { Upload, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import Modal from '../../../shared/ui/Modal.jsx';
import { HEADERS, parseCsvText, buildRows, isLedgerFile } from '../utils/holdingsCsv.js';

export default function CsvImportButton({ addHolding, addTransaction, disabled = false }) {
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
        setParseError(t('فایل خالی است یا هیچ ردیف داده‌ای ندارد.'));
        setStep('preview');
        return;
      }
      const [headerRow, ...dataRows] = table;
      const headerIndex = {};
      headerRow.forEach((h, i) => {
        headerIndex[h.trim()] = i;
      });
      setHasSourceCol(isLedgerFile(headerIndex) || headerIndex[HEADERS.source[0]] !== undefined);
      setParsedRows(buildRows(headerIndex, dataRows));
      setStep('preview');
    } catch (err) {
      setParseError(t('خطا در خواندن فایل: {message}', { message: err.message || '' }));
      setStep('preview');
    }
  };

  const importable = parsedRows.filter((r) => r.status === 'ok' || r.status === 'custom');
  const skippedCount = parsedRows.filter((r) => r.status === 'skipped').length;
  const invalidCount = parsedRows.filter((r) => r.status === 'invalid').length;
  const customFallbackCount = parsedRows.filter((r) => r.status === 'custom').length;
  const sellCount = importable.filter((r) => r.kind === 'sell').length;

  const handleStartImport = async () => {
    setStep('importing');
    setProgress({ done: 0, total: importable.length });
    let success = 0;
    const failedNames = [];
    for (let i = 0; i < importable.length; i++) {
      const row = importable[i];
      try {
        const res = row.kind === 'sell' ? await addTransaction?.(row.transaction) : await addHolding(row.holding);
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
        title={t('درون‌ریزی اقلام پورتفو از فایل CSV')}
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
                {plural(importable.length, t('درون‌ریزی {count} ثبت', { count: importable.length.toLocaleString(intlLocale()) }), t('درون‌ریزی {count} ثبت‌ها', { count: importable.length.toLocaleString(intlLocale()) }))}
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
                    <span>
                      {t('{count} ثبت آماده درون‌ریزی', { count: importable.length.toLocaleString(intlLocale()) })}
                      {sellCount > 0 && plural(sellCount, t(' ({count} فروش)', { count: sellCount.toLocaleString(intlLocale()) }), t(' ({count} فروش‌ها)', { count: sellCount.toLocaleString(intlLocale()) }))}
                    </span>
                  </li>
                  {customFallbackCount > 0 && (
                    <li>
                      <AlertTriangle size={14} className="warn-icon" />
                      <span>{t('{count} مورد بدون شناسه سیستمی شناخته‌شده — به‌صورت دارایی «سفارشی» وارد می‌شوند (نام اصلی در یادداشت ذخیره می‌شود)', { count: customFallbackCount.toLocaleString(intlLocale()) })}</span>
                    </li>
                  )}
                  {skippedCount > 0 && (
                    <li>
                      <XCircle size={14} className="skip-icon" />
                      <span>{t('{count} مورد نادیده گرفته شد («پرداخت هزینه» از خود هزینه ساخته می‌شود؛ پشتیبان کامل آن را هم برمی‌گرداند)', { count: skippedCount.toLocaleString(intlLocale()) })}</span>
                    </li>
                  )}
                  {invalidCount > 0 && (
                    <li>
                      <XCircle size={14} className="skip-icon" />
                      <span>{t('{count} ردیف نامعتبر (بدون مقدار) نادیده گرفته شد', { count: invalidCount.toLocaleString(intlLocale()) })}</span>
                    </li>
                  )}
                </ul>
                {!hasSourceCol && (
                  <div className="csv-import-warning-note">
                    {t('این فایل ستون «منبع» را ندارد (خروجی نسخه‌های قدیمی‌تر). اگر اقلام محاسبه‌شده از تراکنش‌ها هم در آن بوده باشد، ممکن است پس از درون‌ریزی به‌صورت تکراری دیده شوند.')}
                  </div>
                )}
                {importable.length === 0 && (
                  <div className="csv-import-warning-note">
                    {t('هیچ قلم قابل درون‌ریزی‌ای در این فایل یافت نشد.')}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {step === 'importing' && (
          <div className="csv-import-progress">
            <div className="spinner-glow"></div>
            <p>{t('در حال درون‌ریزی... ({done} از {total})', { done: progress.done.toLocaleString(intlLocale()), total: progress.total.toLocaleString(intlLocale()) })}</p>
          </div>
        )}

        {step === 'done' && (
          <div className="csv-import-result">
            <p>
              <CheckCircle2 size={16} className="ok-icon" />
              <span>{t('{count} ثبت با موفقیت اضافه شد.', { count: result.success.toLocaleString(intlLocale()) })}</span>
            </p>
            {result.failed > 0 && (
              <>
                <p>
                  <AlertTriangle size={16} className="warn-icon" />
                  <span>{t('{count} مورد با خطا مواجه شد:', { count: result.failed.toLocaleString(intlLocale()) })}</span>
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

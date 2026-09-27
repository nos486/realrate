import React, { useState } from 'react';
import {
  Check,
  X,
  Copy,
  CheckCheck,
  RotateCcw,
  Sparkles,
  FileCheck2,
  Clock,
  HardDrive,
  Cpu,
} from 'lucide-react';
import { AlertBanner, Button } from '../../../../shared/ui/index.js';
import { gregorianToShamsi } from '../../../portfolio/components/ShamsiDatePicker.jsx';
import { ScanModelSelect } from './ScanModelSelect.jsx';

const SCAN_FIELDS_CONFIG = [
  { key: 'amount', label: 'مبلغ چک', format: (val) => (val ? `${Number(val).toLocaleString('fa-IR')} تومان` : null) },
  { key: 'dueDate', label: 'تاریخ سررسید', format: (val) => (val ? gregorianToShamsi(`${val}T00:00:00`) : null) },
  { key: 'sayadId', label: 'شناسه صیادی (۱۶ رقم)', format: (val) => val },
  { key: 'chequeNumber', label: 'شماره چک', format: (val) => val },
  { key: 'bankName', label: 'بانک صادرکننده', format: (val) => val },
  { key: 'counterparty', label: 'طرف حساب (در وجه/صادرکننده)', format: (val) => val },
  { key: 'notes', label: 'شعبه و یادداشت', format: (val) => val },
];

export function ChequeScanResult({
  result,
  models = [],
  imageMeta,
  onFillForm,
  onRescan,
  onNewPhoto,
}) {
  const [ratings, setRatings] = useState({});
  const [copied, setCopied] = useState(false);
  const [selectedModel, setSelectedModel] = useState(result.model || models[0]?.id || '');

  const fields = result.fields || {};
  const confidence = result.confidence || {};
  const warnings = result.warnings || [];

  const handleRate = (fieldKey, isCorrect) => {
    setRatings((prev) => ({
      ...prev,
      [fieldKey]: prev[fieldKey] === isCorrect ? null : isCorrect,
    }));
  };

  const handleCopyRaw = async () => {
    try {
      await navigator.clipboard.writeText(result.raw || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const confirmedCount = Object.values(ratings).filter((v) => v === true).length;
  const rejectedCount = Object.values(ratings).filter((v) => v === false).length;
  const totalRated = confirmedCount + rejectedCount;

  const currentModelLabel = models.find((m) => m.id === result.model)?.label || result.model;

  const confidenceBadge = (level) => {
    switch (level) {
      case 'high':
        return <span className="scan-confidence-badge high" title="اطمینان بالا">بالا</span>;
      case 'low':
        return <span className="scan-confidence-badge low" title="اطمینان پایین — نیاز به بررسی">پایین</span>;
      case 'medium':
      default:
        return <span className="scan-confidence-badge medium" title="اطمینان متوسط">متوسط</span>;
    }
  };

  return (
    <div className="cheque-scan-result-container">
      {/* Warnings / Error notice */}
      {result.notACheque ? (
        <AlertBanner
          type="error"
          title="تصویر چک شناسایی نشد"
          message="هوش مصنوعی نتوانست تصویر را به عنوان یک چک بانکی معتبر تشخیص دهد یا ارقام آن کاملاً ناخوانا است."
        />
      ) : warnings.length > 0 ? (
        <AlertBanner
          type="warning"
          title="نیاز به بررسی مقادیر"
          message={warnings.join(' • ')}
        />
      ) : null}

      {/* Model & Processing Stats Header */}
      <div className="scan-stats-bar">
        <div className="scan-stat-item">
          <Cpu size={14} />
          <span>مدل: <strong>{currentModelLabel}</strong></span>
        </div>
        <div className="scan-stat-item">
          <Clock size={14} />
          <span>زمان پاسخ: <strong>{(result.durationMs / 1000).toFixed(1)} ثانیه</strong></span>
        </div>
        {imageMeta && (
          <div className="scan-stat-item">
            <HardDrive size={14} />
            <span>
              حجم تصویر: {(imageMeta.originalBytes / 1024).toFixed(0)}KB ← <strong>{(imageMeta.bytes / 1024).toFixed(0)}KB</strong>
            </span>
          </div>
        )}
      </div>

      {/* Accuracy Verification Tool for Admin */}
      <div className="scan-accuracy-summary-card">
        <div className="accuracy-header">
          <div className="accuracy-title-wrap">
            <Sparkles size={16} className="accuracy-icon" />
            <span className="accuracy-title">سنجش دقت استخراج (مخصوص مدیر)</span>
          </div>
          <span className="accuracy-score-pill">
            {totalRated === 0
              ? 'دقت فیلدها را بررسی و تأیید کنید'
              : `${confirmedCount} از ${SCAN_FIELDS_CONFIG.length} فیلد تأیید شد`}
          </span>
        </div>
        <p className="accuracy-hint">
          جهت ارزیابی کیفیت مدل، درستی هر فیلد را با زدن تیک یا ضربدر مشخص کنید.
        </p>
      </div>

      {/* Extracted Fields Table */}
      <div className="scan-fields-table-wrapper">
        <table className="scan-fields-table">
          <thead>
            <tr>
              <th>فیلد</th>
              <th>مقدار استخراج‌شده</th>
              <th>اطمینان</th>
              <th className="th-accuracy">درست است؟</th>
            </tr>
          </thead>
          <tbody>
            {SCAN_FIELDS_CONFIG.map(({ key, label, format }) => {
              const rawVal = fields[key];
              const displayVal = format(rawVal);
              const confLevel = confidence[key] || 'medium';
              const rating = ratings[key];

              return (
                <tr key={key} className={rating === false ? 'is-rejected' : rating === true ? 'is-confirmed' : ''}>
                  <td className="field-label-cell">{label}</td>
                  <td className="field-value-cell">
                    {displayVal ? (
                      <span className="val-text" dir={key === 'sayadId' || key === 'chequeNumber' ? 'ltr' : 'auto'}>
                        {displayVal}
                      </span>
                    ) : (
                      <span className="val-empty">خوانده نشد</span>
                    )}
                  </td>
                  <td className="field-confidence-cell">
                    {confidenceBadge(confLevel)}
                  </td>
                  <td className="field-accuracy-cell">
                    <button
                      type="button"
                      className={`accuracy-check-btn ${rating === true ? 'active-yes' : ''}`}
                      onClick={() => handleRate(key, true)}
                      title="درست است"
                    >
                      <Check size={14} strokeWidth={2.5} />
                    </button>
                    <button
                      type="button"
                      className={`accuracy-cross-btn ${rating === false ? 'active-no' : ''}`}
                      onClick={() => handleRate(key, false)}
                      title="نادرست است"
                    >
                      <X size={14} strokeWidth={2.5} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Collapsible Raw Model Output */}
      {result.raw && (
        <details className="scan-raw-output-details">
          <summary className="scan-raw-output-summary">
            <span>مشاهده خروجی خام مدل هوش مصنوعی</span>
            <Button
              size="sm"
              variant="ghost"
              icon={copied ? <CheckCheck size={13} className="text-positive" /> : <Copy size={13} />}
              onClick={(e) => {
                e.preventDefault();
                handleCopyRaw();
              }}
            >
              {copied ? 'کپی شد' : 'کپی خروجی خام'}
            </Button>
          </summary>
          <pre className="scan-raw-output-pre" dir="ltr">
            <code>{result.raw}</code>
          </pre>
        </details>
      )}

      {/* Model Rescan Option */}
      <div className="scan-rescan-bar">
        <span className="rescan-label">اسکن دوباره با مدل دیگر:</span>
        <div className="rescan-controls">
          <ScanModelSelect
            className="ui-input-control scan-model-select"
            models={models}
            value={selectedModel}
            currentId={result.model}
            onChange={setSelectedModel}
          />
          <Button
            size="sm"
            variant="secondary"
            icon={<RotateCcw size={13} />}
            disabled={selectedModel === result.model}
            onClick={() => onRescan(selectedModel)}
          >
            اسکن دوباره
          </Button>
        </div>
      </div>

      {/* Footer Primary Actions */}
      <div className="scan-result-actions">
        <Button
          variant="secondary"
          onClick={onNewPhoto}
        >
          عکس جدید
        </Button>
        <Button
          variant="primary"
          icon={<FileCheck2 size={16} />}
          disabled={result.notACheque}
          onClick={() => onFillForm(fields, confidence)}
        >
          پر کردن فرم چک
        </Button>
      </div>
    </div>
  );
}

export default ChequeScanResult;

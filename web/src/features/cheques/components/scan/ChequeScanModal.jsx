import React, { useRef, useState } from 'react';
import {
  Camera,
  Image as ImageIcon,
  UploadCloud,
  Loader2,
  Sparkles,
  Info,
  ShieldCheck,
} from 'lucide-react';
import { Modal, Button, AlertBanner } from '../../../../shared/ui/index.js';
import { useChequeScan } from './useChequeScan.js';
import ChequeScanResult from './ChequeScanResult.jsx';

const faNum = (n) => Number(n).toLocaleString('fa-IR');

/** "N of M scans left today", or null while unknown / unlimited */
function QuotaLine({ quota }) {
  if (!quota || quota.limit === null) return null;
  const out = quota.remaining <= 0;
  return (
    <p className={`scan-quota-line ${out ? 'is-empty' : ''}`}>
      {out
        ? `سهمیه امروز شما (${faNum(quota.limit)} اسکن) تمام شده است؛ فردا دوباره می‌توانید اسکن کنید.`
        : `${faNum(quota.remaining)} اسکن از ${faNum(quota.limit)} اسکن امروز باقی مانده است.`}
    </p>
  );
}

export function ChequeScanModal({ isOpen, onClose, onFillForm }) {
  const {
    status,
    quota,
    resized,
    previewUrl,
    result,
    error,
    selectFile,
    startScan,
    cancelScan,
    reset,
  } = useChequeScan();

  const [isDragOver, setIsDragOver] = useState(false);
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  if (!isOpen) return null;

  const outOfScans = quota && quota.limit !== null && quota.remaining <= 0;

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) {
      selectFile(selected);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile && droppedFile.type.startsWith('image/')) {
      selectFile(droppedFile);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleCompleteFill = (fields, confidence) => {
    handleClose();
    onFillForm(fields, confidence);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="اسکن چک با هوش مصنوعی"
      subtitle="استخراج هوشمند اطلاعات چک بانکی از تصویر"
      icon={<Camera size={18} />}
      maxWidth="640px"
    >
      <div className="cheque-scan-modal-body">
        {/* Hidden File Inputs */}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          ref={cameraInputRef}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          ref={galleryInputRef}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {/* Global Error Banner */}
        {error && (
          <AlertBanner
            type="error"
            message={error}
            action={
              status === 'error' && resized && !outOfScans ? (
                <Button size="sm" variant="secondary" onClick={() => startScan()}>
                  تلاش مجدد
                </Button>
              ) : null
            }
          />
        )}

        {/* ── STEP 1: Image Selection ────────────────────────────────────────── */}
        {status === 'idle' && (
          <div className="scan-step-select">
            {/* Helpful Guide Notice */}
            <div className="scan-tip-card">
              <Info size={15} className="scan-tip-icon" />
              <span>چک را روی یک سطح صاف با نور یکنواخت و بدون سایه قرار دهید و عکس را مستقیماً از روبه‌رو بگیرید.</span>
            </div>

            {/* Desktop Drag and Drop Box */}
            <div
              className={`cheque-scan-dropzone ${isDragOver ? 'is-drag-over' : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => galleryInputRef.current?.click()}
            >
              <div className="dropzone-icon-wrap">
                <UploadCloud size={32} />
              </div>
              <p className="dropzone-primary-text">تصویر چک را اینجا بکشید یا کلیک کنید</p>
              <span className="dropzone-secondary-text">پشتیبانی از فرمت‌های JPEG، PNG و WebP (حداکثر ۲ مگابایت)</span>
            </div>

            {/* Two Prominent Action Buttons */}
            <div className="scan-capture-buttons-grid">
              <button
                type="button"
                className="scan-action-btn camera-btn"
                onClick={() => cameraInputRef.current?.click()}
              >
                <div className="btn-icon-bubble">
                  <Camera size={22} />
                </div>
                <div className="btn-text-wrap">
                  <strong className="btn-title">گرفتن عکس با دوربین</strong>
                  <span className="btn-sub">عکاسی مستقیم از چک فیزیکی</span>
                </div>
              </button>

              <button
                type="button"
                className="scan-action-btn gallery-btn"
                onClick={() => galleryInputRef.current?.click()}
              >
                <div className="btn-icon-bubble">
                  <ImageIcon size={22} />
                </div>
                <div className="btn-text-wrap">
                  <strong className="btn-title">انتخاب از گالری / فایل</strong>
                  <span className="btn-sub">انتخاب تصویر از دستگاه</span>
                </div>
              </button>
            </div>

            {/* Where the image goes */}
            <div className="scan-tip-card is-muted">
              <ShieldCheck size={15} className="scan-tip-icon" />
              <span>
                برای خواندن اطلاعات، تصویر یک‌بار برای سرویس هوش مصنوعی Gemini (گوگل) فرستاده می‌شود و در سرور ما ذخیره نمی‌شود.
                چک ثبت‌شده مثل بقیه اطلاعات شما رمزنگاری‌شده ذخیره می‌شود.
              </span>
            </div>
            <QuotaLine quota={quota} />
          </div>
        )}

        {/* ── STEP 1.5: Resizing Loader ───────────────────────────────────────── */}
        {status === 'resizing' && (
          <div className="scan-processing-box">
            <Loader2 size={32} className="spin-anim text-primary" />
            <p className="processing-title">در حال آماده‌سازی و بهینه‌سازی تصویر...</p>
            <span className="processing-subtitle">تصحیح چرخش EXIF و کاهش حجم تصویر جهت ارسال سریع‌تر</span>
          </div>
        )}

        {/* ── STEP 2: Preview & Submit ────────────────────────────────────────── */}
        {(status === 'ready' || status === 'uploading') && (
          <div className="scan-step-preview">
            <div className="preview-image-card">
              <img src={previewUrl} alt="پیش‌نمایش چک" className="preview-cheque-img" />
              {resized && (
                <div className="preview-size-badge">
                  <span>{(resized.originalBytes / 1024).toFixed(0)} کیلوبایت</span>
                  <span className="arrow">←</span>
                  <strong>{(resized.bytes / 1024).toFixed(0)} کیلوبایت (آماده ارسال)</strong>
                </div>
              )}
            </div>

            <QuotaLine quota={quota} />

            {/* Actions / Uploading progress */}
            {status === 'uploading' ? (
              <div className="uploading-state-container">
                <div className="uploading-spinner-row">
                  <Loader2 size={20} className="spin-anim text-primary" />
                  <span className="uploading-text">هوش مصنوعی در حال تحلیل چک و استخراج فیلدهاست...</span>
                </div>
                <Button variant="secondary" size="sm" onClick={cancelScan}>
                  لغو پردازش
                </Button>
              </div>
            ) : (
              <div className="preview-actions-row">
                <Button variant="secondary" onClick={reset}>
                  تغییر تصویر
                </Button>
                <Button
                  variant="primary"
                  icon={<Sparkles size={16} />}
                  disabled={outOfScans}
                  onClick={() => startScan()}
                >
                  استخراج اطلاعات چک
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: Scan Result ────────────────────────────────────────────── */}
        {status === 'done' && result && (
          <ChequeScanResult
            result={result}
            imageMeta={resized}
            onFillForm={handleCompleteFill}
            onNewPhoto={reset}
          />
        )}
      </div>
    </Modal>
  );
}

export default ChequeScanModal;

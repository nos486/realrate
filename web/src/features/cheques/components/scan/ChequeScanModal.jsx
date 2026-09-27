import React, { useRef, useState } from 'react';
import {
  Camera,
  Image as ImageIcon,
  UploadCloud,
  Loader2,
  Sparkles,
  Info,
} from 'lucide-react';
import { Modal, Button, AlertBanner } from '../../../../shared/ui/index.js';
import { useChequeScan } from './useChequeScan.js';
import ChequeScanResult from './ChequeScanResult.jsx';
import { ScanModelSelect } from './ScanModelSelect.jsx';

export function ChequeScanModal({ isOpen, onClose, onFillForm }) {
  const {
    status,
    models,
    file,
    resized,
    previewUrl,
    selectedModel,
    setSelectedModel,
    result,
    error,
    selectFile,
    startScan,
    cancelScan,
    rescanWithModel,
    reset,
  } = useChequeScan();

  const [isDragOver, setIsDragOver] = useState(false);
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  if (!isOpen) return null;

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
              status === 'error' && resized ? (
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

            {/* AI Model Selector */}
            <div className="scan-model-config-row">
              <label htmlFor="scan-modal-model-select" className="ui-input-label">
                مدل پردازش تصویر هوش مصنوعی:
              </label>
              <div className="ui-input-wrapper">
                <ScanModelSelect
                  id="scan-modal-model-select"
                  models={models}
                  value={selectedModel}
                  onChange={setSelectedModel}
                />
              </div>
            </div>
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

            {/* AI Model Confirmation */}
            <div className="preview-model-bar">
              <span className="model-label">مدل انتخابی:</span>
              <ScanModelSelect
                className="ui-input-control scan-model-select-compact"
                models={models}
                value={selectedModel}
                disabled={status === 'uploading'}
                onChange={setSelectedModel}
              />
            </div>

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
            models={models}
            result={result}
            imageMeta={resized}
            onFillForm={handleCompleteFill}
            onRescan={rescanWithModel}
            onNewPhoto={reset}
          />
        )}
      </div>
    </Modal>
  );
}

export default ChequeScanModal;

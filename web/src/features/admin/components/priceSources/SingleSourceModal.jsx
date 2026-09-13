import React from 'react';
import {
  Radio,
  Save,
  Send,
  Globe,
  Activity,
  Code,
  PlayCircle,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import Modal from '../../../../shared/ui/Modal.jsx';
import { CANONICAL_PRICE_TYPE_INFO } from './priceSourceConstants.js';

const QUICK_REGEX_CHIPS = [
  { label: 'عدد قبل از «فروش»', p: '([\\d,]+)\\s*فروش' },
  { label: 'فروش : عدد', p: 'فروش\\s*:\\s*([\\d,]+)' },
  { label: 'قیمت : عدد', p: 'قیمت\\s*:\\s*([\\d,]+)' },
  { label: 'نرخ : عدد', p: 'نرخ\\s*:\\s*([\\d,]+)' },
  { label: 'اولین عدد در متن', p: '([\\d,]+)' },
];

export default function SingleSourceModal({
  isOpen,
  onClose,
  sourceForm,
  setSourceForm,
  editingSourceId,
  modalSaving,
  modalTesting,
  modalTestResult,
  handleSaveModalSource,
  handleTestModalSource,
  priceTypeInfo = CANONICAL_PRICE_TYPE_INFO,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingSourceId ? 'ویرایش سورس قیمت' : 'افزودن سورس قیمت جدید'}
      icon={<Radio size={16} style={{ color: 'var(--accent-blue)' }} />}
      maxWidth="640px"
      className="source-edit-modal-card"
      onSubmit={handleSaveModalSource}
      footer={
        <div className="modal-actions-right">
          <button
            type="button"
            className="btn-cancel"
            onClick={onClose}
            disabled={modalSaving}
          >
            انصراف
          </button>
          <button
            type="submit"
            disabled={modalSaving}
            className="btn-primary"
          >
            <Save size={14} className={modalSaving ? 'spin-anim' : ''} />
            <span>{modalSaving ? 'در حال ذخیره‌سازی...' : 'ذخیره سورس قیمت'}</span>
          </button>
        </div>
      }
    >
      <div className="form-group">
        <label>نام سورس:</label>
        <input
          type="text"
          required
          placeholder="مثال: دلار هرات فردایی، سبزه میدان، صرافی زرما..."
          value={sourceForm.name || ''}
          onChange={(e) => setSourceForm({ ...sourceForm, name: e.target.value })}
        />
      </div>

      {/* Type & Unit */}
      <div className="form-row-2">
        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <label style={{ margin: 0 }}>نوع / دسته‌بندی سورس (Type / Category):</label>
            <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>تایپ آزاد دلخواه یا انتخاب از لیست</span>
          </div>
          <input
            type="text"
            list="dynamic-source-types-list"
            required
            placeholder="مثال: دلار، طلا، خودرو، مسکن، رمزارز، آهن‌آلات..."
            value={sourceForm.priceType || ''}
            onChange={(e) => setSourceForm({ ...sourceForm, priceType: e.target.value.trim() })}
          />
          <datalist id="dynamic-source-types-list">
            {Object.entries(priceTypeInfo).map(([key, info]) => (
              <option key={key} value={key}>{info.label || key}</option>
            ))}
          </datalist>
        </div>

        <div className="form-group">
          <label>واحد نمایشی قیمت (Unit):</label>
          <input
            type="text"
            placeholder="مثال: تومان، دلار ($)، ریال، درصد..."
            value={sourceForm.unit || 'تومان'}
            onChange={(e) => setSourceForm({ ...sourceForm, unit: e.target.value })}
          />
        </div>
      </div>

      {/* Protocol Selector */}
      <div className="form-group">
        <label>پروتکل دریافت داده:</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <button
            type="button"
            className={`btn-secondary ${sourceForm.sourceType === 'telegram' ? 'btn-primary' : ''}`}
            onClick={() => setSourceForm({ ...sourceForm, sourceType: 'telegram' })}
            style={{ padding: '9px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
          >
            <Send size={14} />
            <span>متن دریافتی (کانال عمومی تلگرام)</span>
          </button>
          <button
            type="button"
            className={`btn-secondary ${sourceForm.sourceType === 'api_url' ? 'btn-primary' : ''}`}
            onClick={() => setSourceForm({ ...sourceForm, sourceType: 'api_url' })}
            style={{ padding: '9px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
          >
            <Globe size={14} />
            <span>وب‌سرویس ساختاریافته (REST API JSON)</span>
          </button>
        </div>
      </div>

      {/* Protocol Details */}
      {sourceForm.sourceType === 'telegram' ? (
        <>
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label style={{ margin: 0 }}>آیدی کانال عمومی تلگرام:</label>
              <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>بدون نیاز به توکن ربات</span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span className="input-prefix" style={{ display: 'flex', alignItems: 'center', padding: '0 10px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', color: 'var(--text-muted)' }}>@</span>
              <input
                type="text"
                required
                placeholder="herat_rate یا tahran_sabza"
                value={sourceForm.channelUsername || ''}
                onChange={(e) => setSourceForm({ ...sourceForm, channelUsername: e.target.value.replace(/^@/, '').trim() })}
                style={{ flex: 1, direction: 'ltr', textAlign: 'left' }}
              />
            </div>
          </div>

          {/* Live Telegram Text Viewer */}
          {modalTestResult?.rawSnippet && sourceForm.sourceType === 'telegram' && (
            <div className="live-text-viewer-card">
              <div className="live-text-viewer-header">
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Activity size={13} style={{ color: '#38bdf8' }} />
                  <span>آخرین پیام دریافتی از کانال:</span>
                </span>
                <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>الگوی قیمت را بر اساس این متن بنویسید</span>
              </div>
              <pre className="live-text-viewer-pre">{modalTestResult.rawSnippet}</pre>
            </div>
          )}

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label style={{ margin: 0 }}>الگوی استخراج قیمت از متن (Regex Pattern):</label>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>فلگ چندخطی ims</span>
            </div>
            <input
              type="text"
              required
              placeholder="مثال: ([\d,]+)\s*فروش یا فروش\s*:\s*([\d,]+)"
              value={sourceForm.regexPattern || ''}
              onChange={(e) => setSourceForm({ ...sourceForm, regexPattern: e.target.value })}
              style={{ direction: 'ltr', textAlign: 'left', fontFamily: 'monospace' }}
            />
            <div className="quick-regex-chips-wrap">
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>الگوهای سریع و پرکاربرد:</span>
              {QUICK_REGEX_CHIPS.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="quick-regex-chip"
                  onClick={() => setSourceForm({ ...sourceForm, regexPattern: chip.p })}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="form-group">
            <label>آدرس وب‌سرویس (API URL):</label>
            <input
              type="url"
              required
              placeholder="https://api.example.com/rates/live"
              value={sourceForm.apiUrl || ''}
              onChange={(e) => setSourceForm({ ...sourceForm, apiUrl: e.target.value.trim() })}
              style={{ direction: 'ltr', textAlign: 'left', fontFamily: 'monospace' }}
            />
          </div>

          {/* Live JSON snippet */}
          {modalTestResult?.rawSnippet && sourceForm.sourceType === 'api_url' && (
            <div className="live-text-viewer-card">
              <div className="live-text-viewer-header">
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Code size={13} style={{ color: '#818cf8' }} />
                  <span>پاسخ خام وب‌سرویس JSON:</span>
                </span>
              </div>
              <pre className="live-text-viewer-pre">{modalTestResult.rawSnippet}</pre>
            </div>
          )}

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label style={{ margin: 0 }}>مسیر فیلد قیمت در JSON (JSON Price Path):</label>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>مثال: price یا rates.USD یا data.val</span>
            </div>
            <input
              type="text"
              placeholder="price یا rates.USD یا data.price"
              value={sourceForm.jsonPath || ''}
              onChange={(e) => setSourceForm({ ...sourceForm, jsonPath: e.target.value.trim() })}
              style={{ direction: 'ltr', textAlign: 'left', fontFamily: 'monospace' }}
            />
          </div>
        </>
      )}

      {/* Multiplier & Interval */}
      <div className="form-row-2">
        <div className="form-group">
          <label>ضریب تبدیل ریاضی (اختیاری):</label>
          <input
            type="number"
            step="any"
            placeholder="مثلاً ۰.۱ برای ریال به تومان یا ۱ برای بدون تغییر"
            value={sourceForm.fieldMapping?.multiplier !== undefined ? sourceForm.fieldMapping.multiplier : ''}
            onChange={(e) => setSourceForm({
              ...sourceForm,
              fieldMapping: { ...(sourceForm.fieldMapping || {}), multiplier: e.target.value ? Number(e.target.value) : '' },
            })}
            style={{ direction: 'ltr', textAlign: 'center' }}
          />
        </div>

        <div className="form-group">
          <label>بازه استخراج خودکار (دقیقه):</label>
          <input
            type="number"
            min="1"
            max="1440"
            value={sourceForm.fetchIntervalMinutes || 15}
            onChange={(e) => setSourceForm({ ...sourceForm, fetchIntervalMinutes: e.target.value })}
            style={{ direction: 'ltr', textAlign: 'center' }}
          />
        </div>
      </div>

      <div className="form-group" style={{ display: 'flex', gap: '24px', padding: '6px 0' }}>
        <label className="admin-checkbox-label">
          <input
            type="checkbox"
            checked={Boolean(sourceForm.isActive)}
            onChange={(e) => setSourceForm({ ...sourceForm, isActive: e.target.checked })}
          />
          <span>سورس فعال باشد</span>
        </label>

        <label className="admin-checkbox-label">
          <input
            type="checkbox"
            checked={Boolean(sourceForm.isPrimary)}
            onChange={(e) => setSourceForm({ ...sourceForm, isPrimary: e.target.checked })}
          />
          <span>سورس مرجع این نرخ</span>
        </label>

        <label className="admin-checkbox-label" title="آیا این نماد در صفحه اول (نرخ و حباب) نمایش داده شود؟">
          <input
            type="checkbox"
            checked={sourceForm.showOnHomePage !== false}
            onChange={(e) => setSourceForm({ ...sourceForm, showOnHomePage: e.target.checked })}
          />
          <span style={{ fontWeight: '600', color: sourceForm.showOnHomePage !== false ? 'var(--accent-green, #10b981)' : 'var(--text-muted)' }}>
            نمایش نماد در صفحه اول
          </span>
        </label>
      </div>

      {/* Modal Test Area */}
      <div className="modal-test-area">
        <button
          type="button"
          onClick={handleTestModalSource}
          disabled={modalTesting}
          className="btn-sm site-link"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px', fontWeight: '700' }}
        >
          <PlayCircle size={15} className={modalTesting ? 'spin-anim' : ''} />
          <span>{modalTesting ? 'در حال برقراری ارتباط و پردازش...' : 'تست اتصال و استخراج قبل از ذخیره'}</span>
        </button>

        {modalTestResult && modalTestResult.success && (
          <div className="live-extracted-price-callout" style={{ marginTop: '10px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle2 size={16} style={{ color: '#10b981' }} />
              <span>قیمت با موفقیت استخراج شد:</span>
            </span>
            <span className="live-extracted-price-val">
              {modalTestResult.price !== undefined ? Number(modalTestResult.price).toLocaleString('fa-IR') : '-'} {sourceForm.unit || 'تومان'}
            </span>
          </div>
        )}

        {modalTestResult && !modalTestResult.success && (
          <div className="error-callout" style={{ fontSize: '12px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
            <AlertCircle size={16} style={{ color: '#f43f5e', flexShrink: 0 }} />
            <span>{modalTestResult.error}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}

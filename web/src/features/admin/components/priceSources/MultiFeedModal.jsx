import React from 'react';
import { Layers, PlayCircle, Save } from 'lucide-react';
import Modal from '../../../../shared/ui/Modal.jsx';

export default function MultiFeedModal({
  isOpen,
  onClose,
  multiForm,
  setMultiForm,
  savingMultiSource,
  multiTesting,
  multiTestResult,
  handleSaveMultiSource,
  handleTestMultiSource,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={multiForm.id ? `ویرایش فید چند خروجی: ${multiForm.name}` : 'افزودن فید داده چند خروجی (فارکس / بورس)'}
      icon={<Layers size={18} style={{ color: 'var(--accent-indigo, #818cf8)' }} />}
      maxWidth="720px"
      className="source-edit-modal-card"
      onSubmit={handleSaveMultiSource}
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '10px' }}>
          <button
            type="button"
            onClick={handleTestMultiSource}
            disabled={multiTesting || !multiForm.apiUrl}
            className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '7px 14px' }}
          >
            <PlayCircle size={14} className={multiTesting ? 'spin-anim' : ''} />
            <span>{multiTesting ? 'در حال تست...' : 'تست اتصال و پیش‌نمایش'}</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn-cancel"
              onClick={onClose}
              disabled={savingMultiSource}
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={savingMultiSource || !multiForm.name || !multiForm.apiUrl}
              className="btn-primary"
              style={{ minWidth: '130px' }}
            >
              <Save size={14} className={savingMultiSource ? 'spin-anim' : ''} />
              <span>{savingMultiSource ? 'در حال ذخیره...' : 'ذخیره فید'}</span>
            </button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="form-group">
          <label className="form-label">عنوان فید / سورس</label>
          <input
            type="text"
            placeholder="مثال: نرخ‌های فارکس یا بورس تهران"
            value={multiForm.name || ''}
            onChange={(e) => setMultiForm((prev) => ({ ...prev, name: e.target.value }))}
            className="form-input"
            required
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div className="form-group">
            <label className="form-label">نوع فید</label>
            <select
              value={multiForm.priceType || 'forex'}
              onChange={(e) => {
                const val = e.target.value;
                let defaultUrl = multiForm.apiUrl;
                if (!defaultUrl) {
                  if (val === 'forex') defaultUrl = 'https://open.er-api.com/v6/latest/USD';
                  else if (val === 'bourse') defaultUrl = 'https://api.brsapi.ir/Tsetmc/AllSymbols.php?type=1';
                }
                setMultiForm((prev) => ({
                  ...prev,
                  priceType: val,
                  apiUrl: defaultUrl,
                }));
              }}
              className="form-input"
            >
              <option value="forex">ارزهای جهانی فارکس (Open ER-API)</option>
              <option value="bourse">بورس اوراق بهادار تهران (TSETMC)</option>
              <option value="custom">سایر فیدهای چند خروجی</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">دوره به‌روزرسانی (دقیقه)</label>
            <input
              type="number"
              min="1"
              max="1440"
              value={multiForm.fetchIntervalMinutes || 60}
              onChange={(e) => setMultiForm((prev) => ({ ...prev, fetchIntervalMinutes: parseInt(e.target.value, 10) || 60 }))}
              className="form-input"
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">آدرس API Endpoint</label>
          <input
            type="text"
            dir="ltr"
            placeholder="https://..."
            value={multiForm.apiUrl || ''}
            onChange={(e) => setMultiForm((prev) => ({ ...prev, apiUrl: e.target.value }))}
            className="form-input"
            required
          />
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-sm"
              style={{ fontSize: '11px' }}
              onClick={() => setMultiForm((prev) => ({
                ...prev,
                name: prev.name || 'نرخ‌های جهانی فارکس (Open ER-API)',
                priceType: 'forex',
                apiUrl: 'https://open.er-api.com/v6/latest/USD',
              }))}
            >
              تنظیم آدرس فارکس
            </button>
            <button
              type="button"
              className="btn-sm"
              style={{ fontSize: '11px' }}
              onClick={() => setMultiForm((prev) => ({
                ...prev,
                name: prev.name || 'بورس اوراق بهادار تهران (TSETMC)',
                priceType: 'bourse',
                apiUrl: 'https://api.brsapi.ir/Tsetmc/AllSymbols.php?type=1',
              }))}
            >
              تنظیم آدرس بورس
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              id="multi_active"
              checked={Boolean(multiForm.isActive)}
              onChange={(e) => setMultiForm((prev) => ({ ...prev, isActive: e.target.checked }))}
            />
            <label htmlFor="multi_active" style={{ fontSize: '12px', cursor: 'pointer' }}>
              فید فعال باشد و در فواصل زمانی مشخص داده‌ها به‌روزرسانی شوند
            </label>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              id="multi_show_home"
              checked={multiForm.showOnHomePage !== false}
              onChange={(e) => setMultiForm((prev) => ({ ...prev, showOnHomePage: e.target.checked }))}
            />
            <label htmlFor="multi_show_home" style={{ fontSize: '12px', cursor: 'pointer' }}>
              نمایش اقلام مجاز این فید در صفحه اصلی
            </label>
          </div>
        </div>

        {multiForm.showOnHomePage !== false && (
          <div className="form-group" style={{ marginTop: '2px' }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>اقلام مجاز برای نمایش در صفحه اصلی (اختیاری)</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>تفکیک با کاما</span>
            </label>
            <input
              type="text"
              dir="ltr"
              placeholder="مثال: EUR, AED, TRY, GBP, CHF, CAD, AUD, CNY, JPY"
              value={multiForm.homePageOutputsText || ''}
              onChange={(e) => setMultiForm((prev) => ({ ...prev, homePageOutputsText: e.target.value }))}
              className="form-input"
            />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block', lineHeight: '1.5' }}>
              در صورت خالی بودن، کلیه اقلام این فید در صفحه اصلی مجاز خواهند بود. برای محدودسازی، فقط نمادهای مدنظرتان را وارد کنید.
            </span>
          </div>
        )}

        {/* Test Results Display */}
        {multiTestResult && (
          <div style={{
            marginTop: '10px',
            padding: '12px',
            borderRadius: '8px',
            background: multiTestResult.success ? 'rgba(16, 185, 129, 0.08)' : 'rgba(244, 63, 94, 0.08)',
            border: `1px solid ${multiTestResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12.5px', fontWeight: '700', color: multiTestResult.success ? 'var(--color-positive)' : 'var(--color-negative)' }}>
                {multiTestResult.success ? `✓ ${multiTestResult.message}` : `✗ خطا: ${multiTestResult.error}`}
              </span>
            </div>

            {multiTestResult.success && Array.isArray(multiTestResult.sampleItems) && (
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                <table className="users-table" style={{ width: '100%', fontSize: '11.5px' }}>
                  <thead>
                    <tr>
                      <th>نماد</th>
                      <th>اسم</th>
                      <th>قیمت (تومان)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {multiTestResult.sampleItems.slice(0, 15).map((item, idx) => (
                      <tr key={idx}>
                        <td><strong>{item.s || item.symbol}</strong></td>
                        <td>{item.n || item.name}</td>
                        <td style={{ color: 'var(--color-positive)', fontWeight: '700' }}>
                          {Number(item.priceToman || item.p || item.price || 0).toLocaleString('fa-IR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

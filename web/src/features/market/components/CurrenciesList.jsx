import React, { useState, useMemo } from 'react';
import { SearchBar, EmptyState } from '../../../shared/ui/index.js';

function formatNum(num) {
  if (num === null || num === undefined || isNaN(num)) return '-';
  return Math.round(num).toLocaleString('fa-IR');
}

/**
 * اولویت پیش‌فرض چینش ارزها و دارایی‌ها در صفحه اصلی
 */
export const DEFAULT_PRIORITY_CURRENCIES = [
  'USD',  // دلار آمریکا
  'USDT', // تتر (دلار دیجیتال)
  'XAU',  // انس جهانی طلا
  'EUR',  // یورو
  'AED',  // درهم امارات
  'TRY',  // لیر ترکیه
  'GBP',  // پوند انگلیس
  'CHF',  // فرانک سوئیس
  'CAD',  // دلار کانادا
  'AUD',  // دلار استرالیا
  'CNY',  // یوان چین
  'JPY',  // ین ژاپن
];

// سازگاری با کدهایی که از TOP_10_CURRENCIES استفاده می‌کردند
export const TOP_10_CURRENCIES = DEFAULT_PRIORITY_CURRENCIES;

export default function CurrenciesList({ currencies, onCurrencyClick }) {
  const [search, setSearch] = useState('');

  // نمایش استاندارد و پویای کلیه ارزها و دارایی‌های منتخب صفحه اول بدون وابستگی یا هاردکد
  const topCurrencies = useMemo(() => {
    if (!currencies || !Array.isArray(currencies)) return [];

    const allowed = currencies.filter((c) => {
      if (!c.code) return false;
      return c.showOnHomePage !== false;
    });

    return allowed.sort((a, b) => {
      const idxA = DEFAULT_PRIORITY_CURRENCIES.indexOf(a.code?.toUpperCase());
      const idxB = DEFAULT_PRIORITY_CURRENCIES.indexOf(b.code?.toUpperCase());
      const prioA = idxA === -1 ? 999 : idxA;
      const prioB = idxB === -1 ? 999 : idxB;
      if (prioA !== prioB) return prioA - prioB;
      return (a.code || '').localeCompare(b.code || '');
    });
  }, [currencies]);

  if (!currencies || currencies.length === 0) {
    return (
      <div className="empty-loading-block">
        <div className="loading-spinner"></div>
        <span>در حال دریافت نرخ ارزها و دارایی‌ها...</span>
      </div>
    );
  }

  if (topCurrencies.length === 0) {
    return null;
  }

  const filtered = topCurrencies.filter((c) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.code?.toLowerCase().includes(q) ||
      c.note?.toLowerCase().includes(q) ||
      (c.aliases && c.aliases.some((a) => a.toLowerCase().includes(q)))
    );
  });

  return (
    <div className="currencies-container">
      {/* Search and count bar */}
      <div className="currencies-toolbar">
        <SearchBar
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onClear={() => setSearch('')}
          placeholder="جستجو در بین ارزها و دارایی‌ها..."
          badge={`${filtered.length.toLocaleString('fa-IR')} ارز و دارایی`}
        />
      </div>

      {/* Modern Currencies Grid / Table */}
      {filtered.length === 0 ? (
        <EmptyState
          title="ارزی یافت نشد"
          description={`ارزی با عنوان یا نماد "${search}" پیدا نشد.`}
          action={
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: '12px', padding: '6px 14px', marginTop: '8px' }}
              onClick={() => setSearch('')}
            >
              پاک‌کردن فیلتر جستجو
            </button>
          }
        />
      ) : (
        <div className="currency-cards-grid">
          {filtered.map((c) => (
            <div
              key={c.code}
              className={`currency-item-card ${onCurrencyClick ? 'clickable' : ''}`}
              onClick={() => onCurrencyClick?.(c)}
              role={onCurrencyClick ? 'button' : undefined}
              tabIndex={onCurrencyClick ? 0 : undefined}
              onKeyDown={(e) => {
                if (onCurrencyClick && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onCurrencyClick(c);
                }
              }}
              title={onCurrencyClick ? 'مشاهده مشخصات و روند ۲۴ ساعته' : undefined}
            >
              <div className="curr-lead">
                <span className="curr-flag-emoji">{c.flag}</span>
                <div className="curr-names">
                  <div className="curr-title-row">
                    <span className="curr-persian-name">{c.name}</span>
                    <span className="curr-code-pill">{c.code}</span>
                  </div>
                  <span className="curr-desc">{c.note}</span>
                </div>
              </div>

              <div className="curr-price-block">
                <div className="curr-price-val">
                  {formatNum(c.unit === 'دلار' ? (c.usd_price || c.price) : (c.toman_price || c.price))}
                  <span className="curr-unit">{c.unit || 'تومان'}</span>
                </div>
                {c.subPriceText && (
                  <span className="curr-ratio-tag">{c.subPriceText}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

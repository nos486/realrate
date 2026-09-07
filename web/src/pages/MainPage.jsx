import React, { useState } from 'react';
import Header from '../components/Header.jsx';
import QuickCurrencies from '../components/QuickCurrencies.jsx';
import AnalysisCards from '../components/AnalysisCards.jsx';
import CurrenciesList from '../components/CurrenciesList.jsx';
import JewelryCalc from '../components/JewelryCalc.jsx';
import Footer from '../components/Footer.jsx';
import { useMarketData } from '../hooks/useMarketData.js';

function formatRelativeTime(isoStr) {
  if (!isoStr) return 'ثبت نشده';
  try {
    const d = new Date(isoStr);
    const diffMins = Math.floor((new Date() - d) / 60000);
    if (diffMins < 1) return 'چند لحظه پیش';
    if (diffMins < 60) return diffMins.toLocaleString('fa-IR') + ' دقیقه پیش';
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return diffHours.toLocaleString('fa-IR') + ' ساعت پیش';
    return d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'ثبت نشده';
  }
}

export default function MainPage() {
  const [activeTab, setActiveTab] = useState('analysis');
  const {
    rates,
    calcData,
    loading,
    usdToman,
    goldUsd,
    setUsdToman,
    setGoldUsd,
    liveUsdSource,
    liveUsdDatetime,
  } = useMarketData();

  const announcement = calcData?.globalSettings?.announcement || rates?.globalSettings?.announcement;
  const analytics = calcData?.analytics || rates?.analytics;
  const quickCurrencies = calcData?.quick_currencies || rates?.quick_currencies;
  const analysis = calcData?.analysis;
  const recommendation = calcData?.recommendation;
  const currencies = calcData?.currencies || rates?.currencies;
  const gold18k = calcData?.gold?.gold_18k_gram || rates?.gold?.gold_18k_gram;

  const hasUsd = parseFloat(String(usdToman).replace(/,/g, '')) > 0;

  return (
    <div className="container" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header analytics={analytics} />

      {/* System Announcement Banner */}
      {announcement && (
        <div className="system-announcement">
          <span>📢</span>
          <span>{announcement}</span>
        </div>
      )}

      {/* Quick 4 Currencies */}
      <QuickCurrencies quickCurrencies={quickCurrencies} />

      {/* Alert Banner if USD is null or 0 */}
      {!hasUsd && (
        <div className="alert-banner">
          <span>⚠️ لطفاً ابتدا نرخ دلار آزاد (تومان) را وارد کنید تا محاسبات انجام شود.</span>
        </div>
      )}

      {/* Inputs Panel */}
      <div className="input-panel">
        <div className="inputs-grid">
          <div className="input-group">
            <label htmlFor="usdToman">
              <span>قیمت دلار آزاد (تومان)</span>
              {liveUsdSource === 'live' ? (
                <span style={{ fontSize: '11px', color: 'var(--success)', fontWeight: 700 }}>
                  🌐 زنده از بازار
                </span>
              ) : (
                <span style={{ fontSize: '11px', color: 'var(--gold-light)', fontWeight: 700 }}>
                  ✍️ ورودی دستی شما
                </span>
              )}
            </label>
            <div className="input-wrapper">
              <input
                type="text"
                id="usdToman"
                placeholder="مثلاً ۶۲,۰۰۰"
                value={usdToman}
                onChange={(e) => setUsdToman(e.target.value)}
              />
              <span className="input-suffix">تومان</span>
            </div>
            <div className="input-time-tag">
              {liveUsdSource === 'live' && liveUsdDatetime ? (
                <>آخرین بروزرسانی: <strong>{formatRelativeTime(liveUsdDatetime)}</strong></>
              ) : (
                <>تنظیم شده توسط <strong>ورودی دستی کاربر</strong></>
              )}
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="goldUsd">
              <span>انس جهانی طلا ($)</span>
              <span style={{ fontSize: '11px', color: 'var(--success)', fontWeight: 700 }}>
                🌐 انس جهانی
              </span>
            </label>
            <div className="input-wrapper">
              <input
                type="text"
                id="goldUsd"
                value={goldUsd}
                onChange={(e) => setGoldUsd(e.target.value)}
              />
              <span className="input-suffix">USD</span>
            </div>
            <div className="input-time-tag">
              آخرین استعلام: <strong>زنده از بازار بین‌المللی</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="tabs-nav">
        <button
          className={`tab-btn ${activeTab === 'analysis' ? 'active' : ''}`}
          onClick={() => setActiveTab('analysis')}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"></line>
            <line x1="12" y1="20" x2="12" y2="4"></line>
            <line x1="6" y1="20" x2="6" y2="14"></line>
          </svg>
          <span>حباب طلا و سکه</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'currencies' ? 'active' : ''}`}
          onClick={() => setActiveTab('currencies')}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
          </svg>
          <span>قیمت روز ارزهای جهان</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'jewelry' ? 'active' : ''}`}
          onClick={() => setActiveTab('jewelry')}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3h12l4 6-10 12L2 9z"></path>
            <path d="M11 3v18"></path>
            <path d="M2 9h20"></path>
          </svg>
          <span>محاسبه‌گر طلا و اجرت</span>
        </button>
      </div>

      {/* Tab Contents */}
      <main style={{ flex: 1 }}>
        {activeTab === 'analysis' && (
          <AnalysisCards analysis={analysis} recommendation={recommendation} />
        )}

        {activeTab === 'currencies' && (
          <CurrenciesList currencies={currencies} />
        )}

        {activeTab === 'jewelry' && (
          <JewelryCalc gold18kGram={gold18k} />
        )}
      </main>

      <Footer />
    </div>
  );
}

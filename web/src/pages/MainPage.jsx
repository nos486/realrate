import React, { useState } from 'react';
import Header from '../components/Header.jsx';
import QuickCurrencies from '../components/QuickCurrencies.jsx';
import AnalysisCards from '../components/AnalysisCards.jsx';
import CurrenciesList from '../components/CurrenciesList.jsx';
import JewelryCalc from '../components/JewelryCalc.jsx';
import PortfolioTracker from '../components/PortfolioTracker.jsx';
import Footer from '../components/Footer.jsx';
import { useMarketData } from '../hooks/useMarketData.js';

function formatRelativeTime(isoStr) {
  if (!isoStr) return 'ثبت نشده';
  try {
    const d = new Date(isoStr);
    const diffMins = Math.floor((new Date() - d) / 60000);
    if (diffMins < 1) return 'لحظاتی پیش';
    if (diffMins < 60) return `${diffMins.toLocaleString('fa-IR')} دقیقه پیش`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours.toLocaleString('fa-IR')} ساعت پیش`;
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
    <div className="app-layout">
      <Header analytics={analytics} />

      <main className="main-content">
        {/* System Announcement Banner */}
        {announcement && (
          <div className="announcement-strip">
            <span className="announcement-icon">📢</span>
            <span className="announcement-text">{announcement}</span>
          </div>
        )}

        {/* Quick Ticker Strip */}
        <QuickCurrencies quickCurrencies={quickCurrencies} />

        {/* Compact Inputs Bar */}
        <div className="inputs-toolbar">
          <div className="toolbar-input-item">
            <div className="toolbar-label-row">
              <label htmlFor="usdToman">قیمت دلار آزاد (تومان)</label>
              {liveUsdSource === 'live' ? (
                <span className="source-tag live">🟢 زنده از بازار</span>
              ) : (
                <span className="source-tag manual">✍️ ورودی دستی</span>
              )}
            </div>
            <div className="toolbar-input-wrapper">
              <input
                type="text"
                id="usdToman"
                placeholder="مثلاً ۶۵,۰۰۰"
                value={usdToman}
                onChange={(e) => setUsdToman(e.target.value)}
              />
              <span className="input-affix">تومان</span>
            </div>
            <span className="toolbar-sub-hint">
              {liveUsdSource === 'live' && liveUsdDatetime
                ? `بروزرسانی: ${formatRelativeTime(liveUsdDatetime)}`
                : 'تنظیم دستی توسط کاربر'}
            </span>
          </div>

          <div className="toolbar-input-item">
            <div className="toolbar-label-row">
              <label htmlFor="goldUsd">انس جهانی طلا ($)</label>
              <span className="source-tag live">🌐 انس جهانی</span>
            </div>
            <div className="toolbar-input-wrapper">
              <input
                type="text"
                id="goldUsd"
                value={goldUsd}
                onChange={(e) => setGoldUsd(e.target.value)}
              />
              <span className="input-affix">USD</span>
            </div>
            <span className="toolbar-sub-hint">استعلام زنده از بازار جهانی</span>
          </div>
        </div>

        {/* Alert Banner if USD is null or 0 */}
        {!hasUsd && (
          <div className="warning-notice-bar">
            <span>⚠️ جهت محاسبه ارزش واقعی و حباب‌ها، لطفاً نرخ دلار را وارد فرمایید.</span>
          </div>
        )}

        {/* Modern Segmented Navigation Tabs */}
        <div className="segmented-tab-bar">
          <button
            className={`tab-segment-btn ${activeTab === 'analysis' ? 'active' : ''}`}
            onClick={() => setActiveTab('analysis')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"></line>
              <line x1="12" y1="20" x2="12" y2="4"></line>
              <line x1="6" y1="20" x2="6" y2="14"></line>
            </svg>
            <span>حباب طلا و سکه</span>
          </button>

          <button
            className={`tab-segment-btn ${activeTab === 'currencies' ? 'active' : ''}`}
            onClick={() => setActiveTab('currencies')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            </svg>
            <span>نرخ ارزهای جهان</span>
          </button>

          <button
            className={`tab-segment-btn ${activeTab === 'jewelry' ? 'active' : ''}`}
            onClick={() => setActiveTab('jewelry')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3h12l4 6-10 12L2 9z"></path>
              <path d="M11 3v18"></path>
              <path d="M2 9h20"></path>
            </svg>
            <span>محاسبه‌گر طلا و اجرت</span>
          </button>

          <button
            className={`tab-segment-btn ${activeTab === 'portfolio' ? 'active' : ''}`}
            onClick={() => setActiveTab('portfolio')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
            </svg>
            <span>پورتفوی دارایی من</span>
            <span className="new-tag">جدید</span>
          </button>
        </div>

        {/* Tab Views */}
        <section className="tab-view-container">
          {activeTab === 'analysis' && (
            <AnalysisCards analysis={analysis} recommendation={recommendation} />
          )}

          {activeTab === 'currencies' && (
            <CurrenciesList currencies={currencies} />
          )}

          {activeTab === 'jewelry' && (
            <JewelryCalc gold18kGram={gold18k} />
          )}

          {activeTab === 'portfolio' && (
            <PortfolioTracker calcData={calcData} rates={rates} usdToman={usdToman} goldUsd={goldUsd} />
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}

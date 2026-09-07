import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiGetSharedPortfolio, apiGetRates } from '../api/client.js';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import { CATEGORY_DEFINITIONS } from '../components/PortfolioTracker.jsx';

function formatNum(num) {
  if (num === null || num === undefined || isNaN(num)) return '۰';
  return Math.round(num).toLocaleString('fa-IR');
}

export default function SharedPortfolioPage() {
  const { slug } = useParams();

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [requirePassword, setRequirePassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState(false);

  // Privacy Mode State (Mask values as ****)
  const [hideValues, setHideValues] = useState(() => {
    try {
      return localStorage.getItem('realrate_hide_values') === 'true';
    } catch {
      return false;
    }
  });

  const toggleHideValues = () => {
    setHideValues((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('realrate_hide_values', String(next));
      } catch {}
      return next;
    });
  };

  const [portfolioData, setPortfolioData] = useState(null); // { user, holdings }
  const [marketRates, setMarketRates] = useState(null);

  // 1. Fetch live market rates (gold, dollar, silver)
  useEffect(() => {
    apiGetRates()
      .then((data) => {
        if (data) setMarketRates(data);
      })
      .catch(console.error);
  }, []);

  // 2. Fetch shared portfolio
  const loadPortfolio = async (pwd = '') => {
    setErrorMsg('');
    try {
      const res = await apiGetSharedPortfolio(slug, pwd);
      if (res.requirePassword) {
        setRequirePassword(true);
        if (res.message && pwd) {
          setErrorMsg(res.message);
        }
      } else if (res.success) {
        setRequirePassword(false);
        setPortfolioData(res);
      } else {
        setErrorMsg(res.message || 'خطا در دریافت پورتفو');
      }
    } catch (err) {
      setErrorMsg(err.message || 'خطای سرور در بارگذاری پورتفو');
    } finally {
      setLoading(false);
      setUnlocking(false);
    }
  };

  useEffect(() => {
    if (slug) {
      setLoading(true);
      loadPortfolio();
    }
  }, [slug]);

  const handleUnlock = (e) => {
    e.preventDefault();
    if (!password.trim()) {
      setErrorMsg('لطفاً رمز عبور را وارد فرمایید.');
      return;
    }
    setUnlocking(true);
    loadPortfolio(password);
  };

  // 3. Calculate Real Values & Metrics
  const usdToman = marketRates?.usdToman || 0;
  const goldUsd = marketRates?.goldUsd || 0;

  const realPriceMap = useMemo(() => {
    const usdVal = Number(usdToman) || 0;
    const goldUsdVal = Number(goldUsd) || 0;

    const goldGram18kReal = (goldUsdVal > 0 && usdVal > 0)
      ? ((goldUsdVal / 31.1034768) * usdVal) * 0.75
      : 0;

    const silverUsdVal = Number(marketRates?.silverUsd) || 32.5;
    const silverGram999Real = (silverUsdVal > 0 && usdVal > 0)
      ? (silverUsdVal / 31.1034768) * usdVal
      : 0;
    const silverGram925Real = silverGram999Real * 0.925;
    const silverOunceReal = silverUsdVal * usdVal;

    const coinFullReal = goldGram18kReal * (24 / 18) * 7.3197;
    const coinHalfReal = goldGram18kReal * (24 / 18) * 3.6594;
    const coinQuarterReal = goldGram18kReal * (24 / 18) * 1.8297;
    const coinGramReal = goldGram18kReal * (24 / 18) * 0.909;

    const map = {
      gold_18k: Math.round(goldGram18kReal),
      full_new: Math.round(coinFullReal),
      full_old: Math.round(coinFullReal),
      half: Math.round(coinHalfReal),
      quarter: Math.round(coinQuarterReal),
      gram: Math.round(coinGramReal),
      silver_999: Math.round(silverGram999Real),
      silver_925: Math.round(silverGram925Real),
      silver_ounce: Math.round(silverOunceReal),
      USD: Math.round(usdVal),
      USDT: Math.round(usdVal),
    };

    if (marketRates?.currencies && Array.isArray(marketRates.currencies)) {
      for (const c of marketRates.currencies) {
        if (c.code && c.toman_price) {
          map[c.code] = Math.round(c.toman_price);
        }
      }
    }

    return map;
  }, [marketRates, usdToman, goldUsd]);

  const portfolioMetrics = useMemo(() => {
    if (!portfolioData?.holdings) return { items: [], totalCost: 0, totalRealValue: 0, totalPnl: 0, totalPnlPct: 0 };

    let totalCost = 0;
    let totalRealValue = 0;

    const items = portfolioData.holdings.map((h) => {
      const amountNum = Number(h.amount) || 0;
      const buyPriceNum = Number(h.buyPrice) || 0;
      const isCustomItem = h.assetType === 'custom' || h.assetId?.startsWith('custom_');

      const unitRealPrice = isCustomItem
        ? (Number(h.currentPrice) || buyPriceNum)
        : (realPriceMap[h.assetId] || buyPriceNum);

      const itemCost = amountNum * buyPriceNum;
      const itemRealVal = amountNum * unitRealPrice;
      const itemPnl = itemRealVal - itemCost;
      const itemPnlPct = itemCost > 0 ? (itemPnl / itemCost) * 100 : 0;

      totalCost += itemCost;
      totalRealValue += itemRealVal;

      return {
        ...h,
        isCustomItem,
        unitRealPrice,
        itemCost,
        itemRealVal,
        itemPnl,
        itemPnlPct,
      };
    });

    const totalPnl = totalRealValue - totalCost;
    const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

    return { items, totalCost, totalRealValue, totalPnl, totalPnlPct };
  }, [portfolioData, realPriceMap]);

  const categoryGroups = useMemo(() => {
    return CATEGORY_DEFINITIONS.map((cat) => {
      const groupItems = portfolioMetrics.items.filter(cat.match);
      const groupCost = groupItems.reduce((acc, it) => acc + it.itemCost, 0);
      const groupRealVal = groupItems.reduce((acc, it) => acc + it.itemRealVal, 0);
      const groupPnl = groupRealVal - groupCost;
      const groupPnlPct = groupCost > 0 ? (groupPnl / groupCost) * 100 : 0;
      return {
        ...cat,
        items: groupItems,
        totalCost: groupCost,
        totalRealValue: groupRealVal,
        totalPnl: groupPnl,
        totalPnlPct: groupPnlPct,
      };
    }).filter((group) => group.items.length > 0);
  }, [portfolioMetrics.items]);

  const ownerName = portfolioData?.user?.name || slug;

  return (
    <div className="app-layout">
      <Header
        usdToman={usdToman}
        gold18kPrice={realPriceMap['gold_18k']}
      />

      <main className="main-content">
        {loading ? (
          <div className="portfolio-loading-state" style={{ minHeight: '50vh' }}>
            <div className="spinner-glow"></div>
            <p>در حال بارگذاری اطلاعات پورتفوی اشتراکی...</p>
          </div>
        ) : requirePassword ? (
          /* Password Gate Card */
          <div className="shared-auth-gate-wrap">
            <div className="auth-gate-card shared-lock-card">
              <div className="auth-gate-badge">
                <span className="lock-icon">🔒</span>
                <span className="badge-text">پورتفوی محافظت‌شده</span>
              </div>

              <h2 className="auth-gate-title">پورتفوی سرمایه‌گذاری {ownerName}</h2>
              <p className="auth-gate-desc">
                مالک این پورتفو برای دسترسی به جزئیات دارایی‌ها، رمز عبور تعیین کرده است.
                جهت مشاهده، لطفاً رمز عبور را وارد نمایید.
              </p>

              {errorMsg && (
                <div className="settings-alert-banner error" style={{ marginBottom: '16px' }}>
                  ⚠️ {errorMsg}
                </div>
              )}

              <form onSubmit={handleUnlock} className="shared-pwd-form">
                <div className="password-input-wrapper">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="رمز عبور مشاهده پورتفو..."
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn-toggle-pwd"
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? 'مخفی کردن' : 'نمایش رمز'}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>

                <button type="submit" className="btn-unlock-shared" disabled={unlocking}>
                  {unlocking ? 'در حال بررسی...' : '🔓 مشاهده دارایی‌ها'}
                </button>
              </form>

              <div className="shared-gate-footer">
                <Link to="/" className="back-home-link">← بازگشت به صفحه اصلی RealRate</Link>
              </div>
            </div>
          </div>
        ) : errorMsg ? (
          <div className="portfolio-empty-state" style={{ minHeight: '50vh' }}>
            <div className="empty-icon">⚠️</div>
            <h4>پورتفوی مورد نظر در دسترس نیست</h4>
            <p>{errorMsg}</p>
            <Link to="/" className="btn-add-asset-center">بازگشت به صفحه اصلی</Link>
          </div>
        ) : (
          /* Unlocked Shared Portfolio View */
          <div className="shared-portfolio-container">
            {/* Owner Banner */}
            <div className="shared-owner-banner">
              <div className="owner-badge">
                <span className="owner-avatar">💼</span>
                <div className="owner-info">
                  <h2>پورتفوی سرمایه‌گذاری {ownerName}</h2>
                  <span className="shared-view-tag">👀 حالت مشاهده زنده (فقط‌خواندنی)</span>
                </div>
              </div>

              <div className="shared-url-pill" dir="ltr">
                realrate.geekio.org/p/{slug}
              </div>
            </div>

            {/* Overview Cards Grid */}
            <div className="portfolio-overview-grid">
              <div className="portfolio-stat-card main-val">
                <div className="stat-header">
                  <span className="stat-label">ارزش واقعی کل دارایی‌ها</span>
                  <span className="real-pill">🌐 انس طلا + نقره + دلار</span>
                </div>
                <div className={`stat-number gold-gradient-text ${hideValues ? 'is-masked' : ''}`}>
                  {hideValues ? '****' : formatNum(portfolioMetrics.totalRealValue)}
                  <span className="stat-unit">تومان</span>
                </div>
                <div className="stat-sub">
                  سرمایه اولیه خرید: {hideValues ? '**** تومان' : `${formatNum(portfolioMetrics.totalCost)} تومان`}
                </div>
              </div>

              <div className={`portfolio-stat-card pnl-card ${portfolioMetrics.totalPnl >= 0 ? 'profit' : 'loss'}`}>
                <div className="stat-header">
                  <span className="stat-label">سود / زیان واقعی کل</span>
                  <span className={`pnl-badge ${portfolioMetrics.totalPnl >= 0 ? 'profit' : 'loss'}`}>
                    {hideValues ? '****' : `${portfolioMetrics.totalPnl >= 0 ? '+' : ''}${portfolioMetrics.totalPnlPct.toFixed(2).replace('-', '')}٪`}
                  </span>
                </div>
                <div className={`stat-number ${hideValues ? 'is-masked' : ''}`}>
                  {hideValues ? '****' : `${portfolioMetrics.totalPnl >= 0 ? '+' : ''}${formatNum(portfolioMetrics.totalPnl)}`}
                  <span className="stat-unit">تومان</span>
                </div>
                <div className="stat-sub">
                  {portfolioMetrics.totalPnl >= 0 ? '🟢 پورتفوی در سود است' : '🔴 پورتفوی در زیان است'}
                </div>
              </div>

              <div className="portfolio-stat-card action-card">
                <div className="stat-header">
                  <span className="stat-label">تعداد و تنوع دارایی‌ها</span>
                  <span className="count-pill">{portfolioMetrics.items.length} قلم دارایی</span>
                </div>
                <div className="shared-cta-note">
                  <span>محاسبه شده به صورت لحظه‌ای با نرخ‌های زنده بازار</span>
                </div>
                <Link to="/" className="btn-add-asset" style={{ textAlign: 'center', textDecoration: 'none' }}>
                  <span>ایجاد پورتفوی شخصی من 🚀</span>
                </Link>
              </div>
            </div>

            {/* Categorized Holdings List */}
            <div className="portfolio-table-card">
              <div className="portfolio-table-header">
                <div className="table-title">
                  <h3>📋 جزئیات سبد سرمایه‌گذاری به تفکیک دسته</h3>
                  <span>محاسبه مستقیم بر پایه ارزش خالص بدون حباب بازار</span>
                </div>
                <div className="portfolio-header-actions">
                  <button
                    type="button"
                    className={`btn-privacy-toggle ${hideValues ? 'active' : ''}`}
                    onClick={toggleHideValues}
                    title={hideValues ? 'نمایش مجدد مقادیر مالی' : 'مخفی کردن مقادیر با ****'}
                  >
                    {hideValues ? (
                      <>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                        <span>نمایش مقادیر 👁️</span>
                      </>
                    ) : (
                      <>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                          <line x1="1" y1="1" x2="23" y2="23"></line>
                        </svg>
                        <span>مخفی‌سازی مقادیر (****) 🙈</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {categoryGroups.length === 0 ? (
                <div className="portfolio-empty-state">
                  <div className="empty-icon">💼</div>
                  <h4>هنوز دارایی در این پورتفو ثبت نشده است</h4>
                </div>
              ) : (
                <div className="portfolio-categories-container">
                  {categoryGroups.map((group) => (
                    <div key={group.key} className="category-group-card">
                      <div className="category-group-header">
                        <div className="cat-header-identity">
                          <span className="cat-group-icon">{group.icon}</span>
                          <div className="cat-group-titles">
                            <h4 className="cat-group-name">{group.name}</h4>
                            <span className="cat-group-count">{group.items.length.toLocaleString('fa-IR')} قلم</span>
                          </div>
                        </div>

                        <div className="cat-header-subtotals">
                          <div className="cat-subtotal-val">
                            <span className="subtotal-label">ارزش مجموعه:</span>
                            <strong className={`subtotal-amount ${hideValues ? 'is-masked' : ''}`}>
                              {hideValues ? '****' : formatNum(group.totalRealValue)}
                            </strong>
                            <span className="subtotal-unit">تومان</span>
                          </div>

                          <div className={`cat-subtotal-pnl ${group.totalPnl >= 0 ? 'profit' : 'loss'}`}>
                            <span className="subtotal-pnl-label">سود/زیان:</span>
                            <strong>
                              {hideValues ? '**** تومان' : `${group.totalPnl >= 0 ? '+' : ''}${formatNum(group.totalPnl)} تومان`}
                            </strong>
                            <span className="subtotal-pnl-pct">
                              {hideValues ? '(****)' : `(${group.totalPnl >= 0 ? '+' : ''}${group.totalPnlPct.toFixed(1).replace('-', '')}٪)`}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="portfolio-items-list">
                        {group.items.map((item) => {
                          const isProfit = item.itemPnl >= 0;
                          return (
                            <div key={item.id} className="portfolio-item-row">
                              <div className="item-main-col">
                                <div className="item-name-wrap">
                                  <span className="item-name">{item.assetName || item.name}</span>
                                  <span className={`item-category-pill cat-${item.assetType || 'custom'}`}>
                                    {item.assetType === 'silver' ? '🥈 نقره' :
                                     item.assetType === 'gold' ? '🥇 طلا' :
                                     item.assetType === 'coin' ? '🪙 سکه' :
                                     item.assetType === 'currency' ? '💵 ارز' :
                                     item.assetType === 'crypto' ? '⚡ کریپتو' : '✨ سفارشی'}
                                  </span>
                                  <span className="item-qty-tag">
                                    {hideValues ? '****' : `${Number(item.amount).toLocaleString('fa-IR')} ${item.unit}`}
                                  </span>
                                </div>

                                <div className="item-price-meta">
                                  <span>خرید: {hideValues ? '****' : formatNum(item.buyPrice)} تومان</span>
                                  <span className="meta-sep">•</span>
                                  <span className="meta-real-price">
                                    قیمت واقعی روز: {hideValues ? '****' : formatNum(item.unitRealPrice)} تومان
                                  </span>
                                </div>

                                {(item.buyDate || item.notes) && (
                                  <div className="item-extra-meta">
                                    {item.buyDate && <span className="item-date-tag">📅 {item.buyDate}</span>}
                                    {item.notes && <span className="item-notes-tag">💬 {item.notes}</span>}
                                  </div>
                                )}
                              </div>

                              <div className="item-values-col">
                                <div className={`item-live-val ${hideValues ? 'is-masked' : ''}`}>
                                  {hideValues ? '****' : formatNum(item.itemRealVal)}
                                  <span className="val-unit">تومان</span>
                                </div>
                                <div className={`item-pnl-tag ${isProfit ? 'profit' : 'loss'}`}>
                                  <span>{hideValues ? '**** تومان' : `${isProfit ? '+' : ''}${formatNum(item.itemPnl)} تومان`}</span>
                                  <span className="pct">{hideValues ? '(****)' : `(${isProfit ? '+' : ''}${item.itemPnlPct.toFixed(1).replace('-', '')}٪)`}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

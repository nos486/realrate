import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiGetSharedPortfolio, apiGetRates, apiCalculate } from '../api/client.js';
import Header from '../components/Header.jsx';
import { CATEGORY_DEFINITIONS, formatAssetName } from '../components/PortfolioTracker.jsx';
import {
  deriveE2eeKey,
  verifyE2eeKey,
  decryptHoldingFromApi,
} from '../lib/e2ee.js';

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

  // E2EE Vault State for Shared Portfolio
  const [vaultKey, setVaultKey] = useState(null);
  const [vaultPassInput, setVaultPassInput] = useState('');
  const [showVaultPass, setShowVaultPass] = useState(false);
  const [vaultError, setVaultError] = useState('');
  const [decryptingVault, setDecryptingVault] = useState(false);

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
  const [calcData, setCalcData] = useState(null);

  // 1. Fetch live market rates (gold, dollar, silver) & calculate real prices
  useEffect(() => {
    apiGetRates()
      .then((data) => {
        if (data) {
          setMarketRates(data);
          const u = data.live_usd_toman || data.globalSettings?.default_usd_toman || 95000;
          const g = data.gold_usd || data.globalSettings?.default_gold_usd || 2700;
          apiCalculate(u, g)
            .then((cRes) => {
              if (cRes && cRes.success) setCalcData(cRes);
            })
            .catch(console.error);
        }
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
        setPortfolioData(res);
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

  const isE2ee = Boolean(portfolioData?.portfolio?.isE2ee);
  const isVaultLocked = Boolean(isE2ee && !vaultKey);

  const handleUnlockVault = async (e) => {
    if (e) e.preventDefault();
    if (!portfolioData?.portfolio?.isE2ee) return;
    const pass = vaultPassInput.trim();
    if (!pass) {
      setVaultError('لطفاً رمز عبور شخصی گاوصندوق را وارد فرمایید.');
      return;
    }
    setDecryptingVault(true);
    setVaultError('');
    try {
      const key = await deriveE2eeKey(pass, portfolioData.portfolio.e2eeSalt);
      const valid = await verifyE2eeKey(key, portfolioData.portfolio.e2eeVerifier);
      if (!valid) {
        setVaultError('رمز عبور وارد شده نادرست است.');
        setDecryptingVault(false);
        return;
      }
      setVaultKey(key);
      if (Array.isArray(portfolioData.holdings)) {
        const decrypted = await Promise.all(
          portfolioData.holdings.map((h) => decryptHoldingFromApi(key, h))
        );
        setPortfolioData((prev) => ({ ...prev, holdings: decrypted }));
      }
      setVaultPassInput('');
    } catch (err) {
      console.error('Shared vault unlock error:', err);
      setVaultError('خطا در رمزگشایی گاوصندوق: ' + (err.message || 'نامعتبر'));
    } finally {
      setDecryptingVault(false);
    }
  };

  // 3. Accurate Real Values & Metrics calculation
  const realPriceMap = useMemo(() => {
    const usdVal = Number(
      marketRates?.live_usd_toman ||
      calcData?.inputs?.usd_toman ||
      marketRates?.globalSettings?.default_usd_toman ||
      0
    );

    const goldUsdVal = Number(
      marketRates?.gold_usd ||
      calcData?.inputs?.gold_usd ||
      marketRates?.globalSettings?.default_gold_usd ||
      2700
    );

    const silverUsdVal = Number(
      calcData?.silver?.silver_usd ||
      marketRates?.silver?.silver_usd ||
      marketRates?.silver_usd ||
      33.5
    );

    const map = {};
    if (!usdVal) return map;

    // A. Gold calculations (Pure intrinsic gold value)
    const gold24kGram = (goldUsdVal / 31.1034768) * usdVal;
    map['gold_24k'] = Math.round(gold24kGram);
    map['gold_18k'] = Math.round(gold24kGram * 0.75);
    map['full_new'] = Math.round(gold24kGram * 7.3197);
    map['full_old'] = Math.round(gold24kGram * 7.3197);
    map['half'] = Math.round(gold24kGram * 3.6594);
    map['quarter'] = Math.round(gold24kGram * 1.8297);
    map['gram'] = Math.round(gold24kGram * 0.909);

    // B. Silver calculations (Pure intrinsic silver value)
    const silver999Gram = (silverUsdVal / 31.1034768) * usdVal;
    map['silver_999'] = Math.round(silver999Gram);
    map['silver_925'] = Math.round(silver999Gram * 0.925);
    map['silver_ounce'] = Math.round(silverUsdVal * usdVal);

    // C. Currencies & Crypto
    map['USD'] = Math.round(usdVal);
    map['USDT'] = Math.round(usdVal);

    if (calcData?.currencies && Array.isArray(calcData.currencies)) {
      calcData.currencies.forEach((c) => {
        if (c.code) {
          map[c.code] = c.toman_price ? Math.round(c.toman_price) : Math.round((c.usd_cross_rate || 1) * usdVal);
        }
      });
    } else if (marketRates?.forex) {
      const ratesObj = marketRates.forex.rates || marketRates.forex;
      if (typeof ratesObj === 'object') {
        Object.entries(ratesObj).forEach(([code, rate]) => {
          if (rate && Number(rate) > 0) {
            map[code] = Math.round((1 / Number(rate)) * usdVal);
          }
        });
      }
    }

    return map;
  }, [marketRates, calcData]);

  const portfolioMetrics = useMemo(() => {
    if (!portfolioData?.holdings) return { items: [], totalCost: 0, totalRealValue: 0, totalPnl: 0, totalPnlPct: 0, hasAnyCost: false };

    let totalCost = 0;
    let totalRealValue = 0;

    const items = portfolioData.holdings.map((h) => {
      const amountNum = Number(h.amount) || 0;
      const buyPriceNum = Number(h.buyPrice) || 0;
      const hasBuyPrice = buyPriceNum > 0;
      const isCustomItem = h.assetType === 'custom' || h.assetId?.startsWith('custom_');

      const unitRealPrice = isCustomItem
        ? (Number(h.currentPrice) || (hasBuyPrice ? buyPriceNum : 0))
        : (realPriceMap[h.assetId] || (hasBuyPrice ? buyPriceNum : 0));

      const itemCost = hasBuyPrice ? amountNum * buyPriceNum : 0;
      const itemRealVal = amountNum * unitRealPrice;
      const itemPnl = hasBuyPrice ? itemRealVal - itemCost : null;
      const itemPnlPct = hasBuyPrice && itemCost > 0 ? (itemPnl / itemCost) * 100 : null;

      if (hasBuyPrice) {
        totalCost += itemCost;
      }
      totalRealValue += itemRealVal;

      return {
        ...h,
        hasBuyPrice,
        isCustomItem,
        unitRealPrice,
        itemCost,
        itemRealVal,
        itemPnl,
        itemPnlPct,
      };
    });

    const costedItems = items.filter((it) => it.hasBuyPrice);
    const hasAnyCost = costedItems.length > 0 && totalCost > 0;
    const totalPnl = costedItems.reduce((acc, it) => acc + (it.itemPnl || 0), 0);
    const totalPnlPct = hasAnyCost ? (totalPnl / totalCost) * 100 : 0;

    return { items, totalCost, totalRealValue, totalPnl, totalPnlPct, hasAnyCost };
  }, [portfolioData, realPriceMap]);

  const categoryGroups = useMemo(() => {
    return CATEGORY_DEFINITIONS.map((cat) => {
      const groupItems = portfolioMetrics.items.filter(cat.match);
      const costedGroupItems = groupItems.filter((it) => it.hasBuyPrice);
      const hasCostedItems = costedGroupItems.length > 0;
      const groupCost = costedGroupItems.reduce((acc, it) => acc + it.itemCost, 0);
      const groupRealVal = groupItems.reduce((acc, it) => acc + it.itemRealVal, 0);
      const groupPnl = costedGroupItems.reduce((acc, it) => acc + (it.itemPnl || 0), 0);
      const groupPnlPct = groupCost > 0 ? (groupPnl / groupCost) * 100 : 0;
      return {
        ...cat,
        items: groupItems,
        totalCost: groupCost,
        totalRealValue: groupRealVal,
        totalPnl: hasCostedItems ? groupPnl : null,
        totalPnlPct: groupPnlPct,
        hasCostedItems,
      };
    }).filter((group) => group.items.length > 0);
  }, [portfolioMetrics.items]);

  const ownerName = portfolioData?.user?.name || slug;
  const portfolioName = portfolioData?.portfolio?.name;

  // Export Shared Portfolio to CSV with UTF-8 BOM
  const handleExportCSV = () => {
    if (!portfolioMetrics.items.length) {
      alert('دارایی برای دریافت خروجی در این پورتفو وجود ندارد.');
      return;
    }

    const headers = [
      'نام دارایی',
      'دسته‌بندی',
      'نوع دارایی',
      'مقدار / وزن',
      'واحد',
      'قیمت خرید واحد (تومان)',
      'بهای تمام‌شده کل (تومان)',
      'قیمت واقعی روز واحد (تومان)',
      'ارزش واقعی روز کل (تومان)',
      'سود / زیان کل (تومان)',
      'درصد سود / زیان',
      'تاریخ خرید',
      'یادداشت / توضیحات'
    ];

    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = portfolioMetrics.items.map((item) => {
      const assetTypeLabel =
        item.assetType === 'silver' ? 'نقره' :
        item.assetType === 'gold' ? 'طلا' :
        item.assetType === 'coin' ? 'سکه' :
        item.assetType === 'currency' ? 'ارز' :
        item.assetType === 'crypto' ? 'کریپتو' : 'سفارشی';

      const catLabel =
        item.assetType === 'gold' ? 'طلا و آب‌شده' :
        item.assetType === 'coin' ? 'سکه بهار آزادی' :
        item.assetType === 'silver' ? 'نقره ساچمه و شمش' :
        item.assetType === 'currency' || item.assetType === 'crypto' ? 'ارزهای خارجی و رمزارزها' : 'سایر دارایی‌ها';

      return [
        escapeCSV(formatAssetName(item)),
        escapeCSV(catLabel),
        escapeCSV(assetTypeLabel),
        escapeCSV(item.amount),
        escapeCSV(item.unit),
        escapeCSV(item.hasBuyPrice ? item.buyPrice : ''),
        escapeCSV(item.hasBuyPrice ? item.itemCost : ''),
        escapeCSV(item.unitRealPrice),
        escapeCSV(item.itemRealVal),
        escapeCSV(item.hasBuyPrice ? item.itemPnl : ''),
        escapeCSV(item.hasBuyPrice && item.itemPnlPct !== null ? item.itemPnlPct.toFixed(2) + '%' : ''),
        escapeCSV(item.buyDate || ''),
        escapeCSV(item.notes || '')
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.map(escapeCSV).join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (portfolioName || 'shared-portfolio').replace(/[/\\?%*:|"<>]/g, '-');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `portfolio-${safeName}-${dateStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app-layout">
      <Header
        usdToman={marketRates?.live_usd_toman || calcData?.inputs?.usd_toman || 0}
        gold18kPrice={realPriceMap['gold_18k'] || 0}
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

              <h2 className="auth-gate-title">
                {portfolioName ? `پورتفوی «${portfolioName}»` : 'پورتفوی سرمایه‌گذاری'} {ownerName ? `(${ownerName})` : ''}
              </h2>
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
          <div className="portfolio-section shared-portfolio-container">
            {/* Owner Banner */}
            <div className="shared-owner-banner">
              <div className="owner-badge">
                <span className="owner-avatar">💼</span>
                <div className="owner-info">
                  <h2>{portfolioName ? `پورتفوی «${portfolioName}»` : 'پورتفوی سرمایه‌گذاری'} • {ownerName}</h2>
                  <span className="shared-view-tag">
                    {portfolioMetrics.items.length.toLocaleString('fa-IR')} قلم دارایی در {categoryGroups.length.toLocaleString('fa-IR')} دسته‌بندی
                  </span>
                </div>
              </div>
            </div>

            {/* Two-Column Split: Right (Table & Holdings), Left (Overview Summary Cards) */}
            <div className="portfolio-layout-split">
              {/* Right Column: Categorized Holdings List */}
              <div className="portfolio-content-column">
                <div className="portfolio-table-card">
                  <div className="portfolio-table-header">
                    <div className="table-title">
                      <div className="table-title-main">
                        <h3>
                          <span className="table-title-icon">📋</span>
                          <span>جزئیات سبد دارایی</span>
                        </h3>
                        {isE2ee ? (
                          <span className={`portfolio-encryption-tag e2ee ${isVaultLocked ? 'locked' : 'unlocked'}`} title="حفاظت سرتاسری Zero-Knowledge E2EE">
                            {isVaultLocked ? '🔒 گاوصندوق E2EE (قفل)' : '🔓 گاوصندوق E2EE (باز)'}
                          </span>
                        ) : (
                          <span className="portfolio-encryption-tag" title="حفاظت حریم خصوصی: تمام اقلام در دیتابیس با استاندارد AES-256 رمزنگاری شده‌اند.">
                            🔒 رمزنگاری‌شده (AES-256)
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="portfolio-header-actions">
                      <button
                        type="button"
                        className="btn-export-csv icon-only"
                        onClick={handleExportCSV}
                        title="دریافت فایل اکسل / CSV از اقلام این پورتفو"
                        aria-label="خروجی CSV"
                        disabled={isVaultLocked || portfolioMetrics.items.length === 0}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                          <polyline points="7 10 12 15 17 10"></polyline>
                          <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                      </button>
                      <button
                        type="button"
                        className={`btn-privacy-toggle icon-only ${hideValues ? 'active' : ''}`}
                        onClick={toggleHideValues}
                        title={hideValues ? 'نمایش مجدد مقادیر مالی' : 'مخفی کردن مقادیر با ****'}
                        aria-label={hideValues ? 'نمایش مجدد مقادیر مالی' : 'مخفی کردن مقادیر با ****'}
                      >
                        {hideValues ? (
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                          </svg>
                        ) : (
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                            <line x1="1" y1="1" x2="23" y2="23"></line>
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {isVaultLocked ? (
                    <div className="vault-lock-container">
                      <div className="vault-lock-card">
                        <div className="vault-lock-badge">🔐 گاوصندوق فوق امنیتی E2EE</div>
                        <h4 className="vault-lock-title">این پورتفو دارای رمزنگاری سرتاسری است</h4>
                        <p className="vault-lock-desc">
                          مالک این پورتفو برای اقلام آن امنیت سرتاسری (Zero-Knowledge) را فعال کرده است. برای مشاهده و رمزگشایی دارایی‌ها، رمز عبور گاوصندوق را وارد نمایید.
                        </p>

                        <form className="vault-unlock-form" onSubmit={handleUnlockVault}>
                          <div className="vault-pass-input-wrapper">
                            <input
                              type={showVaultPass ? 'text' : 'password'}
                              className="vault-unlock-input"
                              placeholder="رمز عبور شخصی گاوصندوق..."
                              value={vaultPassInput}
                              onChange={(e) => setVaultPassInput(e.target.value)}
                              autoFocus
                              dir="ltr"
                            />
                            <button
                              type="button"
                              className="btn-toggle-vault-eye"
                              onClick={() => setShowVaultPass((prev) => !prev)}
                              tabIndex={-1}
                              title={showVaultPass ? 'مخفی کردن' : 'نمایش رمز'}
                            >
                              {showVaultPass ? '🙈' : '👁️'}
                            </button>
                          </div>

                          {vaultError && (
                            <div className="vault-unlock-error">
                              ⚠️ {vaultError}
                            </div>
                          )}

                          <div className="vault-unlock-actions">
                            <button
                              type="submit"
                              className="btn-vault-unlock"
                              disabled={decryptingVault || !vaultPassInput}
                            >
                              {decryptingVault ? 'در حال رمزگشایی...' : '🔓 رمزگشایی و مشاهده اقلام'}
                            </button>
                          </div>
                        </form>

                        <div className="vault-lock-footer-note">
                          🛡️ تمام داده‌ها در مرورگر شما پردازش و رمزگشایی می‌شوند.
                        </div>
                      </div>
                    </div>
                  ) : categoryGroups.length === 0 ? (
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

                              {group.hasCostedItems && (
                                <div className={`cat-subtotal-pnl ${group.totalPnl >= 0 ? 'profit' : 'loss'}`}>
                                  <span className="subtotal-pnl-label">سود/زیان:</span>
                                  <strong>
                                    {hideValues ? '**** تومان' : `${group.totalPnl >= 0 ? '+' : ''}${formatNum(group.totalPnl)} تومان`}
                                  </strong>
                                  <span className="subtotal-pnl-pct">
                                    {hideValues ? '(****)' : `(${group.totalPnl >= 0 ? '+' : ''}${group.totalPnlPct.toFixed(1).replace('-', '')}٪)`}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* High-density Data Table for shared view */}
                          <div className="portfolio-table-responsive">
                            <table className="portfolio-data-table">
                              <thead>
                                <tr>
                                  <th className="th-asset">دارایی</th>
                                  <th className="th-qty">مقدار / وزن</th>
                                  <th className="th-buy-price">قیمت خرید (واحد)</th>
                                  <th className="th-real-price">قیمت واقعی روز</th>
                                  <th className="th-total-val">ارزش کل روز</th>
                                  <th className="th-pnl">سود / زیان</th>
                                  <th className="th-date">تاریخ خرید</th>
                                  <th className="th-notes">یادداشت / توضیحات</th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.items.map((item) => {
                                  const isProfit = (item.itemPnl || 0) >= 0;
                                  return (
                                    <tr key={item.id} className="portfolio-table-row">
                                      <td className="td-asset">
                                        <div className="asset-cell-compact">
                                          <span className="asset-name-text">{formatAssetName(item)}</span>
                                          <span className={`item-category-pill cat-${item.assetType || 'custom'}`}>
                                            {item.assetType === 'silver' ? '🥈 نقره' :
                                             item.assetType === 'gold' ? '🥇 طلا' :
                                             item.assetType === 'coin' ? '🪙 سکه' :
                                             item.assetType === 'currency' ? '💵 ارز' :
                                             item.assetType === 'crypto' ? '⚡ کریپتو' : '✨ سفارشی'}
                                          </span>
                                        </div>
                                      </td>

                                      <td className="td-qty">
                                        <span className="table-qty-badge">
                                          {hideValues ? '****' : `${Number(item.amount).toLocaleString('fa-IR')} ${item.unit}`}
                                        </span>
                                      </td>

                                      <td className="td-buy-price">
                                        {item.hasBuyPrice ? (
                                          <div className="cell-currency-wrap">
                                            <span className={`cell-val ${hideValues ? 'is-masked' : ''}`}>
                                              {hideValues ? '****' : formatNum(item.buyPrice)}
                                            </span>
                                            <span className="cell-unit">تومان</span>
                                          </div>
                                        ) : (
                                          <span className="table-notes-text" title="قیمت خرید وارد نشده است">—</span>
                                        )}
                                      </td>

                                      <td className="td-real-price">
                                        <div className="cell-currency-wrap">
                                          <span className={`cell-val real-val ${hideValues ? 'is-masked' : ''}`} title="ارزش واقعی روز بر پایه انس و دلار">
                                            {hideValues ? '****' : formatNum(item.unitRealPrice)}
                                          </span>
                                          <span className="cell-unit">تومان</span>
                                        </div>
                                      </td>

                                      <td className="td-total-val">
                                        <div className="cell-currency-wrap">
                                          <strong className={`cell-val-bold gold-text ${hideValues ? 'is-masked' : ''}`}>
                                            {hideValues ? '****' : formatNum(item.itemRealVal)}
                                          </strong>
                                          <span className="cell-unit">تومان</span>
                                        </div>
                                      </td>

                                      <td className="td-pnl">
                                        {item.hasBuyPrice ? (
                                          <div className={`table-pnl-cell ${isProfit ? 'profit' : 'loss'}`}>
                                            <span className={`pnl-amount ${hideValues ? 'is-masked' : ''}`}>
                                              {hideValues ? '****' : `${isProfit ? '+' : ''}${formatNum(item.itemPnl)} تومان`}
                                            </span>
                                            <span className="pnl-pct-badge">
                                              {hideValues ? '****' : `(${isProfit ? '+' : ''}${item.itemPnlPct?.toFixed(1).replace('-', '')}٪)`}
                                            </span>
                                          </div>
                                        ) : (
                                          <span className="table-notes-text" title="بدون قیمت خرید در سود و زیان محاسبه نمی‌شود">—</span>
                                        )}
                                      </td>

                                      <td className="td-date">
                                        <span className="table-date-text">
                                          {item.buyDate ? `📅 ${item.buyDate}` : '—'}
                                        </span>
                                      </td>

                                      <td className="td-notes">
                                        <span className="table-notes-text" title={item.notes || ''}>
                                          {item.notes ? `💬 ${item.notes}` : '—'}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Left Column: Overview Summary Cards */}
              <div className="portfolio-sidebar-column">
                <div className="portfolio-overview-grid">
                  {/* Card 1: Total Real Value */}
                  <div className="portfolio-stat-card main-val">
                    <div className="stat-header">
                      <span className="stat-label">ارزش واقعی کل دارایی‌ها</span>
                      <span className="real-pill">🌐 نرخ روز طلا و ارز</span>
                    </div>
                    <div className={`stat-number gold-gradient-text ${hideValues ? 'is-masked' : ''}`}>
                      {isVaultLocked ? '🔐 قفل است' : hideValues ? '****' : formatNum(portfolioMetrics.totalRealValue)}
                      {!isVaultLocked && <span className="stat-unit">تومان</span>}
                    </div>
                    <div className="stat-sub">
                      {isVaultLocked ? 'برای مشاهده ارزش، رمز گاوصندوق را وارد کنید' : 'ارزش خالص دارایی‌ها بدون حباب'}
                    </div>
                  </div>

                  {/* Card 2: Initial Investment Cost */}
                  <div className="portfolio-stat-card">
                    <div className="stat-header">
                      <span className="stat-label">سرمایه اولیه خرید</span>
                      <span className="count-pill">
                        {isVaultLocked ? '🔐 قفل' : `${portfolioMetrics.items.length.toLocaleString('fa-IR')} قلم`}
                      </span>
                    </div>
                    <div className={`stat-number ${hideValues ? 'is-masked' : ''}`}>
                      {isVaultLocked ? (
                        <span className="stat-sub" style={{ fontSize: '15px' }}>🔐 قفل است</span>
                      ) : portfolioMetrics.hasAnyCost ? (
                        <>
                          {hideValues ? '****' : formatNum(portfolioMetrics.totalCost)}
                          <span className="stat-unit">تومان</span>
                        </>
                      ) : (
                        <span className="stat-sub" style={{ fontSize: '15px' }}>ثبت‌نشده</span>
                      )}
                    </div>
                    <div className="stat-sub">
                      {isVaultLocked ? 'ابتدا گاوصندوق را بازگشایی کنید' : portfolioMetrics.hasAnyCost ? 'بهای تمام‌شده اولیه سبد دارایی' : 'محاسبه صرفاً به نرخ روز'}
                    </div>
                  </div>

                  {/* Card 3: Total Real PnL */}
                  <div className={`portfolio-stat-card pnl-card ${isVaultLocked ? 'neutral' : portfolioMetrics.hasAnyCost ? (portfolioMetrics.totalPnl >= 0 ? 'profit' : 'loss') : 'neutral'}`}>
                    <div className="stat-header">
                      <span className="stat-label">سود / زیان واقعی کل</span>
                      {isVaultLocked ? (
                        <span className="pnl-badge neutral">🔐 قفل</span>
                      ) : portfolioMetrics.hasAnyCost ? (
                        <span className={`pnl-badge ${portfolioMetrics.totalPnl >= 0 ? 'profit' : 'loss'}`}>
                          {hideValues ? '****' : `${portfolioMetrics.totalPnl >= 0 ? '+' : ''}${portfolioMetrics.totalPnlPct.toFixed(2).replace('-', '')}٪`}
                        </span>
                      ) : (
                        <span className="pnl-badge neutral">—</span>
                      )}
                    </div>
                    <div className={`stat-number ${hideValues ? 'is-masked' : ''}`}>
                      {isVaultLocked ? (
                        <span className="stat-sub" style={{ fontSize: '15px' }}>🔐 قفل است</span>
                      ) : portfolioMetrics.hasAnyCost ? (
                        <>
                          {hideValues ? '****' : `${portfolioMetrics.totalPnl >= 0 ? '+' : ''}${formatNum(portfolioMetrics.totalPnl)}`}
                          <span className="stat-unit">تومان</span>
                        </>
                      ) : (
                        <span className="stat-sub" style={{ fontSize: '15px' }}>بدون قیمت خرید</span>
                      )}
                    </div>
                    <div className="stat-sub">
                      {isVaultLocked ? (
                        'جهت محاسبه سود و زیان، گاوصندوق را باز کنید'
                      ) : portfolioMetrics.hasAnyCost ? (
                        portfolioMetrics.totalPnl >= 0 ? '🟢 پورتفوی در سود است' : '🔴 پورتفوی در زیان است'
                      ) : (
                        'ارزش اقلام صرفاً به نرخ روز محاسبه می‌شود'
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="shared-clean-footer">
        <span>RealRate • سامانه پایش ارزش واقعی دارایی‌ها</span>
      </footer>
    </div>
  );
}

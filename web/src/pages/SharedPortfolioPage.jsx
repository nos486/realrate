import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiGetSharedPortfolio, apiGetPrices, apiGetHistoricalBenchmarks } from '../api/client.js';
import { calculateMarketData } from '../utils/calculator.js';
import { computeAllDerivedPrices } from '../utils/formulaEvaluator.js';
import Header from '../components/Header.jsx';
import AlertBanner from '../components/ui/AlertBanner.jsx';
import {
  CategoryIcon,
  CATEGORY_DEFINITIONS,
  formatAssetName,
} from '../components/PortfolioTracker.jsx';
import {
  Lock,
  Unlock,
  AlertTriangle,
  Eye,
  EyeOff,
  Briefcase,
  FileText,
  Calendar,
  MessageSquare,
  ArrowUpRight,
  ArrowDownRight,
  Download,
} from 'lucide-react';
import {
  deriveE2eeKey,
  verifyE2eeKey,
  decryptHoldingFromApi,
} from '../lib/e2ee.js';

function formatNum(num) {
  if (num === null || num === undefined || isNaN(num)) return '۰';
  return Math.round(num).toLocaleString('fa-IR');
}

/**
 * Helper to parse Shamsi or ISO date to millisecond timestamp for comparison
 */
function parseDateToMs(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const t = new Date(trimmed).getTime();
    return isNaN(t) ? null : t;
  }
  const parts = trimmed.split(/[\/\-\.]/).map((p) => parseInt(p, 10));
  if (parts.length === 3 && parts[0] > 1300 && parts[0] < 1500) {
    const [jy, jm, jd] = parts;
    const approxGy = jy + 621;
    const approxGm = jm <= 6 ? jm + 2 : jm + 2;
    const approxGd = jd;
    const t = new Date(approxGy, approxGm - 1, approxGd).getTime();
    return isNaN(t) ? null : t;
  }
  return null;
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

  // Historical benchmarks for 24h, 7d, 30d performance
  const [benchmarks, setBenchmarks] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('all'); // 'all', '24h', '7d', '30d'

  // Privacy Mode State (Mask values as ****)
  const [hideValues, setHideValues] = useState(() => {
    try {
      return localStorage.getItem('realrate_hide_values') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const onPrivacyChange = () => {
      try {
        setHideValues(localStorage.getItem('realrate_hide_values') === 'true');
      } catch {}
    };
    window.addEventListener('realrate_privacy_change', onPrivacyChange);
    window.addEventListener('storage', onPrivacyChange);
    return () => {
      window.removeEventListener('realrate_privacy_change', onPrivacyChange);
      window.removeEventListener('storage', onPrivacyChange);
    };
  }, []);

  const [portfolioData, setPortfolioData] = useState(null); // { user, holdings }
  const [marketRates, setMarketRates] = useState(null);
  const [calcData, setCalcData] = useState(null);

  // 1. Fetch live market rates (gold, dollar, silver) & calculate real prices
  useEffect(() => {
    apiGetPrices()
      .then((data) => {
        if (data && data.success) {
          setMarketRates(data);
          const u = data.live_usd_toman || data.globalSettings?.default_usd_toman || 95000;
          const g = data.gold_usd || data.globalSettings?.default_gold_usd || 2890;
          const cRes = calculateMarketData({
            usdToman: u,
            goldUsd: g,
            silverUsd: data.silver_usd,
            marketPrices: data.prices || data.market_prices || {},
            forex: data.forex || {},
            globalSettings: data.globalSettings || {},
          });
          if (cRes && cRes.success) setCalcData(cRes);
        }
      })
      .catch(console.error);
  }, []);

  // 2. Fetch historical price benchmarks (24h, 7d, 30d)
  useEffect(() => {
    apiGetHistoricalBenchmarks()
      .then((data) => {
        if (data && data.success && data.benchmarks) {
          setBenchmarks(data.benchmarks);
        }
      })
      .catch((err) => {
        console.warn('Failed to load historical benchmarks:', err);
      });
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

  // Pure pricing calculation helper
  const computePriceMap = (usdVal, goldUsdVal, silverUsdVal) => {
    const map = {};
    if (!usdVal) return map;

    // A. Gold calculations (Pure intrinsic gold value)
    const gold24kGram = (goldUsdVal / 31.1034768) * usdVal;
    map['gold_24k'] = Math.round(gold24kGram);
    map['gold_18k'] = Math.round(gold24kGram * 0.75);
    map['gold_melted'] = Math.round(gold24kGram * 0.75);
    map['full_new'] = Math.round(gold24kGram * 7.3197);
    map['full_old'] = Math.round(gold24kGram * 7.3197);
    map['half'] = Math.round(gold24kGram * 3.6594);
    map['quarter'] = Math.round(gold24kGram * 1.8297);
    // سکه یک گرمی بانکی: ۱.۰۱ گرم طلای ۲۲ عیار (۲۲/۲۴ = ۹۱۶.۶۶ در ۱۰۰۰)
    const bankGramVal = Math.round(gold24kGram * 1.01 * (22 / 24));
    map['bank_gram'] = bankGramVal;
    map['gram'] = bankGramVal;

    // B. Silver calculations (Pure intrinsic silver value)
    const silver999Gram = (silverUsdVal / 31.1034768) * usdVal;
    map['silver_999'] = Math.round(silver999Gram);
    map['silver_925'] = Math.round(silver999Gram * 0.925);
    map['silver_ounce'] = Math.round(silverUsdVal * usdVal);

    // C. Currencies & Crypto
    map['USD'] = Math.round(usdVal);
    map['USDT'] = Math.round(usdVal);
    map['EUR'] = Math.round((1 / 0.915) * usdVal);
    map['CHF'] = Math.round((1 / 0.865) * usdVal);
    map['AED'] = Math.round((1 / 3.6725) * usdVal);
    map['TRY'] = Math.round((1 / 33.5) * usdVal);
    map['GBP'] = Math.round((1 / 0.782) * usdVal);
    map['CAD'] = Math.round((1 / 1.37) * usdVal);

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

    // D. Compute all derived asset prices dynamically via database formulas
    const derivedList = marketRates?.derivedAssets || marketRates?.derived_assets || [];
    if (Array.isArray(derivedList) && derivedList.length > 0) {
      const derived = computeAllDerivedPrices(derivedList, map);
      for (const [k, v] of Object.entries(derived)) {
        if (v > 0) map[k] = Math.round(v);
      }
    }

    return map;
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

    return computePriceMap(usdVal, goldUsdVal, silverUsdVal);
  }, [marketRates, calcData]);

  // Historical price maps for 24h, 7d, 30d periods
  const historicalPriceMaps = useMemo(() => {
    if (!benchmarks) return null;

    const currentUsd = Number(marketRates?.live_usd_toman || calcData?.inputs?.usd_toman || 95000);
    const currentGoldUsd = Number(marketRates?.gold_usd || calcData?.inputs?.gold_usd || 2890);
    const currentSilverUsd = Number(marketRates?.silver_usd || calcData?.silver?.silver_usd || 33.5);

    const buildHistoricalMap = (periodKey) => {
      const b = benchmarks[periodKey] || {};
      const histUsd = b.usd?.price || currentUsd;
      const histGold = b.ons_gold?.price || currentGoldUsd;
      const histSilver = b.ons_silver?.price || currentSilverUsd;

      // Compute pure intrinsic historical prices for all gold, coin, and currency types consistently
      const map = computePriceMap(histUsd, histGold, histSilver);

      // Apply historical foreign currency cross-rates if recorded in benchmarks
      const FOREX_CODES = ['eur', 'try', 'aed', 'gbp', 'chf', 'cad', 'aud', 'cny'];
      FOREX_CODES.forEach((code) => {
        if (b[code]?.price && Number(b[code].price) > 0) {
          map[code.toUpperCase()] = Math.round(Number(b[code].price) * histUsd);
        }
      });

      return map;
    };

    return {
      '24h': buildHistoricalMap('24h'),
      '7d': buildHistoricalMap('7d'),
      '30d': buildHistoricalMap('30d'),
    };
  }, [benchmarks, marketRates, calcData]);

  const portfolioMetrics = useMemo(() => {
    if (!portfolioData?.holdings) {
      return {
        items: [],
        totalCost: 0,
        totalRealValue: 0,
        totalPnl: 0,
        totalPnlPct: 0,
        hasAnyCost: false,
        perf24h: { diff: 0, diffPct: 0, isProfit: true },
        perf7d: { diff: 0, diffPct: 0, isProfit: true },
        perf30d: { diff: 0, diffPct: 0, isProfit: true },
      };
    }

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
      const itemPnlPct = hasBuyPrice && itemCost > 0 ? parseFloat(((itemPnl / itemCost) * 100).toFixed(1)) : null;

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
    const totalCost = costedItems.reduce((acc, it) => acc + it.itemCost, 0);
    const totalRealValue = items.reduce((acc, it) => acc + it.itemRealVal, 0);
    const hasAnyCost = costedItems.length > 0 && totalCost > 0;
    const totalPnl = costedItems.reduce((acc, it) => acc + (it.itemPnl || 0), 0);
    const totalPnlPct = hasAnyCost ? parseFloat(((totalPnl / totalCost) * 100).toFixed(1)) : 0;

    // Periodic returns (24h, 7d, 30d)
    const nowMs = Date.now();
    const periodCutoffs = {
      '24h': nowMs - 24 * 3600 * 1000,
      '7d':  nowMs - 7 * 24 * 3600 * 1000,
      '30d': nowMs - 30 * 24 * 3600 * 1000,
    };

    const calcPeriodicPerf = (periodKey) => {
      if (!hasAnyCost || costedItems.length === 0) {
        return {
          diff: 0,
          diffPct: 0,
          isProfit: true,
          pastTotalVal: 0,
          currentSubVal: 0,
          hasData: false,
        };
      }

      const histMap = historicalPriceMaps?.[periodKey];
      const cutoffMs = periodCutoffs[periodKey];

      let pastTotalVal = 0;
      let currentSubVal = 0;

      for (const it of costedItems) {
        const amt = Number(it.amount) || 0;
        if (amt <= 0) continue;

        const currentPrice = it.unitRealPrice || 0;
        const buyPrice = Number(it.buyPrice) || 0;
        const buyDateMs = parseDateToMs(it.buyDate);

        let pastPrice = currentPrice;
        if (buyDateMs && buyDateMs > cutoffMs) {
          pastPrice = buyPrice > 0 ? buyPrice : currentPrice;
        } else if (it.isCustomItem) {
          pastPrice = currentPrice;
        } else if (histMap && histMap[it.assetId] > 0) {
          pastPrice = histMap[it.assetId];
        }

        pastTotalVal += amt * pastPrice;
        currentSubVal += amt * currentPrice;
      }

      const diff = currentSubVal - pastTotalVal;
      const diffPct = pastTotalVal > 0 ? parseFloat(((diff / pastTotalVal) * 100).toFixed(2)) : 0;
      return {
        diff,
        diffPct,
        isProfit: diff >= 0,
        pastTotalVal,
        currentSubVal,
        hasData: true,
      };
    };

    const perf24h = calcPeriodicPerf('24h');
    const perf7d = calcPeriodicPerf('7d');
    const perf30d = calcPeriodicPerf('30d');

    return { items, totalCost, totalRealValue, totalPnl, totalPnlPct, hasAnyCost, perf24h, perf7d, perf30d };
  }, [portfolioData, realPriceMap, historicalPriceMaps]);

  const categoryGroups = useMemo(() => {
    return CATEGORY_DEFINITIONS.map((cat) => {
      const groupItems = portfolioMetrics.items.filter(cat.match);
      const costedGroupItems = groupItems.filter((it) => it.hasBuyPrice);
      const hasCostedItems = costedGroupItems.length > 0;
      const groupCost = costedGroupItems.reduce((acc, it) => acc + it.itemCost, 0);
      const groupRealVal = groupItems.reduce((acc, it) => acc + it.itemRealVal, 0);
      const groupPnl = costedGroupItems.reduce((acc, it) => acc + (it.itemPnl || 0), 0);
      const groupPnlPct = groupCost > 0 ? parseFloat(((groupPnl / groupCost) * 100).toFixed(1)) : 0;
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
        escapeCSV(item.hasBuyPrice && item.itemPnlPct !== null ? item.itemPnlPct.toFixed(1) + '%' : ''),
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
        activeTab="portfolio"
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
                <Lock size={15} color="var(--gold-light)" />
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
                <AlertBanner
                  type="error"
                  message={errorMsg}
                  style={{ marginBottom: '16px' }}
                />
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
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>

                <button type="submit" className="btn-unlock-shared" disabled={unlocking}>
                  {unlocking ? 'در حال بررسی...' : 'مشاهده'}
                </button>
              </form>

              <div className="shared-gate-footer">
                <Link to="/" className="back-home-link">← صفحه اصلی</Link>
              </div>
            </div>
          </div>
        ) : errorMsg ? (
          <div className="portfolio-empty-state" style={{ minHeight: '50vh' }}>
            <div className="empty-icon">
              <AlertTriangle size={42} color="var(--text-muted)" />
            </div>
            <h4>پورتفو در دسترس نیست</h4>
            <p>{errorMsg}</p>
            <Link to="/" className="btn-add-asset-center">صفحه اصلی</Link>
          </div>
        ) : (
          /* Unlocked Shared Portfolio View */
          <div className="portfolio-section shared-portfolio-container">
            {/* Owner Banner */}
            <div className="shared-owner-banner">
              <div className="owner-badge">
                <span className="owner-avatar">
                  <Briefcase size={20} color="var(--gold-light)" />
                </span>
                <div className="owner-info">
                  <h2>{portfolioName ? `پورتفوی «${portfolioName}»` : 'پورتفو'} • {ownerName}</h2>
                  <span className="shared-view-tag">
                    {portfolioMetrics.items.length.toLocaleString('fa-IR')} قلم در {categoryGroups.length.toLocaleString('fa-IR')} دسته
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
                          <span className="table-title-icon"><FileText size={18} /></span>
                          <span>سبد دارایی</span>
                        </h3>
                        {isE2ee && (
                          <span className={`portfolio-encryption-tag e2ee ${isVaultLocked ? 'locked' : 'unlocked'}`} title="داده‌ها با رمزنگاری سرتاسری محافظت شده‌اند">
                            {isVaultLocked ? (
                              <><Lock size={12} style={{ verticalAlign: 'middle', marginLeft: '4px' }} /> قفل</>
                            ) : (
                              <><Unlock size={12} style={{ verticalAlign: 'middle', marginLeft: '4px' }} /> باز</>
                            )}
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
                        <Download size={15} strokeWidth={2.2} />
                      </button>
                    </div>
                  </div>

                  {isVaultLocked ? (
                    <div className="vault-lock-container">
                      <div className="vault-lock-card">
                        <div className="vault-lock-badge">گاوصندوق E2EE</div>
                        <h4 className="vault-lock-title">پورتفو قفل است</h4>
                        <p className="vault-lock-desc">
                          برای مشاهده و رمزگشایی دارایی‌ها، رمز عبور پورتفو را وارد کنید.
                        </p>

                        <form className="vault-unlock-form" onSubmit={handleUnlockVault}>
                          <div className="vault-pass-input-wrapper">
                            <input
                              type={showVaultPass ? 'text' : 'password'}
                              className="vault-unlock-input"
                              placeholder="رمز عبور..."
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
                              {showVaultPass ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                          </div>

                          {vaultError && (
                            <div className="vault-unlock-error">
                              <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
                              <span>{vaultError}</span>
                            </div>
                          )}

                          <div className="vault-unlock-actions">
                            <button
                              type="submit"
                              className="btn-vault-unlock"
                              disabled={decryptingVault || !vaultPassInput}
                            >
                              {decryptingVault ? 'در حال بررسی...' : 'بازگشایی'}
                            </button>
                          </div>
                        </form>

                        <div className="vault-lock-footer-note">
                          رمزگشایی در مرورگر شما انجام می‌شود و رمز در سرور ذخیره نمی‌گردد.
                        </div>
                      </div>
                    </div>
                  ) : categoryGroups.length === 0 ? (
                    <div className="portfolio-empty-state">
                      <div className="empty-icon">
                        <Briefcase size={40} strokeWidth={1.5} color="var(--text-muted)" />
                      </div>
                      <h4>پورتفو خالی است</h4>
                    </div>
                  ) : (
                    <div className="portfolio-categories-container">
                      {categoryGroups.map((group) => (
                        <div key={group.key} className="category-group-card">
                          <div className="category-group-header">
                            <div className="cat-header-identity">
                              <span className="cat-group-icon">
                                <CategoryIcon category={group.key} size={18} />
                              </span>
                              <div className="cat-group-titles">
                                <h4 className="cat-group-name">{group.name}</h4>
                                <span className="cat-group-count">{group.items.length.toLocaleString('fa-IR')} قلم</span>
                              </div>
                            </div>

                            <div className="cat-header-subtotals">
                              <div className="cat-subtotal-val">
                                <span className="subtotal-label">ارزش:</span>
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
                                  <th className="th-qty">مقدار</th>
                                  <th className="th-buy-price">قیمت خرید</th>
                                  <th className="th-real-price">ارزش روز واحد</th>
                                  <th className="th-total-val">ارزش کل</th>
                                  <th className="th-pnl">سود / زیان</th>
                                  <th className="th-date">تاریخ خرید</th>
                                  <th className="th-notes">یادداشت</th>
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
                                            <CategoryIcon category={item.assetType} size={12} style={{ marginLeft: '4px', verticalAlign: 'middle' }} />
                                            <span>
                                              {item.assetType === 'silver' ? 'نقره' :
                                               item.assetType === 'gold' ? 'طلا' :
                                               item.assetType === 'coin' ? 'سکه' :
                                               item.assetType === 'currency' ? 'ارز' :
                                               item.assetType === 'crypto' ? 'کریپتو' : 'سفارشی'}
                                            </span>
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
                                          {item.buyDate ? (
                                            <>
                                              <Calendar size={12} style={{ verticalAlign: 'middle', marginLeft: '4px', opacity: 0.7 }} />
                                              {item.buyDate}
                                            </>
                                          ) : '—'}
                                        </span>
                                      </td>

                                      <td className="td-notes">
                                        <span className="table-notes-text" title={item.notes || ''}>
                                          {item.notes ? (
                                            <>
                                              <MessageSquare size={12} style={{ verticalAlign: 'middle', marginLeft: '4px', opacity: 0.7 }} />
                                              {item.notes}
                                            </>
                                          ) : '—'}
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
                      <span className="stat-label">ارزش کل</span>
                      <span className="real-pill">ارزش روز</span>
                    </div>
                    <div className={`stat-number gold-gradient-text ${hideValues ? 'is-masked' : ''}`}>
                      {isVaultLocked ? (
                        <><Lock size={16} style={{ verticalAlign: 'middle', marginLeft: '4px' }} /> قفل</>
                      ) : hideValues ? '****' : formatNum(portfolioMetrics.totalRealValue)}
                      {!isVaultLocked && <span className="stat-unit">تومان</span>}
                    </div>
                    <div className="stat-sub">
                      {isVaultLocked ? 'گاوصندوق قفل است' : 'ارزش روز دارایی‌ها'}
                    </div>
                  </div>

                  {/* Card 2: Initial Investment Cost */}
                  <div className="portfolio-stat-card">
                    <div className="stat-header">
                      <span className="stat-label">سرمایه اولیه</span>
                      <span className="count-pill">
                        {isVaultLocked ? (
                          <><Lock size={11} style={{ verticalAlign: 'middle', marginLeft: '3px' }} /> قفل</>
                        ) : `${portfolioMetrics.items.length.toLocaleString('fa-IR')} قلم`}
                      </span>
                    </div>
                    <div className={`stat-number ${hideValues ? 'is-masked' : ''}`}>
                      {isVaultLocked ? (
                        <span className="stat-sub" style={{ fontSize: '15px' }}>
                          <Lock size={13} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
                          قفل است
                        </span>
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
                      {isVaultLocked ? 'گاوصندوق قفل است' : portfolioMetrics.hasAnyCost ? 'بهای تمام‌شده' : 'محاسبه به نرخ روز'}
                    </div>
                  </div>

                  {/* Card 3: Total Real PnL & Periodic Performance */}
                  {(() => {
                    const currentPnl = (() => {
                      if (selectedPeriod === '24h') {
                        return {
                          diff: portfolioMetrics.perf24h.diff,
                          diffPct: portfolioMetrics.perf24h.diffPct,
                          isProfit: portfolioMetrics.perf24h.isProfit,
                          label: 'تغییرات نسبت به ۲۴ ساعت گذشته',
                          hasData: portfolioMetrics.perf24h.hasData,
                        };
                      }
                      if (selectedPeriod === '7d') {
                        return {
                          diff: portfolioMetrics.perf7d.diff,
                          diffPct: portfolioMetrics.perf7d.diffPct,
                          isProfit: portfolioMetrics.perf7d.isProfit,
                          label: 'تغییرات نسبت به ۷ روز گذشته',
                          hasData: portfolioMetrics.perf7d.hasData,
                        };
                      }
                      if (selectedPeriod === '30d') {
                        return {
                          diff: portfolioMetrics.perf30d.diff,
                          diffPct: portfolioMetrics.perf30d.diffPct,
                          isProfit: portfolioMetrics.perf30d.isProfit,
                          label: 'تغییرات نسبت به ۳۰ روز گذشته',
                          hasData: portfolioMetrics.perf30d.hasData,
                        };
                      }
                      return {
                        diff: portfolioMetrics.totalPnl,
                        diffPct: portfolioMetrics.totalPnlPct,
                        isProfit: portfolioMetrics.totalPnl >= 0,
                        label: portfolioMetrics.hasAnyCost
                          ? (portfolioMetrics.totalPnl >= 0 ? 'سودده (از زمان خرید)' : 'زیان‌ده (از زمان خرید)')
                          : 'محاسبه به نرخ روز',
                        hasData: portfolioMetrics.hasAnyCost,
                      };
                    })();

                    return (
                      <div className={`portfolio-stat-card pnl-card ${isVaultLocked ? 'neutral' : currentPnl.hasData ? (currentPnl.isProfit ? 'profit' : 'loss') : 'neutral'}`}>
                        <div className="stat-header">
                          <span className="stat-label">سود / زیان</span>

                          {/* Period Selector Pills */}
                          {!isVaultLocked && (
                            <div className="period-tabs-segmented">
                              <button
                                type="button"
                                className={`period-pill-btn ${selectedPeriod === 'all' ? 'active' : ''}`}
                                onClick={() => setSelectedPeriod('all')}
                                title="محاسبه نسبت به قیمت خرید (کل)"
                              >
                                کل
                              </button>
                              <button
                                type="button"
                                className={`period-pill-btn ${selectedPeriod === '24h' ? 'active' : ''}`}
                                onClick={() => setSelectedPeriod('24h')}
                                title="تغییرات ۲۴ ساعت گذشته"
                              >
                                ۲۴س
                              </button>
                              <button
                                type="button"
                                className={`period-pill-btn ${selectedPeriod === '7d' ? 'active' : ''}`}
                                onClick={() => setSelectedPeriod('7d')}
                                title="تغییرات ۷ روز گذشته"
                              >
                                ۷ر
                              </button>
                              <button
                                type="button"
                                className={`period-pill-btn ${selectedPeriod === '30d' ? 'active' : ''}`}
                                onClick={() => setSelectedPeriod('30d')}
                                title="تغییرات ۳۰ روز گذشته"
                              >
                                ۳۰ر
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="stat-pnl-row">
                          <div className={`stat-number ${hideValues ? 'is-masked' : ''}`}>
                            {isVaultLocked ? (
                              <span className="stat-sub" style={{ fontSize: '15px' }}>
                                <Lock size={13} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
                                قفل است
                              </span>
                            ) : currentPnl.hasData ? (
                              <>
                                {hideValues ? '****' : `${currentPnl.isProfit ? '+' : ''}${formatNum(currentPnl.diff)}`}
                                <span className="stat-unit">تومان</span>
                              </>
                            ) : (
                              <span className="stat-sub" style={{ fontSize: '15px' }}>بدون قیمت خرید</span>
                            )}
                          </div>

                          {!isVaultLocked && currentPnl.hasData && (
                            <span className={`pnl-badge ${currentPnl.isProfit ? 'profit' : 'loss'}`}>
                              {currentPnl.isProfit ? <ArrowUpRight size={13} style={{ verticalAlign: 'middle' }} /> : <ArrowDownRight size={13} style={{ verticalAlign: 'middle' }} />}
                              {hideValues ? '****' : `${currentPnl.isProfit ? '+' : ''}${Math.abs(currentPnl.diffPct).toFixed(1)}٪`}
                            </span>
                          )}
                        </div>

                        <div className="stat-sub">
                          {isVaultLocked ? 'گاوصندوق قفل است' : currentPnl.label}
                        </div>
                      </div>
                    );
                  })()}
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

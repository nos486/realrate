import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiGetSharedPortfolio, apiGetPrices } from '../api/client.js';
import { calculateMarketData } from '../utils/calculator.js';
import { computeUnifiedPrices } from '../utils/pricingEngine.js';
import Header from '../components/Header.jsx';
import AlertBanner from '../shared/ui/AlertBanner.jsx';
import { usePricing } from '../features/market/index.js';
import {
  HoldingsTable,
  CATEGORY_DEFINITIONS,
  formatAssetName,
  formatNum,
  normalizeHolding,
  resolveHoldingUnitRealPrice,
  computeReferenceAssetPnl,
  VaultLockCard,
} from '../features/portfolio/index.js';
import { calculateComputedHoldings } from '../features/transactions/index.js';
import { formatPct } from '../shared/utils/formatters.js';
import {
  getCategoryBadge,
  getCategoryLabel,
} from '../utils/financialSpecs.js';
import {
  Lock,
  Unlock,
  AlertTriangle,
  Eye,
  EyeOff,
  Briefcase,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
  Download,
} from 'lucide-react';
import {
  deriveE2eeKey,
  verifyE2eeKey,
  decryptHoldingFromApi,
  e2eeDecrypt,
  importRawKey,
  linkTokenToRawKey,
} from '../lib/e2ee.js';

/** Portfolio key carried in the share link's #fragment (never sent to the server) */
function readLinkKeyToken() {
  try {
    return new URLSearchParams(window.location.hash.replace(/^#/, '')).get('k') || '';
  } catch {
    return '';
  }
}
import { usePrivacyMode } from '../hooks/usePrivacyMode.js';
import { useFeedback } from '../shared/ui/FeedbackProvider.jsx';
import { SkeletonRows, SkeletonCards } from '../shared/ui/Skeleton.jsx';

export default function SharedPortfolioPage() {
  const { slug } = useParams();
  const pricing = usePricing();

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [requirePassword, setRequirePassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState(false);

  // E2EE Vault State for Shared Portfolio
  const [vaultKey, setVaultKey] = useState(null);
  const [vaultError, setVaultError] = useState('');
  const [decryptingVault, setDecryptingVault] = useState(false);

  // Privacy Mode State (Mask values as ****)
  const hideValues = usePrivacyMode();

  const [portfolioData, setPortfolioData] = useState(null); // { user, holdings }
  const [marketRates, setMarketRates] = useState(null);
  const [calcData, setCalcData] = useState(null);

  // 1. Fetch live market rates (gold, dollar, silver) & calculate real prices
  useEffect(() => {
    apiGetPrices()
      .then((data) => {
        if (data && data.success) {
          setMarketRates(data);
          const u = data.live_usd_toman || data.globalSettings?.default_usd_toman || 0;
          const g = data.gold_usd || data.globalSettings?.default_gold_usd || 0;
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

  // 2. Fetch shared portfolio
  const loadPortfolio = useCallback(async (pwd = '') => {
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
  }, [slug]);

  useEffect(() => {
    if (slug) {
      setLoading(true);
      loadPortfolio();
    }
  }, [slug, loadPortfolio]);

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

  // Transactions for this shared portfolio, decrypted/parsed the same way useTransactions.js
  // does for the authenticated view — needed so positions built purely from buy/sell
  // transactions (not a manually-added holding) aren't silently missing from the share.
  // The async result is tagged with the inputs it was computed from, so an empty/locked state
  // is derived during render and a result for older data is never shown.
  const [decryptResult, setDecryptResult] = useState({ source: null, key: null, list: [] });
  const rawTransactions = portfolioData?.transactions;
  const canDecrypt = Array.isArray(rawTransactions) && rawTransactions.length > 0 && !(isE2ee && !vaultKey);
  const decryptedTransactions = useMemo(
    () => (canDecrypt && decryptResult.source === rawTransactions && decryptResult.key === vaultKey
      ? decryptResult.list
      : []),
    [canDecrypt, decryptResult, rawTransactions, vaultKey]
  );

  useEffect(() => {
    const rawTxs = rawTransactions;
    if (!canDecrypt) return undefined;

    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        rawTxs.map(async (tx) => {
          const rawCipher = tx.encryptedPayload || tx.encrypted_payload || '';
          if (typeof rawCipher === 'string' && rawCipher.startsWith('enc:e2ee:v1:')) {
            if (!vaultKey) return null;
            const dec = await e2eeDecrypt(vaultKey, rawCipher);
            return dec && typeof dec === 'object' ? { ...tx, ...dec } : null;
          }
          if (typeof rawCipher === 'string') {
            try {
              return { ...tx, ...JSON.parse(rawCipher) };
            } catch {
              return null;
            }
          }
          if (typeof rawCipher === 'object' && rawCipher) {
            return { ...tx, ...rawCipher };
          }
          return null;
        })
      );
      if (!cancelled) setDecryptResult({ source: rawTxs, key: vaultKey, list: results.filter(Boolean) });
    })();

    return () => {
      cancelled = true;
    };
  }, [rawTransactions, canDecrypt, vaultKey]);

  const applyVaultKey = useCallback(async (key) => {
    setVaultKey(key);
    const holdings = portfolioData?.holdings;
    if (Array.isArray(holdings)) {
      const decrypted = await Promise.all(holdings.map((h) => decryptHoldingFromApi(key, h)));
      setPortfolioData((prev) => ({ ...prev, holdings: decrypted }));
    }
  }, [portfolioData?.holdings]);

  // A portfolio protected by its owner's account-wide encryption opens with the key in the link
  const linkKeyRequired = Boolean(portfolioData?.portfolio?.e2eeLinkKey);
  const [linkKeyState, setLinkKeyState] = useState({ tried: null, invalid: false });
  useEffect(() => {
    const portfolioId = portfolioData?.portfolio?.id;
    if (!linkKeyRequired || vaultKey || linkKeyState.tried === portfolioId) return undefined;
    let cancelled = false;
    (async () => {
      const raw = linkTokenToRawKey(readLinkKeyToken());
      let invalid = true;
      if (raw) {
        const key = await importRawKey(raw);
        // The key must actually open this portfolio's data
        const probe = (portfolioData.holdings || []).find((h) => typeof h.notes === 'string' && h.notes.startsWith('enc:e2ee:v1:'));
        const works = !probe || (await decryptHoldingFromApi(key, probe))?.isE2eeEncrypted === true;
        if (works && !cancelled) {
          await applyVaultKey(key);
          invalid = false;
        }
      }
      if (!cancelled) setLinkKeyState({ tried: portfolioId, invalid });
    })();
    return () => {
      cancelled = true;
    };
  }, [linkKeyRequired, vaultKey, linkKeyState.tried, portfolioData, applyVaultKey]);

  const handleUnlockVault = async (passphrase) => {
    if (!portfolioData?.portfolio?.isE2ee) return false;
    if (!portfolioData.portfolio.e2eeSalt) {
      setVaultError('این پورتفو فقط با لینک کامل (همراه با کلید) که مالک ارسال کرده باز می‌شود.');
      return false;
    }
    const pass = (passphrase || '').trim();
    if (!pass) {
      setVaultError('لطفاً رمز عبور شخصی گاوصندوق را وارد فرمایید.');
      return false;
    }
    setDecryptingVault(true);
    setVaultError('');
    try {
      const key = await deriveE2eeKey(pass, portfolioData.portfolio.e2eeSalt);
      const valid = await verifyE2eeKey(key, portfolioData.portfolio.e2eeVerifier);
      if (!valid) {
        setVaultError('رمز عبور وارد شده نادرست است.');
        return false;
      }
      await applyVaultKey(key);
      return true;
    } catch (err) {
      console.error('Shared vault unlock error:', err);
      setVaultError('خطا در رمزگشایی گاوصندوق: ' + (err.message || 'نامعتبر'));
      return false;
    } finally {
      setDecryptingVault(false);
    }
  };

  // Accurate Real Values & Metrics calculation via Canonical Pricing Engine
  const livePriceMap = pricing?.priceMap;
  const liveItemMap = pricing?.itemMap;
  const liveUsdToman = pricing?.usdToman;
  const liveGoldUsd = pricing?.goldUsd;
  const liveSilverUsd = pricing?.silverUsd;
  const realPriceMap = useMemo(() => {
    const map = {};
    if (livePriceMap) {
      Object.assign(map, livePriceMap);
    }
    if (marketRates || calcData) {
      const { priceMap } = computeUnifiedPrices({
        marketItems: calcData || marketRates,
        usdToman: marketRates?.live_usd_toman || calcData?.inputs?.usd_toman,
        goldUsd: marketRates?.gold_usd || calcData?.inputs?.gold_usd,
        silverUsd: marketRates?.silver_usd || calcData?.silver?.silver_usd,
      });
      if (priceMap) {
        Object.entries(priceMap).forEach(([k, v]) => {
          if (!map[k] && v > 0) map[k] = v;
        });
      }
    }
    return map;
  }, [livePriceMap, marketRates, calcData]);

  // Positions computed from the portfolio's buy/sell transactions (Weighted Average Cost) —
  // the second half of what the authenticated view shows alongside manually-added holdings.
  const { computedHoldings } = useMemo(
    () => calculateComputedHoldings(decryptedTransactions, realPriceMap),
    [decryptedTransactions, realPriceMap]
  );

  const portfolioMetrics = useMemo(() => {
    if (!portfolioData?.holdings) {
      return {
        items: [],
        totalCost: 0,
        totalRealValue: 0,
        totalPnl: 0,
        totalPnlPct: 0,
        hasAnyCost: false,
      };
    }

    const processHolding = (rawH, sourceTag) => {
      const h = normalizeHolding({ ...rawH, source: sourceTag }, liveItemMap);
      const amountNum = Number(h.amount) || 0;
      const buyPriceNum = Number(h.buyPrice) || 0;
      const hasBuyPrice = buyPriceNum > 0;
      const isCustomItem = h.assetType === 'custom' || h.assetId?.startsWith('custom_');

      const unitRealPrice = resolveHoldingUnitRealPrice(h, realPriceMap, {}, {
        usdToman: liveUsdToman || marketRates?.live_usd_toman || calcData?.inputs?.usd_toman,
        goldUsd: liveGoldUsd || marketRates?.gold_usd || calcData?.inputs?.gold_usd,
        silverUsd: liveSilverUsd || marketRates?.silver_usd || calcData?.silver?.silver_usd,
      });

      const itemCost = hasBuyPrice ? amountNum * buyPriceNum : 0;
      const itemRealVal = amountNum * unitRealPrice;
      const itemPnl = hasBuyPrice ? itemRealVal - itemCost : null;
      const itemPnlPct = hasBuyPrice && itemCost > 0 ? parseFloat(((itemPnl / itemCost) * 100).toFixed(1)) : null;

      const referencePnlInfo = computeReferenceAssetPnl({ ...h, itemRealVal }, realPriceMap, liveItemMap);

      return {
        ...h,
        source: sourceTag,
        hasBuyPrice,
        isCustomItem,
        unitRealPrice,
        itemCost,
        itemRealVal,
        itemPnl,
        itemPnlPct,
        referencePnlInfo,
      };
    };

    const manualItems = portfolioData.holdings.map((h) => processHolding(h, 'manual'));
    const computedItems = computedHoldings.map((h) => processHolding(h, 'transactions'));
    const items = [...manualItems, ...computedItems];

    const costedItems = items.filter((it) => it.hasBuyPrice);
    const totalCost = costedItems.reduce((acc, it) => acc + it.itemCost, 0);
    const totalRealValue = items.reduce((acc, it) => acc + it.itemRealVal, 0);
    const hasAnyCost = costedItems.length > 0 && totalCost > 0;
    const totalPnl = costedItems.reduce((acc, it) => acc + (it.itemPnl || 0), 0);
    const totalPnlPct = hasAnyCost ? parseFloat(((totalPnl / totalCost) * 100).toFixed(1)) : 0;

    return { items, totalCost, totalRealValue, totalPnl, totalPnlPct, hasAnyCost };
    // Prices also feed unitRealPrice directly (formula-priced assets), not only via realPriceMap
  }, [portfolioData, computedHoldings, realPriceMap, liveItemMap, liveUsdToman, liveGoldUsd, liveSilverUsd, marketRates, calcData]);

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

  const { toast } = useFeedback();

  // Export Shared Portfolio to CSV with UTF-8 BOM
  const handleExportCSV = () => {
    if (!portfolioMetrics.items.length) {
      toast.info('دارایی برای دریافت خروجی در این پورتفو وجود ندارد.');
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
      const assetTypeLabel = getCategoryBadge(item.category || item.assetType, 'سفارشی');
      const catLabel = getCategoryLabel(item.category || item.assetType, 'سایر دارایی‌ها');

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
          <div className="shared-portfolio-skeleton">
            <SkeletonCards count={3} label="در حال بارگذاری پورتفوی اشتراکی" />
            <SkeletonRows rows={5} columns={5} />
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
                    linkKeyRequired && !portfolioData?.portfolio?.e2eeSalt ? (
                      <div className="portfolio-empty-state">
                        <h4>این پورتفو رمزنگاری سرتاسری دارد</h4>
                        <p>
                          {linkKeyState.invalid && readLinkKeyToken()
                            ? 'کلید داخل این لینک معتبر نیست. لینک کامل را دوباره از مالک پورتفو بگیرید.'
                            : linkKeyState.tried
                            ? 'برای مشاهده، لینک کامل (همراه با بخش #k=…) که مالک پورتفو ارسال کرده لازم است.'
                            : 'در حال رمزگشایی…'}
                        </p>
                      </div>
                    ) : (
                      <VaultLockCard
                        portfolioName={portfolioData?.portfolio?.name}
                        onUnlock={handleUnlockVault}
                        error={vaultError}
                        loading={decryptingVault}
                      />
                    )
                  ) : categoryGroups.length === 0 ? (
                    <div className="portfolio-empty-state">
                      <div className="empty-icon">
                        <Briefcase size={40} strokeWidth={1.5} color="var(--text-muted)" />
                      </div>
                      <h4>پورتفو خالی است</h4>
                    </div>
                  ) : (
                    <HoldingsTable
                      categoryGroups={categoryGroups}
                      hideValues={hideValues}
                      readOnly={true}
                    />
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

                  {/* Card 3: Total Real PnL */}
                  {(() => {
                    const hasData = portfolioMetrics.hasAnyCost;
                    const isProfit = portfolioMetrics.totalPnl >= 0;
                    return (
                      <div className={`portfolio-stat-card pnl-card ${isVaultLocked ? 'neutral' : hasData ? (isProfit ? 'profit' : 'loss') : 'neutral'}`}>
                        <div className="stat-header">
                          <span className="stat-label">سود / زیان کل</span>
                        </div>

                        <div className="stat-pnl-row">
                          <div className={`stat-number ${hideValues ? 'is-masked' : ''}`}>
                            {isVaultLocked ? (
                              <span className="stat-sub" style={{ fontSize: '15px' }}>
                                <Lock size={13} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
                                قفل است
                              </span>
                            ) : hasData ? (
                              <>
                                {hideValues ? '****' : `${isProfit ? '+' : ''}${formatNum(portfolioMetrics.totalPnl)}`}
                                <span className="stat-unit">تومان</span>
                              </>
                            ) : (
                              <span className="stat-sub" style={{ fontSize: '15px' }}>بدون قیمت خرید</span>
                            )}
                          </div>

                          {!isVaultLocked && hasData && (
                            <span className={`pnl-badge ${isProfit ? 'profit' : 'loss'}`}>
                              {isProfit ? <ArrowUpRight size={13} style={{ verticalAlign: 'middle' }} /> : <ArrowDownRight size={13} style={{ verticalAlign: 'middle' }} />}
                              {hideValues ? '****' : `${isProfit ? '+' : ''}${formatPct(Math.abs(portfolioMetrics.totalPnlPct))}٪`}
                            </span>
                          )}
                        </div>

                        <div className="stat-sub">
                          {isVaultLocked
                            ? 'گاوصندوق قفل است'
                            : hasData
                            ? (isProfit ? 'سودده (از زمان خرید)' : 'زیان‌ده (از زمان خرید)')
                            : 'محاسبه به نرخ روز'}
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

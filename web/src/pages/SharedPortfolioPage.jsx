import { intlLocale, t } from '../utils/i18n.js';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { saveTextFile } from '../shared/utils/fileExport.js';
import { useParams, Link } from 'react-router-dom';
import { getSharedPortfolio } from '../features/portfolio/api/portfolioApi.js';
import Header from '../components/Header.jsx';
import AlertBanner from '../shared/ui/AlertBanner.jsx';
import { usePricing } from '../features/market/index.js';
import {
  HoldingsTable,
  formatAssetName,
  formatNum,
  normalizeHolding,
  VaultLockCard,
} from '../features/portfolio/index.js';
import { buildAssetLedgers } from '../features/portfolio/utils/assetLedger.js';
import AssetLedgerDetails from '../features/portfolio/components/AssetLedgerDetails.jsx';
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
import { decryptSharedItems } from '../shared/vault/vaultPortfolioItems.js';
import { buildCustomCategoryGroups } from '../features/portfolio/portfolioLayoutModel.js';

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
import { todayIso } from '../shared/utils/dates.js';

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
  // 2. Fetch shared portfolio
  const loadPortfolio = useCallback(async (pwd = '') => {
    setErrorMsg('');
    try {
      const res = await getSharedPortfolio(slug, pwd);
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
        setErrorMsg(res.message || t('خطا در دریافت پورتفو'));
      }
    } catch (err) {
      setErrorMsg(err.message || t('خطای سرور در بارگذاری پورتفو'));
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
      setErrorMsg(t('لطفاً رمز عبور را وارد فرمایید.'));
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
  // Items the owner keeps as account-vault records, opened with the link key
  const [vaultTransactions, setVaultTransactions] = useState({ key: null, list: [] });
  const rawTransactions = portfolioData?.transactions;
  const canDecrypt = Array.isArray(rawTransactions) && rawTransactions.length > 0 && !(isE2ee && !vaultKey);
  const decryptedTransactions = useMemo(
    () => [
      ...(canDecrypt && decryptResult.source === rawTransactions && decryptResult.key === vaultKey ? decryptResult.list : []),
      ...(vaultKey && vaultTransactions.key === vaultKey ? vaultTransactions.list : []),
    ],
    [canDecrypt, decryptResult, rawTransactions, vaultKey, vaultTransactions]
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
    const holdings = Array.isArray(portfolioData?.holdings) ? portfolioData.holdings : [];
    const decrypted = await Promise.all(holdings.map((h) => decryptHoldingFromApi(key, h)));
    const shared = await decryptSharedItems(key, {
      vaultHoldings: portfolioData?.vaultHoldings || [],
      vaultTransactions: portfolioData?.vaultTransactions || [],
      vaultLayout: portfolioData?.vaultLayout || [],
    });
    setVaultTransactions({ key, list: shared.transactions });
    setPortfolioData((prev) => ({
      ...prev,
      holdings: [...decrypted, ...shared.holdings],
      sharedLayout: shared.layout || null,
    }));
    setVaultKey(key);
  }, [portfolioData]);

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
        const vaultProbe = [...(portfolioData.vaultHoldings || []), ...(portfolioData.vaultTransactions || [])][0];
        const works = probe
          ? (await decryptHoldingFromApi(key, probe))?.isE2eeEncrypted === true
          : !vaultProbe || Boolean(await e2eeDecrypt(key, vaultProbe.payload));
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
      setVaultError(t('این پورتفو فقط با لینک کامل (همراه با کلید) که مالک ارسال کرده باز می‌شود.'));
      return false;
    }
    const pass = (passphrase || '').trim();
    if (!pass) {
      setVaultError(t('لطفاً رمز عبور شخصی گاوصندوق را وارد فرمایید.'));
      return false;
    }
    setDecryptingVault(true);
    setVaultError('');
    try {
      const key = await deriveE2eeKey(pass, portfolioData.portfolio.e2eeSalt);
      const valid = await verifyE2eeKey(key, portfolioData.portfolio.e2eeVerifier);
      if (!valid) {
        setVaultError(t('رمز عبور وارد شده نادرست است.'));
        return false;
      }
      await applyVaultKey(key);
      return true;
    } catch (err) {
      console.error('Shared vault unlock error:', err);
      setVaultError(t('خطا در رمزگشایی گاوصندوق: {error}', { error: err.message || t('نامعتبر') }));
      return false;
    } finally {
      setDecryptingVault(false);
    }
  };

  // Valued at the price book's prices (the same numbers shown everywhere)
  const livePriceMap = pricing?.priceMap;
  const liveItemMap = pricing?.itemMap;
  const realPriceMap = useMemo(() => livePriceMap || {}, [livePriceMap]);

  // One ledger per asset, as the owner sees it: manual records and transactions together, FIFO
  const ledger = useMemo(() => buildAssetLedgers({
    holdings: (portfolioData?.holdings || []).map((h) => normalizeHolding(h, liveItemMap)),
    transactions: decryptedTransactions,
    priceMap: realPriceMap,
  }), [portfolioData?.holdings, decryptedTransactions, realPriceMap, liveItemMap]);

  const portfolioMetrics = useMemo(() => ({
    items: portfolioData?.holdings ? ledger.assets.filter((a) => a.amount > 0) : [],
    ...ledger.summary,
  }), [ledger, portfolioData?.holdings]);

  const categoryGroups = useMemo(() => {
    return buildCustomCategoryGroups(portfolioMetrics.items, portfolioData?.sharedLayout || null);
  }, [portfolioMetrics.items, portfolioData?.sharedLayout]);

  const ownerName = portfolioData?.user?.name || slug;
  const portfolioName = portfolioData?.portfolio?.name;

  const { toast } = useFeedback();

  // Export Shared Portfolio to CSV with UTF-8 BOM
  const handleExportCSV = () => {
    if (!portfolioMetrics.items.length) {
      toast.info(t('دارایی برای دریافت خروجی در این پورتفو وجود ندارد.'));
      return;
    }

    const headers = [
      t('نام دارایی'),
      t('دسته‌بندی'),
      t('نوع دارایی'),
      t('مقدار / وزن'),
      t('واحد'),
      t('قیمت خرید واحد (تومان)'),
      t('بهای تمام‌شده کل (تومان)'),
      t('قیمت واقعی روز واحد (تومان)'),
      t('ارزش واقعی روز کل (تومان)'),
      t('سود / زیان کل (تومان)'),
      t('درصد سود / زیان'),
      t('تاریخ خرید'),
      t('یادداشت / توضیحات')
    ];

    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = portfolioMetrics.items.map((item) => {
      const assetTypeLabel = getCategoryBadge(item.category || item.assetType, t('سفارشی'));
      const catLabel = getCategoryLabel(item.category || item.assetType, t('سایر دارایی‌ها'));

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
        escapeCSV(item.firstDate || ''),
        escapeCSV('')
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.map(escapeCSV).join(','), ...rows].join('\r\n');
    const safeName = (portfolioName || 'shared-portfolio').replace(/[/\\?%*:|"<>]/g, '-');
    saveTextFile(`portfolio-${safeName}-${todayIso()}.csv`, csvContent, 'text/csv;charset=utf-8').catch(() => {});
  };

  return (
    <div className="app-layout">
      <Header
        usdToman={realPriceMap.usd || 0}
        gold18kPrice={realPriceMap['gold_18k'] || 0}
        activeTab="portfolio"
      />

      <main className="main-content">
        {loading ? (
          <div className="shared-portfolio-skeleton">
            <SkeletonCards count={3} label={t('در حال بارگذاری پورتفوی اشتراکی')} />
            <SkeletonRows rows={5} columns={5} />
          </div>
        ) : requirePassword ? (
          /* Password Gate Card */
          <div className="shared-auth-gate-wrap">
            <div className="auth-gate-card shared-lock-card">
              <div className="auth-gate-badge">
                <Lock size={15} color="var(--gold-light)" />
                <span className="badge-text">{t('پورتفوی محافظت‌شده')}</span>
              </div>

              <h2 className="auth-gate-title">
                {portfolioName ? t('پورتفوی «{name}»', { name: portfolioName }) : t('پورتفوی سرمایه‌گذاری')} {ownerName ? `(${ownerName})` : ''}
              </h2>
              <p className="auth-gate-desc">
                {t('مالک این پورتفو برای دسترسی به جزئیات دارایی‌ها، رمز عبور تعیین کرده است. جهت مشاهده، لطفاً رمز عبور را وارد نمایید.')}
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
                    placeholder={t('رمز عبور مشاهده پورتفو...')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn-toggle-pwd"
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? t('مخفی کردن') : t('نمایش رمز')}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>

                <button type="submit" className="btn-unlock-shared" disabled={unlocking}>
                  {unlocking ? t('در حال بررسی...') : t('مشاهده')}
                </button>
              </form>

              <div className="shared-gate-footer">
                <Link to="/" className="back-home-link">{t('← صفحه اصلی')}</Link>
              </div>
            </div>
          </div>
        ) : errorMsg ? (
          <div className="portfolio-empty-state" style={{ minHeight: '50vh' }}>
            <div className="empty-icon">
              <AlertTriangle size={42} color="#64748b" />
            </div>
            <h4>{t('پورتفو در دسترس نیست')}</h4>
            <p>{errorMsg}</p>
            <Link to="/" className="btn-add-asset-center">{t('صفحه اصلی')}</Link>
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
                  <h2>{portfolioName ? t('پورتفوی «{name}»', { name: portfolioName }) : t('پورتفو')} • {ownerName}</h2>
                  <span className="shared-view-tag">
                    {t('{items} قلم در {categories} دسته', { items: portfolioMetrics.items.length.toLocaleString(intlLocale()), categories: categoryGroups.length.toLocaleString(intlLocale()) })}
                  </span>
                </div>
              </div>
            </div>

            {/* Two-Column Split: Right (Table & Holdings), Left (Overview Summary Cards) */}
            <div className="portfolio-layout-split">
              {/* Right Column: Categorized Holdings List */}
              <div className="portfolio-content-column">
                <div className="portfolio-table-card is-plain">
                  <div className="portfolio-table-header">
                    <div className="table-title">
                      <div className="table-title-main">
                        <h3>
                          <span className="table-title-icon"><FileText size={18} /></span>
                          <span>{t('سبد دارایی')}</span>
                        </h3>
                        {isE2ee && (
                          <span className={`portfolio-encryption-tag e2ee ${isVaultLocked ? 'locked' : 'unlocked'}`} title={t('داده‌ها با رمزنگاری سرتاسری محافظت شده‌اند')}>
                            {isVaultLocked ? (
                              <><Lock size={12} style={{ verticalAlign: 'middle', marginInlineEnd: '4px' }} /> {t('قفل')}</>
                            ) : (
                              <><Unlock size={12} style={{ verticalAlign: 'middle', marginInlineEnd: '4px' }} /> {t('باز')}</>
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
                        title={t('دریافت فایل اکسل / CSV از اقلام این پورتفو')}
                        aria-label={t('خروجی CSV')}
                        disabled={isVaultLocked || portfolioMetrics.items.length === 0}
                      >
                        <Download size={15} strokeWidth={2.2} />
                      </button>
                    </div>
                  </div>

                  {isVaultLocked ? (
                    linkKeyRequired && !portfolioData?.portfolio?.e2eeSalt ? (
                      <div className="portfolio-empty-state">
                        <h4>{t('این پورتفو رمزنگاری سرتاسری دارد')}</h4>
                        <p>
                          {linkKeyState.invalid && readLinkKeyToken()
                            ? t('کلید داخل این لینک معتبر نیست. لینک کامل را دوباره از مالک پورتفو بگیرید.')
                            : linkKeyState.tried
                            ? t('برای مشاهده، لینک کامل (همراه با بخش #k=…) که مالک پورتفو ارسال کرده لازم است.')
                            : t('در حال رمزگشایی…')}
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
                        <Briefcase size={40} strokeWidth={1.5} color="#64748b" />
                      </div>
                      <h4>{t('پورتفو خالی است')}</h4>
                    </div>
                  ) : (
                    <HoldingsTable
                      categoryGroups={categoryGroups}
                      hideValues={hideValues}
                      itemMap={liveItemMap}
                      renderDetails={(asset) => (
                        // Dates, quantities and prices; not the owner's notes
                        <AssetLedgerDetails
                          asset={asset}
                          hideValues={hideValues}
                          readOnly
                          showNotes={false}
                          priceMap={realPriceMap}
                          itemMap={liveItemMap}
                        />
                      )}
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
                      <span className="stat-label">{t('ارزش کل')}</span>
                      <span className="real-pill">{t('ارزش روز')}</span>
                    </div>
                    <div className={`stat-number gold-gradient-text ${hideValues ? 'is-masked' : ''}`}>
                      {isVaultLocked ? (
                        <><Lock size={16} style={{ verticalAlign: 'middle', marginInlineEnd: '4px' }} /> {t('قفل')}</>
                      ) : hideValues ? '****' : formatNum(portfolioMetrics.totalRealValue)}
                      {!isVaultLocked && <span className="stat-unit">{t('تومان')}</span>}
                    </div>
                    <div className="stat-sub">
                      {isVaultLocked ? t('گاوصندوق قفل است') : t('ارزش روز دارایی‌ها')}
                    </div>
                  </div>

                  {/* Card 2: Initial Investment Cost */}
                  <div className="portfolio-stat-card">
                    <div className="stat-header">
                      <span className="stat-label">{t('سرمایه اولیه')}</span>
                      <span className="count-pill">
                        {isVaultLocked ? (
                          <><Lock size={11} style={{ verticalAlign: 'middle', marginInlineEnd: '3px' }} /> {t('قفل')}</>
                        ) : t('{n} قلم', { n: portfolioMetrics.items.length.toLocaleString(intlLocale()) })}
                      </span>
                    </div>
                    <div className={`stat-number ${hideValues ? 'is-masked' : ''}`}>
                      {isVaultLocked ? (
                        <span className="stat-sub" style={{ fontSize: '15px' }}>
                          <Lock size={13} style={{ verticalAlign: 'middle', marginInlineEnd: '4px' }} />
                          {t('قفل است')}
                        </span>
                      ) : portfolioMetrics.hasAnyCost ? (
                        <>
                          {hideValues ? '****' : formatNum(portfolioMetrics.totalCost)}
                          <span className="stat-unit">{t('تومان')}</span>
                        </>
                      ) : (
                        <span className="stat-sub" style={{ fontSize: '15px' }}>{t('ثبت‌نشده')}</span>
                      )}
                    </div>
                    <div className="stat-sub">
                      {isVaultLocked ? t('گاوصندوق قفل است') : portfolioMetrics.hasAnyCost ? t('بهای تمام‌شده') : t('محاسبه به نرخ روز')}
                    </div>
                  </div>

                  {/* Card 3: Total Real PnL */}
                  {(() => {
                    const hasData = portfolioMetrics.hasAnyCost;
                    const isProfit = portfolioMetrics.totalPnl >= 0;
                    return (
                      <div className={`portfolio-stat-card pnl-card ${isVaultLocked ? 'neutral' : hasData ? (isProfit ? 'profit' : 'loss') : 'neutral'}`}>
                        <div className="stat-header">
                          <span className="stat-label">{t('سود / زیان کل')}</span>
                        </div>

                        <div className="stat-pnl-row">
                          <div className={`stat-number ${hideValues ? 'is-masked' : ''}`}>
                            {isVaultLocked ? (
                              <span className="stat-sub" style={{ fontSize: '15px' }}>
                                <Lock size={13} style={{ verticalAlign: 'middle', marginInlineEnd: '4px' }} />
                                {t('قفل است')}
                              </span>
                            ) : hasData ? (
                              <>
                                {hideValues ? '****' : `${isProfit ? '+' : ''}${formatNum(portfolioMetrics.totalPnl)}`}
                                <span className="stat-unit">{t('تومان')}</span>
                              </>
                            ) : (
                              <span className="stat-sub" style={{ fontSize: '15px' }}>{t('بدون قیمت خرید')}</span>
                            )}
                          </div>

                          {!isVaultLocked && hasData && (
                            <span className={`pnl-badge ${isProfit ? 'profit' : 'loss'}`}>
                              {isProfit ? <ArrowUpRight size={13} style={{ verticalAlign: 'middle' }} /> : <ArrowDownRight size={13} style={{ verticalAlign: 'middle' }} />}
                              {hideValues ? '****' : `${isProfit ? '+' : ''}${formatPct(Math.abs(portfolioMetrics.totalPnlPct))}${t('٪')}`}
                            </span>
                          )}
                        </div>

                        <div className="stat-sub">
                          {isVaultLocked
                            ? t('گاوصندوق قفل است')
                            : hasData
                            ? (isProfit ? t('سودده (از زمان خرید)') : t('زیان‌ده (از زمان خرید)'))
                            : t('محاسبه به نرخ روز')}
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
        <span>{t('RealRate • سامانه پایش ارزش واقعی دارایی‌ها')}</span>
      </footer>
    </div>
  );
}

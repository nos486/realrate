import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Lock,
  Unlock,
  Cloud,
  ShieldCheck,
  Sparkles,
  Pencil,
  Search,
  X,
  Settings,
  Plus,
  Briefcase,
  AlertTriangle,
  Eye,
  EyeOff,
  FolderPlus,
  Layers,
  Receipt,
} from 'lucide-react';
import { useAuth } from '../../auth/index.js';
import { usePricing } from '../../market/index.js';
import Modal from '../../../shared/ui/Modal.jsx';
import UserSettingsModal from '../../../components/UserSettingsModal.jsx';

import PortfolioSwitcher from './PortfolioSwitcher.jsx';
import HoldingsTable from './HoldingsTable.jsx';
import PortfolioOverviewCards from './PortfolioOverviewCards.jsx';
import AddHoldingForm from './AddHoldingForm.jsx';
import CsvExportButton from './CsvExportButton.jsx';

import { usePortfolio } from '../hooks/usePortfolio.js';
import { useHoldings } from '../hooks/useHoldings.js';
import { useTransactions, useComputedHoldings } from '../../transactions/index.js';
import { AlertBanner } from '../../../shared/ui/index.js';
import {
  normalizeHolding,
  formatAssetName,
  formatNum,
  parseInputNumber,
  CATEGORY_DEFINITIONS,
} from '../utils/holdingHelpers.js';

export default function PortfolioTracker({ rates, calcData, usdToman, goldUsd }) {
  const { user, loading: authLoading, triggerLogin } = useAuth();
  const pricing = usePricing();

  // 1. Portfolio Management Hook
  const {
    portfolios,
    activePortfolio,
    switchPortfolio,
    createPortfolio,
    deletePortfolio,
    fetchPortfolios,
    loadingPortfolios,
  } = usePortfolio();

  // 2. Holdings Management Hook for active portfolio
  const {
    holdings,
    loadingHoldings,
    submitting,
    deletingId,
    boursePricesMap,
    fetchHoldings,
    addHolding,
    updateHolding,
    deleteHolding,
    isVaultLocked,
    unlockVault,
    lockVault,
    vaultUnlockError,
    unlockingVault,
    activeVaultKey,
  } = useHoldings(activePortfolio);

  // 3. UI State
  const [hideValues, setHideValues] = useState(() => {
    try {
      return localStorage.getItem('realrate_hide_values') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handlePrivacyChange = (e) => {
      try {
        if (e && e.detail && typeof e.detail.hideValues === 'boolean') {
          setHideValues(e.detail.hideValues);
        } else {
          setHideValues(localStorage.getItem('realrate_hide_values') === 'true');
        }
      } catch {}
    };
    window.addEventListener('realrate_privacy_change', handlePrivacyChange);
    window.addEventListener('storage', handlePrivacyChange);
    return () => {
      window.removeEventListener('realrate_privacy_change', handlePrivacyChange);
      window.removeEventListener('storage', handlePrivacyChange);
    };
  }, []);

  const [holdingsFilterQuery, setHoldingsFilterQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState(null);

  const [newPortfolioModalOpen, setNewPortfolioModalOpen] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState('');
  const [creatingPortfolio, setCreatingPortfolio] = useState(false);

  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  const [vaultUnlockPassInput, setVaultUnlockPassInput] = useState('');
  const [showVaultUnlockPass, setShowVaultUnlockPass] = useState(false);

  // 4. Pricing Map & Asset Real Price Calculation
  const realPriceMap = useMemo(() => {
    const map = {};
    if (pricing?.priceMap) {
      Object.assign(map, pricing.priceMap);
    }
    if (boursePricesMap) {
      Object.entries(boursePricesMap).forEach(([sym, pt]) => {
        if (pt > 0) {
          map[`bourse_${sym}`] = pt;
          map[sym] = pt;
        }
      });
    }
    if (calcData?.analysis && Array.isArray(calcData.analysis)) {
      calcData.analysis.forEach((item) => {
        const val = item.market || item.expected_price || item.intrinsic;
        if (val > 0 && !map[item.id]) {
          const rounded = Math.round(val);
          map[item.id] = rounded;
          map[`src_def_${item.id}`] = rounded;
        }
      });
    }
    return map;
  }, [pricing?.priceMap, boursePricesMap, calcData]);

  // 4b. Transactions & Computed Holdings Hook for active portfolio
  const { transactions } = useTransactions(activePortfolio, activeVaultKey);
  const { computedHoldings, warnings: transactionWarnings } = useComputedHoldings(transactions, realPriceMap);

  // 5. Portfolio Metrics (combining manual holdings + computed holdings from transactions)
  const portfolioMetrics = useMemo(() => {
    const processHolding = (rawH, sourceTag = 'manual') => {
      const h = normalizeHolding({ ...rawH, source: sourceTag });
      const amountNum = Number(h.amount) || 0;
      const buyPriceNum = Number(h.buyPrice) || 0;
      const hasBuyPrice = buyPriceNum > 0;
      const cleanAssetId = (h.assetId || '').replace(/^src_def_/, '');
      const isCustomItem =
        h.assetType === 'custom' ||
        h.assetId?.startsWith('custom_') ||
        cleanAssetId.startsWith('custom_');
      const isBourseItem =
        h.assetType === 'bourse' ||
        h.assetType === 'bourse_fund' ||
        h.assetId?.startsWith('bourse_');

      let symCode = isBourseItem
        ? h.assetId?.startsWith('bourse_')
          ? h.assetId.replace('bourse_', '')
          : ''
        : null;
      if (isBourseItem && !symCode && h.assetName) {
        const match = h.assetName.match(/(?:سهام|صندوق)?\s*([^\s()]+)/);
        if (match && match[1]) symCode = match[1];
      }
      const normSym = symCode ? symCode.replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim() : '';
      const liveBoursePrice =
        isBourseItem && symCode
          ? boursePricesMap[symCode] || (normSym && boursePricesMap[normSym])
          : null;

      const unitRealPrice = isBourseItem
        ? liveBoursePrice || Number(h.currentPrice) || (hasBuyPrice ? buyPriceNum : 0)
        : isCustomItem
          ? Number(h.currentPrice) || (hasBuyPrice ? buyPriceNum : 0)
          : realPriceMap[cleanAssetId] ||
          realPriceMap[h.assetId] ||
          Number(h.currentPrice) ||
          (hasBuyPrice ? buyPriceNum : 0);

      const itemCost = hasBuyPrice ? amountNum * buyPriceNum : 0;
      const itemRealVal = amountNum * unitRealPrice;
      const itemPnl = hasBuyPrice ? itemRealVal - itemCost : null;
      const itemPnlPct =
        hasBuyPrice && itemCost > 0
          ? parseFloat(((itemPnl / itemCost) * 100).toFixed(1))
          : null;

      return {
        ...h,
        source: sourceTag,
        hasBuyPrice,
        isCustomItem,
        isBourseItem,
        unitRealPrice,
        itemCost,
        itemRealVal,
        itemPnl,
        itemPnlPct,
      };
    };

    const manualItems = holdings.map((h) => processHolding(h, 'manual'));
    const computedItems = computedHoldings.map((h) => processHolding(h, 'transactions'));
    const allItems = [...manualItems, ...computedItems];

    const costedItems = allItems.filter((it) => it.hasBuyPrice);
    const totalCost = costedItems.reduce((acc, it) => acc + it.itemCost, 0);
    const totalRealValue = allItems.reduce((acc, it) => acc + it.itemRealVal, 0);
    const hasAnyCost = costedItems.length > 0 && totalCost > 0;
    const totalPnl = costedItems.reduce((sum, it) => sum + (it.itemPnl || 0), 0);
    const totalPnlPct = hasAnyCost ? parseFloat(((totalPnl / totalCost) * 100).toFixed(1)) : 0;

    return {
      items: allItems,
      manualItems,
      computedItems,
      totalCost,
      totalRealValue,
      totalPnl,
      totalPnlPct,
      hasAnyCost,
    };
  }, [holdings, computedHoldings, realPriceMap, boursePricesMap]);

  // 6. Category Groups helper
  const buildCategoryGroups = useCallback((itemsList, filterQuery) => {
    let itemsToGroup = itemsList || [];
    if (filterQuery && filterQuery.trim()) {
      const q = filterQuery.trim().toLowerCase();
      itemsToGroup = itemsToGroup.filter((it) => {
        const name = (it.assetName || '').toLowerCase();
        const id = (it.assetId || '').toLowerCase();
        const notes = (it.notes || '').toLowerCase();
        return name.includes(q) || id.includes(q) || notes.includes(q);
      });
    }

    return CATEGORY_DEFINITIONS.map((cat) => {
      const groupItems = itemsToGroup.filter(cat.match);
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
  }, []);

  const manualCategoryGroups = useMemo(() => {
    return buildCategoryGroups(portfolioMetrics.manualItems, holdingsFilterQuery);
  }, [buildCategoryGroups, portfolioMetrics.manualItems, holdingsFilterQuery]);

  const computedCategoryGroups = useMemo(() => {
    return buildCategoryGroups(portfolioMetrics.computedItems, holdingsFilterQuery);
  }, [buildCategoryGroups, portfolioMetrics.computedItems, holdingsFilterQuery]);

  const categoryGroups = useMemo(() => {
    return buildCategoryGroups(portfolioMetrics.items, holdingsFilterQuery);
  }, [buildCategoryGroups, portfolioMetrics.items, holdingsFilterQuery]);

  // 7. Actions & Handlers
  const handleOpenAdd = () => {
    setEditingHolding(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (item) => {
    setEditingHolding(item);
    setModalOpen(true);
  };

  const handleSubmitHolding = async (holdingData) => {
    if (holdingData.id) {
      const ok = await updateHolding(holdingData);
      if (ok) setModalOpen(false);
    } else {
      const ok = await addHolding(holdingData);
      if (ok) setModalOpen(false);
    }
  };

  const handleDeleteHolding = async (id) => {
    if (!window.confirm('آیا از حذف این دارایی از پورتفو اطمینان دارید؟')) return;
    await deleteHolding(id);
  };

  const handleCreatePortfolio = async (e) => {
    e.preventDefault();
    if (!newPortfolioName.trim()) return;
    setCreatingPortfolio(true);
    try {
      const p = await createPortfolio(newPortfolioName);
      if (p) {
        setNewPortfolioName('');
        setNewPortfolioModalOpen(false);
      }
    } finally {
      setCreatingPortfolio(false);
    }
  };

  const handleDeleteActivePortfolio = async (portfolioId) => {
    if (!window.confirm('آیا از حذف این پورتفو اطمینان دارید؟ تمام دارایی‌های آن حذف خواهد شد.')) {
      return;
    }
    const ok = await deletePortfolio(portfolioId || activePortfolio?.id);
    if (ok) setSettingsModalOpen(false);
  };

  const handleUnlockVault = async (e) => {
    if (e) e.preventDefault();
    const ok = await unlockVault(vaultUnlockPassInput);
    if (ok) {
      setVaultUnlockPassInput('');
    }
  };

  // ─── AUTH GATE (Required Login Screen) ──────────────────────────────────
  if (authLoading) {
    return (
      <div className="portfolio-loading-state">
        <div className="spinner-glow"></div>
        <p>در حال بارگذاری اطلاعات کاربری...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="portfolio-auth-gate">
        <div className="auth-gate-card">
          <div className="auth-gate-badge">
            <span className="lock-icon">
              <Lock size={15} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
            </span>
            <span className="badge-text">نیازمند ورود به حساب کاربری</span>
          </div>

          <h3 className="auth-gate-title">مدیریت هوشمند پورتفوی سرمایه‌گذاری</h3>
          <p className="auth-gate-desc">
            اطلاعات دارایی‌های شما به صورت امن در پایگاه داده ابری ذخیره شده و ارزش روز آن‌ها بر
            پایه نرخ لحظه‌ای طلا، نقره و دلار محاسبه می‌گردد.
          </p>

          <div className="auth-gate-features">
            <div className="gate-feature-item">
              <span className="feature-icon"><Cloud size={18} /></span>
              <div className="feature-info">
                <strong>ذخیره ابری</strong>
                <span>دسترسی به پورتفو از تمام دستگاه‌ها با امنیت کامل</span>
              </div>
            </div>
            <div className="gate-feature-item">
              <span className="feature-icon"><ShieldCheck size={18} /></span>
              <div className="feature-info">
                <strong>محاسبه ارزش واقعی</strong>
                <span>ارزش خالص طلا و نقره بر اساس قیمت جهانی و دلار</span>
              </div>
            </div>
            <div className="gate-feature-item">
              <span className="feature-icon"><Sparkles size={18} /></span>
              <div className="feature-info">
                <strong>تنوع دارایی‌ها</strong>
                <span>پشتیبانی از انواع طلا، سکه، نقره، ارزها و دارایی‌های شخصی</span>
              </div>
            </div>
            <div className="gate-feature-item">
              <span className="feature-icon"><Pencil size={18} /></span>
              <div className="feature-info">
                <strong>ثبت جزئیات</strong>
                <span>امکان ثبت تاریخ خرید، قیمت تمام‌شده و یادداشت</span>
              </div>
            </div>
          </div>

          <div className="auth-gate-actions">
            <button className="btn-google-gate-login" onClick={triggerLogin}>
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>ورود با گوگل</span>
            </button>
            <span className="gate-privacy-note">
              <Lock size={12} style={{ verticalAlign: 'middle', marginLeft: '4px', display: 'inline' }} />
              اطلاعات پورتفو کاملاً محرمانه است.
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ─── LOGGED IN VIEW ─────────────────────────────────────────────────────
  return (
    <div className="portfolio-section">
      {/* Portfolios Navigation Bar */}
      <PortfolioSwitcher
        portfolios={portfolios}
        activePortfolioId={activePortfolio?.id}
        onSelect={switchPortfolio}
        onNewPortfolio={() => setNewPortfolioModalOpen(true)}
        holdingsCount={portfolioMetrics.items.length}
        activeCount={portfolioMetrics.items.length}
        mode="portfolio"
      />

      {/* Two Column Split: Right (Content & Holdings Tables), Left (Overview Summary Cards) */}
      <div className="portfolio-layout-split">
        {/* Right Column: Holdings List Grouped by Category */}
        <div className="portfolio-content-column">
          <div className="portfolio-table-card">
            <div className="portfolio-table-header">
              <div className="table-title">
                <div className="table-title-main">
                  <h3>{activePortfolio?.name || 'سبد دارایی'}</h3>
                  {activePortfolio?.isE2ee && (
                    <span
                      className={`portfolio-encryption-tag e2ee ${isVaultLocked ? 'locked' : 'unlocked'}`}
                      title="داده‌ها با رمز اختصاصی شما در مرورگر رمزنگاری می‌شوند."
                    >
                      {isVaultLocked ? (
                        <>
                          <Lock size={12} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
                          قفل
                        </>
                      ) : (
                        <>
                          <Unlock size={12} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
                          باز
                        </>
                      )}
                    </span>
                  )}
                </div>
              </div>

              {!isVaultLocked && holdings.length > 0 && (
                <div className="portfolio-search-box">
                  <Search size={14} className="portfolio-search-icon" />
                  <input
                    type="text"
                    placeholder="جستجو در اقلام پورتفو..."
                    value={holdingsFilterQuery}
                    onChange={(e) => setHoldingsFilterQuery(e.target.value)}
                    className="portfolio-search-input"
                  />
                  {holdingsFilterQuery && (
                    <button
                      type="button"
                      className="portfolio-search-clear"
                      onClick={() => setHoldingsFilterQuery('')}
                      title="پاک کردن جستجو"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              )}

              <div className="portfolio-header-actions">
                {activePortfolio?.isE2ee && !isVaultLocked && (
                  <button
                    type="button"
                    className="btn-lock-vault"
                    onClick={lockVault}
                    title="قفل کردن گاوصندوق"
                  >
                    <Lock size={12} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
                    <span>قفل</span>
                  </button>
                )}

                <CsvExportButton
                  items={portfolioMetrics.items}
                  portfolioName={activePortfolio?.name || 'portfolio'}
                  disabled={isVaultLocked || holdings.length === 0}
                />

                {activePortfolio && (
                  <button
                    type="button"
                    className="btn-portfolio-settings icon-only"
                    onClick={() => setSettingsModalOpen(true)}
                    title="تنظیمات پورتفو"
                    aria-label="تنظیمات پورتفو"
                  >
                    <Settings size={15} strokeWidth={2} />
                  </button>
                )}
              </div>
            </div>

            {loadingHoldings || loadingPortfolios ? (
              <div className="portfolio-empty-state">
                <div className="spinner-glow"></div>
                <p>در حال دریافت اطلاعات پورتفوی شما از دیتابیس...</p>
              </div>
            ) : isVaultLocked ? (
              <div className="vault-lock-container">
                <div className="vault-lock-card">
                  <div className="vault-lock-badge">
                    <Lock size={13} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
                    گاوصندوق E2EE
                  </div>
                  <h4 className="vault-lock-title">پورتفو قفل است</h4>
                  <p className="vault-lock-desc">
                    برای دسترسی به اطلاعات، رمز عبور پورتفوی «{activePortfolio?.name}» را وارد کنید.
                  </p>

                  <form className="vault-unlock-form" onSubmit={handleUnlockVault}>
                    <div className="vault-pass-input-wrapper">
                      <input
                        type={showVaultUnlockPass ? 'text' : 'password'}
                        className="vault-unlock-input"
                        placeholder="رمز عبور..."
                        value={vaultUnlockPassInput}
                        onChange={(e) => setVaultUnlockPassInput(e.target.value)}
                        autoFocus
                        dir="ltr"
                      />
                      <button
                        type="button"
                        className="btn-toggle-vault-eye"
                        onClick={() => setShowVaultUnlockPass((prev) => !prev)}
                        tabIndex={-1}
                        title={showVaultUnlockPass ? 'مخفی کردن' : 'نمایش رمز'}
                      >
                        {showVaultUnlockPass ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>

                    {vaultUnlockError && (
                      <div className="vault-unlock-error">
                        <AlertTriangle
                          size={14}
                          style={{ verticalAlign: 'middle', marginLeft: '4px', display: 'inline' }}
                        />
                        {vaultUnlockError}
                      </div>
                    )}

                    <div className="vault-unlock-actions">
                      <button
                        type="submit"
                        className="btn-vault-unlock"
                        disabled={unlockingVault || !vaultUnlockPassInput}
                      >
                        {unlockingVault ? 'در حال بررسی...' : 'بازگشایی'}
                      </button>
                    </div>
                  </form>

                  <div className="vault-lock-footer-note">
                    رمزگشایی در مرورگر انجام می‌شود و رمز در سرور ذخیره نمی‌گردد.
                  </div>
                </div>
              </div>
            ) : portfolioMetrics.items.length === 0 ? (
              <div className="portfolio-empty-state">
                {transactionWarnings.length > 0 && (
                  <div className="portfolio-tx-warnings-box" style={{ marginBottom: '16px', width: '100%' }}>
                    {transactionWarnings.map((w) => (
                      <AlertBanner
                        key={w.assetId}
                        type="warning"
                        message={w.message}
                        icon={<AlertTriangle size={16} />}
                        style={{ marginBottom: '8px' }}
                      />
                    ))}
                  </div>
                )}
                <div className="empty-icon">
                  <Briefcase size={44} strokeWidth={1.5} color="var(--text-muted)" />
                </div>
                <h4>پورتفو خالی است</h4>
                <p>
                  دارایی‌های خود اعم از طلا، سکه، نقره یا ارز را ثبت کنید یا از تب تراکنش‌ها معامله جدید وارد نمایید.
                </p>
                <button className="btn-add-asset-center" onClick={handleOpenAdd}>
                  <Plus size={15} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
                  ثبت دارایی دستی
                </button>
              </div>
            ) : (
              <div className="portfolio-dual-tables-container">
                {/* Warnings from oversold transactions */}
                {transactionWarnings.length > 0 && (
                  <div className="portfolio-tx-warnings-box" style={{ marginBottom: '16px' }}>
                    {transactionWarnings.map((w) => (
                      <AlertBanner
                        key={w.assetId}
                        type="warning"
                        message={w.message}
                        icon={<AlertTriangle size={16} />}
                        style={{ marginBottom: '8px' }}
                      />
                    ))}
                  </div>
                )}

                {/* Section A: Manual Holdings */}
                {manualCategoryGroups.length > 0 && (
                  <div className="portfolio-table-group-section manual-section">
                    <div className="portfolio-section-title-row">
                      <h3 className="portfolio-section-title">دارایی‌های ثبت‌شده دستی</h3>
                      <span className="portfolio-section-count-badge">
                        {portfolioMetrics.manualItems.length.toLocaleString('fa-IR')} قلم دارایی
                      </span>
                    </div>
                    <HoldingsTable
                      categoryGroups={manualCategoryGroups}
                      hideValues={hideValues}
                      readOnly={false}
                      deletingId={deletingId}
                      onEdit={handleOpenEdit}
                      onDelete={handleDeleteHolding}
                    />
                  </div>
                )}

                {/* Section B: Computed Holdings from Transactions */}
                {computedCategoryGroups.length > 0 && (
                  <div className="portfolio-table-group-section computed-section">
                    <div className="portfolio-section-title-row">
                      <div className="portfolio-section-title-with-pill">
                        <h3 className="portfolio-section-title">دارایی‌های حاصل از تراکنش‌ها</h3>
                        <span className="tx-auto-section-pill">محاسبه خودکار</span>
                      </div>
                      <span className="portfolio-section-count-badge">
                        {portfolioMetrics.computedItems.length.toLocaleString('fa-IR')} دارایی از روی تراکنش‌ها
                      </span>
                    </div>
                    <HoldingsTable
                      categoryGroups={computedCategoryGroups}
                      hideValues={hideValues}
                      readOnly={false}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Left Column: Summary & Overview Cards */}
        <div className="portfolio-sidebar-column">
          <PortfolioOverviewCards
            portfolioMetrics={portfolioMetrics}
            categoryGroups={categoryGroups}
            holdingsCount={holdings.length}
            hideValues={hideValues}
            onOpenAdd={handleOpenAdd}
            isVaultLocked={isVaultLocked}
          />
        </div>
      </div>

      {/* Add / Edit Holding Modal */}
      <AddHoldingForm
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmitHolding}
        editingHolding={editingHolding}
        submitting={submitting}
        rates={rates}
        realPriceMap={realPriceMap}
      />

      {/* New Portfolio Modal */}
      <Modal
        isOpen={newPortfolioModalOpen}
        onClose={() => !creatingPortfolio && setNewPortfolioModalOpen(false)}
        title="پورتفوی جدید"
        icon={<FolderPlus size={18} />}
        maxWidth="460px"
        className="new-portfolio-modal-box"
        onSubmit={handleCreatePortfolio}
        footer={
          <div className="modal-actions">
            <button
              type="button"
              className="btn-cancel"
              disabled={creatingPortfolio}
              onClick={() => setNewPortfolioModalOpen(false)}
            >
              انصراف
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={creatingPortfolio || !newPortfolioName.trim()}
            >
              {creatingPortfolio ? 'در حال ایجاد...' : 'ایجاد'}
            </button>
          </div>
        }
      >
        <div className="form-item">
          <label>نام پورتفو</label>
          <input
            type="text"
            placeholder="مثلاً: پس‌انداز طلا، سبد ارزی..."
            value={newPortfolioName}
            onChange={(e) => setNewPortfolioName(e.target.value)}
            className="form-input"
            required
            autoFocus
          />
          <span className="field-sub-note">
            امکان تنظیم رمز و لینک اشتراک اختصاصی در تنظیمات وجود دارد.
          </span>
        </div>
      </Modal>

      {/* User & Share Settings Modal */}
      <UserSettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        portfolio={activePortfolio}
        canDelete={portfolios.length > 1}
        onDelete={handleDeleteActivePortfolio}
        onSaved={(data) => {
          const targetId =
            data && typeof data === 'object' && data.portfolioId
              ? data.portfolioId
              : activePortfolio?.id;
          fetchPortfolios(targetId);
        }}
      />
    </div>
  );
}

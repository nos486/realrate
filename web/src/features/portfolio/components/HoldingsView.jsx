/**
 * HoldingsView.jsx — Holdings sub-tab of the merged Portfolio page
 *
 * Renders the dual (manual + computed-from-transactions) holdings tables, overview cards,
 * and vault/E2EE controls for the portfolio selected by the parent (PortfolioTracker). The
 * portfolio switcher, page header, and "new portfolio" modal live in the parent, shared with
 * the Transactions sub-tab — this view owns only its own holdings data and its add/edit
 * holding + portfolio-settings modals, exactly as it did before the two pages were merged.
 */

import React, { useState, useMemo, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import {
  Lock,
  Unlock,
  Search,
  X,
  Settings,
  Plus,
  Briefcase,
  AlertTriangle,
} from 'lucide-react';
import { usePricing } from '../../market/index.js';
import UserSettingsModal from '../../../components/UserSettingsModal.jsx';

import HoldingsTable from './HoldingsTable.jsx';
import PortfolioOverviewCards from './PortfolioOverviewCards.jsx';
import AddHoldingForm from './AddHoldingForm.jsx';
import CsvExportButton from './CsvExportButton.jsx';
import CsvImportButton from './CsvImportButton.jsx';
import VaultLockCard from './VaultLockCard.jsx';

import { useHoldings } from '../hooks/useHoldings.js';
import { useTransactions, useComputedHoldings } from '../../transactions/index.js';
import { AlertBanner, SplitPageLayout } from '../../../shared/ui/index.js';
import {
  normalizeHolding,
  resolveHoldingUnitRealPrice,
  computeReferenceAssetPnl,
  CATEGORY_DEFINITIONS,
} from '../utils/holdingHelpers.js';
import { getItemCategory } from '../../../config/displayEngine.js';
import { usePrivacyMode } from '../../../hooks/usePrivacyMode.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { SkeletonRows } from '../../../shared/ui/Skeleton.jsx';

const HoldingsView = forwardRef(function HoldingsView(
  { activePortfolio, portfolios, loadingPortfolios = false, rates, calcData, usdToman, goldUsd, fetchPortfolios, deletePortfolio, onVaultLockChange, onCountChange },
  ref
) {
  const pricing = usePricing();

  // Holdings Management Hook for active portfolio
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
    accountManaged,
  } = useHoldings(activePortfolio);

  useEffect(() => {
    onVaultLockChange?.(isVaultLocked);
  }, [isVaultLocked, onVaultLockChange]);

  useEffect(() => {
    onCountChange?.(holdings.length);
  }, [holdings.length, onCountChange]);

  // UI State
  const hideValues = usePrivacyMode();

  const [holdingsFilterQuery, setHoldingsFilterQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState(null);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  const handleOpenAdd = useCallback(() => {
    setEditingHolding(null);
    setModalOpen(true);
  }, []);

  useImperativeHandle(ref, () => ({ openAdd: handleOpenAdd }));

  // Pricing Map & Asset Real Price Calculation
  const livePriceMap = pricing?.priceMap;
  const liveItemMap = pricing?.itemMap;
  const liveUsdToman = pricing?.usdToman;
  const liveGoldUsd = pricing?.goldUsd;
  const realPriceMap = useMemo(() => {
    const map = {};
    if (livePriceMap) {
      Object.assign(map, livePriceMap);
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
  }, [livePriceMap, boursePricesMap, calcData]);

  // Transactions & Computed Holdings Hook for active portfolio
  const { transactions } = useTransactions(activePortfolio, activeVaultKey);
  const { computedHoldings, warnings: transactionWarnings, summary: transactionSummary } = useComputedHoldings(transactions, realPriceMap);

  // Portfolio Metrics (combining manual holdings + computed holdings from transactions)
  const portfolioMetrics = useMemo(() => {
    const processHolding = (rawH, sourceTag = 'manual') => {
      const h = normalizeHolding({ ...rawH, source: sourceTag }, liveItemMap);
      const amountNum = Number(h.amount) || 0;
      const buyPriceNum = Number(h.buyPrice) || 0;
      const hasBuyPrice = buyPriceNum > 0;
      const cleanAssetId = (h.assetId || '').replace(/^src_def_/, '');
      const isCustomItem =
        h.assetType === 'custom' ||
        h.assetId?.startsWith('custom_') ||
        cleanAssetId.startsWith('custom_');
      const isBourseItem = ['bourse', 'bourse_fund'].includes(
        getItemCategory(h.assetId || h)
      );

      const unitRealPrice = resolveHoldingUnitRealPrice(h, realPriceMap, boursePricesMap, {
        usdToman: liveUsdToman || usdToman,
        goldUsd: liveGoldUsd || goldUsd,
      });

      const itemCost = hasBuyPrice ? amountNum * buyPriceNum : 0;
      const itemRealVal = amountNum * unitRealPrice;
      const itemPnl = hasBuyPrice ? itemRealVal - itemCost : null;
      const itemPnlPct =
        hasBuyPrice && itemCost > 0
          ? parseFloat(((itemPnl / itemCost) * 100).toFixed(1))
          : null;

      const referencePnlInfo = computeReferenceAssetPnl(
        { ...h, itemRealVal },
        livePriceMap || realPriceMap,
        liveItemMap
      );

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
        referencePnlInfo,
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
    // Prices feed unitRealPrice directly too (formula-priced assets), not only via realPriceMap
  }, [holdings, computedHoldings, realPriceMap, livePriceMap, boursePricesMap, liveItemMap, liveUsdToman, liveGoldUsd, usdToman, goldUsd]);

  // Category Groups helper
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

  // Actions & Handlers
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

  const { confirm, toast } = useFeedback();

  const handleDeleteHolding = async (id) => {
    const confirmed = await confirm({
      title: 'حذف دارایی',
      message: 'آیا از حذف این دارایی از پورتفو اطمینان دارید؟',
      confirmLabel: 'حذف',
      danger: true,
    });
    if (!confirmed) return;
    try {
      const ok = await deleteHolding(id);
      if (ok) toast.success('دارایی حذف شد.');
      else toast.error('حذف دارایی انجام نشد.');
    } catch (err) {
      toast.error(err.message || 'خطا در حذف دارایی');
    }
  };

  const handleDeleteActivePortfolio = async (portfolioId) => {
    const confirmed = await confirm({
      title: 'حذف پورتفو',
      message: 'آیا از حذف این پورتفو اطمینان دارید؟ تمام دارایی‌ها و تراکنش‌های آن حذف خواهد شد و این کار قابل بازگشت نیست.',
      confirmLabel: 'حذف پورتفو',
      danger: true,
    });
    if (!confirmed) return;
    const ok = await deletePortfolio(portfolioId || activePortfolio?.id);
    if (ok) setSettingsModalOpen(false);
  };

  return (
    <>
      <SplitPageLayout
        sidebar={
          <PortfolioOverviewCards
            portfolioMetrics={portfolioMetrics}
            categoryGroups={categoryGroups}
            holdingsCount={holdings.length}
            hideValues={hideValues}
            isVaultLocked={isVaultLocked}
            realizedPnl={transactionSummary?.hasRealizedPnl ? transactionSummary.totalRealizedPnl : null}
          />
        }
      >
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

                <CsvImportButton addHolding={addHolding} disabled={isVaultLocked} />

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

            {/* Until the portfolio list itself has loaded there is nothing to show — never flash
                "portfolio is empty" at a user who has holdings */}
            {(loadingPortfolios && !activePortfolio) || (loadingHoldings && holdings.length === 0) ? (
              <SkeletonRows rows={5} columns={6} label="در حال دریافت دارایی‌های پورتفو" />
            ) : isVaultLocked ? (
              <VaultLockCard
                portfolioName={activePortfolio?.name}
                onUnlock={unlockVault}
                error={vaultUnlockError}
                loading={unlockingVault}
                description={accountManaged ? 'این پورتفو با رمزنگاری سرتاسری حساب محافظت می‌شود. رمز عبور رمزنگاری حساب را وارد کنید — همه پورتفوها، وام‌ها و درآمدها با هم باز می‌شوند.' : null}
              />
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
                      itemMap={pricing?.itemMap}
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
                      itemMap={pricing?.itemMap}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
      </SplitPageLayout>

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

      {/* User & Share Settings Modal */}
      <UserSettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        portfolio={activePortfolio}
        canDelete={portfolios.length > 1}
        onDelete={handleDeleteActivePortfolio}
        onSaved={async (data) => {
          const targetId =
            data && typeof data === 'object' && data.portfolioId
              ? data.portfolioId
              : activePortfolio?.id;
          await fetchPortfolios(targetId);
          fetchHoldings();
        }}
      />
    </>
  );
});

export default HoldingsView;

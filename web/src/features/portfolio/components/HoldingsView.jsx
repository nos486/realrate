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
import { createPortal } from 'react-dom';
import {
  Search,
  X,
  Settings,
  Plus,
  Briefcase,
  AlertTriangle,
  SlidersHorizontal,
  Layers,
  List,
} from 'lucide-react';
import { usePricing } from '../../market/index.js';
import UserSettingsModal from '../../../components/UserSettingsModal.jsx';

import HoldingsTable from './HoldingsTable.jsx';
import PortfolioOverviewCards from './PortfolioOverviewCards.jsx';
import AddHoldingForm from './AddHoldingForm.jsx';
import CsvExportButton from './CsvExportButton.jsx';
import CsvImportButton from './CsvImportButton.jsx';
import VaultLockCard from './VaultLockCard.jsx';
import HoldingsCustomizeEditor from './HoldingsCustomizeEditor.jsx';

import { useHoldings } from '../hooks/useHoldings.js';
import { usePortfolioLayout } from '../hooks/usePortfolioLayout.js';
import { useTransactions, useComputedHoldings } from '../../transactions/index.js';
import { AlertBanner, Button, SplitPageLayout } from '../../../shared/ui/index.js';
import {
  normalizeHolding,
  resolveHoldingUnitRealPrice,
  computeReferenceAssetPnl,
  computeCompareAssetPnl,
} from '../utils/holdingHelpers.js';
import {
  buildCustomCategoryGroups,
  buildDefaultPortfolioLayout,
} from '../portfolioLayoutModel.js';
import { getItemCategory } from '../../../config/displayEngine.js';
import { usePrivacyMode } from '../../../hooks/usePrivacyMode.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { SkeletonRows } from '../../../shared/ui/Skeleton.jsx';
import { aggregateHoldings } from '../utils/holdingAggregates.js';

// «هر خرید» (every lot, editable) or «جمع هر دارایی» (one row per asset); remembered per browser
const HOLDINGS_VIEW_KEY = 'realrate_holdings_view';

function readHoldingsView() {
  try {
    return localStorage.getItem(HOLDINGS_VIEW_KEY) === 'assets' ? 'assets' : 'lots';
  } catch {
    return 'lots';
  }
}
import { useDemo } from '../../demo/index.js';

const HoldingsView = forwardRef(function HoldingsView(
  { activePortfolio, portfolios, loadingPortfolios = false, fetchPortfolios, deletePortfolio, onVaultLockChange, onCountChange, toolbarSlot = null },
  ref
) {
  const pricing = usePricing();
  const { readOnly } = useDemo();

  // Holdings Management Hook for active portfolio
  const {
    holdings,
    loadingHoldings,
    submitting,
    deletingId,
    fetchHoldings,
    addHolding,
    updateHolding,
    deleteHolding,
    isVaultLocked,
    unlockVault,
    vaultUnlockError,
    unlockingVault,
    activeVaultKey,
    accountManaged,
  } = useHoldings(activePortfolio);

  // Custom Category Layout Hook for active portfolio
  const {
    layout: customLayout,
    setLayout: setCustomLayout,
    resetLayout: resetCustomLayout,
  } = usePortfolioLayout(activePortfolio, activeVaultKey, isVaultLocked);

  const [isCustomizing, setIsCustomizing] = useState(false);

  useEffect(() => {
    setIsCustomizing(false);
  }, [activePortfolio?.id]);

  useEffect(() => {
    onVaultLockChange?.(isVaultLocked);
  }, [isVaultLocked, onVaultLockChange]);

  useEffect(() => {
    onCountChange?.(holdings.length);
  }, [holdings.length, onCountChange]);

  // UI State
  const hideValues = usePrivacyMode();

  const [holdingsFilterQuery, setHoldingsFilterQuery] = useState('');
  const [holdingsView, setHoldingsView] = useState(readHoldingsView);
  const changeHoldingsView = useCallback((view) => {
    setHoldingsView(view);
    try {
      localStorage.setItem(HOLDINGS_VIEW_KEY, view);
    } catch {
      // Only a convenience
    }
  }, []);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState(null);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  const handleOpenAdd = useCallback(() => {
    setEditingHolding(null);
    setModalOpen(true);
  }, []);

  useImperativeHandle(ref, () => ({ openAdd: handleOpenAdd }));

  // Every holding is valued at the price book's price (the same number shown everywhere)
  const livePriceMap = pricing?.priceMap;
  const liveItemMap = pricing?.itemMap;
  const realPriceMap = useMemo(() => livePriceMap || {}, [livePriceMap]);

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

      const unitRealPrice = resolveHoldingUnitRealPrice(h, realPriceMap);

      const itemCost = hasBuyPrice ? amountNum * buyPriceNum : 0;
      const itemRealVal = amountNum * unitRealPrice;
      const itemPnl = hasBuyPrice ? itemRealVal - itemCost : null;
      const itemPnlPct =
        hasBuyPrice && itemCost > 0
          ? parseFloat(((itemPnl / itemCost) * 100).toFixed(1))
          : null;

      const referencePnlInfo = computeReferenceAssetPnl(
        { ...h, itemRealVal },
        realPriceMap,
        liveItemMap
      );

      const comparePnlInfo = computeCompareAssetPnl(
        { ...h, itemCost, itemRealVal },
        realPriceMap,
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
        comparePnlInfo,
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
  }, [holdings, computedHoldings, realPriceMap, liveItemMap]);

  // Category Groups helper (custom layout if saved, otherwise default fixed categories)
  const buildCategoryGroups = useCallback(
    (itemsList, filterQuery) => {
      return buildCustomCategoryGroups(itemsList, customLayout, filterQuery);
    },
    [customLayout]
  );

  const handleToggleCustomize = useCallback(() => {
    if (!isCustomizing && !customLayout) {
      const defaultLayout = buildDefaultPortfolioLayout(portfolioMetrics.items);
      setCustomLayout(defaultLayout);
    }
    setIsCustomizing((prev) => !prev);
  }, [isCustomizing, customLayout, portfolioMetrics.items, setCustomLayout]);

  const manualCategoryGroups = useMemo(() => {
    return buildCategoryGroups(portfolioMetrics.manualItems, holdingsFilterQuery);
  }, [buildCategoryGroups, portfolioMetrics.manualItems, holdingsFilterQuery]);

  const computedCategoryGroups = useMemo(() => {
    return buildCategoryGroups(portfolioMetrics.computedItems, holdingsFilterQuery);
  }, [buildCategoryGroups, portfolioMetrics.computedItems, holdingsFilterQuery]);

  const categoryGroups = useMemo(() => {
    return buildCategoryGroups(portfolioMetrics.items, holdingsFilterQuery);
  }, [buildCategoryGroups, portfolioMetrics.items, holdingsFilterQuery]);

  // Every lot of an asset (manual and from transactions) added up into one row
  const assetItems = useMemo(() => aggregateHoldings(portfolioMetrics.items), [portfolioMetrics.items]);
  const assetCategoryGroups = useMemo(
    () => buildCategoryGroups(assetItems, holdingsFilterQuery),
    [buildCategoryGroups, assetItems, holdingsFilterQuery]
  );
  const hasRepeatedAssets = assetItems.length < portfolioMetrics.items.length;

  // «N خرید» on an asset row: its lots, found by name in the per-lot view
  const handleShowLots = useCallback((item) => {
    changeHoldingsView('lots');
    setHoldingsFilterQuery(item.assetName || item.name || '');
  }, [changeHoldingsView]);

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

  const toolbar = (
    <div className="portfolio-toolbar">
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
        {!isVaultLocked && portfolioMetrics.items.length > 0 && !isCustomizing && (
          <div className="holdings-view-switch" role="group" aria-label="نحوه نمایش">
            <button
              type="button"
              className={holdingsView === 'lots' ? 'active' : ''}
              aria-pressed={holdingsView === 'lots'}
              onClick={() => changeHoldingsView('lots')}
              title="هر خرید در یک ردیف (قابل ویرایش)"
            >
              <List size={14} />
              <span>هر خرید</span>
            </button>
            <button
              type="button"
              className={holdingsView === 'assets' ? 'active' : ''}
              aria-pressed={holdingsView === 'assets'}
              onClick={() => changeHoldingsView('assets')}
              title="جمع تعداد، میانگین قیمت خرید و سود/زیان هر دارایی"
            >
              <Layers size={14} />
              <span>جمع هر دارایی</span>
            </button>
          </div>
        )}
        {!isVaultLocked && portfolioMetrics.items.length > 0 && (
          <button
            type="button"
            className={`btn-portfolio-customize ${isCustomizing ? 'is-active' : ''}`}
            onClick={handleToggleCustomize}
            disabled={readOnly}
            title={readOnly ? 'در نسخه دمو غیرفعال است' : (isCustomizing ? 'پایان شخصی‌سازی دسته‌ها' : 'شخصی‌سازی دسته‌ها')}
            aria-label="شخصی‌سازی دسته‌ها"
          >
            <SlidersHorizontal size={14} />
            <span>{isCustomizing ? 'پایان ویرایش' : 'شخصی‌سازی دسته‌ها'}</span>
          </button>
        )}

        <CsvExportButton
          items={portfolioMetrics.items}
          portfolioName={activePortfolio?.name || 'portfolio'}
          disabled={isVaultLocked || holdings.length === 0}
        />

        <CsvImportButton addHolding={addHolding} disabled={readOnly || isVaultLocked} />

        {activePortfolio && (
          <button
            type="button"
            className="btn-portfolio-settings icon-only"
            onClick={() => setSettingsModalOpen(true)}
            disabled={readOnly}
            title={readOnly ? 'در نسخه دمو غیرفعال است' : 'تنظیمات پورتفو'}
            aria-label="تنظیمات پورتفو"
          >
            <Settings size={15} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );

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
          {/* The asset groups are cards of their own: no card around them */}
          <div className="portfolio-table-card is-plain">
            {/* No list header: the portfolio is named in the switcher above, and its toolbar
                (search, export / import, settings) sits in the sub-tab row */}
            {toolbarSlot ? createPortal(toolbar, toolbarSlot) : toolbar}

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
                  <Briefcase size={44} strokeWidth={1.5} color="#64748b" />
                </div>
                <h4>پورتفو خالی است</h4>
                <p>
                  دارایی‌های خود اعم از طلا، سکه، نقره یا ارز را ثبت کنید یا از تب تراکنش‌ها معامله جدید وارد نمایید.
                </p>
                <Button icon={<Plus size={16} />} onClick={handleOpenAdd}>
                  ثبت دارایی دستی
                </Button>
              </div>
            ) : isCustomizing ? (
              <HoldingsCustomizeEditor
                layout={customLayout || buildDefaultPortfolioLayout(portfolioMetrics.items)}
                portfolioMetrics={portfolioMetrics}
                itemMap={pricing?.itemMap}
                onChange={setCustomLayout}
                onReset={() => {
                  resetCustomLayout();
                  setIsCustomizing(false);
                }}
                onClose={() => setIsCustomizing(false)}
              />
            ) : holdingsView === 'assets' ? (
              <div className="portfolio-dual-tables-container">
                <div className="portfolio-table-group-section">
                  <div className="portfolio-section-title-row">
                    <h3 className="portfolio-section-title">جمع هر دارایی</h3>
                    <span className="portfolio-section-count-badge">
                      {assetItems.length.toLocaleString('fa-IR')} دارایی از {portfolioMetrics.items.length.toLocaleString('fa-IR')} خرید
                    </span>
                  </div>
                  <HoldingsTable
                    categoryGroups={assetCategoryGroups}
                    hideValues={hideValues}
                    readOnly={readOnly}
                    itemMap={pricing?.itemMap}
                    aggregated
                    onShowLots={handleShowLots}
                  />
                </div>
              </div>
            ) : (
              <div className="portfolio-dual-tables-container">
                {hasRepeatedAssets && (
                  <button type="button" className="holdings-repeat-hint" onClick={() => changeHoldingsView('assets')}>
                    <Layers size={14} />
                    بعضی دارایی‌ها چند بار خریده شده‌اند — «جمع هر دارایی» تعداد کل و میانگین قیمت خرید هرکدام را نشان می‌دهد
                  </button>
                )}
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
                      readOnly={readOnly}
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
                      readOnly={readOnly}
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

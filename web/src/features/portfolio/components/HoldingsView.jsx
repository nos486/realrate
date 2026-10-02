/**
 * HoldingsView.jsx — Holdings sub-tab of the merged Portfolio page
 *
 * One list: every asset once, with its quantity, average buy price of what is left, value and
 * P&L, from its whole ledger — the manual records and the transactions together, first in first
 * out (utils/assetLedger.js). A row opens into everything recorded for that asset
 * (AssetLedgerDetails), with «خرید» / «فروش» and each entry's own edit. «+» asks what to record:
 * a transaction, or a manual record. Overview cards and vault controls as before; the portfolio
 * switcher, page header and "new portfolio" modal live in the parent (PortfolioTracker).
 */

import React, { useState, useMemo, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  X,
  Settings,
  Plus,
  Briefcase,
  SlidersHorizontal,
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
import AssetLedgerDetails from './AssetLedgerDetails.jsx';
import TargetAllocationModal from './TargetAllocationModal.jsx';
import AlertStack from '../../../shared/alerts/AlertStack.jsx';
import { useAlertSource } from '../../../shared/alerts/alertStore.js';
import { portfolioAlerts } from '../../../shared/alerts/alertRules.js';
import TransactionForm from '../../transactions/components/TransactionForm.jsx';

import { useHoldings } from '../hooks/useHoldings.js';
import { usePortfolioLayout } from '../hooks/usePortfolioLayout.js';
import { useTransactions } from '../../transactions/index.js';
import { Button, SplitPageLayout } from '../../../shared/ui/index.js';
import { normalizeHolding } from '../utils/holdingHelpers.js';
import { buildAssetLedgers } from '../utils/assetLedger.js';
import {
  buildCustomCategoryGroups,
  buildDefaultPortfolioLayout,
  setTargets,
} from '../portfolioLayoutModel.js';
import { buildAllocation, DRIFT_THRESHOLD } from '../utils/allocationTargets.js';
import { getItemCategory } from '../../../config/displayEngine.js';
import { usePrivacyMode } from '../../../hooks/usePrivacyMode.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { SkeletonRows } from '../../../shared/ui/Skeleton.jsx';
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

  // Counted once the ledger is built (below)

  // UI State
  const hideValues = usePrivacyMode();

  const [holdingsFilterQuery, setHoldingsFilterQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState(null);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  // The one entry form: its buy side (AddHoldingForm, `buyPreset` for an asset row's «خرید») and
  // its sell side (TransactionForm), each switching to the other for the same asset
  const [buyPreset, setBuyPreset] = useState(null);
  const openManualForm = useCallback((holding = null, preset = null) => {
    setEditingHolding(holding);
    setBuyPreset(preset);
    setModalOpen(true);
  }, []);
  const handleOpenAdd = useCallback(() => openManualForm(null), [openManualForm]);
  // The transaction form: { editing } to edit one, { preset } for a new one of an asset
  const [txForm, setTxForm] = useState(null);

  useImperativeHandle(ref, () => ({ openAdd: handleOpenAdd }));

  // Every holding is valued at the price book's price (the same number shown everywhere)
  const livePriceMap = pricing?.priceMap;
  const liveItemMap = pricing?.itemMap;
  const realPriceMap = useMemo(() => livePriceMap || {}, [livePriceMap]);

  // The portfolio's transactions (all of them: the ledger replays every one)
  const {
    transactions,
    submitting: submittingTx,
    addTransaction,
    updateTransaction,
    deleteTransaction,
  } = useTransactions(activePortfolio, activeVaultKey);

  // One ledger per asset: manual records and transactions together, FIFO
  const normalizedHoldings = useMemo(
    () => holdings.map((h) => normalizeHolding(h, liveItemMap)),
    [holdings, liveItemMap]
  );
  const ledger = useMemo(
    () => buildAssetLedgers({ holdings: normalizedHoldings, transactions, priceMap: realPriceMap }),
    [normalizedHoldings, transactions, realPriceMap]
  );
  const transactionWarnings = ledger.warnings;

  // What is held, by category (a fully sold asset leaves the list; its realized P&L stays in the totals)
  const portfolioMetrics = useMemo(() => {
    const items = ledger.assets
      .filter((a) => a.amount > 0)
      .map((a) => {
        const cleanAssetId = (a.assetId || '').replace(/^src_def_/, '');
        return {
          ...a,
          isCustomItem: a.assetType === 'custom' || cleanAssetId.startsWith('custom_'),
          isBourseItem: ['bourse', 'bourse_fund'].includes(getItemCategory(a.assetId || a)),
        };
      });
    return { items, ...ledger.summary };
  }, [ledger]);

  // Category Groups helper (custom layout if saved, otherwise default fixed categories)
  const buildCategoryGroups = useCallback(
    (itemsList, filterQuery) => {
      return buildCustomCategoryGroups(itemsList, customLayout, filterQuery);
    },
    [customLayout]
  );

  // A layout may hold only targets (no custom groups yet): the editor starts from the standard ones
  const hasCustomGroups = Boolean(customLayout?.groups?.length);
  const handleToggleCustomize = useCallback(() => {
    if (!isCustomizing && !hasCustomGroups) {
      setCustomLayout(buildDefaultPortfolioLayout(portfolioMetrics.items, customLayout?.targets));
    }
    setIsCustomizing((prev) => !prev);
  }, [isCustomizing, hasCustomGroups, customLayout, portfolioMetrics.items, setCustomLayout]);

  // Back to the standard categories: the targets stay
  const handleResetLayout = useCallback(() => {
    if (customLayout?.targets) setCustomLayout({ groups: [], targets: customLayout.targets });
    else resetCustomLayout();
    setIsCustomizing(false);
  }, [customLayout, setCustomLayout, resetCustomLayout]);

  // Target shares per category: every category (a targeted one holding nothing too), unfiltered
  const [targetsOpen, setTargetsOpen] = useState(false);
  const allCategoryGroups = useMemo(
    () => buildCustomCategoryGroups(portfolioMetrics.items, customLayout, '', { keepEmpty: true }),
    [portfolioMetrics.items, customLayout]
  );
  const allocation = useMemo(
    () => buildAllocation(allCategoryGroups, customLayout?.targets),
    [allCategoryGroups, customLayout]
  );
  // This portfolio's alerts (drift from its targets, more sold than held) go to the alert store:
  // the banners below and the header's bell show them
  useAlertSource(
    activePortfolio?.id ? `portfolio:${activePortfolio.id}` : null,
    useMemo(
      () => (isVaultLocked ? [] : portfolioAlerts(activePortfolio, allocation, transactionWarnings, { threshold: DRIFT_THRESHOLD })),
      [isVaultLocked, activePortfolio, allocation, transactionWarnings]
    )
  );

  const handleSaveTargets = useCallback((targets) => {
    const empty = Object.keys(targets).length === 0;
    if (empty && !hasCustomGroups) resetCustomLayout();
    else setCustomLayout(setTargets(customLayout || { groups: [] }, targets));
    setTargetsOpen(false);
  }, [customLayout, hasCustomGroups, setCustomLayout, resetCustomLayout]);

  const categoryGroups = useMemo(() => {
    return buildCategoryGroups(portfolioMetrics.items, holdingsFilterQuery);
  }, [buildCategoryGroups, portfolioMetrics.items, holdingsFilterQuery]);

  useEffect(() => {
    onCountChange?.(portfolioMetrics.items.length);
  }, [portfolioMetrics.items.length, onCountChange]);

  // The sell form's balance: what each asset holds, manual records included
  const currentHoldingsMap = useMemo(
    () => Object.fromEntries(ledger.assets.map((a) => [a.assetId, { amount: a.amount, unit: a.unit }])),
    [ledger]
  );

  // Actions & Handlers
  const presetOf = (asset, transactionType) => ({
    assetId: asset.assetId,
    assetName: asset.assetName,
    unit: asset.unit,
    transactionType,
    unitPrice: asset.unitRealPrice,
  });

  const handleSubmitTransaction = async (formData) => {
    const res = formData.id ? await updateTransaction(formData.id, formData) : await addTransaction(formData);
    if (res) setTxForm(null);
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

  const handleEditEntry = (entry) => {
    if (entry.kind === 'manual') {
      const original = holdings.find((h) => h.id === entry.id) || entry.record;
      openManualForm(original);
    } else {
      setTxForm({ editing: transactions.find((t) => t.id === entry.id) || entry.record });
    }
  };

  const handleDeleteEntry = async (entry) => {
    if (entry.kind === 'manual') {
      await handleDeleteHolding(entry.id);
      return;
    }
    const confirmed = await confirm({
      title: 'حذف تراکنش',
      message: 'این تراکنش حذف شود؟',
      confirmLabel: 'حذف',
      danger: true,
    });
    if (!confirmed) return;
    try {
      if (await deleteTransaction(entry.id)) toast.success('تراکنش حذف شد.');
      else toast.error('حذف تراکنش انجام نشد.');
    } catch (err) {
      toast.error(err.message || 'خطا در حذف تراکنش');
    }
  };

  const handleDeleteHolding = async (id) => {
    const confirmed = await confirm({
      title: 'حذف ثبت دستی',
      message: 'این ثبت دستی از پورتفو حذف شود؟',
      confirmLabel: 'حذف',
      danger: true,
    });
    if (!confirmed) return;
    try {
      const ok = await deleteHolding(id);
      if (ok) toast.success('ثبت دستی حذف شد.');
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
          items={normalizedHoldings}
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
            realizedPnl={ledger.summary.hasRealizedPnl ? ledger.summary.totalRealizedPnl : null}
            allocation={portfolioMetrics.items.length > 0 ? allocation : null}
            onEditTargets={readOnly ? null : () => setTargetsOpen(true)}
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
                <AlertStack sources={['portfolio']} scope={activePortfolio?.id} className="portfolio-alerts" />
                <div className="empty-icon">
                  <Briefcase size={44} strokeWidth={1.5} color="#64748b" />
                </div>
                <h4>پورتفو خالی است</h4>
                <p>
                  خرید و فروش طلا، سکه، ارز یا سهام را ثبت کنید، یا موجودی‌ای را که دارید دستی وارد کنید.
                </p>
                <Button icon={<Plus size={16} />} onClick={handleOpenAdd} disabled={readOnly}>
                  ثبت دارایی
                </Button>
              </div>
            ) : isCustomizing ? (
              <HoldingsCustomizeEditor
                layout={hasCustomGroups ? customLayout : buildDefaultPortfolioLayout(portfolioMetrics.items, customLayout?.targets)}
                portfolioMetrics={portfolioMetrics}
                itemMap={pricing?.itemMap}
                onChange={setCustomLayout}
                onReset={handleResetLayout}
                onClose={() => setIsCustomizing(false)}
              />
            ) : (
              <div className="portfolio-dual-tables-container">
                {/* Drift from the targets, more sold than held (shared/alerts) */}
                <AlertStack sources={['portfolio']} scope={activePortfolio?.id} className="portfolio-alerts" />
                <HoldingsTable
                  categoryGroups={categoryGroups}
                  hideValues={hideValues}
                  itemMap={pricing?.itemMap}
                  renderDetails={(asset) => (
                    <AssetLedgerDetails
                      asset={asset}
                      hideValues={hideValues}
                      readOnly={readOnly}
                      priceMap={realPriceMap}
                      itemMap={liveItemMap}
                      onBuy={(a) => openManualForm(null, { assetId: a.assetId, assetName: a.assetName, unit: a.unit })}
                      onSell={(a) => setTxForm({ preset: presetOf(a, 'sell') })}
                      onEditEntry={handleEditEntry}
                      onDeleteEntry={handleDeleteEntry}
                    />
                  )}
                />
              </div>
            )}
          </div>
      </SplitPageLayout>

      <TransactionForm
        isOpen={Boolean(txForm)}
        onClose={() => setTxForm(null)}
        onSubmit={handleSubmitTransaction}
        editingTransaction={txForm?.editing || null}
        preset={txForm?.preset || null}
        submitting={submittingTx}
        currentHoldingsMap={currentHoldingsMap}
        onSwitchToBuy={(asset) => {
          setTxForm(null);
          openManualForm(null, asset);
        }}
      />

      {/* Add / Edit Holding Modal */}
      <AddHoldingForm
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmitHolding}
        editingHolding={editingHolding}
        presetAsset={buyPreset}
        onSwitchToSell={(asset) => {
          setModalOpen(false);
          setTxForm({ preset: asset ? { ...asset, transactionType: 'sell', unitPrice: realPriceMap[asset.assetId] || 0 } : { transactionType: 'sell' } });
        }}
        submitting={submitting}
        realPriceMap={realPriceMap}
      />

      {/* User & Share Settings Modal */}
      {targetsOpen && (
        <TargetAllocationModal
          groups={allCategoryGroups}
          targets={customLayout?.targets || {}}
          onSave={handleSaveTargets}
          onClose={() => setTargetsOpen(false)}
        />
      )}

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

/**
 * TransactionsView.jsx — Transactions sub-tab of the merged Portfolio page
 *
 * Renders buy/sell transaction CRUD, search/filter, and turnover stats for the portfolio
 * selected by the parent (PortfolioTracker). A period picker (a year by default) sets the date
 * window fetched from the server — one query per period; the stats, search, type filter,
 * sorting and the 20-per-page list all work in the browser on that result (the fields are
 * encrypted). The full history is loaded only for the form's sell-balance check. The portfolio switcher and page header live in
 * the parent, shared with the Holdings sub-tab — this view owns only its own vault-unlock
 * state and transaction data, exactly as it did as a standalone page.
 */

import React, { useState, useMemo, useEffect, forwardRef, useImperativeHandle } from 'react';
import {
  Receipt,
  Plus,
  Pencil,
  Trash2,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  Calendar,
  MessageSquare,
} from 'lucide-react';
import { useTransactions } from '../hooks/useTransactions.js';
import { useComputedHoldings } from '../hooks/useComputedHoldings.js';
import TransactionForm from './TransactionForm.jsx';
import VaultLockCard from '../../portfolio/components/VaultLockCard.jsx';
import {
  isAccountVaultPortfolio,
  unlockVault as unlockAccountVault,
  markLegacyVaultUnlocked,
  LOCK_ALL_EVENT,
} from '../../../shared/vault/vaultStore.js';
import EmptyState from '../../../shared/ui/EmptyState.jsx';
import Button from '../../../shared/ui/Button.jsx';
import SplitPageLayout from '../../../shared/ui/SplitPageLayout.jsx';
import { usePricing } from '../../market/index.js';
import { CategoryIcon, formatAssetName, formatNum, getItemBrand, resolveAssetDisplayName } from '../../portfolio/utils/holdingHelpers.js';
import ResponsiveDataTable from '../../../shared/ui/ResponsiveDataTable.jsx';
import Pagination from '../../../shared/ui/Pagination.jsx';
import PeriodBar from '../../../shared/ui/PeriodBar.jsx';
import { DEFAULT_RECENT_PERIOD, periodFrom } from '../../../shared/utils/recentPeriods.js';
import { toIsoDay } from '../../../shared/vault/vaultRecordMeta.js';
import {
  deriveE2eeKey,
  verifyE2eeKey,
  saveVaultPassphraseToSession,
} from '../../../lib/e2ee.js';
import { usePrivacyMode } from '../../../hooks/usePrivacyMode.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { SkeletonRows } from '../../../shared/ui/Skeleton.jsx';

const TX_PAGE_SIZE = 20;

const TransactionsView = forwardRef(function TransactionsView(
  { activePortfolio, loadingPortfolios = false, calcData = null, rates = null, fetchPortfolios, onCountChange },
  ref
) {
  const pricing = usePricing();

  // E2EE Vault Keys State
  // Tagged with the portfolio it unlocks, so switching portfolios never reuses it
  const [unlockedVault, setUnlockedVault] = useState({ portfolioId: null, key: null });
  const vaultKey =
    activePortfolio?.id && unlockedVault.portfolioId === activePortfolio.id ? unlockedVault.key : null;
  // The header's global lock drops this view's passphrase key too
  useEffect(() => {
    const dropKey = () => setUnlockedVault({ portfolioId: null, key: null });
    window.addEventListener(LOCK_ALL_EVENT, dropKey);
    return () => window.removeEventListener(LOCK_ALL_EVENT, dropKey);
  }, []);
  const [vaultUnlockError, setVaultUnlockError] = useState('');
  const [unlockingVault, setUnlockingVault] = useState(false);

  const [period, setPeriod] = useState(DEFAULT_RECENT_PERIOD);
  const periodStart = periodFrom(period);

  // The period's transactions (fetched by date on the server) for the stats and the list
  const {
    transactions,
    loadingTransactions,
    submitting,
    deletingId,
    isVaultLocked,
    addTransaction,
    updateTransaction,
    deleteTransaction,
  } = useTransactions(activePortfolio, vaultKey, { from: periodStart });

  useEffect(() => {
    onCountChange?.(transactions.length);
  }, [transactions.length, onCountChange]);

  // Price map
  const livePriceMap = pricing?.priceMap;
  const realPriceMap = useMemo(() => {
    const map = {};
    if (livePriceMap) {
      Object.assign(map, livePriceMap);
    }
    if (calcData?.analysis && Array.isArray(calcData.analysis)) {
      calcData.analysis.forEach((item) => {
        const val = item.market || item.expected_price || item.intrinsic;
        if (val > 0 && !map[item.id]) {
          map[item.id] = Math.round(val);
          map[`src_def_${item.id}`] = Math.round(val);
        }
      });
    }
    return map;
  }, [livePriceMap, calcData]);

  // Computed Holdings (for checking balances on sell): they need every transaction ever made,
  // so the full history is read only while the form is open (the period already is all of it)
  const [formOpen, setFormOpen] = useState(false);
  const { transactions: fullHistory } = useTransactions(activePortfolio, vaultKey, {
    enabled: formOpen && Boolean(periodStart),
  });
  const { computedHoldings } = useComputedHoldings(periodStart ? fullHistory : transactions, realPriceMap);
  const currentHoldingsMap = useMemo(() => {
    const map = {};
    computedHoldings.forEach((h) => {
      map[h.assetId] = h;
    });
    return map;
  }, [computedHoldings]);

  // UI state
  const hideValues = usePrivacyMode();

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'buy' | 'sell'
  // Newest first by default; the date is the only column the server can sort by
  const [sortState, setSortState] = useState({ key: 'date', dir: 'desc' });
  const [editingTx, setEditingTx] = useState(null);

  const handleOpenAdd = () => {
    setEditingTx(null);
    setFormOpen(true);
  };

  useImperativeHandle(ref, () => ({ openAdd: handleOpenAdd }));

  // Handle Vault Unlock
  const handleUnlockVault = async (passphrase) => {
    if (!passphrase || !activePortfolio) return false;
    const accountManaged = isAccountVaultPortfolio(activePortfolio);
    if (!accountManaged && !activePortfolio.e2eeSalt) return false;

    setUnlockingVault(true);
    setVaultUnlockError('');
    try {
      if (accountManaged) {
        // One passphrase opens the whole account vault
        if (await unlockAccountVault(passphrase)) return true;
        if (!activePortfolio.e2eeSalt) {
          setVaultUnlockError('رمز عبور رمزنگاری حساب اشتباه است.');
          return false;
        }
      }
      const derivedKey = await deriveE2eeKey(passphrase, activePortfolio.e2eeSalt);
      const isValid = await verifyE2eeKey(derivedKey, activePortfolio.e2eeVerifier);
      if (isValid) {
        setUnlockedVault({ portfolioId: activePortfolio.id, key: derivedKey });
        markLegacyVaultUnlocked();
        saveVaultPassphraseToSession(activePortfolio.id, passphrase);
        return true;
      } else {
        setVaultUnlockError('رمز عبور وارد شده صحیح نیست.');
        return false;
      }
    } catch {
      setVaultUnlockError('خطا در رمزگشایی گاوصندوق.');
      return false;
    } finally {
      setUnlockingVault(false);
    }
  };

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (typeFilter !== 'all' && (tx.transactionType || tx.type) !== typeFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const name = (tx.assetName || '').toLowerCase();
        const id = (tx.assetId || '').toLowerCase();
        const notes = (tx.notes || '').toLowerCase();
        const date = (tx.transactionDate || '').toLowerCase();
        return name.includes(q) || id.includes(q) || notes.includes(q) || date.includes(q);
      }
      return true;
    });
  }, [transactions, typeFilter, searchQuery]);

  // Column sorting: the date flips between newest and oldest first; another column sorts
  // ascending, then descending, then back to the date
  const toggleSort = (key) => {
    setSortState((prev) => {
      if (key === 'date') return { key, dir: prev.key === 'date' && prev.dir === 'desc' ? 'asc' : 'desc' };
      if (prev.key !== key) return { key, dir: 'asc' };
      return prev.dir === 'asc' ? { key, dir: 'desc' } : { key: 'date', dir: 'desc' };
    });
  };
  const sortAccessors = useMemo(
    () => ({
      type: (tx) => (tx.transactionType || tx.type || 'buy').toLowerCase(),
      asset: (tx) => (tx.assetName || tx.assetId || '').toLowerCase(),
      qty: (tx) => Number(tx.quantity || tx.amount || 0),
      unitPrice: (tx) => Number(tx.unitPrice || tx.buyPrice || 0),
      totalPrice: (tx) => Number(tx.quantity || tx.amount || 0) * Number(tx.unitPrice || tx.buyPrice || 0),
      date: (tx) => toIsoDay(tx.transactionDate || tx.date) || '',
    }),
    []
  );
  const sortedTransactions = useMemo(() => {
    const accessor = sortAccessors[sortState.key];
    const dir = sortState.dir === 'asc' ? 1 : -1;
    return [...filteredTransactions].sort((a, b) => {
      const va = accessor(a);
      const vb = accessor(b);
      const primary = typeof va === 'string' ? va.localeCompare(vb, 'fa') : va - vb;
      return dir * (primary || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    });
  }, [filteredTransactions, sortAccessors, sortState]);

  // Paging: 20 per page, reset whenever what is listed changes
  const listKey = `${activePortfolio?.id}|${period}|${typeFilter}|${searchQuery.trim()}|${sortState.key}|${sortState.dir}`;
  const [paging, setPaging] = useState({ key: '', page: 1 });
  const setPage = (next) => setPaging({ key: listKey, page: next });

  const lastPage = Math.max(1, Math.ceil(sortedTransactions.length / TX_PAGE_SIZE));
  // A delete can leave the last page empty: show the new last page
  const page = Math.min(paging.key === listKey ? paging.page : 1, lastPage);
  const listRows = sortedTransactions.slice((page - 1) * TX_PAGE_SIZE, page * TX_PAGE_SIZE);
  const listTotal = sortedTransactions.length;

  // Stats
  const stats = useMemo(() => {
    let totalBuys = 0;
    let totalBuyCost = 0;
    let totalSells = 0;
    let totalSellProceeds = 0;

    transactions.forEach((tx) => {
      const type = (tx.transactionType || tx.type || 'buy').toLowerCase();
      const qty = Number(tx.quantity || tx.amount || 0);
      const price = Number(tx.unitPrice || tx.buyPrice || 0);
      const total = qty * price;

      if (type === 'buy') {
        totalBuys++;
        totalBuyCost += total;
      } else if (type === 'sell') {
        totalSells++;
        totalSellProceeds += total;
      }
    });

    return {
      totalBuys,
      totalBuyCost,
      totalSells,
      totalSellProceeds,
      totalTurnover: totalBuyCost + totalSellProceeds,
      totalCount: transactions.length,
    };
  }, [transactions]);

  const handleOpenEdit = (tx) => {
    setEditingTx(tx);
    setFormOpen(true);
  };

  const handleSubmitForm = async (formData) => {
    let res = null;
    if (formData.id) {
      res = await updateTransaction(formData.id, formData);
      if (res) setFormOpen(false);
    } else {
      res = await addTransaction(formData);
      if (res) setFormOpen(false);
    }
    if (res) {
      fetchPortfolios();
    }
  };

  const { confirm, toast } = useFeedback();

  const handleDeleteTx = async (id) => {
    const confirmed = await confirm({
      title: 'حذف تراکنش',
      message: 'آیا از حذف این تراکنش اطمینان دارید؟',
      confirmLabel: 'حذف',
      danger: true,
    });
    if (!confirmed) return;
    try {
      const ok = await deleteTransaction(id);
      if (ok) {
        toast.success('تراکنش حذف شد.');
        fetchPortfolios();
      } else {
        toast.error('حذف تراکنش انجام نشد.');
      }
    } catch (err) {
      toast.error(err.message || 'خطا در حذف تراکنش');
    }
  };

  // Login is guaranteed by MainPage's site-wide auth gate before this component renders.

  const transactionColumns = [
    {
      key: 'type',
      header: 'نوع',
      sortKey: 'type',
      thClassName: 'th-type',
      tdClassName: 'td-type',
      mobile: 'meta',
      render: (tx) => {
        const isBuy = (tx.transactionType || tx.type || 'buy').toLowerCase() === 'buy';
        return (
          <span className={`tx-badge ${isBuy ? 'buy' : 'sell'}`}>
            {isBuy ? (
              <>
                <ArrowDownLeft size={13} style={{ verticalAlign: 'middle', marginLeft: '3px' }} />
                خرید
              </>
            ) : (
              <>
                <ArrowUpRight size={13} style={{ verticalAlign: 'middle', marginLeft: '3px' }} />
                فروش
              </>
            )}
          </span>
        );
      },
    },
    {
      key: 'asset',
      header: 'دارایی',
      sortKey: 'asset',
      thClassName: 'th-asset',
      tdClassName: 'td-asset',
      mobile: 'title',
      render: (tx) => (
        <div className="asset-cell-compact">
          <span className="asset-name-text">{formatAssetName(tx, pricing?.itemMap)}</span>
          <span className={`item-category-pill cat-${tx.category || tx.assetType || 'custom'}`}>
            <CategoryIcon category={tx.category || tx.assetType} size={11} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
            {getItemBrand(tx, tx.sourceId ? { id: tx.sourceId } : null)}
          </span>
        </div>
      ),
    },
    {
      key: 'qty',
      header: 'مقدار',
      sortKey: 'qty',
      thClassName: 'th-qty',
      tdClassName: 'td-qty',
      mobile: 'meta',
      render: (tx) => (
        <span className={`table-qty-badge ${hideValues ? 'is-masked' : ''}`}>
          {hideValues ? '****' : `${Number(tx.quantity || tx.amount || 0).toLocaleString('fa-IR')} ${tx.unit || 'واحد'}`}
        </span>
      ),
    },
    {
      key: 'unitPrice',
      header: 'قیمت واحد',
      sortKey: 'unitPrice',
      thClassName: 'th-unit-price',
      tdClassName: 'td-unit-price',
      // Hidden on mobile — the total below is what matters at a glance there.
      render: (tx) => (
        <div className="cell-value-stack">
          <div className="cell-currency-wrap">
            <span className={`cell-val ${hideValues ? 'is-masked' : ''}`}>
              {hideValues ? '****' : formatNum(Number(tx.unitPrice || tx.buyPrice || 0))}
            </span>
            <span className="cell-unit">تومان</span>
          </div>
          {tx.referenceAssetId && tx.referenceQuantity > 0 && !hideValues && (
            <span className="cell-native-sub">
              ({Number(tx.referenceQuantity).toLocaleString('fa-IR', { maximumFractionDigits: 2 })}{' '}
              {resolveAssetDisplayName(tx.referenceAssetId)})
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'totalPrice',
      header: 'ارزش کل',
      sortKey: 'totalPrice',
      thClassName: 'th-total-price',
      tdClassName: 'td-total-price',
      mobile: 'stat',
      render: (tx) => {
        const isBuy = (tx.transactionType || tx.type || 'buy').toLowerCase() === 'buy';
        const totalVal = Number(tx.quantity || tx.amount || 0) * Number(tx.unitPrice || tx.buyPrice || 0);
        return (
          <div className="cell-currency-wrap">
            <strong className={`cell-val-bold ${isBuy ? 'text-profit' : 'text-loss'} ${hideValues ? 'is-masked' : ''}`}>
              {hideValues ? '****' : formatNum(totalVal)}
            </strong>
            <span className="cell-unit">تومان</span>
          </div>
        );
      },
    },
    {
      key: 'date',
      header: 'تاریخ معامله',
      sortKey: 'date',
      thClassName: 'th-date',
      tdClassName: 'td-date',
      render: (tx) => (
        <span className="table-date-text">
          {tx.transactionDate ? (
            <>
              <Calendar size={12} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
              {tx.transactionDate}
            </>
          ) : '—'}
        </span>
      ),
    },
    {
      key: 'notes',
      header: 'یادداشت',
      thClassName: 'th-notes',
      tdClassName: 'td-notes',
      render: (tx) => (
        <span className="table-notes-text" title={tx.notes || ''}>
          {tx.notes ? (
            <>
              <MessageSquare size={12} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
              {tx.notes}
            </>
          ) : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'عملیات',
      thClassName: 'th-actions',
      tdClassName: 'td-actions',
      mobile: 'actions',
      render: (tx) => (
        <div className="row-actions-group">
          <button
            type="button"
            className="btn-table-action edit"
            title="ویرایش تراکنش"
            onClick={() => handleOpenEdit(tx)}
          >
            <Pencil size={13} strokeWidth={2} />
          </button>
          <button
            type="button"
            className={`btn-table-action delete ${deletingId === tx.id ? 'loading' : ''}`}
            title="حذف تراکنش"
            onClick={() => handleDeleteTx(tx.id)}
            disabled={deletingId === tx.id}
          >
            <Trash2 size={13} strokeWidth={2} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      {isVaultLocked ? (
        <VaultLockCard
          portfolioName={activePortfolio?.name}
          onUnlock={handleUnlockVault}
          error={vaultUnlockError}
          loading={unlockingVault}
          description={isAccountVaultPortfolio(activePortfolio) ? 'این پورتفو با رمزنگاری سرتاسری حساب محافظت می‌شود. رمز عبور رمزنگاری حساب را وارد کنید.' : null}
        />
      ) : (
        <>
        <PeriodBar value={period} onChange={setPeriod} />
        <SplitPageLayout
          sidebar={
            <div className="portfolio-overview-grid">
              {/* Card 1: Total Turnover (highlight) */}
              <div className="portfolio-stat-card main-val">
                <div className="stat-header">
                  <span className="stat-label">گردش مالی این بازه</span>
                </div>
                <div className={`stat-number gold-gradient-text ${hideValues ? 'is-masked' : ''}`}>
                  {hideValues ? '****' : formatNum(stats.totalTurnover)}
                  <span className="stat-unit">تومان</span>
                </div>
                <div className="stat-sub">{stats.totalCount.toLocaleString('fa-IR')} تراکنش</div>
              </div>

              {/* Card 2: Total Buys */}
              <div className="portfolio-stat-card">
                <div className="stat-header">
                  <span className="stat-label">مجموع خرید</span>
                  <span className="count-pill">{stats.totalBuys.toLocaleString('fa-IR')} معامله</span>
                </div>
                <div className={`stat-number text-profit ${hideValues ? 'is-masked' : ''}`}>
                  {hideValues ? '****' : formatNum(stats.totalBuyCost)}
                  <span className="stat-unit">تومان</span>
                </div>
              </div>

              {/* Card 3: Total Sells */}
              <div className="portfolio-stat-card">
                <div className="stat-header">
                  <span className="stat-label">مجموع فروش</span>
                  <span className="count-pill">{stats.totalSells.toLocaleString('fa-IR')} معامله</span>
                </div>
                <div className={`stat-number text-loss ${hideValues ? 'is-masked' : ''}`}>
                  {hideValues ? '****' : formatNum(stats.totalSellProceeds)}
                  <span className="stat-unit">تومان</span>
                </div>
              </div>
            </div>
          }
        >
          <div className="portfolio-table-card">
            <div className="portfolio-table-header">
              <div className="table-title">
                <div className="table-title-main">
                  <h3>{activePortfolio?.name || 'تراکنش‌ها'}</h3>
                </div>
              </div>

              <div className="tx-search-box">
                <Search size={15} className="search-icon" />
                <input
                  type="text"
                  placeholder="جستجو در نماد، نام دارایی یا یادداشت..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="tx-search-input"
                />
              </div>
            </div>

            <div className="table-card-body">
              {/* Type Filter Pills */}
              <div className="tx-filter-pills-bar">
                <button
                  type="button"
                  className={`tx-filter-pill ${typeFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setTypeFilter('all')}
                >
                  همه ({stats.totalCount.toLocaleString('fa-IR')})
                </button>
                <button
                  type="button"
                  className={`tx-filter-pill buy ${typeFilter === 'buy' ? 'active' : ''}`}
                  onClick={() => setTypeFilter('buy')}
                >
                  خرید ({stats.totalBuys.toLocaleString('fa-IR')})
                </button>
                <button
                  type="button"
                  className={`tx-filter-pill sell ${typeFilter === 'sell' ? 'active' : ''}`}
                  onClick={() => setTypeFilter('sell')}
                >
                  فروش ({stats.totalSells.toLocaleString('fa-IR')})
                </button>
              </div>

              {/* Transactions Data Table */}
              {(loadingPortfolios && !activePortfolio) || (loadingTransactions && transactions.length === 0) ? (
                <SkeletonRows rows={5} columns={5} label="در حال بارگذاری تراکنش‌ها" />
              ) : listTotal === 0 ? (
                <EmptyState
                  icon={<Receipt size={40} strokeWidth={1.5} color="#64748b" />}
                  title="هیچ تراکنشی یافت نشد"
                  description={
                    searchQuery || typeFilter !== 'all'
                      ? 'تراکنشی با فیلترهای انتخابی مطابقت ندارد.'
                      : periodStart
                        ? 'در این بازه تراکنشی ثبت نشده است؛ بازه دیگری را از بالای صفحه انتخاب کنید.'
                        : 'هنوز هیچ معامله خریدی یا فروشی در این پورتفو ثبت نکرده‌اید. با کلیک روی دکمه زیر اولین معامله را ثبت کنید.'
                  }
                  action={
                    <Button icon={<Plus size={16} />} onClick={handleOpenAdd}>
                      ثبت اولین تراکنش
                    </Button>
                  }
                />
              ) : (
                <div className={loadingTransactions ? 'is-refreshing' : ''} aria-busy={loadingTransactions}>
                  <ResponsiveDataTable
                    columns={transactionColumns}
                    rows={listRows}
                    wrapperClassName="portfolio-table-responsive"
                    tableClassName="portfolio-data-table transactions-table"
                    rowClassName={() => 'portfolio-table-row'}
                    sortState={sortState}
                    onSortChange={toggleSort}
                  />
                </div>
              )}

              <Pagination
                page={page}
                pageSize={TX_PAGE_SIZE}
                total={listTotal}
                loading={loadingTransactions}
                onChange={setPage}
                label="صفحه‌بندی تراکنش‌ها"
              />
            </div>
          </div>
        </SplitPageLayout>
        </>
      )}

      {/* Form Modal */}
      <TransactionForm
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmitForm}
        editingTransaction={editingTx}
        submitting={submitting}
        rates={rates}
        realPriceMap={realPriceMap}
        currentHoldingsMap={currentHoldingsMap}
      />
    </>
  );
});

export default TransactionsView;

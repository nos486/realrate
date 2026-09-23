/**
 * TransactionsPage.jsx — Main view for user portfolio transactions
 *
 * Provides full CRUD for buy/sell transactions with Zero-Knowledge E2EE encryption,
 * Persian date support, asset search, and real-time turnover statistics.
 */

import React, { useState, useMemo } from 'react';
import {
  Receipt,
  Plus,
  Pencil,
  Trash2,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  AlertTriangle,
  Calendar,
  MessageSquare,
} from 'lucide-react';
import { usePortfolio } from '../../portfolio/hooks/usePortfolio.js';
import { useTransactions } from '../hooks/useTransactions.js';
import { useComputedHoldings } from '../hooks/useComputedHoldings.js';
import TransactionForm from './TransactionForm.jsx';
import PortfolioSwitcher from '../../portfolio/components/PortfolioSwitcher.jsx';
import VaultLockCard from '../../portfolio/components/VaultLockCard.jsx';
import EmptyState from '../../../shared/ui/EmptyState.jsx';
import { usePricing } from '../../market/index.js';
import { CategoryIcon, formatAssetName, formatNum, getItemBrand, resolveAssetDisplayName } from '../../portfolio/utils/holdingHelpers.js';
import ResponsiveDataTable from '../../../shared/ui/ResponsiveDataTable.jsx';
import {
  deriveE2eeKey,
  verifyE2eeKey,
  saveVaultPassphraseToSession,
} from '../../../lib/e2ee.js';
import { usePrivacyMode } from '../../../hooks/usePrivacyMode.js';

export default function TransactionsPage({
  calcData = null,
  rates = null,
  usdToman = null,
  goldUsd = null,
  initialPortfolioId = null,
}) {
  const pricing = usePricing();
  const {
    portfolios,
    activePortfolioId,
    activePortfolio,
    loadingPortfolios,
    switchPortfolio,
    createPortfolio,
    fetchPortfolios,
  } = usePortfolio(initialPortfolioId);

  // E2EE Vault Keys State
  const [vaultKey, setVaultKey] = useState(null);
  const [vaultUnlockError, setVaultUnlockError] = useState('');
  const [unlockingVault, setUnlockingVault] = useState(false);

  // Transactions Hook for active portfolio
  const {
    transactions,
    loadingTransactions,
    submitting,
    deletingId,
    isVaultLocked,
    addTransaction,
    updateTransaction,
    deleteTransaction,
  } = useTransactions(activePortfolio, vaultKey);

  // Price map
  const realPriceMap = useMemo(() => {
    const map = {};
    if (pricing?.priceMap) {
      Object.assign(map, pricing.priceMap);
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
  }, [pricing?.priceMap, calcData]);

  // Computed Holdings (for checking balances on sell)
  const { computedHoldings } = useComputedHoldings(transactions, realPriceMap);
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
  const [formOpen, setFormOpen] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [newPortfolioModalOpen, setNewPortfolioModalOpen] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState('');
  const [creatingPortfolio, setCreatingPortfolio] = useState(false);

  // Handle Vault Unlock
  const handleUnlockVault = async (passphrase) => {
    if (!passphrase || !activePortfolio?.e2eeSalt) return false;

    setUnlockingVault(true);
    setVaultUnlockError('');
    try {
      const derivedKey = await deriveE2eeKey(passphrase, activePortfolio.e2eeSalt);
      const isValid = await verifyE2eeKey(derivedKey, activePortfolio.e2eeVerifier);
      if (isValid) {
        setVaultKey(derivedKey);
        saveVaultPassphraseToSession(activePortfolio.id, passphrase);
        return true;
      } else {
        setVaultUnlockError('رمز عبور وارد شده صحیح نیست.');
        return false;
      }
    } catch (err) {
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

  const handleOpenAdd = () => {
    setEditingTx(null);
    setFormOpen(true);
  };

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

  const handleDeleteTx = async (id) => {
    if (!window.confirm('آیا از حذف این تراکنش اطمینان دارید؟')) return;
    const ok = await deleteTransaction(id);
    if (ok) {
      fetchPortfolios();
    }
  };

  const handleCreateNewPortfolio = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!newPortfolioName.trim()) return;
    setCreatingPortfolio(true);
    try {
      await createPortfolio(newPortfolioName.trim());
      setNewPortfolioModalOpen(false);
      setNewPortfolioName('');
    } finally {
      setCreatingPortfolio(false);
    }
  };

  // Login is guaranteed by MainPage's site-wide auth gate before this component renders.

  const transactionColumns = [
    {
      key: 'type',
      header: 'نوع',
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
    <div className="transactions-page-container">
      {/* 1. Portfolio Switcher */}
      <PortfolioSwitcher
        portfolios={portfolios}
        activePortfolioId={activePortfolioId}
        onSelect={switchPortfolio}
        onNewPortfolio={() => setNewPortfolioModalOpen(true)}
        holdingsCount={transactions.length}
        activeCount={transactions.length}
        mode="transactions"
      />

      {/* 2. Vault Locked View */}
      {isVaultLocked ? (
        <VaultLockCard
          portfolioName={activePortfolio?.name}
          onUnlock={handleUnlockVault}
          error={vaultUnlockError}
          loading={unlockingVault}
        />
      ) : (
        <>
          {/* 3. Stats Overview Cards */}
          <div className="transactions-stats-bar">
            <div className="tx-stat-card">
              <span className="tx-stat-icon buy">
                <ArrowDownLeft size={18} />
              </span>
              <div className="tx-stat-info">
                <span className="tx-stat-label">مجموع خرید ({stats.totalBuys.toLocaleString('fa-IR')} معامله)</span>
                <strong className={`tx-stat-val text-profit ${hideValues ? 'is-masked' : ''}`}>
                  {hideValues ? '****' : formatNum(stats.totalBuyCost)} <span className="tx-stat-unit">تومان</span>
                </strong>
              </div>
            </div>

            <div className="tx-stat-card">
              <span className="tx-stat-icon sell">
                <ArrowUpRight size={18} />
              </span>
              <div className="tx-stat-info">
                <span className="tx-stat-label">مجموع فروش ({stats.totalSells.toLocaleString('fa-IR')} معامله)</span>
                <strong className={`tx-stat-val text-loss ${hideValues ? 'is-masked' : ''}`}>
                  {hideValues ? '****' : formatNum(stats.totalSellProceeds)} <span className="tx-stat-unit">تومان</span>
                </strong>
              </div>
            </div>

            <div className="tx-stat-card">
              <span className="tx-stat-icon turnover">
                <Receipt size={18} />
              </span>
              <div className="tx-stat-info">
                <span className="tx-stat-label">گردش مالی کل ({stats.totalCount.toLocaleString('fa-IR')} تراکنش)</span>
                <strong className={`tx-stat-val gold-text ${hideValues ? 'is-masked' : ''}`}>
                  {hideValues ? '****' : formatNum(stats.totalTurnover)} <span className="tx-stat-unit">تومان</span>
                </strong>
              </div>
            </div>
          </div>

          {/* 4. Controls & Filters Toolbar */}
          <div className="transactions-toolbar">
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

            <button
              type="button"
              className="btn-add-transaction"
              onClick={handleOpenAdd}
            >
              <Plus size={16} style={{ verticalAlign: 'middle', marginLeft: '6px' }} />
              ثبت تراکنش جدید
            </button>
          </div>

          {/* 5. Transactions Data Table */}
          {loadingTransactions ? (
            <div className="transactions-loading-placeholder">
              در حال بارگذاری تراکنش‌ها...
            </div>
          ) : filteredTransactions.length === 0 ? (
            <EmptyState
              icon={<Receipt size={40} strokeWidth={1.5} color="var(--text-muted)" />}
              title="هیچ تراکنشی یافت نشد"
              description={
                searchQuery || typeFilter !== 'all'
                  ? 'تراکنشی با فیلترهای انتخابی مطابقت ندارد.'
                  : 'هنوز هیچ معامله خریدی یا فروشی در این پورتفو ثبت نکرده‌اید. با کلیک روی دکمه زیر اولین معامله را ثبت کنید.'
              }
              action={
                <button
                  type="button"
                  className="btn-add-transaction center"
                  onClick={handleOpenAdd}
                >
                  <Plus size={16} style={{ verticalAlign: 'middle', marginLeft: '6px' }} />
                  ثبت اولین تراکنش
                </button>
              }
            />
          ) : (
            <ResponsiveDataTable
              columns={transactionColumns}
              rows={filteredTransactions}
              wrapperClassName="portfolio-table-responsive"
              tableClassName="portfolio-data-table transactions-table"
              rowClassName={() => 'portfolio-table-row'}
            />
          )}
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
    </div>
  );
}

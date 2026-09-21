/**
 * TransactionsPage.jsx — Main view for user portfolio transactions
 *
 * Provides full CRUD for buy/sell transactions with Zero-Knowledge E2EE encryption,
 * Persian date support, asset search, and real-time turnover statistics.
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Receipt,
  Plus,
  Pencil,
  Trash2,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  Lock,
  Eye,
  EyeOff,
  AlertTriangle,
  Calendar,
  MessageSquare,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Cloud,
} from 'lucide-react';
import { useAuth } from '../../auth/index.js';
import { usePortfolio } from '../../portfolio/hooks/usePortfolio.js';
import { useTransactions } from '../hooks/useTransactions.js';
import { useComputedHoldings } from '../hooks/useComputedHoldings.js';
import TransactionForm from './TransactionForm.jsx';
import PortfolioSwitcher from '../../portfolio/components/PortfolioSwitcher.jsx';
import VaultLockCard from '../../portfolio/components/VaultLockCard.jsx';
import { usePricing } from '../../market/index.js';
import { CategoryIcon, formatAssetName, formatNum, getItemBrand } from '../../portfolio/utils/holdingHelpers.js';
import {
  deriveE2eeKey,
  verifyE2eeKey,
  saveVaultPassphraseToSession,
} from '../../../lib/e2ee.js';

export default function TransactionsPage({
  calcData = null,
  rates = null,
  usdToman = null,
  goldUsd = null,
  initialPortfolioId = null,
}) {
  const { user, loading: authLoading, triggerLogin } = useAuth();
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

  // ─── AUTH GATE (Required Login Screen for Guests) ────────────────────────
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

          <h3 className="auth-gate-title">مدیریت معاملات و تاریخچه تراکنش‌ها</h3>
          <p className="auth-gate-desc">
            اطلاعات خرید و فروش و گردش حساب دارایی‌های شما به صورت امن با رمزنگاری سرتاسری (Zero-Knowledge) ذخیره شده و سود و زیان محقق‌شده محاسبه می‌گردد.
          </p>

          <div className="auth-gate-features">
            <div className="gate-feature-item">
              <span className="feature-icon"><Receipt size={18} /></span>
              <div className="feature-info">
                <strong>ثبت دقیق خرید و فروش</strong>
                <span>ثبت معاملات انواع دارایی‌ها با تاریخ شمسی، قیمت تمام‌شده و کارمزد</span>
              </div>
            </div>
            <div className="gate-feature-item">
              <span className="feature-icon"><Lock size={18} /></span>
              <div className="feature-info">
                <strong>رمزنگاری سرتاسری (Zero-Knowledge)</strong>
                <span>امنیت اطلاعات با کلید اختصاصی بدون امکان مشاهده توسط سرور</span>
              </div>
            </div>
            <div className="gate-feature-item">
              <span className="feature-icon"><TrendingUp size={18} /></span>
              <div className="feature-info">
                <strong>محاسبه خودکار سود و زیان</strong>
                <span>محاسبه خودکار سود و زیان محقق‌شده و میانگین موزون قیمت خرید</span>
              </div>
            </div>
            <div className="gate-feature-item">
              <span className="feature-icon"><Cloud size={18} /></span>
              <div className="feature-info">
                <strong>ذخیره و همگام‌سازی ابری</strong>
                <span>دسترسی امن به تاریخچه معاملات از تمام دستگاه‌ها</span>
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
              اطلاعات معاملات شما کاملاً محرمانه و رمزنگاری‌شده است.
            </span>
          </div>
        </div>
      </div>
    );
  }

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
            <div className="transactions-empty-box">
              <div className="empty-icon-circle">
                <Receipt size={40} strokeWidth={1.5} color="var(--text-muted)" />
              </div>
              <h4>هیچ تراکنشی یافت نشد</h4>
              <p>
                {searchQuery || typeFilter !== 'all'
                  ? 'تراکنشی با فیلترهای انتخابی مطابقت ندارد.'
                  : 'هنوز هیچ معامله خریدی یا فروشی در این پورتفو ثبت نکرده‌اید. با کلیک روی دکمه زیر اولین معامله را ثبت کنید.'}
              </p>
              <button
                type="button"
                className="btn-add-transaction center"
                onClick={handleOpenAdd}
              >
                <Plus size={16} style={{ verticalAlign: 'middle', marginLeft: '6px' }} />
                ثبت اولین تراکنش
              </button>
            </div>
          ) : (
            <div className="portfolio-table-responsive">
              <table className="portfolio-data-table transactions-table">
                <thead>
                  <tr>
                    <th className="th-type">نوع</th>
                    <th className="th-asset">دارایی</th>
                    <th className="th-qty">مقدار</th>
                    <th className="th-unit-price">قیمت واحد</th>
                    <th className="th-total-price">ارزش کل</th>
                    <th className="th-date">تاریخ معامله</th>
                    <th className="th-notes">یادداشت</th>
                    <th className="th-actions">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((tx) => {
                    const isBuy = (tx.transactionType || tx.type || 'buy').toLowerCase() === 'buy';
                    const qty = Number(tx.quantity || tx.amount || 0);
                    const price = Number(tx.unitPrice || tx.buyPrice || 0);
                    const totalVal = qty * price;
                    const isDeleting = deletingId === tx.id;

                    return (
                      <tr key={tx.id} className="portfolio-table-row">
                        {/* Transaction Type Badge */}
                        <td className="td-type">
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
                        </td>

                        {/* Asset Info */}
                        <td className="td-asset">
                          <div className="asset-cell-compact">
                            <span className="asset-name-text">{formatAssetName(tx, pricing?.itemMap)}</span>
                            <span className={`item-category-pill cat-${tx.category || tx.assetType || 'custom'}`}>
                              <CategoryIcon category={tx.category || tx.assetType} size={11} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
                              {getItemBrand(tx, tx.sourceId ? { id: tx.sourceId } : null)}
                            </span>
                          </div>
                        </td>

                        {/* Quantity */}
                        <td className="td-qty">
                          <span className={`table-qty-badge ${hideValues ? 'is-masked' : ''}`}>
                            {hideValues ? '****' : `${qty.toLocaleString('fa-IR')} ${tx.unit || 'واحد'}`}
                          </span>
                        </td>

                        {/* Unit Price */}
                        <td className="td-unit-price">
                          <div className="cell-currency-wrap">
                            <span className={`cell-val ${hideValues ? 'is-masked' : ''}`}>
                              {hideValues ? '****' : formatNum(price)}
                            </span>
                            <span className="cell-unit">تومان</span>
                          </div>
                        </td>

                        {/* Total Price */}
                        <td className="td-total-price">
                          <div className="cell-currency-wrap">
                            <strong className={`cell-val-bold ${isBuy ? 'text-profit' : 'text-loss'} ${hideValues ? 'is-masked' : ''}`}>
                              {hideValues ? '****' : formatNum(totalVal)}
                            </strong>
                            <span className="cell-unit">تومان</span>
                          </div>
                        </td>

                        {/* Transaction Date */}
                        <td className="td-date">
                          <span className="table-date-text">
                            {tx.transactionDate ? (
                              <>
                                <Calendar size={12} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
                                {tx.transactionDate}
                              </>
                            ) : '—'}
                          </span>
                        </td>

                        {/* Notes */}
                        <td className="td-notes">
                          <span className="table-notes-text" title={tx.notes || ''}>
                            {tx.notes ? (
                              <>
                                <MessageSquare size={12} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
                                {tx.notes}
                              </>
                            ) : '—'}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="td-actions">
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
                              className={`btn-table-action delete ${isDeleting ? 'loading' : ''}`}
                              title="حذف تراکنش"
                              onClick={() => handleDeleteTx(tx.id)}
                              disabled={isDeleting}
                            >
                              <Trash2 size={13} strokeWidth={2} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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

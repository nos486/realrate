import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import {
  apiAdminStats,
  apiAdminUsers,
  apiAdminSaveSettings,
  apiGetRates,
  apiAdminGetUserPortfolio,
} from '../api/client.js';
import { CATEGORY_DEFINITIONS } from '../components/PortfolioTracker.jsx';

function formatNum(num) {
  if (num === null || num === undefined || isNaN(num)) return '۰';
  return Math.round(num).toLocaleString('fa-IR');
}

function formatPersianDate(isoStr) {
  if (!isoStr) return '-';
  try {
    const d = new Date(isoStr);
    return (
      d.toLocaleDateString('fa-IR') +
      ' ' +
      d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })
    );
  } catch {
    return isoStr;
  }
}

export default function AdminPage() {
  const { user, loading, triggerLogin, logout } = useAuth();

  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [marketRates, setMarketRates] = useState(null);
  const [userSearch, setUserSearch] = useState('');

  // Portfolio Inspector Modal State
  const [inspectUser, setInspectUser] = useState(null);
  const [inspectHoldings, setInspectHoldings] = useState([]);
  const [inspectPortfolios, setInspectPortfolios] = useState([]);
  const [inspectActivePortfolioId, setInspectActivePortfolioId] = useState(null);
  const [loadingInspect, setLoadingInspect] = useState(false);
  const [inspectModalOpen, setInspectModalOpen] = useState(false);

  // Settings form
  const [usdToman, setUsdToman] = useState(62000);
  const [goldUsd, setGoldUsd] = useState(2450);
  const [bubbleFull, setBubbleFull] = useState(15);
  const [bubbleHalf, setBubbleHalf] = useState(20);
  const [bubbleQuarter, setBubbleQuarter] = useState(25);
  const [announcement, setAnnouncement] = useState('');

  const [msg, setMsg] = useState({ text: '', type: '' });
  const [saving, setSaving] = useState(false);

  const showMsg = (text, type = 'info') => {
    setMsg({ text, type });
    if (type === 'success') {
      setTimeout(() => setMsg({ text: '', type: '' }), 5000);
    }
  };

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const data = await apiAdminStats();
      if (data.success) {
        setStats(data);
      }
    } catch (e) {
      console.error('Failed to load stats:', e);
    } finally {
      setLoadingStats(false);
    }
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const data = await apiAdminUsers();
      if (data.success && Array.isArray(data.users)) {
        setUsers(data.users);
      }
    } catch (e) {
      console.error('Failed to load users:', e);
    } finally {
      setLoadingUsers(false);
    }
  };

  // Fetch initial data once admin user is confirmed
  useEffect(() => {
    if (user?.role === 'admin') {
      loadStats();
      loadUsers();

      apiGetRates()
        .then((data) => {
          if (data) setMarketRates(data);
          if (data?.globalSettings) {
            const s = data.globalSettings;
            if (s.default_usd_toman) setUsdToman(s.default_usd_toman);
            if (s.default_gold_usd) setGoldUsd(s.default_gold_usd);
            if (s.bubble_pct_full !== undefined) setBubbleFull(s.bubble_pct_full);
            if (s.bubble_pct_half !== undefined) setBubbleHalf(s.bubble_pct_half);
            if (s.bubble_pct_quarter !== undefined) setBubbleQuarter(s.bubble_pct_quarter);
            if (s.announcement !== undefined) setAnnouncement(s.announcement || '');
          }
        })
        .catch(console.error);
    }
  }, [user]);

  // Real-time market price mapping
  const realPriceMap = useMemo(() => {
    const usdVal = Number(usdToman) || 0;
    const goldUsdVal = Number(goldUsd) || 0;

    const goldGram18kReal = (goldUsdVal > 0 && usdVal > 0)
      ? ((goldUsdVal / 31.1034768) * usdVal) * 0.75
      : 0;

    const silverUsdVal = Number(marketRates?.silverUsd) || 32.5;
    const silverGram999Real = (silverUsdVal > 0 && usdVal > 0)
      ? (silverUsdVal / 31.1034768) * usdVal
      : 0;
    const silverGram925Real = silverGram999Real * 0.925;
    const silverOunceReal = silverUsdVal * usdVal;

    const goldGram24kReal = goldGram18kReal * (24 / 18);
    const coinFullReal = goldGram18kReal * (24 / 18) * 7.3197;
    const coinHalfReal = goldGram18kReal * (24 / 18) * 3.6594;
    const coinQuarterReal = goldGram18kReal * (24 / 18) * 1.8297;
    const coinGramReal = goldGram18kReal * (24 / 18) * 0.909;

    const map = {
      gold_24k: Math.round(goldGram24kReal),
      gold_18k: Math.round(goldGram18kReal),
      full_new: Math.round(coinFullReal),
      full_old: Math.round(coinFullReal),
      half: Math.round(coinHalfReal),
      quarter: Math.round(coinQuarterReal),
      gram: Math.round(coinGramReal),
      silver_999: Math.round(silverGram999Real),
      silver_925: Math.round(silverGram925Real),
      silver_ounce: Math.round(silverOunceReal),
      USD: Math.round(usdVal),
      USDT: Math.round(usdVal),
    };

    if (marketRates?.currencies && Array.isArray(marketRates.currencies)) {
      for (const c of marketRates.currencies) {
        if (c.code && c.toman_price) {
          map[c.code] = Math.round(c.toman_price);
        }
      }
    }

    return map;
  }, [marketRates, usdToman, goldUsd]);

  // Metrics for currently inspected user
  const inspectMetrics = useMemo(() => {
    let totalCost = 0;
    let totalRealValue = 0;
    let totalCostWithBuyPrice = 0;
    let totalRealValWithBuyPrice = 0;
    let itemsWithBuyPriceCount = 0;

    const items = inspectHoldings.map((h) => {
      const amountNum = Number(h.amount) || 0;
      const buyPriceNum = Number(h.buyPrice) || 0;
      const hasBuyPrice = buyPriceNum > 0;
      const isCustomItem = h.assetType === 'custom' || h.assetId?.startsWith('custom_');

      const unitRealPrice = isCustomItem
        ? (Number(h.currentPrice) || (hasBuyPrice ? buyPriceNum : 0))
        : (realPriceMap[h.assetId] || (hasBuyPrice ? buyPriceNum : 0));

      const itemCost = hasBuyPrice ? (amountNum * buyPriceNum) : 0;
      const itemRealVal = amountNum * unitRealPrice;
      const itemPnl = hasBuyPrice ? (itemRealVal - itemCost) : null;
      const itemPnlPct = (hasBuyPrice && itemCost > 0) ? (itemPnl / itemCost) * 100 : null;

      totalRealValue += itemRealVal;
      if (hasBuyPrice) {
        totalCost += itemCost;
        totalCostWithBuyPrice += itemCost;
        totalRealValWithBuyPrice += itemRealVal;
        itemsWithBuyPriceCount += 1;
      }

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

    const hasAnyBuyPrice = itemsWithBuyPriceCount > 0;
    const totalPnl = hasAnyBuyPrice ? (totalRealValWithBuyPrice - totalCostWithBuyPrice) : 0;
    const totalPnlPct = (hasAnyBuyPrice && totalCostWithBuyPrice > 0) ? (totalPnl / totalCostWithBuyPrice) * 100 : 0;

    return { items, totalCost, totalRealValue, totalPnl, totalPnlPct, hasAnyBuyPrice };
  }, [inspectHoldings, realPriceMap]);

  const inspectCategoryGroups = useMemo(() => {
    return CATEGORY_DEFINITIONS.map((cat) => {
      const groupItems = inspectMetrics.items.filter(cat.match);
      const itemsWithBuyPrice = groupItems.filter((it) => it.hasBuyPrice);

      const groupCost = itemsWithBuyPrice.reduce((acc, it) => acc + it.itemCost, 0);
      const groupRealVal = groupItems.reduce((acc, it) => acc + it.itemRealVal, 0);
      const groupRealValForPnl = itemsWithBuyPrice.reduce((acc, it) => acc + it.itemRealVal, 0);

      const hasAnyBuyPrice = itemsWithBuyPrice.length > 0;
      const groupPnl = hasAnyBuyPrice ? (groupRealValForPnl - groupCost) : 0;
      const groupPnlPct = (hasAnyBuyPrice && groupCost > 0) ? (groupPnl / groupCost) * 100 : 0;

      return {
        ...cat,
        items: groupItems,
        totalCost: groupCost,
        totalRealValue: groupRealVal,
        totalPnl: groupPnl,
        totalPnlPct: groupPnlPct,
        hasAnyBuyPrice,
      };
    }).filter((group) => group.items.length > 0);
  }, [inspectMetrics.items]);

  // Filtered users by search query
  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return users;
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) =>
      (u.name && u.name.toLowerCase().includes(q)) ||
      (u.customName && u.customName.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.shareSlug && u.shareSlug.toLowerCase().includes(q)) ||
      (u.id && String(u.id).toLowerCase().includes(q))
    );
  }, [users, userSearch]);

  const handleInspectPortfolio = async (targetUser, targetPortfolioId = null) => {
    setInspectUser(targetUser);
    setInspectHoldings([]);
    setInspectPortfolios([]);
    setInspectActivePortfolioId(targetPortfolioId);
    setLoadingInspect(true);
    setInspectModalOpen(true);
    try {
      const res = await apiAdminGetUserPortfolio(targetUser.id, targetPortfolioId);
      if (res.success) {
        setInspectHoldings(res.holdings || []);
        if (res.user) setInspectUser(res.user);
        setInspectPortfolios(res.portfolios || []);
        setInspectActivePortfolioId(res.activePortfolioId || targetPortfolioId || res.portfolios?.[0]?.id || null);
      }
    } catch (e) {
      console.error('Failed to load user portfolio:', e);
    } finally {
      setLoadingInspect(false);
    }
  };

  const handleSelectInspectPortfolio = async (portfolioId) => {
    if (!inspectUser || portfolioId === inspectActivePortfolioId) return;
    setInspectActivePortfolioId(portfolioId);
    setLoadingInspect(true);
    try {
      const res = await apiAdminGetUserPortfolio(inspectUser.id, portfolioId);
      if (res.success) {
        setInspectHoldings(res.holdings || []);
      }
    } catch (e) {
      console.error('Failed to switch inspect portfolio:', e);
    } finally {
      setLoadingInspect(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiAdminSaveSettings({
        default_usd_toman: parseFloat(usdToman),
        default_gold_usd: parseFloat(goldUsd),
        bubble_pct_full: parseFloat(bubbleFull),
        bubble_pct_half: parseFloat(bubbleHalf),
        bubble_pct_quarter: parseFloat(bubbleQuarter),
        announcement,
      });

      if (res.success) {
        showMsg(res.message || 'تنظیمات با موفقیت ذخیره شد.', 'success');
      } else {
        showMsg(res.message || 'خطا در ذخیره‌سازی تنظیمات', 'error');
      }
    } catch (e) {
      showMsg('خطا در ارتباط با سرور: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
        در حال بررسی دسترسی...
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <div className="admin-container" style={{ margin: '40px auto' }}>
        <div className="admin-header">
          <h2>ورود به پنل مدیریت RealRate</h2>
          <p>جهت ورود، لطفاً با حساب گوگل تعیین‌شده برای مدیر وارد شوید.</p>
        </div>
        <div className="login-box">
          <button className="google-admin-btn" onClick={triggerLogin}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            <span>ورود به مدیریت با گوگل</span>
          </button>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px' }}>
            🛡️ احراز هویت اختصاصی بر اساس متغیر محیطی ADMIN_EMAIL
          </p>
          <Link to="/" className="btn-sm site-link" style={{ marginTop: '12px' }}>
            ← بازگشت به صفحه اصلی سایت
          </Link>
        </div>
      </div>
    );
  }

  // Logged in but not admin
  if (user.role !== 'admin') {
    return (
      <div className="admin-container" style={{ margin: '40px auto' }}>
        <div className="login-box">
          <div style={{ fontSize: '40px' }}>⛔</div>
          <h3 style={{ color: '#f87171', fontWeight: 800 }}>عدم دسترسی مدیریت</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '420px', lineHeight: '1.8' }}>
            شما با حساب گوگل{' '}
            <strong style={{ color: '#fff', direction: 'ltr', display: 'inline-block' }}>
              {user.email}
            </strong>{' '}
            وارد شده‌اید، اما این حساب به عنوان مدیر ثبت نشده است.
          </p>
          <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button className="btn-sm logout" onClick={logout}>🔄 خروج و تعویض حساب گوگل</button>
            <Link to="/" className="btn-sm site-link">🏠 بازگشت به سایت</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-container" style={{ margin: '20px auto' }}>
      {/* Header */}
      <div className="admin-header">
        <h2>پنل مدیریت RealRate</h2>
        <p>تنظیمات قیمت، انس و پایش کاربران سیستم</p>
      </div>

      {msg.text && (
        <div className={`msg-box ${msg.type}`} style={{ display: 'block' }}>
          {msg.text}
        </div>
      )}

      {/* Admin Profile Bar */}
      <div className="admin-profile-bar">
        <div className="admin-user-info">
          <img
            className="admin-avatar"
            src={user.picture || ''}
            alt={user.name}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <strong style={{ fontSize: '13px', color: '#fff' }}>{user.name || 'مدیر سیستم'}</strong>
              <span className="admin-role-badge">مدیر کل</span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', direction: 'ltr', display: 'block' }}>
              {user.email}
            </span>
          </div>
        </div>
        <div className="admin-actions">
          <Link to="/" className="btn-sm site-link" title="مشاهده سایت">مشاهده سایت ↗</Link>
          <button className="btn-sm logout" onClick={logout}>خروج</button>
        </div>
      </div>

      {/* Live Stats */}
      <div className="section-title">
        <span>📊 آمار و آنالیتیکس سیستم (Cloudflare KV)</span>
        <button onClick={loadStats} className="btn-sm site-link" style={{ padding: '2px 8px', fontSize: '11px' }}>
          {loadingStats ? 'در حال دریافت...' : '🔄 بروزرسانی'}
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-card-title">👥 کاربران ثبت‌نام شده</span>
          <span className="stat-card-val blue">
            {stats?.registeredUsers?.toLocaleString('fa-IR') || users.length.toLocaleString('fa-IR')}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-card-title">🔗 پورتفوهای عمومی فعال</span>
          <span className="stat-card-val green">
            {users.filter((u) => u.shareEnabled).length.toLocaleString('fa-IR')}
          </span>
        </div>
      </div>

      {/* Registered Users Table */}
      <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <span>👥 جدول کاربران ({filteredUsers.length.toLocaleString('fa-IR')} کاربر)</span>
        <button onClick={loadUsers} className="btn-sm site-link" style={{ padding: '3px 10px', fontSize: '11px' }}>
          {loadingUsers ? 'در حال دریافت...' : '🔄 تازه‌سازی کاربران'}
        </button>
      </div>

      <div className="admin-user-search-wrap" style={{ marginBottom: '14px' }}>
        <div className="search-box">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="جستجوی کاربر با نام، ایمیل، شناسه یا اسلاگ پورتفو..."
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
          />
          {userSearch && (
            <button className="clear-search-btn" onClick={() => setUserSearch('')}>✕</button>
          )}
        </div>
      </div>

      <div className="users-table-wrap">
        <table className="users-table">
          <thead>
            <tr>
              <th>کاربر</th>
              <th>ایمیل</th>
              <th>نقش</th>
              <th>لینک اشتراک</th>
              <th>آخرین ورود</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '18px' }}>
                  {loadingUsers ? 'در حال دریافت اطلاعات کاربران...' : 'هیچ کاربری با این مشخصات یافت نشد.'}
                </td>
              </tr>
            ) : (
              filteredUsers.map((u, idx) => (
                <tr key={u.id || idx}>
                  <td>
                    <div className="user-cell">
                      <img
                        src={u.picture || ''}
                        alt={u.name || ''}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                      <div>
                        <strong>{u.customName || u.name || '-'}</strong>
                        {u.customName && u.name && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>({u.name})</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ direction: 'ltr', textAlign: 'right' }}>{u.email}</td>
                  <td>
                    {u.role === 'admin' ? (
                      <span className="role-tag admin">مدیر کل</span>
                    ) : (
                      <span className="role-tag user">کاربر عادی</span>
                    )}
                  </td>
                  <td>
                    {u.shareSlug ? (
                      <span className={`share-badge ${u.shareEnabled ? 'active' : 'disabled'}`}>
                        {u.shareEnabled ? '🟢 فعال' : '⚪ خصوصی'}: {u.shareSlug}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>-</span>
                    )}
                  </td>
                  <td>{formatPersianDate(u.lastLogin)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn-inspect-portfolio"
                      onClick={() => handleInspectPortfolio(u)}
                      title="مشاهده سبد دارایی این کاربر"
                    >
                      💼 مشاهده پورتفو
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Settings Form */}
      <form onSubmit={handleSave}>
        <div className="section-title">⚙️ تنظیمات قیمت و انس عمومی</div>

        <div className="grid-2">
          <div className="form-group">
            <label htmlFor="adminUsdToman">قیمت پیش‌فرض دلار (تومان)</label>
            <input
              type="number"
              id="adminUsdToman"
              value={usdToman}
              onChange={(e) => setUsdToman(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="adminGoldUsd">پیش‌فرض انس طلا ($)</label>
            <input
              type="number"
              id="adminGoldUsd"
              value={goldUsd}
              onChange={(e) => setGoldUsd(e.target.value)}
            />
          </div>
        </div>

        <div className="section-title">🪙 تنظیم درصد حباب مصوب سکه‌ها</div>

        <div className="form-group">
          <label htmlFor="adminBubbleFull">درصد حباب مصوب سکه تمام (٪)</label>
          <input
            type="number"
            id="adminBubbleFull"
            step="0.5"
            value={bubbleFull}
            onChange={(e) => setBubbleFull(e.target.value)}
          />
        </div>

        <div className="grid-2">
          <div className="form-group">
            <label htmlFor="adminBubbleHalf">حباب مصوب نیم سکه (٪)</label>
            <input
              type="number"
              id="adminBubbleHalf"
              step="0.5"
              value={bubbleHalf}
              onChange={(e) => setBubbleHalf(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="adminBubbleQuarter">حباب مصوب ربع سکه (٪)</label>
            <input
              type="number"
              id="adminBubbleQuarter"
              step="0.5"
              value={bubbleQuarter}
              onChange={(e) => setBubbleQuarter(e.target.value)}
            />
          </div>
        </div>

        <div className="section-title">📢 پیام عمومی سیستم</div>

        <div className="form-group">
          <label htmlFor="adminAnnouncement">
            پیام یا اطلاعیه بالای سایت (در صورت خالی بودن نمایش داده نمی‌شود)
          </label>
          <textarea
            id="adminAnnouncement"
            rows="2"
            placeholder="متن پیام عمومی را وارد کنید..."
            value={announcement}
            onChange={(e) => setAnnouncement(e.target.value)}
          />
        </div>

        <button type="submit" className="btn" disabled={saving}>
          {saving ? 'در حال ذخیره‌سازی...' : '💾 ذخیره کلیه تغییرات'}
        </button>
      </form>

      {/* Admin User Portfolio Inspector Modal */}
      {inspectModalOpen && (
        <div className="modal-backdrop" onClick={() => setInspectModalOpen(false)}>
          <div className="modal-content admin-inspect-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <span className="modal-icon">💼</span>
                <div>
                  <h3>پورتفوی کاربر: {inspectUser?.customName || inspectUser?.name || inspectUser?.email}</h3>
                  <p className="modal-subtitle" dir="ltr">
                    {inspectUser?.email} {inspectUser?.shareSlug ? `• /p/${inspectUser.shareSlug}` : ''}
                  </p>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setInspectModalOpen(false)}>✕</button>
            </div>

            {loadingInspect ? (
              <div className="portfolio-loading-state" style={{ padding: '40px' }}>
                <div className="spinner-glow"></div>
                <p>در حال دریافت اطلاعات پورتفوی کاربر...</p>
              </div>
            ) : inspectHoldings.length === 0 && inspectPortfolios.length === 0 ? (
              <div className="portfolio-empty-state" style={{ padding: '30px' }}>
                <div className="empty-icon">💼</div>
                <h4>هیچ دارایی توسط این کاربر ثبت نشده است.</h4>
              </div>
            ) : (
              <div className="admin-inspect-body">
                {/* Portfolios Tab Selector (if multiple or named) */}
                {inspectPortfolios.length > 0 && (
                  <div className="portfolio-tabs-scroll" style={{ marginBottom: '16px' }}>
                    <span className="portfolio-nav-label">پورتفوها ({inspectPortfolios.length.toLocaleString('fa-IR')} سبد):</span>
                    {inspectPortfolios.map((p) => {
                      const isActive = p.id === inspectActivePortfolioId;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          className={`portfolio-tab-pill ${isActive ? 'active' : ''}`}
                          onClick={() => handleSelectInspectPortfolio(p.id)}
                        >
                          <span className="tab-pill-icon">{p.isDefault ? '⭐' : '📁'}</span>
                          <span className="tab-pill-name">{p.name}</span>
                          {p.shareSlug && (
                            <span className="tab-pill-shared" title={`لینک: /p/${p.shareSlug}`}>🔗</span>
                          )}
                          <span className="tab-pill-count">{(p.itemCount ?? 0).toLocaleString('fa-IR')}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Summary Cards */}
                <div className="portfolio-overview-grid" style={{ marginBottom: '20px' }}>
                  <div className="portfolio-stat-card main-val">
                    <div className="stat-header">
                      <span className="stat-label">ارزش واقعی دارایی‌ها</span>
                    </div>
                    <div className="stat-number gold-gradient-text" style={{ fontSize: '20px' }}>
                      {formatNum(inspectMetrics.totalRealValue)} <span className="stat-unit">تومان</span>
                    </div>
                    <div className="stat-sub">
                      سرمایه خرید: {formatNum(inspectMetrics.totalCost)} تومان
                    </div>
                  </div>

                  <div className={`portfolio-stat-card pnl-card ${inspectMetrics.totalPnl >= 0 ? 'profit' : 'loss'}`}>
                    <div className="stat-header">
                      <span className="stat-label">سود / زیان کل</span>
                      <span className={`pnl-badge ${inspectMetrics.totalPnl >= 0 ? 'profit' : 'loss'}`}>
                        {inspectMetrics.totalPnl >= 0 ? '+' : ''}
                        {inspectMetrics.totalPnlPct.toFixed(2).replace('-', '')}٪
                      </span>
                    </div>
                    <div className="stat-number" style={{ fontSize: '20px' }}>
                      {inspectMetrics.totalPnl >= 0 ? '+' : ''}
                      {formatNum(inspectMetrics.totalPnl)} <span className="stat-unit">تومان</span>
                    </div>
                    <div className="stat-sub">
                      {inspectMetrics.totalPnl >= 0 ? '🟢 در سود' : '🔴 در زیان'}
                    </div>
                  </div>

                  <div className="portfolio-stat-card action-card">
                    <div className="stat-header">
                      <span className="stat-label">اقلام ثبت‌شده</span>
                      <span className="count-pill">{inspectHoldings.length} قلم دارایی</span>
                    </div>
                    <div className="stat-sub" style={{ marginTop: '8px' }}>
                      وضعیت لینک: {(() => {
                        const activeP = inspectPortfolios.find((p) => p.id === inspectActivePortfolioId);
                        if (activeP?.shareEnabled) {
                          return `🟢 اشتراک فعال (${activeP.shareSlug ? `/p/${activeP.shareSlug}` : 'عمومی'})`;
                        }
                        if (inspectUser?.shareEnabled) {
                          return '🟢 اشتراک فعال';
                        }
                        return '⚪ خصوصی';
                      })()}
                    </div>
                  </div>
                </div>

                {/* Categorized Holdings List */}
                <div className="portfolio-categories-container">
                  {inspectCategoryGroups.map((group) => (
                    <div key={group.key} className="category-group-card">
                      <div className="category-group-header">
                        <div className="cat-header-identity">
                          <span className="cat-group-icon">{group.icon}</span>
                          <div className="cat-group-titles">
                            <h4 className="cat-group-name">{group.name}</h4>
                            <span className="cat-group-count">{group.items.length.toLocaleString('fa-IR')} قلم</span>
                          </div>
                        </div>

                        <div className="cat-header-subtotals">
                          <div className="cat-subtotal-val">
                            <span className="subtotal-label">ارزش مجموعه:</span>
                            <strong className="subtotal-amount">{formatNum(group.totalRealValue)}</strong>
                            <span className="subtotal-unit">تومان</span>
                          </div>

                          <div className={`cat-subtotal-pnl ${group.totalPnl >= 0 ? 'profit' : 'loss'}`}>
                            <span className="subtotal-pnl-label">سود/زیان:</span>
                            <strong>{group.totalPnl >= 0 ? '+' : ''}{formatNum(group.totalPnl)} تومان</strong>
                            <span className="subtotal-pnl-pct">({group.totalPnl >= 0 ? '+' : ''}{group.totalPnlPct.toFixed(1).replace('-', '')}٪)</span>
                          </div>
                        </div>
                      </div>

                      <div className="portfolio-items-list">
                        {group.items.map((item) => {
                          const isProfit = item.itemPnl >= 0;
                          return (
                            <div key={item.id} className="portfolio-item-row">
                              <div className="item-main-col">
                                <div className="item-name-wrap">
                                  <span className="item-name">{item.assetName || item.name}</span>
                                  <span className={`item-category-pill cat-${item.assetType || 'custom'}`}>
                                    {item.assetType === 'silver' ? '🥈 نقره' :
                                     item.assetType === 'gold' ? '🥇 طلا' :
                                     item.assetType === 'coin' ? '🪙 سکه' :
                                     item.assetType === 'currency' ? '💵 ارز' :
                                     item.assetType === 'crypto' ? '⚡ کریپتو' : '✨ سفارشی'}
                                  </span>
                                  <span className="item-qty-tag">
                                    {Number(item.amount).toLocaleString('fa-IR')} {item.unit}
                                  </span>
                                </div>

                                <div className="item-price-meta">
                                  <span>{item.hasBuyPrice ? `خرید: ${formatNum(item.buyPrice)} تومان` : 'خرید: ثبت نشده'}</span>
                                  <span className="meta-sep">•</span>
                                  <span className="meta-real-price">
                                    قیمت واقعی روز: {formatNum(item.unitRealPrice)} تومان
                                  </span>
                                </div>

                                {(item.buyDate || item.notes) && (
                                  <div className="item-extra-meta">
                                    {item.buyDate && <span className="item-date-tag">📅 {item.buyDate}</span>}
                                    {item.notes && <span className="item-notes-tag">💬 {item.notes}</span>}
                                  </div>
                                )}
                              </div>

                              <div className="item-values-col">
                                <div className="item-live-val">
                                  {formatNum(item.itemRealVal)}
                                  <span className="val-unit">تومان</span>
                                </div>
                                {item.hasBuyPrice ? (
                                  <div className={`item-pnl-tag ${isProfit ? 'profit' : 'loss'}`}>
                                    <span>{isProfit ? '+' : ''}{formatNum(item.itemPnl)} تومان</span>
                                    <span className="pct">({isProfit ? '+' : ''}{item.itemPnlPct.toFixed(1).replace('-', '')}٪)</span>
                                  </div>
                                ) : (
                                  <div className="item-pnl-tag neutral">
                                    <span>بدون محاسبه سود/زیان</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

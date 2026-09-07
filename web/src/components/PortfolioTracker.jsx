import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  apiGetPortfolio,
  apiAddPortfolioHolding,
  apiUpdatePortfolioHolding,
  apiDeletePortfolioHolding,
} from '../api/client.js';

const ASSET_TYPES = [
  // طلا و مسکوکات
  { id: 'gold_18k', name: 'طلای ۱۸ عیار (خام / آب‌شده)', unit: 'گرم', category: 'gold' },
  { id: 'full_new', name: 'سکه امامی (طرح جدید)', unit: 'عدد', category: 'coin' },
  { id: 'full_old', name: 'سکه بهار آزادی (طرح قدیم)', unit: 'عدد', category: 'coin' },
  { id: 'half', name: 'نیم سکه بهار آزادی', unit: 'عدد', category: 'coin' },
  { id: 'quarter', name: 'ربع سکه بهار آزادی', unit: 'عدد', category: 'coin' },
  { id: 'gram', name: 'سکه گرمی', unit: 'عدد', category: 'coin' },

  // نقره (Silver)
  { id: 'silver_999', name: 'نقره خام و ساچمه ۹۹۹', unit: 'گرم', category: 'silver' },
  { id: 'silver_925', name: 'نقره استرلینگ ۹۲۵', unit: 'گرم', category: 'silver' },
  { id: 'silver_ounce', name: 'انس جهانی نقره (XAG)', unit: 'اونس', category: 'silver' },

  // ارزهای خارجی و رمزارزها
  { id: 'USD', name: 'دلار آمریکا (اسکناس)', unit: 'دلار', category: 'currency' },
  { id: 'USDT', name: 'تتر (USDT)', unit: 'تتر', category: 'crypto' },
  { id: 'EUR', name: 'یورو اروپا', unit: 'یورو', category: 'currency' },
  { id: 'AED', name: 'درهم امارات', unit: 'درهم', category: 'currency' },
  { id: 'TRY', name: 'لیر ترکیه', unit: 'لیر', category: 'currency' },
  { id: 'GBP', name: 'پوند انگلیس', unit: 'پوند', category: 'currency' },
  { id: 'CAD', name: 'دلار کانادا', unit: 'دلار', category: 'currency' },
  { id: 'BTC', name: 'بیت‌کوین (BTC)', unit: 'عدد', category: 'crypto' },
  { id: 'ETH', name: 'اتریوم (ETH)', unit: 'عدد', category: 'crypto' },

  // دارایی شخصی و سفارشی (Custom Asset)
  { id: 'custom', name: '✨ دارایی شخصی / سفارشی (بورس، مسکن، صندوق، خودرو...)', unit: 'واحد', category: 'custom' },
];

function formatNum(num) {
  if (num === null || num === undefined || isNaN(num)) return '۰';
  return Math.round(num).toLocaleString('fa-IR');
}

function parseInputNumber(val) {
  if (!val) return 0;
  const pers = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  let s = String(val);
  for (let i = 0; i < 10; i++) {
    s = s.replace(new RegExp(pers[i], 'g'), i);
  }
  return parseFloat(s.replace(/,/g, '')) || 0;
}

export default function PortfolioTracker({ calcData, rates, usdToman, goldUsd }) {
  const { user, loading: authLoading, triggerLogin } = useAuth();

  const [holdings, setHoldings] = useState([]);
  const [loadingHoldings, setLoadingHoldings] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Modal Form State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState(null);
  const [selectedAssetId, setSelectedAssetId] = useState('gold_18k');
  const [customName, setCustomName] = useState('');
  const [customUnit, setCustomUnit] = useState('واحد');
  const [customCurrentPrice, setCustomCurrentPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [buyDate, setBuyDate] = useState('');
  const [notes, setNotes] = useState('');

  // 1. Fetch holdings from backend when user logs in
  const fetchHoldings = useCallback(async () => {
    if (!user) {
      setHoldings([]);
      setLoadingHoldings(false);
      return;
    }

    try {
      setLoadingHoldings(true);
      const res = await apiGetPortfolio();
      if (res.success && Array.isArray(res.holdings)) {
        setHoldings(res.holdings);

        // Check if there are local holdings to migrate
        try {
          const localStr = localStorage.getItem('realrate_portfolio_v1');
          if (localStr && res.holdings.length === 0) {
            const localItems = JSON.parse(localStr);
            if (Array.isArray(localItems) && localItems.length > 0) {
              for (const itm of localItems) {
                await apiAddPortfolioHolding({
                  assetId: itm.assetId,
                  assetName: itm.name,
                  assetType: itm.category || 'custom',
                  unit: itm.unit,
                  amount: itm.amount,
                  buyPrice: itm.buyPrice,
                  currentPrice: itm.currentPrice || 0,
                  buyDate: itm.buyDate || '',
                  notes: itm.notes || '',
                });
              }
              localStorage.removeItem('realrate_portfolio_v1');
              const refreshed = await apiGetPortfolio();
              if (refreshed.success && Array.isArray(refreshed.holdings)) {
                setHoldings(refreshed.holdings);
              }
            }
          }
        } catch (mErr) {
          console.warn('Migration error:', mErr);
        }
      }
    } catch (err) {
      console.error('Failed to fetch portfolio:', err);
    } finally {
      setLoadingHoldings(false);
    }
  }, [user]);

  useEffect(() => {
    fetchHoldings();
  }, [fetchHoldings]);

  // Active USD & Spot Gold & Silver resolution
  const usdVal = useMemo(() => {
    return parseInputNumber(usdToman) || rates?.live_usd_toman || calcData?.inputs?.usd_toman || 0;
  }, [usdToman, rates, calcData]);

  const goldUsdVal = useMemo(() => {
    return parseInputNumber(goldUsd) || rates?.gold_usd || calcData?.inputs?.gold_usd || 2450;
  }, [goldUsd, rates, calcData]);

  const silverUsdVal = useMemo(() => {
    return calcData?.silver?.silver_usd || rates?.silver_usd || rates?.silver?.silver_usd || 33.5;
  }, [calcData, rates]);

  // 2. Real / Intrinsic Price Calculation (قیمت واقعی طلا، نقره و ارزها)
  const intrinsicPriceMap = useMemo(() => {
    const map = {};
    if (!usdVal) return map;

    // A. Gold calculations
    if (goldUsdVal) {
      const gold_24k_gram = (goldUsdVal / 31.1034768) * usdVal;
      map['gold_18k'] = Math.round(gold_24k_gram * 0.75);
      map['full_new'] = Math.round(gold_24k_gram * 7.3197);
      map['full_old'] = Math.round(gold_24k_gram * 7.3197);
      map['half'] = Math.round(gold_24k_gram * 3.6594);
      map['quarter'] = Math.round(gold_24k_gram * 1.8297);
      map['gram'] = Math.round(gold_24k_gram * 0.909);
    }

    // B. Silver calculations (1 Troy Ounce = 31.1034768g)
    if (silverUsdVal) {
      const silver_999_gram = (silverUsdVal / 31.1034768) * usdVal;
      map['silver_999'] = Math.round(silver_999_gram);
      map['silver_925'] = Math.round(silver_999_gram * 0.925);
      map['silver_ounce'] = Math.round(silverUsdVal * usdVal);
    }

    // C. Currencies (Cross rate * usdVal)
    map['USD'] = Math.round(usdVal);
    map['USDT'] = Math.round(usdVal);

    const currList = calcData?.currencies || rates?.currencies;
    if (currList && Array.isArray(currList)) {
      currList.forEach((c) => {
        if (c.code) {
          const cross = c.usd_cross_rate || 1;
          map[c.code] = Math.round(cross * usdVal);
        }
      });
    }

    return map;
  }, [usdVal, goldUsdVal, silverUsdVal, calcData, rates]);

  // 3. Live Market Price Map (قیمت روز بازار آزاد)
  const marketPriceMap = useMemo(() => {
    const map = {};
    const usd = usdVal;

    // A. Gold & Coins from analysis
    if (calcData?.analysis) {
      calcData.analysis.forEach((item) => {
        if (item.id === 'full_coin' || item.id === 'full_new') map['full_new'] = item.market || item.intrinsic;
        if (item.id === 'full_old') map['full_old'] = item.market || item.intrinsic;
        if (item.id === 'half_coin' || item.id === 'half') map['half'] = item.market || item.intrinsic;
        if (item.id === 'quarter_coin' || item.id === 'quarter') map['quarter'] = item.market || item.intrinsic;
        if (item.id === 'gram') map['gram'] = item.market || item.intrinsic;
        if (item.id === 'gold_18k') map['gold_18k'] = item.market || item.intrinsic;
      });
    }

    // Telegram prices
    const tg = calcData?.market_data || rates?.market_prices;
    if (tg) {
      if (tg.full_coin?.price) map['full_new'] = tg.full_coin.price;
      if (tg.half_coin?.price) map['half'] = tg.half_coin.price;
      if (tg.quarter_coin?.price) map['quarter'] = tg.quarter_coin.price;
      if (tg.gold_18k?.price) map['gold_18k'] = tg.gold_18k.price;
    }

    if (!map['gold_18k'] && (calcData?.gold?.gold_18k_gram || rates?.gold?.gold_18k_gram)) {
      map['gold_18k'] = calcData?.gold?.gold_18k_gram || rates?.gold?.gold_18k_gram;
    }

    // B. Silver prices
    if (calcData?.silver || rates?.silver) {
      const sil = calcData?.silver || rates?.silver;
      if (sil.silver_999_gram) map['silver_999'] = sil.silver_999_gram;
      if (sil.silver_925_gram) map['silver_925'] = sil.silver_925_gram;
      if (sil.silver_ounce) map['silver_ounce'] = sil.silver_ounce;
    }

    map['USD'] = usd;
    map['USDT'] = usd;

    const currList = calcData?.currencies || rates?.currencies;
    if (currList && Array.isArray(currList)) {
      currList.forEach((c) => {
        if (c.code) map[c.code] = c.toman_price;
      });
    }

    // Fallback to intrinsic if market price is absent
    Object.keys(intrinsicPriceMap).forEach((k) => {
      if (!map[k]) map[k] = intrinsicPriceMap[k];
    });

    return map;
  }, [calcData, rates, usdVal, intrinsicPriceMap]);

  // 4. Open Modal for Adding
  const handleOpenAdd = () => {
    setEditingHolding(null);
    setSelectedAssetId('gold_18k');
    setCustomName('');
    setCustomUnit('واحد');
    setCustomCurrentPrice('');
    setAmount('');
    setBuyPrice('');
    setBuyDate('');
    setNotes('');
    setModalOpen(true);
  };

  // 5. Open Modal for Editing
  const handleOpenEdit = (item) => {
    setEditingHolding(item);
    const isKnown = ASSET_TYPES.some((a) => a.id === item.assetId && a.id !== 'custom');
    if (isKnown) {
      setSelectedAssetId(item.assetId);
      setCustomName('');
      setCustomUnit(item.unit || 'واحد');
      setCustomCurrentPrice(item.currentPrice ? String(item.currentPrice) : '');
    } else {
      setSelectedAssetId('custom');
      setCustomName(item.assetName || '');
      setCustomUnit(item.unit || 'واحد');
      setCustomCurrentPrice(item.currentPrice ? String(item.currentPrice) : '');
    }
    setAmount(String(item.amount));
    setBuyPrice(String(item.buyPrice));
    setBuyDate(item.buyDate || '');
    setNotes(item.notes || '');
    setModalOpen(true);
  };

  // 6. Handle Submit (Add or Edit)
  const handleSubmitHolding = async (e) => {
    e.preventDefault();
    const qty = parseInputNumber(amount);
    const price = parseInputNumber(buyPrice);

    if (qty <= 0 || price <= 0) {
      alert('لطفاً مقادیر معتبر برای تعداد/وزن و قیمت خرید وارد فرمایید.');
      return;
    }

    const isCustom = selectedAssetId === 'custom';
    const assetMeta = ASSET_TYPES.find((a) => a.id === selectedAssetId);

    const finalName = isCustom
      ? (customName.trim() || 'دارایی شخصی')
      : (assetMeta?.name || selectedAssetId);

    const finalUnit = isCustom
      ? (customUnit.trim() || 'واحد')
      : (assetMeta?.unit || 'واحد');

    const finalCategory = isCustom
      ? 'custom'
      : (assetMeta?.category || 'custom');

    const finalCurrentPrice = isCustom
      ? (parseInputNumber(customCurrentPrice) || price)
      : (marketPriceMap[selectedAssetId] || intrinsicPriceMap[selectedAssetId] || price);

    setSubmitting(true);

    try {
      const payload = {
        id: editingHolding ? editingHolding.id : undefined,
        assetId: isCustom ? (editingHolding?.assetId?.startsWith('custom_') ? editingHolding.assetId : `custom_${Date.now()}`) : selectedAssetId,
        assetName: finalName,
        assetType: finalCategory,
        unit: finalUnit,
        amount: qty,
        buyPrice: price,
        currentPrice: finalCurrentPrice,
        buyDate: buyDate.trim(),
        notes: notes.trim(),
      };

      if (editingHolding) {
        const res = await apiUpdatePortfolioHolding(payload);
        if (res.success && res.item) {
          setHoldings((prev) => prev.map((h) => (h.id === editingHolding.id ? res.item : h)));
          setModalOpen(false);
          setEditingHolding(null);
        } else {
          alert(res.message || 'خطا در ذخیره تغییرات دارایی');
        }
      } else {
        const res = await apiAddPortfolioHolding(payload);
        if (res.success && res.item) {
          setHoldings((prev) => [res.item, ...prev]);
          setModalOpen(false);
        } else {
          alert(res.message || 'خطا در ثبت دارایی');
        }
      }
    } catch (err) {
      console.error('Error saving holding:', err);
      alert('خطا در برقراری ارتباط با سرور.');
    } finally {
      setSubmitting(false);
    }
  };

  // 7. Handle Delete Holding from Database
  const handleDeleteHolding = async (id) => {
    if (!window.confirm('آیا از حذف این دارایی از پورتفو اطمینان دارید؟')) return;

    setDeletingId(id);
    try {
      const res = await apiDeletePortfolioHolding(id);
      if (res.success) {
        setHoldings((prev) => prev.filter((h) => h.id !== id));
      } else {
        alert(res.message || 'خطا در حذف دارایی');
      }
    } catch (err) {
      console.error('Error deleting holding:', err);
      alert('خطا در حذف دارایی از سرور.');
    } finally {
      setDeletingId(null);
    }
  };

  // 8. Portfolio Metrics & PnL Calculations
  const portfolioMetrics = useMemo(() => {
    let totalCost = 0;
    let totalMarketValue = 0;
    let totalIntrinsicValue = 0;

    const items = holdings.map((h) => {
      const amountNum = Number(h.amount) || 0;
      const buyPriceNum = Number(h.buyPrice) || 0;
      const isCustomItem = h.assetType === 'custom' || h.assetId?.startsWith('custom_');

      const intrinsicUnit = isCustomItem
        ? (Number(h.currentPrice) || buyPriceNum)
        : (intrinsicPriceMap[h.assetId] || 0);

      const marketUnit = isCustomItem
        ? (Number(h.currentPrice) || buyPriceNum)
        : (marketPriceMap[h.assetId] || intrinsicUnit || buyPriceNum);

      const itemCost = amountNum * buyPriceNum;
      const itemMarketVal = amountNum * marketUnit;
      const itemIntrinsicVal = amountNum * (intrinsicUnit || marketUnit);

      const itemPnl = itemMarketVal - itemCost;
      const itemPnlPct = itemCost > 0 ? (itemPnl / itemCost) * 100 : 0;

      let bubble = null;
      let bubblePct = null;
      if (!isCustomItem && intrinsicUnit > 0 && marketUnit > 0) {
        bubble = marketUnit - intrinsicUnit;
        bubblePct = parseFloat(((bubble / intrinsicUnit) * 100).toFixed(1));
      }

      totalCost += itemCost;
      totalMarketValue += itemMarketVal;
      totalIntrinsicValue += itemIntrinsicVal;

      return {
        ...h,
        isCustomItem,
        intrinsicUnit,
        marketUnit,
        itemCost,
        itemMarketVal,
        itemIntrinsicVal,
        itemPnl,
        itemPnlPct,
        bubble,
        bubblePct,
      };
    });

    const totalPnl = totalMarketValue - totalCost;
    const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

    return {
      items,
      totalCost,
      totalMarketValue,
      totalIntrinsicValue,
      totalPnl,
      totalPnlPct,
    };
  }, [holdings, intrinsicPriceMap, marketPriceMap]);

  const isModalCustom = selectedAssetId === 'custom';
  const selectedAssetMeta = ASSET_TYPES.find((a) => a.id === selectedAssetId);
  const currentModalIntrinsic = intrinsicPriceMap[selectedAssetId] || 0;
  const currentModalMarket = marketPriceMap[selectedAssetId] || currentModalIntrinsic || 0;
  const currentModalBubble = currentModalIntrinsic > 0 && currentModalMarket > 0
    ? parseFloat((((currentModalMarket - currentModalIntrinsic) / currentModalIntrinsic) * 100).toFixed(1))
    : null;

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
            <span className="lock-icon">🔒</span>
            <span className="badge-text">نیازمند ورود به حساب کاربری</span>
          </div>

          <h3 className="auth-gate-title">مدیریت هوشمند پورتفوی سرمایه‌گذاری</h3>
          <p className="auth-gate-desc">
            اطلاعات دارایی‌های شما (طلا، نقره، سکه، ارز و دارایی‌های شخصی) به صورت اختصاصی در پایگاه داده ابری
            ذخیره شده و ارزش روز و سود/زیان آنها همگام با نوسانات بازار لحظه‌به‌لحظه محاسبه می‌گردد.
          </p>

          <div className="auth-gate-features">
            <div className="gate-feature-item">
              <span className="feature-icon">☁️</span>
              <div className="feature-info">
                <strong>ذخیره ابری دائمی در دیتابیس</strong>
                <span>دسترسی به پورتفو از تمام گوشی‌ها و کامپیوترها بدون از دست رفتن داده‌ها</span>
              </div>
            </div>
            <div className="gate-feature-item">
              <span className="feature-icon">🥈</span>
              <div className="feature-info">
                <strong>پشتیبانی از طلا، نقره و دارایی‌های دلخواه</strong>
                <span>ثبت انواع سکه، طلای ۱۸ عیار، نقره ساچمه و استرلینگ، ارزها و دارایی‌های شخصی (بورس، مسکن و...)</span>
              </div>
            </div>
            <div className="gate-feature-item">
              <span className="feature-icon">⚖️</span>
              <div className="feature-info">
                <strong>سنجش ارزش واقعی و حباب</strong>
                <span>محاسبه مستقیم ارزش خالص طلا و نقره بر اساس انس جهانی و نرخ دلار روز</span>
              </div>
            </div>
            <div className="gate-feature-item">
              <span className="feature-icon">✏️</span>
              <div className="feature-info">
                <strong>امکان ویرایش، ثبت تاریخ و یادداشت</strong>
                <span>ویرایش آسان مقادیر، زمان دقیق خرید، قیمت تمام‌شده و توضیحات هر دارایی</span>
              </div>
            </div>
          </div>

          <div className="auth-gate-actions">
            <button className="btn-google-gate-login" onClick={triggerLogin}>
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>ورود سریع و امن با حساب گوگل</span>
            </button>
            <span className="gate-privacy-note">🔒 اطلاعات پورتفوی شما فقط برای خودتان قابل مشاهده است.</span>
          </div>
        </div>
      </div>
    );
  }

  // ─── LOGGED IN VIEW ─────────────────────────────────────────────────────
  return (
    <div className="portfolio-section">
      {/* Overview Cards Grid */}
      <div className="portfolio-overview-grid">
        {/* Card 1: Live Market Value */}
        <div className="portfolio-stat-card main-val">
          <div className="stat-header">
            <span className="stat-label">ارزش کل روز دارایی‌ها (بازار)</span>
            <span className="live-pill">
              <span className="live-dot"></span>
              نرخ روز بازار
            </span>
          </div>
          <div className="stat-number gold-gradient-text">
            {formatNum(portfolioMetrics.totalMarketValue)}
            <span className="stat-unit">تومان</span>
          </div>
          <div className="stat-sub">
            سرمایه اولیه خرید: {formatNum(portfolioMetrics.totalCost)} تومان
          </div>
        </div>

        {/* Card 2: Intrinsic Real Value */}
        <div className="portfolio-stat-card intrinsic-val">
          <div className="stat-header">
            <span className="stat-label">ارزش واقعی و خالص طلا، نقره و ارز</span>
            <span className="real-pill">
              🌐 انس جهانی + دلار
            </span>
          </div>
          <div className="stat-number sky-gradient-text">
            {formatNum(portfolioMetrics.totalIntrinsicValue)}
            <span className="stat-unit">تومان</span>
          </div>
          <div className="stat-sub">
            طلا: {goldUsdVal ? `$${goldUsdVal.toLocaleString()}` : '-'} • نقره: {silverUsdVal ? `$${silverUsdVal.toFixed(2)}` : '-'} • دلار: {formatNum(usdVal)}
          </div>
        </div>

        {/* Card 3: Total PnL */}
        <div className={`portfolio-stat-card pnl-card ${portfolioMetrics.totalPnl >= 0 ? 'profit' : 'loss'}`}>
          <div className="stat-header">
            <span className="stat-label">سود / زیان کل پورتفو</span>
            <span className={`pnl-badge ${portfolioMetrics.totalPnl >= 0 ? 'profit' : 'loss'}`}>
              {portfolioMetrics.totalPnl >= 0 ? '+' : ''}
              {portfolioMetrics.totalPnlPct.toFixed(2).replace('-', '')}٪
            </span>
          </div>
          <div className="stat-number">
            {portfolioMetrics.totalPnl >= 0 ? '+' : ''}
            {formatNum(portfolioMetrics.totalPnl)}
            <span className="stat-unit">تومان</span>
          </div>
          <div className="stat-sub">
            {portfolioMetrics.totalPnl >= 0 ? '🟢 سبد شما در سود است' : '🔴 سبد شما در زیان است'}
          </div>
        </div>

        {/* Card 4: Actions & Count */}
        <div className="portfolio-stat-card action-card">
          <div className="stat-header">
            <span className="stat-label">مدیریت سبد دارایی</span>
            <span className="count-pill">{holdings.length} قلم دارایی</span>
          </div>
          <button className="btn-add-asset" onClick={handleOpenAdd}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>افزودن دارایی جدید</span>
          </button>
        </div>
      </div>

      {/* Holdings List */}
      <div className="portfolio-table-card">
        <div className="portfolio-table-header">
          <div className="table-title">
            <h3>📋 جزئیات سبد سرمایه‌گذاری ({user.name || user.email})</h3>
            <span>
              محاسبه آنلاین بر پایه انس جهانی طلا ({goldUsdVal ? `$${goldUsdVal.toLocaleString()}` : ''})، انس نقره ({silverUsdVal ? `$${silverUsdVal.toFixed(2)}` : ''}) و دلار آزاد ({formatNum(usdVal)} تومان)
            </span>
          </div>
          {holdings.length > 0 && (
            <button className="btn-quick-add" onClick={handleOpenAdd}>
              + افزودن دارایی جدید
            </button>
          )}
        </div>

        {loadingHoldings ? (
          <div className="portfolio-empty-state">
            <div className="spinner-glow"></div>
            <p>در حال دریافت اطلاعات پورتفوی شما از دیتابیس...</p>
          </div>
        ) : portfolioMetrics.items.length === 0 ? (
          <div className="portfolio-empty-state">
            <div className="empty-icon">💼</div>
            <h4>هنوز دارایی در پورتفوی شما ثبت نشده است</h4>
            <p>
              می‌توانید انواع طلا، سکه، نقره ساچمه و استرلینگ، ارزها یا دارایی‌های دلخواه خود (سهام بورس، صندوق، مسکن و...) را
              ثبت کنید تا سود و زیان آنها به صورت زنده رصد شود.
            </p>
            <button className="btn-add-asset-center" onClick={handleOpenAdd}>
              + ثبت اولین دارایی
            </button>
          </div>
        ) : (
          <div className="portfolio-items-list">
            {portfolioMetrics.items.map((item) => {
              const isProfit = item.itemPnl >= 0;
              const isDeleting = deletingId === item.id;
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
                      <span>خرید: {formatNum(item.buyPrice)} تومان</span>
                      <span className="meta-sep">•</span>
                      {!item.isCustomItem ? (
                        <>
                          <span className="meta-real-price" title="محاسبه مستقیم از انس جهانی و دلار">
                            قیمت واقعی: {formatNum(item.intrinsicUnit)} تومان
                          </span>
                          <span className="meta-sep">•</span>
                          <span className="meta-market-price">
                            نرخ روز بازار: {formatNum(item.marketUnit)} تومان
                          </span>
                          {item.bubblePct !== null && (
                            <span className={`meta-bubble-tag ${item.bubblePct < 0 ? 'negative' : ''}`}>
                              {item.bubblePct >= 0 ? '+' : ''}{item.bubblePct}٪ حباب
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="meta-market-price">
                          نرخ جاری ثبت‌شده: {formatNum(item.marketUnit)} تومان
                        </span>
                      )}
                    </div>

                    {/* Meta info: Purchase date & notes */}
                    {(item.buyDate || item.notes) && (
                      <div className="item-extra-meta">
                        {item.buyDate && (
                          <span className="item-date-tag">
                            📅 {item.buyDate}
                          </span>
                        )}
                        {item.notes && (
                          <span className="item-notes-tag" title={item.notes}>
                            💬 {item.notes}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="item-values-col">
                    <div className="item-live-val">
                      {formatNum(item.itemMarketVal)}
                      <span className="val-unit">تومان</span>
                    </div>
                    {!item.isCustomItem && (
                      <div className="item-intrinsic-sub" title="ارزش کل واقعی بر اساس طلای خام و نقره">
                        ارزش واقعی: {formatNum(item.itemIntrinsicVal)} تومان
                      </div>
                    )}
                    <div className={`item-pnl-tag ${isProfit ? 'profit' : 'loss'}`}>
                      <span>{isProfit ? '+' : ''}{formatNum(item.itemPnl)} تومان</span>
                      <span className="pct">({isProfit ? '+' : ''}{item.itemPnlPct.toFixed(1).replace('-', '')}٪)</span>
                    </div>
                  </div>

                  <div className="item-actions-col">
                    {/* Edit Button */}
                    <button
                      className="btn-edit-item"
                      title="ویرایش دارایی"
                      onClick={() => handleOpenEdit(item)}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                      </svg>
                    </button>

                    {/* Delete Button */}
                    <button
                      className="btn-del-item"
                      title="حذف از پورتفو"
                      disabled={isDeleting}
                      onClick={() => handleDeleteHolding(item.id)}
                    >
                      {isDeleting ? (
                        <div className="mini-spinner"></div>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit Asset Modal */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={() => !submitting && setModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingHolding ? '✏️ ویرایش دارایی در پورتفو' : '➕ افزودن دارایی به پورتفو'}</h3>
              <button
                className="modal-close-btn"
                disabled={submitting}
                onClick={() => setModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitHolding} className="modal-form">
              <div className="form-item">
                <label>نوع دارایی</label>
                <select
                  value={selectedAssetId}
                  onChange={(e) => setSelectedAssetId(e.target.value)}
                  className="form-select"
                >
                  <optgroup label="طلا و مسکوکات">
                    <option value="gold_18k">طلای ۱۸ عیار (خام / آب‌شده)</option>
                    <option value="full_new">سکه امامی (طرح جدید)</option>
                    <option value="full_old">سکه بهار آزادی (طرح قدیم)</option>
                    <option value="half">نیم سکه بهار آزادی</option>
                    <option value="quarter">ربع سکه بهار آزادی</option>
                    <option value="gram">سکه گرمی</option>
                  </optgroup>

                  <optgroup label="نقره (Silver)">
                    <option value="silver_999">نقره خام و ساچمه ۹۹۹ (گرم)</option>
                    <option value="silver_925">نقره استرلینگ ۹۲۵ (گرم)</option>
                    <option value="silver_ounce">انس جهانی نقره (XAG)</option>
                  </optgroup>

                  <optgroup label="ارزهای خارجی و کریپتو">
                    <option value="USD">دلار آمریکا (اسکناس)</option>
                    <option value="USDT">تتر (USDT)</option>
                    <option value="EUR">یورو اروپا</option>
                    <option value="AED">درهم امارات</option>
                    <option value="TRY">لیر ترکیه</option>
                    <option value="GBP">پوند انگلیس</option>
                    <option value="CAD">دلار کانادا</option>
                    <option value="BTC">بیت‌کوین (BTC)</option>
                    <option value="ETH">اتریوم (ETH)</option>
                  </optgroup>

                  <optgroup label="دارایی‌های دلخواه">
                    <option value="custom">✨ دارایی شخصی / سفارشی (بورس، مسکن، صندوق و...)</option>
                  </optgroup>
                </select>
              </div>

              {/* Custom Asset Specific Fields */}
              {isModalCustom && (
                <div className="form-row-dual">
                  <div className="form-item flex-1">
                    <label>نام دارایی سفارشی</label>
                    <input
                      type="text"
                      placeholder="مثلاً صندوق طلای کهربا یا سهام فولاد"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      className="form-input"
                      required
                    />
                  </div>

                  <div className="form-item flex-1">
                    <label>واحد شمارش</label>
                    <input
                      type="text"
                      placeholder="مثلاً سهم، واحد، متر، عدد"
                      value={customUnit}
                      onChange={(e) => setCustomUnit(e.target.value)}
                      className="form-input"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="form-item">
                <label>
                  مقدار یا تعداد ({isModalCustom ? (customUnit || 'واحد') : selectedAssetMeta?.unit})
                </label>
                <input
                  type="text"
                  placeholder={`مثلاً ${selectedAssetMeta?.unit === 'گرم' ? '۱۵.۵' : '۲'}`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="form-input"
                  required
                />
              </div>

              <div className="form-item">
                <label>
                  قیمت خرید هر واحد (به ازای هر {isModalCustom ? (customUnit || 'واحد') : selectedAssetMeta?.unit} - تومان)
                </label>
                <input
                  type="text"
                  placeholder="مثلاً ۵۴,۲۰۰,۰۰۰"
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(e.target.value)}
                  className="form-input"
                  required
                />
              </div>

              {/* Custom Asset: Current Market Price field */}
              {isModalCustom && (
                <div className="form-item">
                  <label>قیمت روز هر واحد در بازار (تومان)</label>
                  <input
                    type="text"
                    placeholder="جهت محاسبه زنده ارزش و سود/زیان"
                    value={customCurrentPrice}
                    onChange={(e) => setCustomCurrentPrice(e.target.value)}
                    className="form-input"
                  />
                  <span className="field-sub-note">در صورت خالی ماندن، برابر با قیمت خرید در نظر گرفته می‌شود.</span>
                </div>
              )}

              <div className="form-row-dual">
                <div className="form-item flex-1">
                  <label>تاریخ یا زمان خرید (اختیاری)</label>
                  <input
                    type="text"
                    placeholder="مثلاً ۱۴۰۳/۱۱/۲۰ یا آبان ۱۴۰۳"
                    value={buyDate}
                    onChange={(e) => setBuyDate(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div className="form-item flex-1">
                  <label>توضیحات و یادداشت (اختیاری)</label>
                  <input
                    type="text"
                    placeholder="مثلاً خرید از بورس یا بازار"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              {/* Real & Market Price Comparison Hint Box (for standard assets) */}
              {!isModalCustom && currentModalIntrinsic > 0 && (
                <div className="live-hint-box-detailed">
                  <div className="hint-row">
                    <span className="hint-label">💎 قیمت واقعی (ارزش ذاتی خالص):</span>
                    <strong className="hint-val-sky">{formatNum(currentModalIntrinsic)} تومان</strong>
                  </div>
                  <div className="hint-row">
                    <span className="hint-label">📈 نرخ روز در بازار آزاد:</span>
                    <strong className="hint-val-gold">{formatNum(currentModalMarket)} تومان</strong>
                  </div>
                  {currentModalBubble !== null && (
                    <div className="hint-sub">
                      حباب نسبت به ارزش خام: <strong>{currentModalBubble >= 0 ? '+' : ''}{currentModalBubble}٪</strong>
                    </div>
                  )}
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-modal-cancel"
                  disabled={submitting}
                  onClick={() => setModalOpen(false)}
                >
                  انصراف
                </button>
                <button type="submit" className="btn-modal-submit" disabled={submitting}>
                  {submitting
                    ? 'در حال ذخیره‌سازی...'
                    : editingHolding
                    ? 'ذخیره تغییرات'
                    : 'ثبت در دیتابیس پورتفو'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

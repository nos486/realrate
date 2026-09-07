import React, { useState, useEffect, useMemo } from 'react';

const ASSET_TYPES = [
  { id: 'full_new', name: 'سکه امامی (طرح جدید)', unit: 'عدد', category: 'coin' },
  { id: 'full_old', name: 'سکه بهار آزادی (طرح قدیم)', unit: 'عدد', category: 'coin' },
  { id: 'half', name: 'نیم سکه بهار آزادی', unit: 'عدد', category: 'coin' },
  { id: 'quarter', name: 'ربع سکه بهار آزادی', unit: 'عدد', category: 'coin' },
  { id: 'gram', name: 'سکه گرمی', unit: 'عدد', category: 'coin' },
  { id: 'gold_18k', name: 'طلای ۱۸ عیار (خام/آب‌شده)', unit: 'گرم', category: 'gold' },
  { id: 'USD', name: 'دلار آمریکا (اسکناس)', unit: 'دلار', category: 'currency' },
  { id: 'EUR', name: 'یورو اروپا', unit: 'یورو', category: 'currency' },
  { id: 'AED', name: 'درهم امارات', unit: 'درهم', category: 'currency' },
  { id: 'TRY', name: 'لیر ترکیه', unit: 'لیر', category: 'currency' },
  { id: 'USDT', name: 'تتر (USDT)', unit: 'تتر', category: 'crypto' },
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

export default function PortfolioTracker({ calcData, rates, usdToman }) {
  const [holdings, setHoldings] = useState(() => {
    try {
      const saved = localStorage.getItem('realrate_portfolio_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState('gold_18k');
  const [amount, setAmount] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [notes, setNotes] = useState('');

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('realrate_portfolio_v1', JSON.stringify(holdings));
    } catch (e) {
      console.error('Failed to save portfolio', e);
    }
  }, [holdings]);

  // Live Price Resolution Map
  const livePriceMap = useMemo(() => {
    const map = {};
    const usd = parseInputNumber(usdToman) || rates?.live_usd_toman || 0;

    // 1. Coins & 18k from analysis
    if (calcData?.analysis) {
      calcData.analysis.forEach((item) => {
        if (item.id === 'full_new') map['full_new'] = item.market || item.intrinsic;
        if (item.id === 'full_old') map['full_old'] = item.market || item.intrinsic;
        if (item.id === 'half') map['half'] = item.market || item.intrinsic;
        if (item.id === 'quarter') map['quarter'] = item.market || item.intrinsic;
        if (item.id === 'gram') map['gram'] = item.market || item.intrinsic;
        if (item.id === 'gold_18k') map['gold_18k'] = item.market || item.intrinsic;
      });
    }

    if (!map['gold_18k'] && (calcData?.gold?.gold_18k_gram || rates?.gold?.gold_18k_gram)) {
      map['gold_18k'] = calcData?.gold?.gold_18k_gram || rates?.gold?.gold_18k_gram;
    }

    // 2. Currencies
    map['USD'] = usd;
    map['USDT'] = usd; // Tether approximate 1:1 with USD cash

    const currList = calcData?.currencies || rates?.currencies;
    if (currList && Array.isArray(currList)) {
      currList.forEach((c) => {
        if (c.code) map[c.code] = c.toman_price;
      });
    }

    return map;
  }, [calcData, rates, usdToman]);

  // Handle Add Asset
  const handleAddAsset = (e) => {
    e.preventDefault();
    const qty = parseInputNumber(amount);
    const price = parseInputNumber(buyPrice);

    if (qty <= 0 || price <= 0) {
      alert('لطفاً مقادیر معتبر برای تعداد/وزن و قیمت خرید وارد کنید.');
      return;
    }

    const assetMeta = ASSET_TYPES.find((a) => a.id === selectedAssetId);

    const newHolding = {
      id: 'h_' + Date.now(),
      assetId: selectedAssetId,
      name: assetMeta?.name || selectedAssetId,
      unit: assetMeta?.unit || 'واحد',
      amount: qty,
      buyPrice: price,
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
    };

    setHoldings((prev) => [newHolding, ...prev]);
    setModalOpen(false);
    setAmount('');
    setBuyPrice('');
    setNotes('');
  };

  const handleDeleteHolding = (id) => {
    if (window.confirm('آیا از حذف این دارایی از پورتفو اطمینان دارید؟')) {
      setHoldings((prev) => prev.filter((h) => h.id !== id));
    }
  };

  // Calculate totals
  const portfolioMetrics = useMemo(() => {
    let totalCost = 0;
    let totalCurrentValue = 0;

    const items = holdings.map((h) => {
      const liveUnitPrice = livePriceMap[h.assetId] || 0;
      const itemCost = h.amount * h.buyPrice;
      const itemCurrentVal = h.amount * (liveUnitPrice || h.buyPrice);
      const itemPnl = itemCurrentVal - itemCost;
      const itemPnlPct = itemCost > 0 ? (itemPnl / itemCost) * 100 : 0;

      totalCost += itemCost;
      totalCurrentValue += itemCurrentVal;

      return {
        ...h,
        liveUnitPrice,
        itemCost,
        itemCurrentVal,
        itemPnl,
        itemPnlPct,
      };
    });

    const totalPnl = totalCurrentValue - totalCost;
    const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

    return {
      items,
      totalCost,
      totalCurrentValue,
      totalPnl,
      totalPnlPct,
    };
  }, [holdings, livePriceMap]);

  const selectedAssetMeta = ASSET_TYPES.find((a) => a.id === selectedAssetId);

  return (
    <div className="portfolio-section">
      {/* Overview Cards Grid */}
      <div className="portfolio-overview-grid">
        <div className="portfolio-stat-card main-val">
          <div className="stat-header">
            <span className="stat-label">ارزش کل روز دارایی‌ها</span>
            <span className="live-pill">
              <span className="live-dot"></span>
              زنده با بازار
            </span>
          </div>
          <div className="stat-number gold-gradient-text">
            {formatNum(portfolioMetrics.totalCurrentValue)}
            <span className="stat-unit">تومان</span>
          </div>
          <div className="stat-sub">
            سرمایه اولیه: {formatNum(portfolioMetrics.totalCost)} تومان
          </div>
        </div>

        <div className={`portfolio-stat-card pnl-card ${portfolioMetrics.totalPnl >= 0 ? 'profit' : 'loss'}`}>
          <div className="stat-header">
            <span className="stat-label">سود / زیان کل</span>
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
            {portfolioMetrics.totalPnl >= 0 ? '🟢 در سود هستید' : '🔴 در زیان هستید'}
          </div>
        </div>

        <div className="portfolio-stat-card action-card">
          <div className="stat-header">
            <span className="stat-label">مدیریت سبد</span>
            <span className="count-pill">{holdings.length} قلم دارایی</span>
          </div>
          <button className="btn-add-asset" onClick={() => setModalOpen(true)}>
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
            <h3>📋 جزئیات سبد سرمایه‌گذاری شما</h3>
            <span>ارزش‌گذاری و محاسبه سود/ضرر بر اساس نرخ لحظه‌ای طلا و ارز</span>
          </div>
          {holdings.length > 0 && (
            <button className="btn-quick-add" onClick={() => setModalOpen(true)}>
              + افزودن مورد دیگر
            </button>
          )}
        </div>

        {portfolioMetrics.items.length === 0 ? (
          <div className="portfolio-empty-state">
            <div className="empty-icon">💼</div>
            <h4>هنوز دارایی در پورتفوی شما ثبت نشده است</h4>
            <p>
              می‌توانید موجودی طلا (۱۸ عیار)، انواع سکه، یا ارزهای خارجی خود را با قیمت خرید وارد کنید
              تا سود یا زیان لحظه‌ای آنها به صورت خودکار رصد شود.
            </p>
            <button className="btn-add-asset-center" onClick={() => setModalOpen(true)}>
              + ثبت اولین دارایی
            </button>
          </div>
        ) : (
          <div className="portfolio-items-list">
            {portfolioMetrics.items.map((item) => {
              const isProfit = item.itemPnl >= 0;
              return (
                <div key={item.id} className="portfolio-item-row">
                  <div className="item-main-col">
                    <div className="item-name-wrap">
                      <span className="item-name">{item.name}</span>
                      <span className="item-qty-tag">
                        {item.amount.toLocaleString('fa-IR')} {item.unit}
                      </span>
                    </div>
                    <div className="item-price-meta">
                      <span>خرید: {formatNum(item.buyPrice)}</span>
                      <span className="meta-sep">•</span>
                      <span>روز: {item.liveUnitPrice ? formatNum(item.liveUnitPrice) : 'استعلام'} تومان</span>
                    </div>
                  </div>

                  <div className="item-values-col">
                    <div className="item-live-val">
                      {formatNum(item.itemCurrentVal)}
                      <span className="val-unit">تومان</span>
                    </div>
                    <div className={`item-pnl-tag ${isProfit ? 'profit' : 'loss'}`}>
                      <span>{isProfit ? '+' : ''}{formatNum(item.itemPnl)} تومان</span>
                      <span className="pct">({isProfit ? '+' : ''}{item.itemPnlPct.toFixed(1).replace('-', '')}٪)</span>
                    </div>
                  </div>

                  <div className="item-actions-col">
                    <button
                      className="btn-del-item"
                      title="حذف از پورتفو"
                      onClick={() => handleDeleteHolding(item.id)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Asset Modal */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>افزودن دارایی جدید به پورتفو</h3>
              <button className="modal-close-btn" onClick={() => setModalOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleAddAsset} className="modal-form">
              <div className="form-item">
                <label>نوع دارایی</label>
                <select
                  value={selectedAssetId}
                  onChange={(e) => setSelectedAssetId(e.target.value)}
                  className="form-select"
                >
                  {ASSET_TYPES.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-item">
                <label>مقدار یا تعداد ({selectedAssetMeta?.unit})</label>
                <input
                  type="text"
                  placeholder={`مثلاً ${selectedAssetMeta?.unit === 'گرم' ? '۵.۵' : '۲'}`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="form-input"
                  required
                />
              </div>

              <div className="form-item">
                <label>قیمت خرید واحد (به ازای هر {selectedAssetMeta?.unit} - تومان)</label>
                <input
                  type="text"
                  placeholder="مثلاً ۵۲,۰۰۰,۰۰۰"
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(e.target.value)}
                  className="form-input"
                  required
                />
              </div>

              <div className="form-item">
                <label>یادداشت یا تاریخ خرید (اختیاری)</label>
                <input
                  type="text"
                  placeholder="مثلاً خرید از طلافروشی پاساژ"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="form-input"
                />
              </div>

              {livePriceMap[selectedAssetId] && (
                <div className="live-hint-box">
                  <span>قیمت لحظه‌ای روز در بازار:</span>
                  <strong>{formatNum(livePriceMap[selectedAssetId])} تومان</strong>
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn-modal-cancel" onClick={() => setModalOpen(false)}>
                  انصراف
                </button>
                <button type="submit" className="btn-modal-submit">
                  ثبت در سبد دارایی
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

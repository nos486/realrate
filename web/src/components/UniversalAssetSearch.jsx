import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  X,
  Award,
  Coins,
  Disc,
  Banknote,
  Zap,
  TrendingUp,
  Layers,
  Sparkles,
  Check,
} from 'lucide-react';
import { apiGetPriceSources, apiSearchBourseSymbols } from '../api/client.js';

export const STANDARD_PRICE_TYPE_LABELS = {
  usd: 'دلار آمریکا',
  usd_toman: 'دلار آمریکا',
  gold_18k: 'طلای ۱۸ عیار',
  gold_24k: 'طلای ۲۴ عیار',
  gold_melted: 'طلای آبشده',
  mesghal: 'مثقال طلا (مظنه)',
  full_coin: 'سکه امامی',
  full_new: 'سکه امامی',
  full_old: 'سکه بهار آزادی (طرح قدیم)',
  half_coin: 'نیم سکه بهار آزادی',
  half: 'نیم سکه بهار آزادی',
  quarter_coin: 'ربع سکه بهار آزادی',
  quarter: 'ربع سکه بهار آزادی',
  gerami_coin: 'سکه گرمی',
  gerami: 'سکه گرمی',
  ons_gold: 'انس جهانی طلا',
  gold_ounce: 'انس جهانی طلا',
  ons_silver: 'انس جهانی نقره',
  silver_ounce: 'انس جهانی نقره',
  silver_999: 'نقره خام ۹۹۹',
  eur: 'یورو اروپا',
  try: 'لیر ترکیه',
  aed: 'درهم امارات',
  gbp: 'پوند انگلیس',
  chf: 'فرانک سوئیس',
  cad: 'دلار کانادا',
  aud: 'دلار استرالیا',
  cny: 'یوان چین',
  kwd: 'دینار کویت',
  sar: 'ریال عربستان',
  qar: 'ریال قطر',
  bourse: 'بورس اوراق بهادار',
  bourse_fund: 'صندوق سرمایه‌گذاری بورس',
  forex: 'ارزهای جهانی (فارکس)',
  crypto: 'رمزارز',
  usdt: 'تتر (USDT)',
  btc: 'بیت‌کوین (BTC)',
  eth: 'اتریوم (ETH)',
};

export function getPriceTypeLabel(priceType, priceTypeInfo = null) {
  if (!priceType) return '';
  const clean = String(priceType).trim().toLowerCase();
  if (priceTypeInfo && priceTypeInfo[priceType]?.label) return priceTypeInfo[priceType].label;
  if (priceTypeInfo && priceTypeInfo[clean]?.label) return priceTypeInfo[clean].label;
  if (STANDARD_PRICE_TYPE_LABELS[clean]) return STANDARD_PRICE_TYPE_LABELS[clean];
  if (STANDARD_PRICE_TYPE_LABELS[priceType]) return STANDARD_PRICE_TYPE_LABELS[priceType];
  return priceType;
}

export function getCategoryMetadata(priceType) {
  const pt = String(priceType || '').toLowerCase();
  if (pt === 'gold_18k' || pt === 'gold_24k' || pt === 'gold_melted' || pt === 'mesghal' || pt.includes('gold')) {
    return { category: 'gold', badge: 'طلا', tab: 'gold_coins' };
  }
  if (pt.includes('coin') || pt === 'full_new' || pt === 'full_old' || pt === 'half' || pt === 'quarter' || pt === 'gerami') {
    return { category: 'coin', badge: 'سکه', tab: 'gold_coins' };
  }
  if (pt.includes('silver')) {
    return { category: 'silver', badge: 'نقره', tab: 'gold_coins' };
  }
  if (pt === 'crypto' || pt === 'btc' || pt === 'eth' || pt === 'usdt') {
    return { category: 'crypto', badge: 'رمزارز', tab: 'currency_crypto' };
  }
  if (pt === 'bourse') {
    return { category: 'bourse', badge: 'بورس', tab: 'bourse' };
  }
  if (pt === 'bourse_fund') {
    return { category: 'bourse_fund', badge: 'صندوق', tab: 'bourse' };
  }
  return { category: 'currency', badge: 'ارز', tab: 'currency_crypto' };
}

export function normalizeSearchText(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/\u200C/g, ' ')
    .replace(/[\u200B\u200D\uFEFF]/g, '')
    .replace(/[ي]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .replace(/[آأإ]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .replace(/[۰٠]/g, '0')
    .replace(/[۱١]/g, '1')
    .replace(/[۲٢]/g, '2')
    .replace(/[۳٣]/g, '3')
    .replace(/[۴٤]/g, '4')
    .replace(/[۵٥]/g, '5')
    .replace(/[۶٦]/g, '6')
    .replace(/[۷٧]/g, '7')
    .replace(/[۸٨]/g, '8')
    .replace(/[۹٩]/g, '9')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isSourceMultiOutput(s) {
  if (!s) return false;
  const t = (s.priceType || '').toLowerCase();
  if (t === 'bourse' || t === 'bourse_fund' || t === 'forex') return true;
  if (s.category === 'multi_output' || s.isMultiOutput) return true;
  if (s.fieldMapping && (s.fieldMapping.isMultiOutput || s.fieldMapping.idField || s.fieldMapping.symbolField)) return true;
  if (s.lastMultiData) return true;
  if (Array.isArray(s.sampleItems) && s.sampleItems.length > 0) return true;
  if (Array.isArray(s.compactList) && s.compactList.length > 0) return true;
  if (Array.isArray(s.items) && s.items.length > 0) return true;
  return false;
}

export function extractMultiItems(src) {
  if (!src) return [];
  let multi = null;
  if (src.lastMultiData) {
    if (typeof src.lastMultiData === 'string') {
      try {
        multi = JSON.parse(src.lastMultiData);
      } catch (e) {
        console.warn('Failed to parse lastMultiData for', src.name, e);
      }
    } else if (typeof src.lastMultiData === 'object') {
      multi = src.lastMultiData;
    }
  }

  let rawList = [];
  if (multi) {
    if (Array.isArray(multi.sampleItems)) rawList = multi.sampleItems;
    else if (Array.isArray(multi.compactList)) rawList = multi.compactList;
    else if (Array.isArray(multi.items)) rawList = multi.items;
    else if (Array.isArray(multi.symbols)) rawList = multi.symbols;
    else if (Array.isArray(multi.data)) rawList = multi.data;
    else if (Array.isArray(multi.results)) rawList = multi.results;
    else if (Array.isArray(multi.list)) rawList = multi.list;
    else if (Array.isArray(multi)) rawList = multi;
    else if (typeof multi === 'object') {
      rawList = Object.entries(multi)
        .filter(([k]) => !['updatedAt', 'totalCount', 'totalSymbols', 'labels', 'topSymbols', 'error', 'datetime'].includes(k))
        .map(([k, v]) => {
          const val = typeof v === 'object' ? (v?.price || v?.p || v?.val || 0) : v;
          return {
            s: k.toUpperCase(),
            n: k.toUpperCase(),
            p: Number(val) || 0,
            priceTomans: Number(val) || 0,
          };
        });
    }
  }

  if (rawList.length === 0) {
    if (Array.isArray(src.sampleItems)) rawList = src.sampleItems;
    else if (Array.isArray(src.compactList)) rawList = src.compactList;
    else if (Array.isArray(src.items)) rawList = src.items;
  }

  if (!rawList || rawList.length === 0) return [];

  let excludedSet = new Set();
  if (src.excludedOutputs) {
    let excludedArr = [];
    if (Array.isArray(src.excludedOutputs)) {
      excludedArr = src.excludedOutputs;
    } else if (typeof src.excludedOutputs === 'string') {
      try { excludedArr = JSON.parse(src.excludedOutputs); } catch {}
    }
    excludedSet = new Set(excludedArr.map((x) => String(x).trim().toLowerCase()));
  }

  const isBourse = src.priceType === 'bourse' || src.priceType === 'bourse_fund';
  const isRial = src.unit === 'rial' || (typeof src.fieldMapping === 'object' && src.fieldMapping?.priceUnit === 'rial') || isBourse;

  return rawList
    .filter((item) => {
      if (!item || typeof item !== 'object') return false;
      const sym = String(item.s || item.symbol || item.id || item.code || item.slug || item.l18 || item.ticker || '').trim().toLowerCase();
      const name = String(item.n || item.name || item.title || item.car_name || item.model || item.l30 || '').trim().toLowerCase();
      if (sym && excludedSet.has(sym)) return false;
      if (name && excludedSet.has(name)) return false;
      return true;
    })
    .map((item) => {
      const sym = String(item.s || item.symbol || item.id || item.code || item.slug || item.l18 || item.ticker || '').trim();
      const name = String(item.n || item.name || item.title || item.car_name || item.model || item.l30 || sym).trim();
      const rawPrice = Number(item.priceTomans || item.priceFinal || item.price || item.lastPrice || item.p || item.pl || item.pc || 0);
      const finalPrice = isRial && rawPrice > 0 ? Math.round(rawPrice / 10) : (rawPrice >= 100 ? Math.round(rawPrice) : rawPrice);
      const cp = Number(item.cp !== undefined ? item.cp : (item.changePercent !== undefined ? item.changePercent : (item.plp || 0)));
      const rawCategory = String(item.cat || item.category || item.brand || item.group || '').trim();
      const isFund = Boolean(item.f === 1 || item.isFund || src.priceType === 'bourse_fund' || rawCategory.includes('صندوق') || name.includes('صندوق'));

      return {
        ...item,
        symbol: sym,
        name,
        price: finalPrice,
        changePercent: cp,
        category: rawCategory,
        extra: String(item.extra || item.model || item.volume || '').trim(),
        isFund,
      };
    });
}

function getCategoryIcon(cat) {
  switch (cat) {
    case 'gold':
      return <Award size={15} />;
    case 'coin':
      return <Coins size={15} />;
    case 'silver':
      return <Disc size={15} />;
    case 'currency':
      return <Banknote size={15} />;
    case 'crypto':
      return <Zap size={15} />;
    case 'bourse':
      return <TrendingUp size={15} />;
    case 'bourse_fund':
      return <Layers size={15} />;
    default:
      return <Sparkles size={15} />;
  }
}

const CATEGORY_TABS = [
  { id: 'all', label: 'همه اقلام' },
  { id: 'gold_coins', label: 'طلا و مسکوکات' },
  { id: 'currency_crypto', label: 'ارز و رمزارز' },
  { id: 'bourse', label: 'بورس و صندوق‌ها' },
];

export default function UniversalAssetSearch({
  mode = 'picker',
  sources = null,
  priceTypeInfo = null,
  selectedAsset = null,
  selectedAssetId = null,
  onSelect = () => {},
  showCategories = true,
  placeholder = 'جستجو در تمامی سورس‌ها، طلا، سکه، ارز، بورس...',
  title = '',
  subtitle = '',
  autoFocus = false,
}) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [internalSources, setInternalSources] = useState(sources || []);
  const [bourseSymbols, setBourseSymbols] = useState([]);
  const containerRef = useRef(null);

  // 1. Fetch Sources if not supplied via props
  useEffect(() => {
    if (sources && sources.length > 0) {
      setInternalSources(sources);
      return;
    }
    let isMounted = true;
    apiGetPriceSources()
      .then((res) => {
        if (isMounted && res?.success && Array.isArray(res.sources)) {
          setInternalSources(res.sources);
        }
      })
      .catch((err) => console.error('Error loading sources:', err));
    return () => { isMounted = false; };
  }, [sources]);

  // 2. Fetch Bourse symbols once upfront for instant client-side search
  useEffect(() => {
    let isMounted = true;
    apiSearchBourseSymbols('', 2000)
      .then((res) => {
        if (isMounted && res?.success && Array.isArray(res.symbols)) {
          setBourseSymbols(res.symbols);
        }
      })
      .catch((err) => console.error('Error preloading bourse symbols:', err));
    return () => { isMounted = false; };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 3. Build the COMPLETE Unified Items List Upfront (Only 2 types, 100% clean)
  const allItems = useMemo(() => {
    const items = [];
    const seenKeys = new Set();

    // ── نوع اول: سورس‌های نرخ پایه ──────────────────────────────────────────
    // فقط نوع نرخ را بنویس، فقط در صورت فعال بودن و مرجع بودن
    internalSources.forEach((src) => {
      const isActive = src.isActive === 1 || src.isActive === true || src.is_active === 1 || src.is_active === true;
      if (!isActive) return;

      const isMulti = isSourceMultiOutput(src);
      if (isMulti) return;

      const isPrimary = src.isPrimary === 1 || src.isPrimary === true || src.is_primary === 1 || src.is_primary === true;
      if (!isPrimary) return; // سورس پایه فقط در صورت مرجع بودن

      const typeLabel = getPriceTypeLabel(src.priceType, priceTypeInfo) || src.name;
      const meta = getCategoryMetadata(src.priceType);

      items.push({
        id: src.id,
        sourceId: src.id,
        name: typeLabel, // فقط نوع نرخ
        symbol: '',
        subText: 'نرخ پایه بازار (سورس مرجع)',
        badge: meta.badge,
        badgeClass: meta.category,
        category: meta.category,
        tab: meta.tab,
        price: Number(src.lastPrice || 0),
        unit: src.unit || 'تومان',
        type: 'source',
        changePercent: src.diff !== undefined ? src.diff : src.changePercent,
        raw: src,
      });
      seenKeys.add(src.id);
    });

    // ── نوع دوم: هاب سورس‌های چند خروجی و فیدها ─────────────────────────────
    // بر اساس دسته‌بندی هر اقلامی که زیرش هست رو بیار، در صورت فعال بودن
    internalSources.forEach((src) => {
      const isActive = src.isActive === 1 || src.isActive === true || src.is_active === 1 || src.is_active === true;
      if (!isActive) return;

      const isMulti = isSourceMultiOutput(src);
      if (!isMulti) return;

      const isBourseFeed = src.priceType === 'bourse' || src.priceType === 'bourse_fund';
      const isForexFeed = src.priceType === 'forex';

      if (isBourseFeed) {
        // اقلام زیرمجموعه فید بورس
        const extracted = extractMultiItems(src);
        const listToUse = bourseSymbols.length > 0 ? bourseSymbols : extracted;

        listToUse.forEach((sym) => {
          const symCode = (sym.symbol || sym.s || '').trim();
          const symName = (sym.name || sym.n || symCode).trim();
          if (!symCode && !symName) return;

          const itemKey = `bourse_${symCode || symName}`;
          if (seenKeys.has(itemKey)) return;
          seenKeys.add(itemKey);

          const isFund = Boolean(sym.isFund || sym.f === 1 || src.priceType === 'bourse_fund' || sym.category?.includes('صندوق') || symName.includes('صندوق'));
          const priceToman = sym.priceToman !== undefined
            ? Number(sym.priceToman)
            : Math.round(Number(sym.priceRial || sym.p || sym.price || 0) / 10);
          const cp = Number(sym.changePercent !== undefined ? sym.changePercent : (sym.cp !== undefined ? sym.cp : (sym.plp || 0)));

          items.push({
            id: itemKey,
            sourceId: src.id,
            symbol: symCode,
            name: symCode && !symName.includes(symCode) ? `${symName} (${symCode})` : symName,
            subText: sym.category ? `${sym.category}${symCode ? ` • نماد: ${symCode}` : ''}` : (isFund ? `صندوق سرمایه‌گذاری${symCode ? ` • نماد: ${symCode}` : ''}` : `سهام بورس اوراق بهادار${symCode ? ` • نماد: ${symCode}` : ''}`),
            badge: isFund ? 'صندوق' : 'بورس',
            badgeClass: 'bourse',
            category: isFund ? 'bourse_fund' : 'bourse',
            tab: 'bourse',
            price: priceToman,
            unit: isFund ? 'واحد' : 'برگ سهم',
            type: 'bourse',
            changePercent: cp,
            raw: {
              symbol: symCode,
              name: symName,
              priceToman,
              priceRial: priceToman * 10,
              isFund,
              category: sym.category,
              sourceId: src.id,
            },
          });
        });
      } else if (isForexFeed) {
        // اقلام زیرمجموعه فید فارکس
        const subItems = extractMultiItems(src);
        subItems.forEach((sub) => {
          const symCode = (sub.symbol || sub.s || '').trim();
          const curKey = `${src.id}::${symCode || sub.name}`;
          if (seenKeys.has(curKey)) return;
          seenKeys.add(curKey);

          const curLabel = STANDARD_PRICE_TYPE_LABELS[symCode.toLowerCase()] || sub.name || symCode;

          items.push({
            id: curKey,
            sourceId: src.id,
            symbol: symCode,
            name: curLabel,
            subText: `ارز جهانی • نرخ برابری ${symCode}`,
            badge: 'ارز',
            badgeClass: 'currency',
            category: 'currency',
            tab: 'currency_crypto',
            price: Number(sub.price || 0),
            unit: 'تومان',
            type: 'source',
            changePercent: Number(sub.changePercent || 0),
            raw: {
              ...sub,
              sourceId: src.id,
              sourceName: src.name,
              unit: 'تومان',
            },
          });
        });
      } else {
        // سایر فیدهای چند خروجی (رمزارز، کالا و ...)
        const subItems = extractMultiItems(src);
        const meta = getCategoryMetadata(src.priceType);

        subItems.forEach((sub) => {
          const symCode = (sub.symbol || sub.s || '').trim();
          const itemKey = `${src.id}::${symCode || sub.name}`;
          if (seenKeys.has(itemKey)) return;
          seenKeys.add(itemKey);

          items.push({
            id: itemKey,
            sourceId: src.id,
            symbol: symCode,
            name: sub.name,
            subText: sub.category || sub.extra || '',
            badge: meta.badge || 'آیتم',
            badgeClass: meta.category,
            category: meta.category,
            tab: meta.tab,
            price: Number(sub.price || 0),
            unit: src.unit || 'تومان',
            type: 'source',
            changePercent: Number(sub.changePercent || 0),
            raw: {
              ...sub,
              sourceId: src.id,
              sourceName: src.name,
              unit: src.unit || 'تومان',
            },
          });
        });
      }
    });

    return items;
  }, [internalSources, bourseSymbols, priceTypeInfo]);

  // 4. Pure Client-Side Instant Search Filtering
  const filteredItems = useMemo(() => {
    const q = normalizeSearchText(query);

    return allItems.filter((item) => {
      // فیلتر تب دسته‌بندی
      if (activeCategory !== 'all') {
        if (activeCategory === 'gold_coins' && item.tab !== 'gold_coins') return false;
        if (activeCategory === 'currency_crypto' && item.tab !== 'currency_crypto') return false;
        if (activeCategory === 'bourse' && item.tab !== 'bourse') return false;
      }

      // فیلتر عبارت جستجو
      if (!q) return true;

      const nameNorm = normalizeSearchText(item.name);
      const symNorm = normalizeSearchText(item.symbol);
      const subNorm = normalizeSearchText(item.subText);
      const badgeNorm = normalizeSearchText(item.badge);

      return nameNorm.includes(q) || symNorm.includes(q) || subNorm.includes(q) || badgeNorm.includes(q);
    });
  }, [allItems, query, activeCategory]);

  const isItemActive = (item) => {
    const targetId = selectedAssetId || (selectedAsset?.id ? selectedAsset.id : null);
    if (!targetId) return false;
    if (item.id === targetId) return true;
    if (item.symbol && targetId === `bourse_${item.symbol}`) return true;
    if (item.sourceId && item.sourceId === targetId) return true;
    return false;
  };

  const handleSelectItem = (item) => {
    onSelect(item);
    if (mode === 'picker') {
      setIsDropdownOpen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`universal-search-container mode-${mode}`}
      style={{ position: 'relative', width: '100%' }}
    >
      {/* Header & Category Filter Strip */}
      {showCategories && (
        <div className="universal-search-header-area">
          {title && (
            <div className="universal-header-titles">
              <h4 className="universal-search-title">{title}</h4>
              {subtitle && <p className="universal-search-subtitle">{subtitle}</p>}
            </div>
          )}

          <div className="universal-categories-strip">
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`universal-cat-pill ${activeCategory === tab.id ? 'active' : ''}`}
                onClick={() => setActiveCategory(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Active Asset Banner in Explorer Mode */}
          {mode === 'explorer' && selectedAsset && (
            <div className="universal-active-asset-banner">
              <div className="universal-active-badge">دارایی فعال</div>
              <div className="universal-active-details">
                <div className="universal-active-icon">
                  {getCategoryIcon(selectedAsset?.category || selectedAsset?.priceType || 'all')}
                </div>
                <strong className="universal-active-name">
                  {getPriceTypeLabel(selectedAsset?.priceType, priceTypeInfo) || selectedAsset?.name || 'انتخاب نشده'}
                </strong>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search Input Bar */}
      <div className="universal-search-bar">
        <Search size={16} className="universal-search-icon" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (mode === 'picker') setIsDropdownOpen(true);
          }}
          onFocus={() => {
            if (mode === 'picker') setIsDropdownOpen(true);
          }}
          placeholder={placeholder}
          className="universal-search-input"
          autoFocus={autoFocus}
        />
        {query && (
          <button
            type="button"
            className="universal-search-clear"
            onClick={() => setQuery('')}
            title="پاک کردن"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Results Rendering: Mode Dependent */}
      {mode === 'picker' ? (
        /* Picker Mode: Dropdown Popover */
        isDropdownOpen && (
          <div className="universal-results-picker-dropdown">
            {filteredItems.length === 0 ? (
              <div className="universal-empty-results">
                هیچ دارایی یا سورسی مطابق با عبارت جستجو یافت نشد.
              </div>
            ) : (
              filteredItems.slice(0, 40).map((item) => {
                const active = isItemActive(item);
                return (
                  <div
                    key={item.id}
                    className={`universal-result-card ${active ? 'active-selected' : ''}`}
                    onClick={() => handleSelectItem(item)}
                  >
                    <div className="universal-result-info">
                      <div className={`universal-result-icon ${item.badgeClass || item.category}`}>
                        {getCategoryIcon(item.category)}
                      </div>
                      <div className="universal-result-text">
                        <span className="universal-result-name">{item.name}</span>
                        <div className="universal-result-sub">
                          <span className={`universal-result-badge ${item.badgeClass || item.category}`}>
                            {item.badge}
                          </span>
                          {item.subText && <span>{item.subText}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="universal-result-pricing">
                      {item.price > 0 ? (
                        <>
                          <span className="universal-result-price">
                            {item.price % 1 !== 0
                              ? Number(item.price).toLocaleString('fa-IR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
                              : Math.round(item.price).toLocaleString('fa-IR')}
                          </span>
                          <span className="universal-result-unit">{item.unit || 'تومان'}</span>
                        </>
                      ) : (
                        <span className="universal-result-badge" style={{ color: '#60a5fa' }}>
                          {active ? <Check size={12} /> : 'انتخاب'}
                        </span>
                      )}
                      {item.changePercent !== undefined && Number(item.changePercent) !== 0 && (
                        <span className={`universal-result-change ${Number(item.changePercent) > 0 ? 'positive' : 'negative'}`}>
                          {Number(item.changePercent) > 0 ? '+' : ''}{Number(item.changePercent).toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )
      ) : (
        /* Explorer Mode: Grid View */
        query.trim().length > 0 && (
          <div className="universal-results-explorer">
            {filteredItems.length === 0 ? (
              <div className="universal-empty-results" style={{ gridColumn: '1 / -1' }}>
                موردی با این مشخصات یافت نشد.
              </div>
            ) : (
              filteredItems.slice(0, 40).map((item) => {
                const active = isItemActive(item);
                return (
                  <div
                    key={item.id}
                    className={`universal-result-card ${active ? 'active-selected' : ''}`}
                    onClick={() => handleSelectItem(item)}
                  >
                    <div className="universal-result-info">
                      <div className={`universal-result-icon ${item.badgeClass || item.category}`}>
                        {getCategoryIcon(item.category)}
                      </div>
                      <div className="universal-result-text">
                        <span className="universal-result-name">{item.name}</span>
                        <div className="universal-result-sub">
                          <span className={`universal-result-badge ${item.badgeClass || item.category}`}>
                            {item.badge}
                          </span>
                          {item.subText && <span>{item.subText}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="universal-result-pricing">
                      {item.price > 0 ? (
                        <>
                          <span className="universal-result-price">
                            {item.price % 1 !== 0
                              ? Number(item.price).toLocaleString('fa-IR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
                              : Math.round(item.price).toLocaleString('fa-IR')}
                          </span>
                          <span className="universal-result-unit">{item.unit || 'تومان'}</span>
                        </>
                      ) : (
                        <span className="universal-result-badge" style={{ color: '#60a5fa' }}>
                          {active ? <Check size={12} /> : 'انتخاب'}
                        </span>
                      )}
                      {item.changePercent !== undefined && Number(item.changePercent) !== 0 && (
                        <span className={`universal-result-change ${Number(item.changePercent) > 0 ? 'positive' : 'negative'}`}>
                          {Number(item.changePercent) > 0 ? '+' : ''}{Number(item.changePercent).toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )
      )}
    </div>
  );
}

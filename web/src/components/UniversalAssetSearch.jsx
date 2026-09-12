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
  Radio,
  Globe,
  Check,
  Building2,
  SlidersHorizontal,
} from 'lucide-react';
import { apiGetPriceSources, apiSearchBourseSymbols } from '../api/client.js';

const CORE_ASSETS = [
  { id: 'gold_18k', name: 'طلای ۱۸ عیار', category: 'gold', unit: 'گرم', type: 'standard' },
  { id: 'gold_melted', name: 'طلای آبشده (گرم ۱۸)', category: 'gold', unit: 'گرم', type: 'standard' },
  { id: 'full_new', name: 'سکه امامی', category: 'coin', unit: 'عدد', type: 'standard' },
  { id: 'full_old', name: 'سکه بهار آزادی', category: 'coin', unit: 'عدد', type: 'standard' },
  { id: 'half', name: 'نیم سکه بهار آزادی', category: 'coin', unit: 'عدد', type: 'standard' },
  { id: 'quarter', name: 'ربع سکه بهار آزادی', category: 'coin', unit: 'عدد', type: 'standard' },
  { id: 'silver_999', name: 'نقره خام ۹۹۹', category: 'silver', unit: 'گرم', type: 'standard' },
  { id: 'USD', name: 'دلار آمریکا', category: 'currency', unit: 'دلار', type: 'standard' },
  { id: 'USDT', name: 'تتر (USDT)', category: 'crypto', unit: 'تتر', type: 'standard' },
  { id: 'EUR', name: 'یورو اروپا', category: 'currency', unit: 'یورو', type: 'standard' },
  { id: 'AED', name: 'درهم امارات', category: 'currency', unit: 'درهم', type: 'standard' },
  { id: 'TRY', name: 'لیر ترکیه', category: 'currency', unit: 'لیر', type: 'standard' },
  { id: 'BTC', name: 'بیت‌کوین (BTC)', category: 'crypto', unit: 'عدد', type: 'standard' },
  { id: 'ETH', name: 'اتریوم (ETH)', category: 'crypto', unit: 'عدد', type: 'standard' },
];

const CATEGORY_TABS = [
  { id: 'all', label: 'همه اقلام' },
  { id: 'sources', label: 'سورس‌های تعریف‌شده' },
  { id: 'bourse', label: 'بورس و صندوق‌ها' },
  { id: 'gold_coins', label: 'طلا و مسکوکات' },
  { id: 'currency_crypto', label: 'ارز و رمزارز' },
];

const FREQUENT_QUICK_ITEMS = [
  { id: 'gold_18k', name: 'طلای ۱۸ عیار', category: 'gold' },
  { id: 'full_new', name: 'سکه امامی', category: 'coin' },
  { id: 'USD', name: 'دلار آمریکا', category: 'currency' },
  { id: 'USDT', name: 'تتر', category: 'crypto' },
  { id: 'bourse_فملی', symbol: 'فملی', name: 'فملی (ملی مس)', category: 'bourse', isBourse: true },
  { id: 'bourse_خودرو', symbol: 'خودرو', name: 'خودرو (ایران خودرو)', category: 'bourse', isBourse: true },
  { id: 'bourse_عیار', symbol: 'عیار', name: 'صندوق طلای عیار', category: 'bourse_fund', isBourse: true, isFund: true },
];

function getCategoryIcon(cat) {
  switch (cat) {
    case 'gold':
    case 'gold_18k':
      return <Award size={15} />;
    case 'coin':
    case 'full_coin':
    case 'half_coin':
    case 'quarter_coin':
      return <Coins size={15} />;
    case 'silver':
      return <Disc size={15} />;
    case 'currency':
    case 'usd':
    case 'eur':
    case 'aed':
    case 'try':
      return <Banknote size={15} />;
    case 'crypto':
      return <Zap size={15} />;
    case 'bourse':
    case 'bourse_fund':
      return <Building2 size={15} />;
    case 'multi_output':
      return <Layers size={15} />;
    default:
      return <Sparkles size={15} />;
  }
}

export default function UniversalAssetSearch({
  mode = 'explorer', // 'explorer' | 'picker'
  onSelect = () => {},
  selectedAsset = null,
  selectedAssetId = null,
  sources: propSources = null,
  title = '',
  subtitle = '',
  placeholder = 'جستجو در تمامی سورس‌ها، طلا، سکه، ارز، بورس، خودرو و فیدها...',
  showFrequentChips = true,
  showCategories = true,
  autoFocus = false,
  className = '',
}) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [internalSources, setInternalSources] = useState([]);
  const [bourseResults, setBourseResults] = useState([]);
  const [isSearchingBourse, setIsSearchingBourse] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const searchContainerRef = useRef(null);

  // Load sources if not provided via props
  useEffect(() => {
    if (propSources && Array.isArray(propSources)) {
      setInternalSources(propSources);
    } else {
      let isMounted = true;
      apiGetPriceSources()
        .then((res) => {
          if (isMounted && res?.success && Array.isArray(res.sources)) {
            setInternalSources(res.sources);
          }
        })
        .catch((err) => console.error('Error fetching sources for search:', err));
      return () => {
        isMounted = false;
      };
    }
  }, [propSources]);

  // Handle click outside to close picker dropdown
  useEffect(() => {
    if (mode !== 'picker') return;
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [mode]);

  // Debounced Bourse Symbol Search
  useEffect(() => {
    const q = query.trim();
    if (!q || q.length < 2) {
      setBourseResults([]);
      setIsSearchingBourse(false);
      return;
    }

    if (activeCategory !== 'all' && activeCategory !== 'bourse') {
      setBourseResults([]);
      return;
    }

    setIsSearchingBourse(true);
    const timer = setTimeout(async () => {
      try {
        const res = await apiSearchBourseSymbols(q, 10);
        if (res?.success && Array.isArray(res.symbols)) {
          setBourseResults(res.symbols);
        } else {
          setBourseResults([]);
        }
      } catch (e) {
        console.error('Error searching bourse:', e);
        setBourseResults([]);
      } finally {
        setIsSearchingBourse(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [query, activeCategory]);

  // Build Unified Searchable Items
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const results = [];

    // 1. Configured Price Sources
    if (activeCategory === 'all' || activeCategory === 'sources') {
      internalSources.forEach((src) => {
        const nameMatch = !q || (src.name && src.name.toLowerCase().includes(q));
        const typeMatch = !q || (src.priceType && src.priceType.toLowerCase().includes(q));
        const channelMatch = !q || (src.channelUsername && src.channelUsername.toLowerCase().includes(q));
        const endpointMatch = !q || (src.endpoint && src.endpoint.toLowerCase().includes(q));

        if (nameMatch || typeMatch || channelMatch || endpointMatch) {
          results.push({
            id: src.id,
            sourceId: src.id,
            name: src.name || 'سورس بدون نام',
            subText: src.sourceType === 'telegram'
              ? `@${src.channelUsername || src.endpoint || ''}`
              : (src.endpoint ? 'وب‌سرویس API' : 'سورس اختصاصی'),
            badge: src.sourceType === 'telegram' ? 'تلگرام' : 'API',
            badgeClass: src.sourceType === 'telegram' ? 'telegram' : 'api',
            price: src.lastPrice || 0,
            unit: src.unit || 'تومان',
            category: 'source',
            type: 'source',
            priceType: src.priceType,
            raw: src,
          });
        }
      });
    }

    // 2. Bourse Symbols
    if (activeCategory === 'all' || activeCategory === 'bourse') {
      bourseResults.forEach((sym) => {
        results.push({
          id: `bourse_${sym.symbol}`,
          symbol: sym.symbol,
          name: sym.isFund ? (sym.name || sym.symbol) : `سهام ${sym.symbol} (${sym.name})`,
          subText: sym.isFund ? 'صندوق سرمایه‌گذاری' : 'بورس اوراق بهادار تهران',
          badge: sym.isFund ? 'صندوق' : 'بورس',
          badgeClass: 'bourse',
          price: sym.priceToman || Math.round((sym.priceRial || 0) / 10),
          unit: sym.isFund ? 'واحد' : 'برگ سهم',
          category: sym.isFund ? 'bourse_fund' : 'bourse',
          type: 'bourse',
          changePercent: sym.changePercent,
          raw: sym,
        });
      });
    }

    // 3. Core & Standard Assets (Gold, Coins, Currencies, Crypto)
    const allowGoldCoins = activeCategory === 'all' || activeCategory === 'gold_coins';
    const allowCurrencies = activeCategory === 'all' || activeCategory === 'currency_crypto';

    CORE_ASSETS.forEach((core) => {
      const isGoldCoin = core.category === 'gold' || core.category === 'coin' || core.category === 'silver';
      const isCurrCrypto = core.category === 'currency' || core.category === 'crypto';

      if ((allowGoldCoins && isGoldCoin) || (allowCurrencies && isCurrCrypto)) {
        const nameMatch = !q || core.name.toLowerCase().includes(q) || core.id.toLowerCase().includes(q);
        if (nameMatch) {
          results.push({
            id: core.id,
            name: core.name,
            subText: core.category === 'gold' ? 'طلای خام و آب‌شده'
              : core.category === 'coin' ? 'مسکوکات رسمی بانکی'
              : core.category === 'currency' ? 'ارز بازار آزاد'
              : core.category === 'crypto' ? 'رمزارز پایه' : 'دارایی پایه',
            badge: core.unit,
            badgeClass: core.category,
            price: 0,
            unit: core.unit,
            category: core.category,
            type: 'standard',
            raw: core,
          });
        }
      }
    });

    return results;
  }, [query, activeCategory, internalSources, bourseResults]);

  // Check if item matches current selection
  const isItemActive = (item) => {
    const targetId = selectedAssetId || (selectedAsset?.id ? selectedAsset.id : null);
    if (!targetId) return false;
    if (item.id === targetId) return true;
    if (item.sourceId && item.sourceId === targetId) return true;
    if (item.symbol && targetId === `bourse_${item.symbol}`) return true;
    return false;
  };

  const handleSelectItem = (item) => {
    onSelect(item);
    if (mode === 'picker') {
      setIsDropdownOpen(false);
    }
  };

  const handleSelectFrequent = (freq) => {
    if (freq.isBourse) {
      handleSelectItem({
        id: freq.id,
        symbol: freq.symbol,
        name: freq.name,
        category: freq.category,
        unit: freq.isFund ? 'واحد' : 'برگ سهم',
        type: 'bourse',
        raw: { symbol: freq.symbol, name: freq.name, isFund: freq.isFund },
      });
    } else {
      const matched = CORE_ASSETS.find((c) => c.id === freq.id);
      if (matched) {
        handleSelectItem(matched);
      } else {
        handleSelectItem(freq);
      }
    }
  };

  const activeAssetName = useMemo(() => {
    if (selectedAsset?.name) return selectedAsset.name;
    if (selectedAssetId) {
      const foundSource = internalSources.find((s) => s.id === selectedAssetId);
      if (foundSource) return foundSource.name;
      const foundCore = CORE_ASSETS.find((c) => c.id === selectedAssetId);
      if (foundCore) return foundCore.name;
      if (selectedAssetId.startsWith('bourse_')) return selectedAssetId.replace('bourse_', 'نماد ');
    }
    return '';
  }, [selectedAsset, selectedAssetId, internalSources]);

  return (
    <div
      ref={searchContainerRef}
      className={`universal-asset-search-wrap ${mode === 'picker' ? 'picker-mode' : 'explorer-mode'} ${className}`}
    >
      {/* Explorer Top Toolbar (Header + Title) */}
      {mode === 'explorer' && (
        <div className="universal-search-topbar">
          <div className="universal-search-title-box">
            <SlidersHorizontal size={18} style={{ color: 'var(--accent-blue, #3b82f6)' }} />
            <div>
              <h4>{title || 'مرکز جستجو و کاوشگر داده‌ها و سورس‌ها'}</h4>
              <span>{subtitle || 'جستجوی آنی در تمامی سورس‌ها، وب‌سرویس‌ها، بورس تهران، طلا، سکه و ارز'}</span>
            </div>
          </div>

          {activeAssetName && (
            <div className="universal-active-asset-banner">
              <div className="universal-active-asset-info">
                <span className="universal-active-label">آیتم فعال:</span>
                <strong className="universal-active-name">{activeAssetName}</strong>
                {selectedAsset?.lastPrice > 0 && (
                  <span className="universal-active-price">
                    {Math.round(selectedAsset.lastPrice).toLocaleString('fa-IR')} {selectedAsset.unit || 'تومان'}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Category Filter Pills (Explorer or Picker when enabled) */}
      {showCategories && (
        <div className="universal-categories-strip">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`universal-category-pill ${activeCategory === tab.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Search Bar Input */}
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
        <div className="universal-search-trailing">
          {isSearchingBourse && <span className="universal-search-spinner" title="در حال جستجوی بورس..." />}
          {query && (
            <button
              type="button"
              className="universal-search-clear"
              onClick={() => {
                setQuery('');
                setBourseResults([]);
              }}
              title="پاک کردن"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Frequent Quick Select Chips */}
      {showFrequentChips && (
        <div className="universal-frequent-strip">
          <span className="universal-frequent-lead">دسترسی سریع:</span>
          {FREQUENT_QUICK_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`universal-frequent-chip ${selectedAssetId === item.id ? 'selected' : ''}`}
              onClick={() => handleSelectFrequent(item)}
            >
              {getCategoryIcon(item.category)}
              <span>{item.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Results Rendering: Mode Dependent */}
      {mode === 'picker' ? (
        /* Picker Dropdown Popover */
        isDropdownOpen && (
          <div className="universal-results-picker-dropdown">
            {filteredItems.length === 0 ? (
              <div className="universal-empty-results">
                {isSearchingBourse ? 'در حال جستجو در پایگاه داده...' : 'هیچ دارایی یا سورسی مطابق با عبارت جستجو یافت نشد.'}
              </div>
            ) : (
              filteredItems.slice(0, 15).map((item) => {
                const active = isItemActive(item);
                return (
                  <div
                    key={item.id}
                    className={`universal-result-card ${active ? 'active-selected' : ''}`}
                    onClick={() => handleSelectItem(item)}
                  >
                    <div className="universal-result-info">
                      <div className={`universal-result-icon ${item.category}`}>
                        {getCategoryIcon(item.category)}
                      </div>
                      <div className="universal-result-text">
                        <span className="universal-result-name">{item.name}</span>
                        <div className="universal-result-sub">
                          <span className="universal-result-badge">{item.badge}</span>
                          <span>{item.subText}</span>
                        </div>
                      </div>
                    </div>

                    <div className="universal-result-pricing">
                      {item.price > 0 && (
                        <span className="universal-result-price">
                          {Math.round(item.price).toLocaleString('fa-IR')}
                        </span>
                      )}
                      <span className="universal-result-unit">{item.unit}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )
      ) : (
        /* Explorer Mode Grid (when searching or active) */
        query.trim().length > 0 && (
          <div className="universal-results-explorer">
            {filteredItems.length === 0 ? (
              <div className="universal-empty-results" style={{ gridColumn: '1 / -1' }}>
                {isSearchingBourse ? 'در حال جستجو...' : 'موردی با این مشخصات یافت نشد.'}
              </div>
            ) : (
              filteredItems.slice(0, 12).map((item) => {
                const active = isItemActive(item);
                return (
                  <div
                    key={item.id}
                    className={`universal-result-card ${active ? 'active-selected' : ''}`}
                    onClick={() => handleSelectItem(item)}
                  >
                    <div className="universal-result-info">
                      <div className={`universal-result-icon ${item.category}`}>
                        {getCategoryIcon(item.category)}
                      </div>
                      <div className="universal-result-text">
                        <span className="universal-result-name">{item.name}</span>
                        <div className="universal-result-sub">
                          <span className="universal-result-badge">{item.badge}</span>
                          <span>{item.subText}</span>
                        </div>
                      </div>
                    </div>

                    <div className="universal-result-pricing">
                      {item.price > 0 ? (
                        <span className="universal-result-price">
                          {Math.round(item.price).toLocaleString('fa-IR')}
                        </span>
                      ) : (
                        <span className="universal-result-badge" style={{ color: '#60a5fa' }}>
                          {active ? <Check size={12} /> : 'انتخاب'}
                        </span>
                      )}
                      <span className="universal-result-unit">{item.unit}</span>
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

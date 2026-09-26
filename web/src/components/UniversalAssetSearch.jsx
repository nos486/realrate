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
  Wallet,
} from 'lucide-react';
import { usePricing } from '../features/market/index.js';
import { toPriceId } from '../utils/priceIds.js';
import { getSourceDisplayName, getSourceCategoryConfig } from '../config/displayEngine.js';
import {
  getItemCategory,
  getItemBadge,
  getItemUnit,
  getSourceBrand,
} from '../config/displayEngine.js';
import { getCategoryIconName } from '../config/categories.config.js';
import {
  FOREX_SPECS,
  PORTFOLIO_CATEGORIES,
  getCanonicalAssetSpec,
  getCanonicalAssetName,
} from '../utils/financialSpecs.js';

export const PROMINENT_FOREX_CURRENCIES = FOREX_SPECS;

export const WORLD_CURRENCY_NAMES = new Proxy({}, {
  get(target, prop) {
    if (typeof prop !== 'string') return target[prop];
    return getCanonicalAssetName(prop, prop);
  },
  has(target, prop) {
    if (typeof prop !== 'string') return false;
    const spec = getCanonicalAssetSpec(prop);
    return Boolean(spec && spec.name);
  },
});

export function getPriceTypeLabel(priceType, priceTypeInfo = null) {
  if (!priceType) return '';
  const rawStr = String(priceType).trim();
  const clean = rawStr.toLowerCase();
  const upper = rawStr.toUpperCase();
  if (priceTypeInfo && priceTypeInfo[priceType]?.label) return priceTypeInfo[priceType].label;
  if (priceTypeInfo && priceTypeInfo[clean]?.label) return priceTypeInfo[clean].label;

  const canonicalName = getCanonicalAssetName(rawStr);
  if (canonicalName && canonicalName !== rawStr && canonicalName !== clean && canonicalName !== upper) {
    return canonicalName;
  }

  const stripped = upper.replace(/^(FOREX_|CUR_|FX_|SRC_DEF_)/, '');
  const strippedName = getCanonicalAssetName(stripped);
  if (strippedName && strippedName !== stripped) return strippedName;

  const srcConfig = getSourceCategoryConfig(clean);
  if (srcConfig?.name) return srcConfig.name;

  if (clean === 'bourse') return 'بورس اوراق بهادار';
  if (clean === 'bourse_fund') return 'صندوق سرمایه‌گذاری بورس';
  if (clean === 'forex') return 'ارزهای جهانی (فارکس)';
  if (clean === 'crypto') return 'رمزارز';

  return priceType;
}

export const STANDARD_PRICE_TYPE_LABELS = new Proxy({}, {
  get(target, prop) {
    if (typeof prop !== 'string') return target[prop];
    return getPriceTypeLabel(prop);
  },
  has(target, prop) {
    if (typeof prop !== 'string') return prop in target;
    return Boolean(getPriceTypeLabel(prop));
  },
});

export function getCategoryMetadata(priceType) {
  return {
    category: getItemCategory(priceType),
    badge: getItemBadge(priceType),
    unit: getItemUnit(priceType),
  };
}

export function calculateUsdCrossRate(code, rawVal) {
  const num = Number(rawVal);
  if (!num || num <= 0) return 0;
  const c = String(code || '').toUpperCase();
  if (c === 'USD') return 1.0;

  // Currencies typically stronger than 1 USD
  if (['EUR', 'GBP', 'CHF', 'KWD', 'BHD', 'OMR', 'JOD', 'KYD', 'GIP'].includes(c)) {
    return num < 1 ? parseFloat((1 / num).toFixed(5)) : parseFloat(num.toFixed(5));
  }

  // All other world currencies (1 unit is typically < 1 USD)
  // If num > 1 (e.g. 3.67 for AED, 33.2 for TRY, 1.38 for CAD), it is raw rate quoted as 1 USD = num Currency
  if (num > 1) {
    return parseFloat((1 / num).toFixed(5));
  }
  return parseFloat(num.toFixed(5));
}

export function normalizeSearchText(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/\u200C/g, ' ')
    .replace(/\u200B|\u200D|\uFEFF/g, '')
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

export function isSourceMultiOutput(s, priceTypeInfo = {}) {
  if (!s) return false;
  if (s.isCatalog || s.category === 'catalog' || s.category === 'multi_output' || s.isMultiOutput) return true;
  const t = (s.priceType || '').toLowerCase();
  if (priceTypeInfo && priceTypeInfo[t]?.category === 'multi_output') return true;
  if (priceTypeInfo && priceTypeInfo[s.priceType]?.category === 'multi_output') return true;
  if (s.lastMultiData) return true;
  if (Array.isArray(s.sampleItems) && s.sampleItems.length > 0) return true;
  if (Array.isArray(s.compactList) && s.compactList.length > 0) return true;
  if (Array.isArray(s.items) && s.items.length > 0) return true;

  let fm = s.fieldMapping || s.field_mapping;
  if (typeof fm === 'string') {
    try { fm = JSON.parse(fm); } catch {}
  }
  if (fm && typeof fm === 'object') {
    if (fm.isMultiOutput || fm.idField || fm.symbolField || fm.nameField || fm.priceField || fm.currencies || fm.arrayPath) {
      return true;
    }
  }
  return false;
}

export function extractMultiItems(src) {
  if (!src) return [];
  let multi = null;
  const targetMulti = src.lastMultiData !== undefined && src.lastMultiData !== null
    ? src.lastMultiData
    : (src.last_multi_data !== undefined && src.last_multi_data !== null ? src.last_multi_data : null);

  if (targetMulti) {
    if (typeof targetMulti === 'string') {
      try {
        multi = JSON.parse(targetMulti);
      } catch (e) {
        console.warn('Failed to parse lastMultiData for', src.name, e);
      }
    } else if (typeof targetMulti === 'object') {
      multi = targetMulti;
    }
  }

  let fm = src.fieldMapping || src.field_mapping;
  if (typeof fm === 'string') {
    try { fm = JSON.parse(fm); } catch {}
  }

  // 0. If customParser is present, execute it to parse raw data into items
  if (typeof src.customParser === 'function' && multi) {
    try {
      const parsed = src.customParser(multi, src);
      if (parsed && typeof parsed === 'object') {
        const customItems = Array.isArray(parsed.items)
          ? parsed.items
          : (Array.isArray(parsed.compactList) ? parsed.compactList : (Array.isArray(parsed.sampleItems) ? parsed.sampleItems : (Array.isArray(parsed.funds) ? parsed.funds : null)));
        if (customItems && customItems.length > 0) {
          return customItems;
        }
      }
    } catch {}
  }

  let rawList = [];
  if (multi) {
    // 1. Direct Open ER-API / Exchange Rates Object (e.g. multi.rates = { USD: 1, EUR: 0.93, AED: 3.67, ... })
    if (multi.rates && typeof multi.rates === 'object') {
      rawList = Object.entries(multi.rates).map(([k, v]) => {
        const sym = k.toUpperCase();
        return {
          s: sym,
          n: WORLD_CURRENCY_NAMES[sym] || sym,
          p: Number(v) || 0,
          rawRate: Number(v) || 0,
        };
      });
    } else if (multi.data && multi.data.rates && typeof multi.data.rates === 'object') {
      rawList = Object.entries(multi.data.rates).map(([k, v]) => {
        const sym = k.toUpperCase();
        return {
          s: sym,
          n: WORLD_CURRENCY_NAMES[sym] || sym,
          p: Number(v) || 0,
          rawRate: Number(v) || 0,
        };
      });
    } else if (Array.isArray(multi.sampleItems)) rawList = multi.sampleItems;
    else if (Array.isArray(multi.compactList)) rawList = multi.compactList;
    else if (Array.isArray(multi.items)) rawList = multi.items;
    else if (Array.isArray(multi.funds)) rawList = multi.funds;
    else if (Array.isArray(multi.symbols)) rawList = multi.symbols;
    else if (Array.isArray(multi.data)) rawList = multi.data;
    else if (Array.isArray(multi.results)) rawList = multi.results;
    else if (Array.isArray(multi.result)) rawList = multi.result;
    else if (Array.isArray(multi.list)) rawList = multi.list;
    else if (Array.isArray(multi.currencies)) rawList = multi.currencies;
    else if (Array.isArray(multi)) rawList = multi;
    else if (typeof multi === 'object') {
      const isCatalog = Boolean(src.isCatalog || multi.isCatalog);
      if (!isCatalog || Array.isArray(multi.symbols) || Array.isArray(multi.compactList) || Array.isArray(multi.sampleItems) || Array.isArray(multi.items) || Array.isArray(multi.funds)) {
        rawList = Object.entries(multi)
          .filter(([k]) => !['updatedAt', 'totalCount', 'totalSymbols', 'labels', 'topSymbols', 'error', 'datetime', 'totalFunds', 'fundsCount', 'result', 'base_code', 'time_last_update_utc', 'time_next_update_utc', 'time_last_update_unix', 'time_next_update_unix', 'provider', 'documentation', 'terms_of_use', 'time_eol_unix', 'stats', 'isCatalog'].includes(k))
          .map(([k, v]) => {
            if (v && typeof v === 'object') {
              const sym = (v.symbol || v.s || v.code || v.id || k).toUpperCase();
              const fa = WORLD_CURRENCY_NAMES[sym] || v.name || v.n || v.title || v.car_name || v.label || sym;
              return {
                s: sym,
                n: fa,
                p: v.price || v.p || v.priceTomans || v.lastPrice || v.val || v.usdCrossRate || v.rawRate || 0,
                rawRate: Number(v.rawRate || v.price || v.p || v.val || 0),
                usdCrossRate: Number(v.usdCrossRate || 0),
                cat: v.category || v.cat || v.brand || v.group || '',
                extra: v.extra || v.model || '',
                cp: v.changePercent || v.cp || v.plp || 0,
                isFund: Boolean(v.isFund || v.f === 1),
              };
            }
            const sym = String(k).toUpperCase();
            return {
              s: sym,
              n: WORLD_CURRENCY_NAMES[sym] || sym,
              p: Number(v) || 0,
              rawRate: Number(v) || 0,
            };
          });
      }
    }
  }

  if (rawList.length === 0) {
    if (Array.isArray(src.sampleItems)) rawList = src.sampleItems;
    else if (Array.isArray(src.compactList)) rawList = src.compactList;
    else if (Array.isArray(src.items)) rawList = src.items;
    else if (Array.isArray(src.funds)) rawList = src.funds;
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

  const isForex = src.priceType === 'forex' || src.sourceType === 'forex_api';

  const selectionMode = isForex ? 'all' : (fm?.selectionMode || (Array.isArray(fm?.includedKeys) && fm.includedKeys.length > 0 ? 'whitelist' : 'all'));
  let includedSet = null;
  if (!isForex && selectionMode === 'whitelist' && Array.isArray(fm?.includedKeys) && fm.includedKeys.length > 0) {
    includedSet = new Set(fm.includedKeys.map((x) => String(x).trim().toLowerCase()));
  } else if (!isForex && selectionMode === 'whitelist' && Array.isArray(fm?.currencies) && fm.currencies.length > 0) {
    includedSet = new Set(fm.currencies.map((c) => String(c.key || c.code || c.path).trim().toLowerCase()));
  }

  const symField = fm?.symbolField || fm?.idField;
  const nameField = fm?.nameField || fm?.titleField;
  const priceField = fm?.priceField;
  const altPriceField = fm?.altPriceField;
  const changeField = fm?.changePercentField || fm?.changeField;

  return rawList
    .filter((item) => {
      if (!item || typeof item !== 'object') return false;
      const sym = String((symField && item[symField]) || item.id || item.symbol || item.s || item.code || item.slug || item.ticker || '').trim().toLowerCase();
      const name = String((nameField && item[nameField]) || item.name || item.n || item.title || item.car_name || item.model || '').trim().toLowerCase();

      if (includedSet && includedSet.size > 0) {
        const isIncluded = (sym && includedSet.has(sym)) || (name && includedSet.has(name));
        if (!isIncluded) return false;
      } else {
        if (sym && excludedSet.has(sym)) return false;
        if (name && excludedSet.has(name)) return false;
      }
      return true;
    })
    .map((item) => {
      const sym = String((symField && item[symField]) || item.id || item.symbol || item.s || item.code || item.slug || item.ticker || '').trim();
      const symUpper = sym.toUpperCase();
      const resolvedFaName = isForex ? (WORLD_CURRENCY_NAMES[symUpper] || item.name || item.n || symUpper) : null;
      let name = String((nameField && item[nameField]) || item.name || item.n || item.title || item.car_name || item.model || sym).trim();
      if (isForex && resolvedFaName) {
        name = resolvedFaName.includes(symUpper) ? resolvedFaName : `${resolvedFaName} (${symUpper})`;
      }

      const rawVal = Number((priceField && item[priceField]) || item.price || item.rawRate || item.priceTomans || item.priceFinal || item.lastPrice || item.p || (altPriceField && item[altPriceField]) || 0);
      const usdCross = isForex ? (item.usdCrossRate || calculateUsdCrossRate(symUpper, rawVal)) : 0;

      let finalPrice;
      if (isForex) {
        finalPrice = usdCross;
      } else if (item.price !== undefined && item.price !== null) {
        finalPrice = Number(item.price);
      } else if (item.priceToman !== undefined && item.priceToman !== null) {
        finalPrice = Number(item.priceToman);
      } else {
        const isRial = src.unit === 'rial' || item.unit === 'rial' || item.priceRial !== undefined || (typeof fm === 'object' && fm?.priceUnit === 'rial');
        const rialVal = item.priceRial !== undefined ? Number(item.priceRial) : rawVal;
        finalPrice = isRial && rialVal > 0 ? Math.round(rialVal / 10) : (rawVal >= 100 ? Math.round(rawVal) : rawVal);
      }

      const cp = Number((changeField && item[changeField]) || (item.cp !== undefined ? item.cp : (item.changePercent !== undefined ? item.changePercent : 0)));
      const rawCategory = isForex ? 'currency' : getItemCategory(item, src);
      const isFund = rawCategory === 'bourse_fund' || Boolean(item.f === 1 || item.isFund);

      const itemSourceName = item.sourceName || getSourceBrand(src) || src.name || getSourceDisplayName(src.id || src.priceType);
      const itemSourceId = item.sourceId || src.id;

      return {
        ...item,
        symbol: isForex ? symUpper : sym,
        name,
        sourceName: itemSourceName,
        sourceId: itemSourceId,
        faName: isForex ? resolvedFaName : undefined,
        rawRate: rawVal,
        usdCrossRate: isForex ? usdCross : undefined,
        price: isForex ? usdCross : finalPrice,
        priceToman: finalPrice,
        changePercent: cp,
        category: rawCategory,
        extra: String(item.extra || item.model || item.volume || '').trim(),
        isFund,
      };
    });
}

const ICON_COMPONENT_MAP = {
  Award,
  Coins,
  Disc,
  Banknote,
  Zap,
  TrendingUp,
  Layers,
  Sparkles,
  Wallet,
};

function getAssetIcon(item) {
  if (!item) return <Sparkles size={15} />;
  const cat = getItemCategory(item);
  const iconName = getCategoryIconName(cat);
  const IconComponent = ICON_COMPONENT_MAP[iconName] || Sparkles;
  return <IconComponent size={15} />;
}

export default function UniversalAssetSearch({
  mode = 'picker',
  selectedAsset = null,
  selectedAssetId = null,
  onSelect = () => {},
  placeholder = 'جستجو در تمامی دارایی‌ها و سورس‌ها...',
  title = '',
  subtitle = '',
  autoFocus = false,
  showCategories = false,
}) {
  const pricingContext = usePricing();
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const containerRef = useRef(null);

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

  // 3. Every asset of the price book — the one list, the one id and the one price the whole app uses
  const resolvedAssets = pricingContext?.resolvedAssets;
  const allItems = useMemo(() => (resolvedAssets || []).map((asset) => {
    const category = asset.category || 'custom';
    const isBourse = category.startsWith('bourse');
    return {
      id: asset.id,
      sourceId: asset.sourceId || null,
      sourceName: asset.sourceName || undefined,
      name: asset.name,
      symbol: asset.symbol || '',
      subText: asset.subText || '',
      badge: asset.badge,
      badgeClass: category,
      category,
      aliases: asset.aliases || [],
      price: asset.price,
      unit: asset.unit,
      type: category === 'currency' ? 'forex' : (isBourse ? 'bourse' : 'standard'),
      changePercent: asset.changePercent,
      isFund: asset.isFund,
      raw: asset,
    };
  }), [resolvedAssets]);

  // 4. Pure Client-Side Instant Search Filter with Scoring, Category Filter, and Tokenized Matching
  const filteredItems = useMemo(() => {
    let list = allItems;

    // Filter by category pill if selected
    if (activeCategory && activeCategory !== 'all') {
      list = list.filter((item) => item.category === activeCategory);
    }

    const q = normalizeSearchText(query);
    if (!q) return list;

    const qTokens = q.split(/\s+/).filter(Boolean);

    const scored = [];
    for (const item of list) {
      const nameNorm = normalizeSearchText(item.name);
      const symNorm = normalizeSearchText(item.symbol);
      const idNorm = normalizeSearchText(item.id);
      const subNorm = normalizeSearchText(item.subText);
      const aliases = Array.isArray(item.aliases) ? item.aliases : [];
      const aliasesNorm = aliases.map(normalizeSearchText).filter(Boolean);

      let score = 0;

      // 1. Exact matches
      if (symNorm && symNorm === q) {
        score += 1200;
      } else if (nameNorm === q) {
        score += 1000;
      } else if (aliasesNorm.includes(q)) {
        score += 950;
      } else if (idNorm === q) {
        score += 900;
      }
      // 2. Starts with query
      else if (symNorm && symNorm.startsWith(q)) {
        score += 600;
      } else if (nameNorm.startsWith(q)) {
        score += 500;
      } else if (aliasesNorm.some((a) => a.startsWith(q))) {
        score += 450;
      }
      // 3. Contains query as substring
      else if (symNorm && symNorm.includes(q)) {
        score += 300;
      } else if (nameNorm.includes(q)) {
        score += 250;
      } else if (aliasesNorm.some((a) => a.includes(q))) {
        score += 200;
      } else if (subNorm.includes(q)) {
        score += 100;
      } else if (idNorm.includes(q)) {
        score += 80;
      }
      // 4. Multi-token match
      else if (qTokens.length > 1) {
        const combined = `${nameNorm} ${symNorm} ${aliasesNorm.join(' ')} ${subNorm} ${idNorm}`;
        const allTokensMatch = qTokens.every((tok) => combined.includes(tok));
        if (allTokensMatch) {
          score += 150;
        }
      }

      if (score > 0) {
        if (item.type === 'standard' || item.type === 'forex') score += 20;
        scored.push({ item, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);

    // Deduplicate
    const unique = [];
    const seenResultKeys = new Set();
    for (const entry of scored) {
      const canonicalKey = (entry.item.id || '').toLowerCase().trim();
      if (seenResultKeys.has(canonicalKey)) continue;
      seenResultKeys.add(canonicalKey);
      unique.push(entry.item);
    }

    return unique;
  }, [allItems, query, activeCategory]);

  const isItemActive = (item) => {
    const targetId = selectedAssetId || (selectedAsset?.id ? selectedAsset.id : null);
    // A stored id may be an older form of the book id
    return Boolean(targetId) && item.id === toPriceId(targetId, pricingContext?.itemMap);
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
      {/* Header Area (No tabs) */}
      {(title || subtitle || (mode === 'explorer' && selectedAsset)) && (
        <div className="universal-search-header-area" style={{ marginBottom: '10px' }}>
          {title && (
            <div className="universal-header-titles">
              <h4 className="universal-search-title">{title}</h4>
              {subtitle && <p className="universal-search-subtitle">{subtitle}</p>}
            </div>
          )}

          {/* Active Asset Banner in Explorer Mode */}
          {mode === 'explorer' && selectedAsset && (
            <div className="universal-active-asset-banner">
              <div className="universal-active-badge">دارایی فعال</div>
              <div className="universal-active-details">
                <div className="universal-active-icon">
                  {getAssetIcon(selectedAsset)}
                </div>
                <strong className="universal-active-name">
                  {selectedAsset?.name || 'انتخاب نشده'}
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

      {/* Category Filter Pills Strip */}
      {showCategories && (
        <div className="universal-categories-strip" style={{ marginTop: '8px', marginBottom: '4px' }}>
          <button
            type="button"
            className={`universal-category-pill ${activeCategory === 'all' ? 'active' : ''}`}
            onClick={() => {
              setActiveCategory('all');
              if (mode === 'picker') setIsDropdownOpen(true);
            }}
          >
            <span>همه</span>
          </button>
          {PORTFOLIO_CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              type="button"
              className={`universal-category-pill ${activeCategory === cat.key ? 'active' : ''}`}
              onClick={() => {
                setActiveCategory(cat.key);
                if (mode === 'picker') setIsDropdownOpen(true);
              }}
            >
              <span>{cat.badge || cat.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Results Rendering */}
      {mode === 'picker' ? (
        /* Picker Mode: Dropdown Popover */
        isDropdownOpen && (
          <div className="universal-results-picker-dropdown">
            {filteredItems.length === 0 ? (
              <div className="universal-empty-results">
                هیچ دارایی یا سورسی یافت نشد.
              </div>
            ) : (
              filteredItems.slice(0, 50).map((item) => {
                const active = isItemActive(item);
                return (
                  <div
                    key={item.id}
                    className={`universal-result-card ${active ? 'active-selected' : ''}`}
                    onClick={() => handleSelectItem(item)}
                  >
                    <div className="universal-result-info">
                      <div className="universal-result-icon">
                        {getAssetIcon(item)}
                      </div>
                      <div className="universal-result-text">
                        <span className="universal-result-name">{item.name}</span>
                        <div className="universal-result-sub">
                          <span className="universal-result-badge">
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
                        <span className="universal-result-badge" style={{ color: 'var(--color-primary-text)' }}>
                          {active ? <Check size={12} /> : 'انتخاب'}
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
              filteredItems.slice(0, 50).map((item) => {
                const active = isItemActive(item);
                return (
                  <div
                    key={item.id}
                    className={`universal-result-card ${active ? 'active-selected' : ''}`}
                    onClick={() => handleSelectItem(item)}
                  >
                    <div className="universal-result-info">
                      <div className="universal-result-icon">
                        {getAssetIcon(item)}
                      </div>
                      <div className="universal-result-text">
                        <span className="universal-result-name">{item.name}</span>
                        <div className="universal-result-sub">
                          <span className="universal-result-badge">
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
                        <span className="universal-result-badge" style={{ color: 'var(--color-primary-text)' }}>
                          {active ? <Check size={12} /> : 'انتخاب'}
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

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
import { usePricing } from '../context/PricingContext.jsx';
import {
  FOREX_SPECS,
  TROY_OUNCE_GRAMS,
  PORTFOLIO_CATEGORIES,
  CANONICAL_ASSET_REGISTRY,
  getCanonicalAssetSpec,
  getCanonicalAssetName,
  getCanonicalAssetUnit,
  getCanonicalAssetCategory,
  getCanonicalAssetBadge,
  resolveItemCategory,
  getCategoryBadge,
  getCategoryLabel,
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
  const pt = String(priceType || '').toLowerCase().replace(/^src_def_/, '');
  if (pt === 'silver_gram' || pt === 'silver_999' || pt === 'silver_925' || pt === 'ons_silver' || pt === 'silver_ounce' || pt.includes('silver')) {
    return { category: 'silver', badge: 'نقره', unit: pt.includes('ons') || pt.includes('ounce') ? 'اونس' : 'گرم' };
  }
  if (pt === 'gold_18k' || pt === 'gold_22k' || pt === 'gold_24k' || pt === 'gold_melted' || pt === 'mesghal' || pt === 'ons_gold' || pt.includes('gold')) {
    return { category: 'gold', badge: 'طلا', unit: pt.includes('mesghal') ? 'مثقال' : (pt.includes('ons') ? 'اونس' : 'گرم') };
  }
  if (pt.includes('coin') || pt === 'full_new' || pt === 'full_old' || pt === 'half' || pt === 'quarter' || pt === 'gerami' || pt === 'bank_gram' || pt === 'gram') {
    return { category: 'coin', badge: 'سکه', unit: 'عدد' };
  }
  if (pt === 'crypto' || pt === 'btc' || pt === 'eth' || pt === 'usdt') {
    return { category: 'crypto', badge: 'رمزارز', unit: 'واحد' };
  }
  if (pt === 'bourse') {
    return { category: 'bourse', badge: 'بورس', unit: 'برگ سهم' };
  }
  if (pt === 'bourse_fund') {
    return { category: 'bourse_fund', badge: 'صندوق', unit: 'واحد' };
  }
  return { category: 'currency', badge: 'ارز', unit: 'تومان' };
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

export function isSourceMultiOutput(s, priceTypeInfo = {}) {
  if (!s) return false;
  const t = (s.priceType || '').toLowerCase();
  if (t === 'bourse' || t === 'bourse_fund' || t === 'forex') return true;
  if (s.category === 'multi_output' || s.isMultiOutput) return true;
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

  let fm = src.fieldMapping || src.field_mapping;
  if (typeof fm === 'string') {
    try { fm = JSON.parse(fm); } catch {}
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
    else if (Array.isArray(multi.symbols)) rawList = multi.symbols;
    else if (Array.isArray(multi.data)) rawList = multi.data;
    else if (Array.isArray(multi.results)) rawList = multi.results;
    else if (Array.isArray(multi.result)) rawList = multi.result;
    else if (Array.isArray(multi.list)) rawList = multi.list;
    else if (Array.isArray(multi.currencies)) rawList = multi.currencies;
    else if (Array.isArray(multi)) rawList = multi;
    else if (typeof multi === 'object') {
      rawList = Object.entries(multi)
        .filter(([k]) => !['updatedAt', 'totalCount', 'totalSymbols', 'labels', 'topSymbols', 'error', 'datetime', 'totalFunds', 'fundsCount', 'result', 'base_code', 'time_last_update_utc', 'time_next_update_utc', 'time_last_update_unix', 'time_next_update_unix', 'provider', 'documentation', 'terms_of_use', 'time_eol_unix'].includes(k))
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

  const isBourse = src.priceType === 'bourse' || src.priceType === 'bourse_fund' || (src.endpoint && (src.endpoint.includes('brsapi') || src.endpoint.includes('tsetmc')));
  const isForex = src.priceType === 'forex' || (src.endpoint && src.endpoint.includes('open.er-api.com'));

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
  const catField = fm?.categoryField || fm?.brandField;

  return rawList
    .filter((item) => {
      if (!item || typeof item !== 'object') return false;
      const sym = String((symField && item[symField]) || item.s || item.symbol || item.id || item.code || item.slug || item.l18 || item.ticker || '').trim().toLowerCase();
      const name = String((nameField && item[nameField]) || item.n || item.name || item.title || item.car_name || item.model || item.l30 || '').trim().toLowerCase();

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
      const sym = String((symField && item[symField]) || item.s || item.symbol || item.id || item.code || item.slug || item.l18 || item.ticker || '').trim();
      const symUpper = sym.toUpperCase();
      const resolvedFaName = isForex ? (WORLD_CURRENCY_NAMES[symUpper] || item.n || item.name || symUpper) : null;
      let name = String((nameField && item[nameField]) || item.n || item.name || item.title || item.car_name || item.model || item.l30 || sym).trim();
      if (isForex && resolvedFaName) {
        name = resolvedFaName.includes(symUpper) ? resolvedFaName : `${resolvedFaName} (${symUpper})`;
      }

      const rawVal = Number((priceField && item[priceField]) || item.rawRate || item.priceTomans || item.priceFinal || item.price || item.lastPrice || item.p || item.pl || (altPriceField && item[altPriceField]) || item.pc || 0);
      const usdCross = isForex ? (item.usdCrossRate || calculateUsdCrossRate(symUpper, rawVal)) : 0;

      let finalPrice;
      if (isBourse) {
        // TSETMC / BRS API: pl & pc are in Rials -> divide by 10 to get Tomans.
        if (item.priceToman !== undefined) {
          finalPrice = Number(item.priceToman);
        } else if (item.pl !== undefined || item.pc !== undefined) {
          const rawRial = Number(item.pl || item.pc || 0);
          finalPrice = Math.round(rawRial / 10);
        } else if (item.priceRial !== undefined) {
          finalPrice = Math.round(Number(item.priceRial) / 10);
        } else {
          finalPrice = Math.round(Number(item.price !== undefined ? item.price : (item.p || 0)));
        }
      } else if (isForex) {
        finalPrice = usdCross;
      } else {
        const isRial = src.unit === 'rial' || (typeof fm === 'object' && fm?.priceUnit === 'rial');
        finalPrice = isRial && rawVal > 0 ? Math.round(rawVal / 10) : (rawVal >= 100 ? Math.round(rawVal) : rawVal);
      }

      const cp = Number((changeField && item[changeField]) || item.cp !== undefined ? item.cp : (item.changePercent !== undefined ? item.changePercent : (item.plp || 0)));
      const rawCategory = isForex ? 'ارزهای جهانی (فارکس)' : String((catField && item[catField]) || item.cat || item.category || item.brand || item.group || '').trim();
      const isFund = Boolean(item.f === 1 || item.isFund || src.priceType === 'bourse_fund' || rawCategory.includes('صندوق') || name.includes('صندوق'));

      return {
        ...item,
        symbol: isForex ? symUpper : sym,
        name,
        faName: isForex ? resolvedFaName : undefined,
        rawRate: rawVal,
        usdCrossRate: isForex ? usdCross : undefined,
        price: isForex ? usdCross : finalPrice,
        priceToman: isBourse ? finalPrice : undefined,
        changePercent: cp,
        category: rawCategory,
        extra: String(item.extra || item.model || item.volume || '').trim(),
        isFund,
      };
    });
}

function getAssetIcon(item) {
  if (!item) return <Sparkles size={15} />;
  if (item.type === 'bourse') return <TrendingUp size={15} />;
  const badge = String(item.badge || item.category || item.name || '').toLowerCase();
  if (badge.includes('طلا') || badge.includes('gold')) return <Award size={15} />;
  if (badge.includes('سکه') || badge.includes('coin')) return <Coins size={15} />;
  if (badge.includes('نقره') || badge.includes('silver')) return <Disc size={15} />;
  if (badge.includes('ارز') || badge.includes('currency') || badge.includes('دلار')) return <Banknote size={15} />;
  if (badge.includes('رمز') || badge.includes('crypto')) return <Zap size={15} />;
  if (badge.includes('صندوق') || badge.includes('fund')) return <Layers size={15} />;
  return <Sparkles size={15} />;
}

export default function UniversalAssetSearch({
  mode = 'picker',
  sources = null,
  priceTypeInfo = null,
  selectedAsset = null,
  selectedAssetId = null,
  onSelect = () => {},
  placeholder = 'جستجو در تمامی دارایی‌ها و سورس‌ها...',
  title = '',
  subtitle = '',
  autoFocus = false,
  usdToman: propUsdToman = null,
  goldUsd: propGoldUsd = null,
  silverUsd: propSilverUsd = null,
  showCategories = false,
}) {
  const pricingContext = usePricing();
  const effectiveUsdToman = Number(
    propUsdToman ||
    pricingContext?.usdToman ||
    0
  );
  const effectiveGoldUsd = Number(
    propGoldUsd ||
    pricingContext?.goldUsd ||
    0
  );
  const effectiveSilverUsd = Number(
    propSilverUsd ||
    pricingContext?.silverUsd ||
    0
  );

  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [internalSources, setInternalSources] = useState(sources || []);
  const [bourseSymbols, setBourseSymbols] = useState([]);
  const containerRef = useRef(null);

  // 1. Fetch Sources if not passed in props
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

  // 2. Preload Bourse symbols once upfront for instant search
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

  // 3. Build Unified Items List (100% Client-Side, Single Source of Truth via PricingContext)
  const allItems = useMemo(() => {
    const items = [];
    const seenKeys = new Set();
    const seenNames = new Set();

    // ── بخش ۱: دارایی‌های کاتالوگ محاسباتی PricingContext ──────────────────────
    if (pricingContext?.resolvedAssets && pricingContext.resolvedAssets.length > 0) {
      pricingContext.resolvedAssets.forEach((asset) => {
        const sym = (asset.symbol || asset.code || '').trim();
        const canonicalId = (asset.id || '').toLowerCase().trim();
        const normName = normalizeSearchText(asset.name);

        if (seenKeys.has(canonicalId)) return;
        seenKeys.add(canonicalId);
        if (sym) seenKeys.add(sym.toLowerCase());
        seenNames.add(normName);

        const category = resolveItemCategory(asset);
        const badge = getCategoryBadge(category, asset.badge || 'دارایی');
        const spec = getCanonicalAssetSpec(asset.id || sym);
        const aliases = spec?.aliases || asset.aliases || [];

        items.push({
          id: asset.id,
          sourceId: asset.sourceId || asset.id,
          priceType: asset.priceType || asset.id,
          name: asset.name,
          symbol: sym,
          subText: asset.subText || '',
          badge,
          badgeClass: category,
          category,
          aliases,
          price: asset.price,
          unit: asset.unit || getCanonicalAssetUnit(asset.id, 'واحد'),
          type: asset.priceType === 'forex' ? 'forex' : (category.startsWith('bourse') ? 'bourse' : 'standard'),
          changePercent: asset.changePercent,
          raw: {
            ...asset,
            id: asset.id,
            symbol: sym,
            name: asset.name,
            faName: asset.name,
            aliases,
            usdCrossRate: asset.usdCrossRate,
            priceToman: asset.price,
            price: asset.price,
            category,
            unit: asset.unit || getCanonicalAssetUnit(asset.id, 'واحد'),
            isFund: category === 'bourse_fund',
            isMultiItem: category === 'currency' || category.startsWith('bourse'),
          },
        });
      });
    }

    // ── بخش ۲: دارایی‌های پایه استاندارد (Fallback برای تضمین حضور طلا، سکه، نقره، فارکس و کریپتو) ──
    Object.values(CANONICAL_ASSET_REGISTRY).forEach((spec) => {
      const canonicalId = spec.id.toLowerCase().trim();
      if (seenKeys.has(canonicalId)) return;
      seenKeys.add(canonicalId);
      if (spec.symbol) seenKeys.add(spec.symbol.toLowerCase());
      if (spec.code) seenKeys.add(spec.code.toLowerCase());

      const cat = spec.category || 'gold';
      const livePrice = pricingContext?.priceMap?.[spec.id] || pricingContext?.priceMap?.[canonicalId] || 0;

      items.push({
        id: spec.id,
        sourceId: `src_def_${spec.id}`,
        priceType: spec.id,
        name: spec.name,
        symbol: spec.symbol || spec.code || '',
        subText: spec.formulaText || '',
        badge: getCategoryBadge(cat, spec.badge || 'پایه'),
        badgeClass: cat,
        category: cat,
        aliases: spec.aliases || [],
        price: livePrice,
        unit: spec.unit || 'واحد',
        type: cat === 'currency' ? 'forex' : 'standard',
        raw: {
          ...spec,
          id: spec.id,
          name: spec.name,
          category: cat,
          aliases: spec.aliases || [],
          unit: spec.unit || 'واحد',
          price: livePrice,
          priceToman: livePrice,
        },
      });
    });

    // ── بخش ۳: نمادهای سهام و صندوق‌های بورس اوراق بهادار تهران (۲۰۰۰+ نماد) ──────
    if (bourseSymbols && bourseSymbols.length > 0) {
      bourseSymbols.forEach((sub) => {
        const symCode = (sub.symbol || sub.s || '').trim();
        const itemName = (sub.name || sub.title || sub.n || symCode).trim();
        if (!symCode && !itemName) return;

        const canonicalId = `bourse_${symCode}`.toLowerCase();
        if (seenKeys.has(canonicalId) || (symCode && seenKeys.has(symCode.toLowerCase()))) return;
        seenKeys.add(canonicalId);
        if (symCode) seenKeys.add(symCode.toLowerCase());

        const isFund = Boolean(
          sub.isFund ||
          sub.f === 1 ||
          sub.category === 'bourse_fund' ||
          sub.category?.includes('صندوق') ||
          itemName.includes('صندوق') ||
          sub.title?.includes('صندوق')
        );
        const category = isFund ? 'bourse_fund' : 'bourse';
        const badge = isFund ? 'صندوق' : 'بورس';
        const badgeClass = isFund ? 'bourse_fund' : 'bourse';

        let priceToman = 0;
        if (pricingContext?.priceMap) {
          priceToman = pricingContext.priceMap[symCode] || pricingContext.priceMap[canonicalId] || 0;
        }
        if (!priceToman) {
          if (sub.priceToman !== undefined) priceToman = Number(sub.priceToman);
          else if (sub.priceRial !== undefined) priceToman = Math.round(Number(sub.priceRial) / 10);
          else if (sub.price !== undefined) priceToman = Number(sub.price);
          else if (sub.pl !== undefined || sub.pc !== undefined) priceToman = Math.round(Number(sub.pl || sub.pc) / 10);
          else priceToman = Number(sub.p || 0);
        }

        const unit = isFund ? 'واحد' : 'برگ سهم';
        const subDetails = isFund
          ? (sub.category ? `${sub.category} • نماد: ${symCode}` : `صندوق سرمایه‌گذاری • نماد: ${symCode}`)
          : (sub.category ? `${sub.category} • نماد: ${symCode}` : `سهام بورس تهران • نماد: ${symCode}`);

        const displayName = isFund && !itemName.includes(symCode)
          ? `${itemName} (${symCode})`
          : itemName;

        items.push({
          id: `bourse_${symCode}`,
          sourceId: 'bourse_feed',
          symbol: symCode,
          name: displayName,
          subText: subDetails,
          badge,
          badgeClass,
          category,
          aliases: [symCode, itemName, isFund ? `صندوق ${symCode}` : `سهام ${symCode}`],
          price: priceToman,
          unit,
          type: 'bourse',
          changePercent: Number(sub.changePercent ?? sub.cp ?? sub.plp ?? 0),
          raw: {
            ...sub,
            id: `bourse_${symCode}`,
            symbol: symCode,
            name: displayName,
            priceToman,
            price: priceToman,
            isFund,
            category,
            unit,
          },
        });
      });
    }

    // ── بخش ۴: سورس‌های چند خروجی و فیدهای فعال ──────────────────────────────
    internalSources.forEach((src) => {
      const isActive = src.isActive === 1 || src.isActive === true || src.is_active === 1 || src.is_active === true;
      if (!isActive) return;
      const isMulti = isSourceMultiOutput(src, priceTypeInfo);
      if (!isMulti) return;

      const subItems = extractMultiItems(src);
      subItems.forEach((sub) => {
        const symCode = (sub.symbol || sub.s || '').trim();
        const itemName = (sub.name || sub.n || symCode).trim();
        if (!symCode && !itemName) return;

        const isBourse = src.priceType === 'bourse' || src.priceType === 'bourse_fund' || Boolean(sub.isFund) || itemName.includes('صندوق');
        const isForex = src.priceType === 'forex';
        const itemKey = isBourse ? `bourse_${symCode}`.toLowerCase() : `${src.id}::${symCode || itemName}`.toLowerCase();

        if (seenKeys.has(itemKey) || (symCode && seenKeys.has(symCode.toLowerCase()))) return;
        seenKeys.add(itemKey);
        if (symCode) seenKeys.add(symCode.toLowerCase());

        const isFund = Boolean(sub.isFund || (isBourse && (sub.category?.includes('صندوق') || itemName.includes('صندوق'))));
        const category = isForex ? 'currency' : (isBourse ? (isFund ? 'bourse_fund' : 'bourse') : (src.priceType || 'custom'));
        const badge = isForex ? 'ارز' : (isBourse ? (isFund ? 'صندوق' : 'بورس') : (src.name || 'سورس'));

        let priceToman = Number(sub.priceToman || sub.price || sub.p || 0);
        if (isBourse && sub.priceRial) priceToman = Math.round(Number(sub.priceRial) / 10);
        const unit = isBourse ? (isFund ? 'واحد' : 'برگ سهم') : (src.unit || 'تومان');

        items.push({
          id: itemKey,
          sourceId: src.id,
          symbol: symCode,
          name: itemName,
          subText: `${src.name || ''} • ${symCode || ''}`,
          badge,
          badgeClass: category,
          category,
          aliases: [symCode, itemName],
          price: priceToman,
          unit,
          type: isBourse ? 'bourse' : (isForex ? 'forex' : 'source'),
          changePercent: Number(sub.changePercent ?? sub.cp ?? 0),
          raw: {
            ...sub,
            symbol: symCode,
            name: itemName,
            category,
            unit,
            price: priceToman,
            priceToman,
            isFund,
          },
        });
      });
    });

    return items;
  }, [pricingContext?.resolvedAssets, pricingContext?.priceMap, bourseSymbols, internalSources, priceTypeInfo]);

  // 4. Pure Client-Side Instant Search Filter with Scoring, Category Filter, and Tokenized Matching
  const filteredItems = useMemo(() => {
    let list = allItems;

    // Filter by category pill if selected
    if (activeCategory && activeCategory !== 'all') {
      list = list.filter((item) => {
        if (activeCategory === 'bourse') {
          return item.category === 'bourse';
        }
        if (activeCategory === 'bourse_fund') {
          return item.category === 'bourse_fund';
        }
        return item.category === activeCategory;
      });
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
                  {(priceTypeInfo && priceTypeInfo[selectedAsset?.priceType]?.label) || selectedAsset?.name || 'انتخاب نشده'}
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
                        <span className="universal-result-badge" style={{ color: '#60a5fa' }}>
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
                        <span className="universal-result-badge" style={{ color: '#60a5fa' }}>
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

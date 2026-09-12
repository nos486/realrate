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

export const WORLD_CURRENCY_NAMES = {
  USD: 'دلار آمریکا',
  EUR: 'یورو اروپا',
  GBP: 'پوند انگلیس',
  AED: 'درهم امارات',
  TRY: 'لیر ترکیه',
  CHF: 'فرانک سوئیس',
  CAD: 'دلار کانادا',
  AUD: 'دلار استرالیا',
  CNY: 'یوان چین',
  JPY: 'ین ژاپن',
  KWD: 'دینار کویت',
  SAR: 'ریال عربستان',
  QAR: 'ریال قطر',
  OMR: 'ریال عمان',
  BHD: 'دینار بحرین',
  IQD: 'دینار عراق',
  RUB: 'روبل روسیه',
  INR: 'روپیه هند',
  PKR: 'روپیه پاکستان',
  AFN: 'افغانی افغانستان',
  SEK: 'کرون سوئد',
  NOK: 'کرون نروژ',
  DKK: 'کرون دانمارک',
  SGD: 'دلار سنگاپور',
  HKD: 'دلار هنگ‌کنگ',
  KRW: 'وون کره جنوبی',
  THB: 'بات تایلند',
  MYR: 'رینگیت مالزی',
  NZD: 'دلار نیوزیلند',
  BRL: 'رئال برزیل',
  ZAR: 'رند آفریقای جنوبی',
  AZN: 'منات آذربایجان',
  GEL: 'لاری گرجستان',
  AMD: 'درام ارمنستان',
  TMT: 'منات ترکمنستان',
  TJS: 'سامانی تاجیکستان',
  KZT: 'تنگه قزاقستان',
  UZS: 'سوم ازبکستان',
  EGP: 'پوند مصر',
  SYP: 'لیر سوریه',
  LBP: 'لیر لبنان',
  JOD: 'دینار اردن',
  IDR: 'روپیه اندونزی',
  PHP: 'پزو فیلیپین',
  VND: 'دانگ ویتنام',
  MXN: 'پزو مکزیک',
  PLN: 'زلوتی لهستان',
  CZK: 'کرونا چک',
  HUF: 'فورینت مجارستان',
  ILS: 'شکل اسرائیل',
  CLP: 'پزو شیلی',
  COP: 'پزو کلمبیا',
  PEN: 'سول پرو',
  ARS: 'پزو آرژانتین',
  BGN: 'لو بلغارستان',
  RON: 'لئو رومانی',
  ISK: 'کرون ایسلند',
  HRK: 'کونا کرواسی',
  RSD: 'دینار صربستان',
  LYD: 'دینار لیبی',
  TND: 'دینار تونس',
  MAD: 'درهم مراکش',
  DZD: 'دینار الجزایر',
  USDT: 'تتر (USDT)',
};

const baseLabels = {
  usd: 'دلار آمریکا',
  usd_toman: 'دلار آمریکا',
  gold_18k: 'طلای ۱۸ عیار',
  gold_22k: 'طلای ۲۲ عیار',
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
  silver_gram: 'نقره خام (گرمی ۹۹۹)',
  silver_999: 'نقره خام (گرمی ۹۹۹)',
  silver_925: 'نقره استرلینگ ۹۲۵',
  bourse: 'بورس اوراق بهادار',
  bourse_fund: 'صندوق سرمایه‌گذاری بورس',
  forex: 'ارزهای جهانی (فارکس)',
  crypto: 'رمزارز',
  usdt: 'تتر (USDT)',
  btc: 'بیت‌کوین (BTC)',
  eth: 'اتریوم (ETH)',
  ...Object.entries(WORLD_CURRENCY_NAMES).reduce((acc, [code, name]) => {
    acc[code.toLowerCase()] = name;
    acc[code.toUpperCase()] = name;
    acc[code] = name;
    return acc;
  }, {}),
};

export const STANDARD_PRICE_TYPE_LABELS = new Proxy(baseLabels, {
  get(target, prop) {
    if (typeof prop !== 'string') return target[prop];
    if (target[prop]) return target[prop];
    const upper = prop.toUpperCase().trim();
    if (WORLD_CURRENCY_NAMES[upper]) return WORLD_CURRENCY_NAMES[upper];
    const lower = prop.toLowerCase().trim();
    if (target[lower]) return target[lower];
    const stripped = upper.replace(/^(FOREX_|CUR_|FX_|SRC_DEF_)/, '');
    if (WORLD_CURRENCY_NAMES[stripped]) return WORLD_CURRENCY_NAMES[stripped];
    return target[prop];
  },
  has(target, prop) {
    if (typeof prop !== 'string') return prop in target;
    const upper = prop.toUpperCase().trim();
    return (prop in target) || (upper in WORLD_CURRENCY_NAMES) || (prop.toLowerCase() in target);
  },
});

export function getPriceTypeLabel(priceType, priceTypeInfo = null) {
  if (!priceType) return '';
  const rawStr = String(priceType).trim();
  const clean = rawStr.toLowerCase();
  const upper = rawStr.toUpperCase();
  if (priceTypeInfo && priceTypeInfo[priceType]?.label) return priceTypeInfo[priceType].label;
  if (priceTypeInfo && priceTypeInfo[clean]?.label) return priceTypeInfo[clean].label;
  if (WORLD_CURRENCY_NAMES[upper]) return WORLD_CURRENCY_NAMES[upper];
  if (STANDARD_PRICE_TYPE_LABELS[clean]) return STANDARD_PRICE_TYPE_LABELS[clean];
  if (STANDARD_PRICE_TYPE_LABELS[upper]) return STANDARD_PRICE_TYPE_LABELS[upper];
  if (STANDARD_PRICE_TYPE_LABELS[priceType]) return STANDARD_PRICE_TYPE_LABELS[priceType];
  const stripped = upper.replace(/^(FOREX_|CUR_|FX_|SRC_DEF_)/, '');
  if (WORLD_CURRENCY_NAMES[stripped]) return WORLD_CURRENCY_NAMES[stripped];
  return priceType;
}

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

  const isBourse = src.priceType === 'bourse' || src.priceType === 'bourse_fund';
  const isForex = src.priceType === 'forex';
  const isRial = src.unit === 'rial' || (typeof fm === 'object' && fm?.priceUnit === 'rial') || isBourse;

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
      if (sym && excludedSet.has(sym)) return false;
      if (name && excludedSet.has(name)) return false;
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
      const finalPrice = isRial && rawVal > 0 ? Math.round(rawVal / 10) : (rawVal >= 100 ? Math.round(rawVal) : rawVal);
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
}) {
  const [query, setQuery] = useState('');
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

  // 3. Build Unified Items List (100% Client-Side, Exact 2 Types, All Multi-Output Categories)
  const allItems = useMemo(() => {
    const items = [];
    const seenKeys = new Set();

    // ── نوع ۱: سورس‌های نرخ پایه و اقلام استاندارد طلا، سکه و نقره ─────────────
    // فقط نوع نرخ را بنویس، فقط در صورت فعال بودن و مرجع بودن
    internalSources.forEach((src) => {
      const isActive = src.isActive === 1 || src.isActive === true || src.is_active === 1 || src.is_active === true;
      if (!isActive) return;

      const isMulti = isSourceMultiOutput(src, priceTypeInfo);
      if (isMulti) return;

      const isPrimary = src.isPrimary === 1 || src.isPrimary === true || src.is_primary === 1 || src.is_primary === true;
      if (!isPrimary) return;

      const canonicalId = (src.priceType || src.id || '').replace(/^src_def_/, '');
      const typeLabel = getPriceTypeLabel(src.priceType, priceTypeInfo) || src.name;
      const meta = getCategoryMetadata(src.priceType);

      items.push({
        id: canonicalId,
        sourceId: src.id,
        priceType: src.priceType,
        name: typeLabel,
        symbol: '',
        subText: 'نرخ پایه بازار (سورس مرجع)',
        badge: meta.badge || 'پایه',
        badgeClass: meta.category,
        category: meta.category,
        price: Number(src.lastPrice || 0),
        unit: meta.unit || src.unit || 'تومان',
        type: 'standard',
        changePercent: src.diff !== undefined ? src.diff : src.changePercent,
        raw: {
          ...src,
          id: canonicalId,
          priceType: src.priceType,
          category: meta.category,
          unit: meta.unit || src.unit || 'تومان',
        },
      });
      seenKeys.add(canonicalId);
      seenKeys.add(src.id);
    });

    // Find active primary USD rate for Forex and Silver calculations
    const activeSources = internalSources.filter(s =>
      s.isActive === 1 || s.isActive === true || s.is_active === 1 || s.is_active === true
    );
    const usdSource =
      activeSources.find(s => (s.priceType === 'usd' || s.priceType === 'usd_toman') && (s.isPrimary === 1 || s.isPrimary === true || s.is_primary === 1 || s.is_primary === true) && Number(s.lastPrice || s.last_price || 0) > 0) ||
      activeSources.find(s => (s.priceType === 'usd' || s.priceType === 'usd_toman') && Number(s.lastPrice || s.last_price || 0) > 0) ||
      activeSources.find(s => (s.priceType === 'usd' || s.priceType === 'usd_toman')) ||
      activeSources.find(s => (s.id === 'src_def_usd' || (s.name && s.name.includes('دلار'))));
    const usdToman = Number(usdSource?.lastPrice || usdSource?.last_price || 0);

    // اشتقاق و افزودن طلا ۱۸ عیار، ۲۲ عیار، ۲۴ عیار و نقره گرمی
    const onsGoldItem = items.find(i => i.id === 'ons_gold' || i.id === 'gold_ounce');
    const onsGoldPrice = Number(onsGoldItem?.price || 2900);

    let p18 = Number(items.find(i => i.id === 'gold_18k')?.price || 0);
    if (p18 <= 0 && usdToman > 0) {
      p18 = Math.round(((onsGoldPrice > 100 ? onsGoldPrice : 2900) / 31.1034768) * usdToman * 0.75);
    }

    // تضمین حضور طلای ۱۸ عیار
    if (!seenKeys.has('gold_18k') && !items.some(i => i.id === 'gold_18k')) {
      items.push({
        id: 'gold_18k',
        sourceId: 'src_def_gold_18k',
        priceType: 'gold_18k',
        name: 'طلای ۱۸ عیار',
        symbol: '',
        subText: 'نرخ پایه بازار (هر گرم طلا ۱۸ عیار)',
        badge: 'طلا',
        badgeClass: 'gold',
        category: 'gold',
        price: p18,
        unit: 'گرم',
        type: 'standard',
        raw: { id: 'gold_18k', priceType: 'gold_18k', name: 'طلای ۱۸ عیار', category: 'gold', unit: 'گرم', price: p18 },
      });
      seenKeys.add('gold_18k');
    }

    // تضمین حضور طلای ۲۲ عیار
    if (!seenKeys.has('gold_22k')) {
      const p22 = p18 > 0 ? Math.round(p18 * (22 / 18)) : 0;
      items.push({
        id: 'gold_22k',
        sourceId: 'derived_gold_22k',
        priceType: 'gold_22k',
        name: 'طلای ۲۲ عیار',
        symbol: '',
        subText: 'محاسبه شده بر مبنای طلای ۱۸ عیار',
        badge: 'طلا',
        badgeClass: 'gold',
        category: 'gold',
        price: p22,
        unit: 'گرم',
        type: 'standard',
        raw: { id: 'gold_22k', priceType: 'gold_22k', name: 'طلای ۲۲ عیار', category: 'gold', unit: 'گرم', price: p22 },
      });
      seenKeys.add('gold_22k');
    }

    // تضمین حضور طلای ۲۴ عیار
    if (!seenKeys.has('gold_24k')) {
      const p24 = p18 > 0 ? Math.round(p18 * (24 / 18)) : 0;
      items.push({
        id: 'gold_24k',
        sourceId: 'derived_gold_24k',
        priceType: 'gold_24k',
        name: 'طلای ۲۴ عیار',
        symbol: '',
        subText: 'طلای خالص شمش (۹۹۹)',
        badge: 'طلا',
        badgeClass: 'gold',
        category: 'gold',
        price: p24,
        unit: 'گرم',
        type: 'standard',
        raw: { id: 'gold_24k', priceType: 'gold_24k', name: 'طلای ۲۴ عیار', category: 'gold', unit: 'گرم', price: p24 },
      });
      seenKeys.add('gold_24k');
    }

    // تضمین حضور نقره خام (گرمی ۹۹۹)
    if (!seenKeys.has('silver_999') && !seenKeys.has('silver_gram')) {
      const onsSilverItem = items.find(i => i.id === 'ons_silver' || i.id === 'silver_ounce');
      const rawOns = Number(onsSilverItem?.price || 0);
      const onsToman = rawOns > 1000 ? rawOns : (usdToman > 0 ? (rawOns > 0 ? rawOns * usdToman : 33.5 * usdToman) : (rawOns > 0 ? rawOns * 90000 : 33.5 * 90000));
      const silverGramPrice = Math.round(onsToman / 31.1034768);
      items.push({
        id: 'silver_gram',
        sourceId: 'derived_silver_gram',
        priceType: 'silver_gram',
        name: 'نقره خام (گرمی ۹۹۹)',
        symbol: '',
        subText: 'نقره خام و ساچمه بر مبنای انس جهانی',
        badge: 'نقره',
        badgeClass: 'silver',
        category: 'silver',
        price: silverGramPrice,
        unit: 'گرم',
        type: 'standard',
        raw: { id: 'silver_gram', priceType: 'silver_gram', name: 'نقره خام (گرمی ۹۹۹)', category: 'silver', unit: 'گرم', price: silverGramPrice },
      });
      seenKeys.add('silver_gram');
      seenKeys.add('silver_999');
    }

    // ── نوع ۲: هاب سورس‌های چند خروجی و فیدها (تمام دسته‌بندی‌ها) ───────────────
    // هر اقلامی که زیرش هست رو بیار، در صورت فعال بودن
    internalSources.forEach((src) => {
      const isActive = src.isActive === 1 || src.isActive === true || src.is_active === 1 || src.is_active === true;
      if (!isActive) return;

      const isMulti = isSourceMultiOutput(src, priceTypeInfo);
      if (!isMulti) return;

      const feedCategoryLabel = getPriceTypeLabel(src.priceType, priceTypeInfo) || src.name;
      const isBourse = src.priceType === 'bourse' || src.priceType === 'bourse_fund';
      const isForex = src.priceType === 'forex';

      // استخراج تمامی اقلام زیرمجموعه این فید
      const subItems = extractMultiItems(src);

      // اگر فید بورس است و دیتای نمادها از قبل لود شده، ادغام کن
      let listToIterate = subItems;
      if (isBourse && bourseSymbols.length > 0) {
        if (subItems.length === 0) {
          listToIterate = bourseSymbols;
        } else {
          const subSymSet = new Set(subItems.map(x => (x.symbol || x.s || '').toUpperCase()).filter(Boolean));
          const additionalBourse = bourseSymbols.filter(bs => !subSymSet.has((bs.symbol || bs.s || '').toUpperCase()));
          listToIterate = [...subItems, ...additionalBourse];
        }
      }

      listToIterate.forEach((sub) => {
        const symCode = (sub.symbol || sub.s || '').trim();
        const symUpper = symCode.toUpperCase();
        const isForexItem = isForex;
        const faName = isForexItem ? (WORLD_CURRENCY_NAMES[symUpper] || sub.faName || symUpper) : null;
        const itemName = isForexItem
          ? (faName ? (faName.includes(symUpper) ? faName : `${faName} (${symUpper})`) : symUpper)
          : (sub.name || sub.n || symCode).trim();
        if (!symCode && !itemName) return;

        const itemKey = isBourse ? `bourse_${symCode || itemName}` : `${src.id}::${symUpper || symCode || itemName}`;
        if (seenKeys.has(itemKey)) return;
        seenKeys.add(itemKey);

        const isFund = Boolean(sub.isFund || (isBourse && (sub.category?.includes('صندوق') || itemName.includes('صندوق'))));
        const itemBadge = isForexItem ? 'ارز' : (sub.category || (isBourse ? (isFund ? 'صندوق' : 'بورس') : feedCategoryLabel));

        const displayName = itemName;
        const cross = isForexItem
          ? Number(sub.usdCrossRate || calculateUsdCrossRate(symUpper, sub.rawRate || sub.price || sub.p || 0))
          : Number(sub.price || 0);

        const calculatedPriceToman = isForexItem
          ? (usdToman > 0 && cross > 0 ? Math.round(cross * usdToman) : Math.round(cross))
          : (sub.price !== undefined
              ? Number(sub.price)
              : (sub.priceToman !== undefined ? Number(sub.priceToman) : Math.round(Number(sub.priceRial || sub.p || 0) / 10)));

        const subDetails = isForexItem
          ? (cross > 0
              ? `بر مبنای دلار (${cross < 1 ? cross.toFixed(4) : cross.toFixed(2)} $)` + (usdToman > 0 ? ` • دلار: ${usdToman.toLocaleString('fa-IR')} ت` : '')
              : 'نرخ جهانی فارکس')
          : (isBourse
              ? (sub.category ? `${sub.category}${symCode ? ` • نماد: ${symCode}` : ''}` : (isFund ? `صندوق سرمایه‌گذاری${symCode ? ` • نماد: ${symCode}` : ''}` : `سهام بورس اوراق بهادار${symCode ? ` • نماد: ${symCode}` : ''}`))
              : ([sub.category, symCode ? `کد: ${symCode}` : '', sub.extra].filter(Boolean).join(' • ') || feedCategoryLabel));

        const unit = isForexItem ? (usdToman > 0 ? 'تومان' : 'دلار') : (isBourse ? (isFund ? 'واحد' : 'برگ سهم') : (src.unit || 'تومان'));
        const cp = Number(sub.changePercent !== undefined ? sub.changePercent : (sub.cp !== undefined ? sub.cp : (sub.plp || 0)));

        items.push({
          id: itemKey,
          sourceId: src.id,
          symbol: isForexItem ? symUpper : symCode,
          name: displayName,
          subText: subDetails,
          badge: itemBadge,
          badgeClass: isForexItem ? 'currency' : (isBourse ? 'bourse' : 'multi-item'),
          category: isForexItem ? 'currency' : (sub.category || src.priceType),
          price: calculatedPriceToman,
          unit,
          type: isForexItem ? 'forex' : (isBourse ? 'bourse' : 'source'),
          isMultiItem: true,
          changePercent: cp,
          raw: {
            ...sub,
            symbol: isForexItem ? symUpper : symCode,
            name: displayName,
            faName,
            usdCrossRate: isForexItem ? cross : undefined,
            priceToman: calculatedPriceToman,
            priceRial: calculatedPriceToman * 10,
            isFund,
            category: isForexItem ? 'currency' : (sub.category || src.priceType),
            sourceId: src.id,
            sourceName: src.name,
            unit,
            isMultiItem: true,
          },
        });
      });
    });

    return items;
  }, [internalSources, bourseSymbols, priceTypeInfo]);

  // 4. Pure Client-Side Instant Search Filter
  const filteredItems = useMemo(() => {
    const q = normalizeSearchText(query);
    if (!q) return allItems;

    return allItems.filter((item) => {
      const nameNorm = normalizeSearchText(item.name);
      const symNorm = normalizeSearchText(item.symbol);
      const subNorm = normalizeSearchText(item.subText);
      const badgeNorm = normalizeSearchText(item.badge);
      const faNameNorm = normalizeSearchText(item.raw?.faName || '');

      return nameNorm.includes(q) || symNorm.includes(q) || subNorm.includes(q) || badgeNorm.includes(q) || faNameNorm.includes(q);
    });
  }, [allItems, query]);

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

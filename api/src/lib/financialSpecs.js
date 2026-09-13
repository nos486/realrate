/**
 * financialSpecs.js — Single Source of Truth for all Financial Specifications,
 * Physical Gold & Coin Weights, Forex Metadata, and Pricing Rules.
 *
 * This file centralizes all mathematical and physical standards of the Iranian market:
 * - 1 Troy Ounce = 31.1034768 grams
 * - Gold Carat Standards: 24k = 1000/1000, 22k = 916/1000, 21.6k = 900/1000, 18k = 750/1000, 17k = 705/1000
 * - Coin Specifications: Emami (8.133g, 900), Half (4.066g, 900), Quarter (2.033g, 900), Gerami (1.01g, 916)
 * - Forex Specifications: 24 Prominent Currencies + USD
 * - Canonical Asset Registry & Dynamic Name/Metadata Resolution
 */

export const TROY_OUNCE_GRAMS = 31.1034768;

// ── 1. Gold Specifications ───────────────────────────────────────────────────
export const GOLD_SPECS = {
  gold_18k: {
    id: 'gold_18k',
    name: 'طلا ۱۸ عیار',
    category: 'gold',
    badge: 'طلا',
    unit: 'گرم',
    carat: 18,
    weight: 1.0,
    gold24kWeight: 0.75, // 18 / 24
    targetBubblePct: 0,
    formulaText: '(انس طلا ÷ ۳۱.۱۰۳۵) × دلار × ۰.۷۵',
    aliases: ['طلا', 'طلا ۱۸', 'طلا 18', 'طلای ۱۸ عیار', 'طلای 18 عیار', 'طلای ۱۸', 'طلای 18', 'گرم طلا', 'gold 18k'],
  },
  gold_22k: {
    id: 'gold_22k',
    name: 'طلای ۲۲ عیار',
    category: 'gold',
    badge: 'طلا',
    unit: 'گرم',
    carat: 22,
    weight: 1.0,
    gold24kWeight: 22 / 24,
    targetBubblePct: 0,
    formulaText: '(انس طلا ÷ ۳۱.۱۰۳۵) × دلار × (۲۲ ÷ ۲۴)',
    aliases: ['طلا ۲۲', 'طلا 22', 'طلای ۲۲ عیار', 'طلای 22 عیار', 'طلای ۲۲'],
  },
  mesghal: {
    id: 'mesghal',
    name: 'مثقال طلا (مظنه ۱۷ عیار)',
    category: 'gold',
    badge: 'طلا',
    unit: 'مثقال',
    carat: 17,
    weight: 4.608,
    gold24kWeight: 4.608 * (17 / 24), // ~3.24864
    targetBubblePct: 0,
    formulaText: '(انس طلا ÷ ۳۱.۱۰۳۵) × دلار × ۴.۶۰۸ × ۰.۷۰۵',
    aliases: ['مثقال', 'مثقال طلا', 'مظنه', 'مظنه ۱۷', 'مظنه 17', 'مظنه طلا', 'مظنه ۱۷ عیار'],
  },
  gold_24k: {
    id: 'gold_24k',
    name: 'طلای ۲۴ عیار',
    category: 'gold',
    badge: 'طلا',
    unit: 'گرم',
    carat: 24,
    weight: 1.0,
    gold24kWeight: 1.0,
    targetBubblePct: 0,
    formulaText: '(انس طلا ÷ ۳۱.۱۰۳۵) × دلار',
    aliases: ['طلا ۲۴', 'طلا 24', 'طلای ۲۴ عیار', 'طلای 24 عیار', 'طلای خالص'],
  },
  melted_gold: {
    id: 'melted_gold',
    name: 'طلای آبشده',
    category: 'gold',
    badge: 'طلا',
    unit: 'گرم',
    carat: 18,
    weight: 1.0,
    gold24kWeight: 0.75,
    targetBubblePct: 0,
    formulaText: 'هر گرم طلا با عیار ۷۵۰ آبشده',
    aliases: ['آبشده', 'ابشده', 'طلای آبشده', 'آب شده', 'اب شده', 'طلای ابشده', 'اب شده نقدی'],
  },
  ons_gold: {
    id: 'ons_gold',
    name: 'انس طلای جهانی (XAU)',
    category: 'gold',
    badge: 'انس',
    unit: 'دلار',
    weight: TROY_OUNCE_GRAMS,
    carat: 24,
    gold24kWeight: TROY_OUNCE_GRAMS,
    targetBubblePct: 0,
    formulaText: 'نرخ لحظه‌ای هر تروا انس طلا در بازارهای بین‌المللی',
    aliases: ['انس', 'اونس', 'انس طلا', 'اونس طلا', 'طلای جهانی', 'انس جهانی', 'XAU', 'xau'],
  },
};

// ── 2. Coin Specifications ───────────────────────────────────────────────────
export const COIN_SPECS = {
  full_coin: {
    id: 'full_coin',
    name: 'سکه تمام بهار آزادی (امامی)',
    category: 'coin',
    badge: 'سکه',
    unit: 'عدد',
    carat: 21.6,
    weight: 8.133,
    gold24kWeight: 7.3197, // 8.133 * (21.6 / 24)
    targetBubblePct: 15,
    formulaText: 'وزن ۸.۱۳۳ گرم، عیار ۹۰۰ (معادل ۷.۳۱۹۷ گرم طلای خالص ۲۴ عیار)',
    aliases: ['سکه', 'سکه تمام', 'تمام بهار', 'سکه امامی', 'سکه تمام بهار', 'طرح جدید', 'سکه تمام طرح جدید', 'امامی', 'full coin'],
  },
  full_old: {
    id: 'full_old',
    name: 'سکه بهار آزادی (طرح قدیم)',
    category: 'coin',
    badge: 'سکه',
    unit: 'عدد',
    carat: 21.6,
    weight: 8.133,
    gold24kWeight: 7.3197,
    targetBubblePct: 10,
    formulaText: 'وزن ۸.۱۳۳ گرم، عیار ۹۰۰ (سکه تمام طرح قدیم)',
    aliases: ['سکه قدیم', 'طرح قدیم', 'سکه طرح قدیم', 'سکه بهار آزادی', 'تمام قدیم'],
  },
  half_coin: {
    id: 'half_coin',
    name: 'نیم سکه بهار آزادی',
    category: 'coin',
    badge: 'سکه',
    unit: 'عدد',
    carat: 21.6,
    weight: 4.066,
    gold24kWeight: 3.6594, // 4.066 * (21.6 / 24)
    targetBubblePct: 20,
    formulaText: 'وزن ۴.۰۶۶ گرم، عیار ۹۰۰ (معادل ۳.۶۵۹۴ گرم طلای خالص ۲۴ عیار)',
    aliases: ['نیم', 'نیم سکه', 'نیم سکه بهار آزادی', 'نیم بهار', 'half coin'],
  },
  quarter_coin: {
    id: 'quarter_coin',
    name: 'ربع سکه بهار آزادی',
    category: 'coin',
    badge: 'سکه',
    unit: 'عدد',
    carat: 21.6,
    weight: 2.033,
    gold24kWeight: 1.8297, // 2.033 * (21.6 / 24)
    targetBubblePct: 25,
    formulaText: 'وزن ۲.۰۳۳ گرم، عیار ۹۰۰ (معادل ۱.۸۲۹۷ گرم طلای خالص ۲۴ عیار)',
    aliases: ['ربع', 'ربع سکه', 'ربع سکه بهار آزادی', 'ربع بهار', 'quarter coin'],
  },
  gerami_coin: {
    id: 'gerami_coin',
    name: 'سکه گرمی بانک مرکزی',
    category: 'coin',
    badge: 'سکه',
    unit: 'عدد',
    carat: 22,
    weight: 1.01,
    gold24kWeight: 1.01 * (22 / 24), // ~0.925833
    targetBubblePct: 30,
    formulaText: 'وزن ۱.۰۱ گرم، عیار ۹۱۶ (معادل ۰.۹۲۵۸ گرم طلای خالص ۲۴ عیار)',
    aliases: ['گرمی', 'سکه گرمی', 'سکه یک گرمی', 'گرمی بانک مرکزی', 'سکه ۱ گرمی'],
  },
};

// ── 3. Silver Specifications ─────────────────────────────────────────────────
export const SILVER_SPECS = {
  ons_silver: {
    id: 'ons_silver',
    name: 'انس نقره جهانی (XAG)',
    category: 'silver',
    badge: 'انس',
    unit: 'دلار',
    weight: TROY_OUNCE_GRAMS,
    formulaText: 'نرخ لحظه‌ای هر تروا انس نقره در بازارهای بین‌المللی',
    aliases: ['انس نقره', 'اونس نقره', 'نقره جهانی', 'XAG', 'xag'],
  },
  silver_gram: {
    id: 'silver_gram',
    name: 'نقره خام ۹۹۹ (گرم)',
    category: 'silver',
    badge: 'نقره',
    unit: 'گرم',
    weight: 1.0,
    formulaText: '(انس نقره ÷ ۳۱.۱۰۳۵) × دلار',
    aliases: ['نقره', 'نقره خام', 'نقره ۹۹۹', 'نقره 999', 'گرم نقره', 'نقره ساچمه'],
  },
  silver_925: {
    id: 'silver_925',
    name: 'نقره استرلینگ ۹۲۵ (گرم)',
    category: 'silver',
    badge: 'نقره',
    unit: 'گرم',
    weight: 1.0,
    silverRatio: 0.925,
    formulaText: 'هر گرم نقره عیار ۹۲۵',
    aliases: ['نقره ۹۲۵', 'نقره 925', 'نقره استرلینگ', 'استرلینگ', 'زیورآلات نقره'],
  },
};

// ── 4. Prominent World Currencies (Forex) ────────────────────────────────────
export const FOREX_SPECS = [
  { code: 'USD', name: 'دلار', flag: '🇺🇸', symbol: '$', defaultCross: 1.0, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['دلار', 'دلار امریکا', 'دلار آمریکا', 'دلار نقدی', 'دلار سبزه', 'دلار صرافی', 'USD', 'dollar'] },
  { code: 'EUR', name: 'یورو', flag: '🇪🇺', symbol: '€', defaultCross: 1.082, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['یورو', 'یورو اروپا', 'EUR', 'euro'] },
  { code: 'GBP', name: 'پوند انگلیس', flag: '🇬🇧', symbol: '£', defaultCross: 1.294, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['پوند', 'پوند انگلیس', 'پوند بریتانیا', 'GBP', 'pound'] },
  { code: 'AED', name: 'درهم امارات', flag: '🇦🇪', symbol: 'د.إ', defaultCross: 0.2723, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['درهم', 'درهم امارات', 'درهم دبی', 'AED', 'dirham'] },
  { code: 'TRY', name: 'لیر ترکیه', flag: '🇹🇷', symbol: '₺', defaultCross: 0.0206, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['لیر', 'لیر ترکیه', 'TRY', 'lira'] },
  { code: 'CHF', name: 'فرانک سوئیس', flag: '🇨🇭', symbol: 'CHF', defaultCross: 1.135, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['فرانک', 'فرانک سوئیس', 'CHF', 'franc'] },
  { code: 'CAD', name: 'دلار کانادا', flag: '🇨🇦', symbol: 'CA$', defaultCross: 0.724, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['دلار کانادا', 'CAD', 'cad'] },
  { code: 'AUD', name: 'دلار استرالیا', flag: '🇦🇺', symbol: 'AU$', defaultCross: 0.655, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['دلار استرالیا', 'AUD', 'aud'] },
  { code: 'CNY', name: 'یوان چین', flag: '🇨🇳', symbol: '¥', defaultCross: 0.138, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['یوان', 'یوان چین', 'CNY', 'yuan'] },
  { code: 'JPY', name: 'ین ژاپن', flag: '🇯🇵', symbol: '¥', defaultCross: 0.0066, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['ین', 'ین ژاپن', 'JPY', 'yen'] },
  { code: 'SAR', name: 'ریال عربستان', flag: '🇸🇦', symbol: '﷼', defaultCross: 0.266, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['ریال عربستان', 'SAR', 'sar'] },
  { code: 'QAR', name: 'ریال قطر', flag: '🇶🇦', symbol: '﷼', defaultCross: 0.274, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['ریال قطر', 'QAR', 'qar'] },
  { code: 'KWD', name: 'دینار کویت', flag: '🇰🇼', symbol: 'د.ك', defaultCross: 3.25, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['دینار کویت', 'KWD', 'kwd'] },
  { code: 'OMR', name: 'ریال عمان', flag: '🇴🇲', symbol: '﷼', defaultCross: 2.60, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['ریال عمان', 'OMR', 'omr'] },
  { code: 'BHD', name: 'دینار بحرین', flag: '🇧🇭', symbol: '.د.ب', defaultCross: 2.65, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['دینار بحرین', 'BHD', 'bhd'] },
  { code: 'IQD', name: 'دینار عراق', flag: '🇮🇶', symbol: 'ع.د', defaultCross: 0.00076, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['دینار عراق', 'دینار', 'IQD', 'iqd'] },
  { code: 'RUB', name: 'روبل روسیه', flag: '🇷🇺', symbol: '₽', defaultCross: 0.0108, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['روبل', 'روبل روسیه', 'RUB', 'ruble'] },
  { code: 'AFN', name: 'افغانی افغانستان', flag: '🇦🇫', symbol: '؋', defaultCross: 0.0145, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['افغانی', 'افغانی افغانستان', 'AFN', 'afn'] },
  { code: 'AZN', name: 'منات آذربایجان', flag: '🇦🇿', symbol: '₼', defaultCross: 0.588, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['منات', 'منات آذربایجان', 'AZN', 'azn'] },
  { code: 'INR', name: 'روپیه هند', flag: '🇮🇳', symbol: '₹', defaultCross: 0.0118, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['روپیه', 'روپیه هند', 'INR', 'rupee'] },
  { code: 'PKR', name: 'روپیه پاکستان', flag: '🇵🇰', symbol: '₨', defaultCross: 0.0036, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['روپیه پاکستان', 'PKR'] },
  { code: 'SEK', name: 'کرون سوئد', flag: '🇸🇪', symbol: 'kr', defaultCross: 0.093, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['کرون سوئد', 'SEK', 'sek'] },
  { code: 'NOK', name: 'کرون نروژ', flag: '🇳🇴', symbol: 'kr', defaultCross: 0.091, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['کرون نروژ', 'NOK', 'nok'] },
  { code: 'DKK', name: 'کرون دانمارک', flag: '🇩🇰', symbol: 'kr', defaultCross: 0.145, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['کرون دانمارک', 'DKK'] },
  { code: 'SGD', name: 'دلار سنگاپور', flag: '🇸🇬', symbol: 'S$', defaultCross: 0.75, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['دلار سنگاپور', 'SGD', 'sgd'] },
  { code: 'HKD', name: 'دلار هنگ‌کنگ', flag: '🇭🇰', symbol: 'HK$', defaultCross: 0.128, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['دلار هنگ‌کنگ', 'دلار هنگ کنگ', 'HKD'] },
  { code: 'KRW', name: 'وون کره جنوبی', flag: '🇰🇷', symbol: '₩', defaultCross: 0.00072, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['وون', 'وون کره جنوبی', 'KRW', 'krw'] },
  { code: 'THB', name: 'بات تایلند', flag: '🇹🇭', symbol: '฿', defaultCross: 0.029, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['بات تایلند', 'بات', 'THB'] },
  { code: 'MYR', name: 'رینگیت مالزی', flag: '🇲🇾', symbol: 'RM', defaultCross: 0.224, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['رینگیت مالزی', 'رینگیت', 'MYR'] },
  { code: 'NZD', name: 'دلار نیوزیلند', flag: '🇳🇿', symbol: 'NZ$', defaultCross: 0.59, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['دلار نیوزیلند', 'NZD'] },
  { code: 'BRL', name: 'رئال برزیل', flag: '🇧🇷', symbol: 'R$', defaultCross: 0.178, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['رئال برزیل', 'BRL', 'brl'] },
  { code: 'ZAR', name: 'رند آفریقای جنوبی', flag: '🇿🇦', symbol: 'R', defaultCross: 0.055, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['رند آفریقای جنوبی', 'رند', 'ZAR'] },
  { code: 'GEL', name: 'لاری گرجستان', flag: '🇬🇪', symbol: '₾', defaultCross: 0.368, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['لاری گرجستان', 'لاری', 'GEL'] },
  { code: 'AMD', name: 'درام ارمنستان', flag: '🇦🇲', symbol: '֏', defaultCross: 0.0025, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['درام ارمنستان', 'درام', 'AMD'] },
  { code: 'TMT', name: 'منات ترکمنستان', flag: '🇹🇲', symbol: 'T', defaultCross: 0.285, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['منات ترکمنستان', 'TMT'] },
  { code: 'TJS', name: 'سامانی تاجیکستان', flag: '🇹🇯', symbol: 'SM', defaultCross: 0.092, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['سامانی تاجیکستان', 'سامانی', 'TJS'] },
  { code: 'KZT', name: 'تنگه قزاقستان', flag: '🇰🇿', symbol: '₸', defaultCross: 0.0021, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['تنگه قزاقستان', 'تنگه', 'KZT'] },
  { code: 'UZS', name: 'سوم ازبکستان', flag: '🇺🇿', symbol: "so'm", defaultCross: 0.000078, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['سوم ازبکستان', 'سوم', 'UZS'] },
  { code: 'EGP', name: 'پوند مصر', flag: '🇪🇬', symbol: 'E£', defaultCross: 0.02, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['پوند مصر', 'EGP'] },
  { code: 'SYP', name: 'لیر سوریه', flag: '🇸🇾', symbol: 'LS', defaultCross: 0.000077, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['لیر سوریه', 'SYP'] },
  { code: 'LBP', name: 'لیر لبنان', flag: '🇱🇧', symbol: 'L£', defaultCross: 0.000011, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['لیر لبنان', 'LBP'] },
  { code: 'JOD', name: 'دینار اردن', flag: '🇯🇴', symbol: 'JD', defaultCross: 1.41, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['دینار اردن', 'JOD'] },
  { code: 'IDR', name: 'روپیه اندونزی', flag: '🇮🇩', symbol: 'Rp', defaultCross: 0.000062, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['روپیه اندونزی', 'IDR'] },
  { code: 'PHP', name: 'پزو فیلیپین', flag: '🇵🇭', symbol: '₱', defaultCross: 0.017, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['پزو فیلیپین', 'PHP'] },
  { code: 'VND', name: 'دانگ ویتنام', flag: '🇻🇳', symbol: '₫', defaultCross: 0.000039, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['دانگ ویتنام', 'دانگ', 'VND'] },
  { code: 'MXN', name: 'پزو مکزیک', flag: '🇲🇽', symbol: '$', defaultCross: 0.051, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['پزو مکزیک', 'MXN'] },
  { code: 'PLN', name: 'زلوتی لهستان', flag: '🇵🇱', symbol: 'zł', defaultCross: 0.255, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['زلوتی لهستان', 'زلوتی', 'PLN'] },
  { code: 'CZK', name: 'کرونا چک', flag: '🇨🇿', symbol: 'Kč', defaultCross: 0.043, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['کرونا چک', 'CZK'] },
  { code: 'HUF', name: 'فورینت مجارستان', flag: '🇭🇺', symbol: 'Ft', defaultCross: 0.0027, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['فورینت مجارستان', 'فورینت', 'HUF'] },
  { code: 'ILS', name: 'شکل اسرائیل', flag: '🇮🇱', symbol: '₪', defaultCross: 0.27, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['شکل اسرائیل', 'ILS'] },
  { code: 'CLP', name: 'پزو شیلی', flag: '🇨🇱', symbol: '$', defaultCross: 0.00105, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['پزو شیلی', 'CLP'] },
  { code: 'COP', name: 'پزو کلمبیا', flag: '🇨🇴', symbol: '$', defaultCross: 0.00024, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['پزو کلمبیا', 'COP'] },
  { code: 'PEN', name: 'سول پرو', flag: '🇵🇪', symbol: 'S/.', defaultCross: 0.266, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['سول پرو', 'PEN'] },
  { code: 'ARS', name: 'پزو آرژانتین', flag: '🇦🇷', symbol: '$', defaultCross: 0.00102, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['پزو آرژانتین', 'ARS'] },
  { code: 'BGN', name: 'لو بلغارستان', flag: '🇧🇬', symbol: 'лв', defaultCross: 0.55, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['لو بلغارستان', 'BGN'] },
  { code: 'RON', name: 'لئو رومانی', flag: '🇷🇴', symbol: 'lei', defaultCross: 0.218, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['لئو رومانی', 'RON'] },
  { code: 'ISK', name: 'کرون ایسلند', flag: '🇮🇸', symbol: 'kr', defaultCross: 0.0073, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['کرون ایسلند', 'ISK'] },
  { code: 'HRK', name: 'کونا کرواسی', flag: '🇭🇷', symbol: 'kn', defaultCross: 0.143, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['کونا کرواسی', 'HRK'] },
  { code: 'RSD', name: 'دینار صربستان', flag: '🇷🇸', symbol: 'din', defaultCross: 0.0092, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['دینار صربستان', 'RSD'] },
  { code: 'LYD', name: 'دینار لیبی', flag: '🇱🇾', symbol: 'LD', defaultCross: 0.207, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['دینار لیبی', 'LYD'] },
  { code: 'TND', name: 'دینار تونس', flag: '🇹🇳', symbol: 'DT', defaultCross: 0.323, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['دینار تونس', 'TND'] },
  { code: 'MAD', name: 'درهم مراکش', flag: '🇲🇦', symbol: 'MAD', defaultCross: 0.101, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['درهم مراکش', 'MAD'] },
  { code: 'DZD', name: 'دینار الجزایر', flag: '🇩🇿', symbol: 'DA', defaultCross: 0.0074, category: 'currency', badge: 'ارز', unit: 'تومان', aliases: ['دینار الجزایر', 'DZD'] },
];

export const FOREX_DICT = Object.fromEntries(FOREX_SPECS.map(c => [c.code, c]));

// ── 5. Crypto Specifications ────────────────────────────────────────────────
export const CRYPTO_SPECS = {
  USDT: {
    id: 'USDT',
    code: 'USDT',
    name: 'تتر',
    symbol: 'USDT',
    unit: 'تتر',
    category: 'crypto',
    badge: 'رمزارز',
    formulaText: 'استیبل‌کوین معادل ۱ دلار آمریکا',
    aliases: ['تتر', 'دلار دیجیتال', 'تتر دلار', 'USDT', 'tether', 'usdt'],
  },
  BTC: {
    id: 'BTC',
    code: 'BTC',
    name: 'بیت‌کوین',
    symbol: 'BTC',
    unit: 'عدد',
    category: 'crypto',
    badge: 'رمزارز',
    formulaText: 'پادشاه رمزارزها',
    aliases: ['بیت کوین', 'بیتکوین', 'بیت‌کوین', 'BTC', 'bitcoin', 'btc'],
  },
  ETH: {
    id: 'ETH',
    code: 'ETH',
    name: 'اتریوم',
    symbol: 'ETH',
    unit: 'عدد',
    category: 'crypto',
    badge: 'رمزارز',
    formulaText: 'رمزارز شبکه اتریوم',
    aliases: ['اتریوم', 'اتر', 'ETH', 'ethereum', 'eth'],
  },
};

// ── 6. Master Canonical Asset Registry ──────────────────────────────────────
export const CANONICAL_ASSET_REGISTRY = {};

// Register Gold
Object.values(GOLD_SPECS).forEach(item => {
  CANONICAL_ASSET_REGISTRY[item.id] = item;
  CANONICAL_ASSET_REGISTRY[item.id.toLowerCase()] = item;
});

// Register Coins
Object.values(COIN_SPECS).forEach(item => {
  CANONICAL_ASSET_REGISTRY[item.id] = item;
  CANONICAL_ASSET_REGISTRY[item.id.toLowerCase()] = item;
});

// Register Silver
Object.values(SILVER_SPECS).forEach(item => {
  CANONICAL_ASSET_REGISTRY[item.id] = item;
  CANONICAL_ASSET_REGISTRY[item.id.toLowerCase()] = item;
});

// Register Forex
FOREX_SPECS.forEach(item => {
  const spec = {
    id: item.code,
    code: item.code,
    name: item.name,
    flag: item.flag,
    symbol: item.symbol,
    unit: 'تومان',
    category: 'currency',
    badge: 'ارز',
    defaultCross: item.defaultCross,
    aliases: item.aliases || [],
  };
  CANONICAL_ASSET_REGISTRY[item.code] = spec;
  CANONICAL_ASSET_REGISTRY[item.code.toLowerCase()] = spec;
});

// Register Crypto
Object.values(CRYPTO_SPECS).forEach(item => {
  CANONICAL_ASSET_REGISTRY[item.id] = item;
  CANONICAL_ASSET_REGISTRY[item.id.toLowerCase()] = item;
});

// Standard Aliases for historical / alternate identifiers
const ALIAS_MAP = {
  // Gold Aliases
  gold_melted: 'melted_gold',
  gold_ounce: 'ons_gold',
  // Coin Aliases
  full_new: 'full_coin',
  half: 'half_coin',
  quarter: 'quarter_coin',
  bank_gram: 'gerami_coin',
  gram: 'gerami_coin',
  // Silver Aliases
  silver_ounce: 'ons_silver',
  silver_999: 'silver_gram',
  // Currency / Forex Aliases
  usd: 'USD',
  usd_toman: 'USD',
};

for (const [alias, canonicalId] of Object.entries(ALIAS_MAP)) {
  const target = CANONICAL_ASSET_REGISTRY[canonicalId];
  if (target) {
    CANONICAL_ASSET_REGISTRY[alias] = target;
    CANONICAL_ASSET_REGISTRY[alias.toLowerCase()] = target;
  }
}

// ── 7. Canonical Name & Metadata Resolution Helpers ─────────────────────────

/**
 * Retrieve the full canonical asset specification object
 * @param {string} assetId
 * @returns {object|null}
 */
export function getCanonicalAssetSpec(assetId) {
  if (!assetId) return null;
  const clean = String(assetId).replace(/^src_def_/, '').replace(/^derived_/, '').trim();
  return (
    CANONICAL_ASSET_REGISTRY[clean] ||
    CANONICAL_ASSET_REGISTRY[clean.toLowerCase()] ||
    CANONICAL_ASSET_REGISTRY[clean.toUpperCase()] ||
    null
  );
}

/**
 * Retrieve the canonical Persian display name of an asset by ID
 * @param {string} assetId
 * @param {string} fallbackName
 * @returns {string}
 */
export function getCanonicalAssetName(assetId, fallbackName = '') {
  const spec = getCanonicalAssetSpec(assetId);
  if (spec && spec.name) return spec.name;
  return fallbackName || assetId || '';
}

/**
 * Retrieve the canonical unit of an asset by ID
 * @param {string} assetId
 * @param {string} fallbackUnit
 * @returns {string}
 */
export function getCanonicalAssetUnit(assetId, fallbackUnit = 'واحد') {
  const spec = getCanonicalAssetSpec(assetId);
  if (spec && spec.unit) return spec.unit;
  return fallbackUnit;
}

/**
 * Retrieve the canonical category of an asset by ID
 * @param {string} assetId
 * @param {string} fallbackCategory
 * @returns {string}
 */
export function getCanonicalAssetCategory(assetId, fallbackCategory = 'custom') {
  const spec = getCanonicalAssetSpec(assetId);
  if (spec && spec.category) return spec.category;
  return fallbackCategory;
}

/**
 * Retrieve the canonical badge text of an asset by ID
 * @param {string} assetId
 * @param {string} fallbackBadge
 * @returns {string}
 */
export function getCanonicalAssetBadge(assetId, fallbackBadge = '') {
  const spec = getCanonicalAssetSpec(assetId);
  if (spec && spec.badge) return spec.badge;
  return fallbackBadge;
}

/**
 * Resolve the standard category key for any holding/asset
 * @param {object|string} item - holding object or assetId
 * @returns {string} - 'gold' | 'coin' | 'silver' | 'currency' | 'crypto' | 'bourse' | 'bourse_fund' | 'custom'
 */
export function resolveItemCategory(item) {
  if (!item) return 'custom';
  if (typeof item === 'string') {
    const clean = item.replace(/^src_def_/, '').replace(/^derived_/, '').trim();
    const spec = getCanonicalAssetSpec(clean);
    if (spec && spec.category) return spec.category;
    if (clean.startsWith('bourse_')) return 'bourse';
    if (clean.startsWith('custom_') || clean === 'custom') return 'custom';
    return 'custom';
  }

  const assetId = String(item.assetId || item.id || '').trim();
  const cleanId = assetId.replace(/^src_def_/, '').replace(/^derived_/, '').trim();
  const assetType = String(item.assetType || item.category || '').trim().toLowerCase();
  const assetName = String(item.assetName || item.name || '').trim();

  // 1. Canonical standard assets (Gold, Coins, Silver, Forex, Crypto) - Always check first!
  const spec = getCanonicalAssetSpec(cleanId);
  if (spec && spec.category) return spec.category;

  // 2. Custom personal asset
  if (assetType === 'custom' || cleanId.startsWith('custom_') || cleanId === 'custom') {
    return 'custom';
  }

  // 3. Explicit Bourse Stocks & Funds
  const isFund = Boolean(
    item.isFund ||
    item.raw?.isFund ||
    assetType === 'bourse_fund' ||
    (assetName.includes('صندوق') && (cleanId.startsWith('bourse_') || assetType === 'bourse' || !assetType))
  );
  const isBourse = (
    cleanId.startsWith('bourse_') ||
    assetType === 'bourse' ||
    assetType === 'bourse_fund' ||
    Boolean(item.isFund) ||
    Boolean(item.raw?.isFund) ||
    (assetName.includes('صندوق') && !cleanId.startsWith('custom_'))
  );
  if (isBourse) {
    return isFund ? 'bourse_fund' : 'bourse';
  }

  if (['gold', 'coin', 'silver', 'currency', 'crypto', 'bourse', 'bourse_fund'].includes(assetType)) {
    return assetType;
  }

  return 'custom';
}

// ── Master Portfolio Category Definitions ───────────────────────────────────
export const PORTFOLIO_CATEGORIES = [
  {
    key: 'gold',
    name: 'طلا و آب‌شده',
    badge: 'طلا',
    iconName: 'Award',
    order: 1,
    match: (item) => resolveItemCategory(item) === 'gold',
  },
  {
    key: 'coin',
    name: 'سکه‌های بهار آزادی',
    badge: 'سکه',
    iconName: 'Coins',
    order: 2,
    match: (item) => resolveItemCategory(item) === 'coin',
  },
  {
    key: 'silver',
    name: 'نقره و مسکوکات',
    badge: 'نقره',
    iconName: 'Disc',
    order: 3,
    match: (item) => resolveItemCategory(item) === 'silver',
  },
  {
    key: 'currency',
    name: 'ارزهای خارجی',
    badge: 'ارز',
    iconName: 'Banknote',
    order: 4,
    match: (item) => resolveItemCategory(item) === 'currency',
  },
  {
    key: 'crypto',
    name: 'رمزارزها',
    badge: 'رمزارز',
    iconName: 'Zap',
    order: 5,
    match: (item) => resolveItemCategory(item) === 'crypto',
  },
  {
    key: 'bourse',
    name: 'بورس اوراق بهادار تهران (سهام)',
    badge: 'سهام بورس',
    iconName: 'TrendingUp',
    order: 6,
    match: (item) => resolveItemCategory(item) === 'bourse',
  },
  {
    key: 'bourse_fund',
    name: 'بورس اوراق بهادار تهران (صندوق)',
    badge: 'صندوق بورس',
    iconName: 'Layers',
    order: 7,
    match: (item) => resolveItemCategory(item) === 'bourse_fund',
  },
  {
    key: 'custom',
    name: 'دارایی‌های شخصی و سفارشی',
    badge: 'سفارشی',
    iconName: 'Sparkles',
    order: 8,
    match: (item) => resolveItemCategory(item) === 'custom',
  },
];

export const CATEGORY_DEFINITIONS = PORTFOLIO_CATEGORIES;

export const PORTFOLIO_CATEGORY_DICT = Object.fromEntries(
  PORTFOLIO_CATEGORIES.map((c) => [c.key, c])
);

export function getCategoryLabel(categoryKey, fallback = '') {
  return PORTFOLIO_CATEGORY_DICT[categoryKey]?.name || fallback || categoryKey || '';
}

export function getCategoryBadge(categoryKey, fallback = '') {
  return PORTFOLIO_CATEGORY_DICT[categoryKey]?.badge || fallback || categoryKey || '';
}

// ── 8. Standard Mathematical Calculation Helpers ─────────────────────────────

/**
 * Calculate pure 24k gold gram value in Tomans
 * @param {number} goldUsd - Spot price of 1 troy ounce of gold in USD
 * @param {number} usdToman - USD price in Tomans
 * @returns {number}
 */
export function calculateGold24kGram(goldUsd, usdToman) {
  if (!goldUsd || !usdToman || goldUsd <= 0 || usdToman <= 0) return 0;
  return (goldUsd / TROY_OUNCE_GRAMS) * usdToman;
}

/**
 * Calculate intrinsic value in Tomans for a given gold or coin spec
 * @param {object} spec - Specification object (GOLD_SPECS or COIN_SPECS)
 * @param {number} goldUsd - Gold spot price in USD
 * @param {number} usdToman - USD price in Tomans
 * @returns {number}
 */
export function calculateIntrinsicValue(spec, goldUsd, usdToman) {
  const gold24kGram = calculateGold24kGram(goldUsd, usdToman);
  if (gold24kGram <= 0 || !spec) return 0;
  const weight = spec.gold24kWeight || spec.weight || 0;
  return Math.round(gold24kGram * weight);
}

/**
 * Calculate Toman price for a Forex currency based on its USD cross-rate
 * @param {number} usdCrossRate - Currency value relative to 1 USD
 * @param {number} usdToman - USD price in Tomans
 * @returns {number}
 */
export function calculateForexTomanPrice(usdCrossRate, usdToman) {
  const cross = Number(usdCrossRate || 0);
  const usd = Number(usdToman || 0);
  if (cross <= 0 || usd <= 0) return 0;
  return Math.round(cross * usd);
}

/**
 * Normalize raw forex quote to USD cross rate (value of 1 unit of foreign currency in USD)
 * @param {string} priceType - e.g. 'eur', 'try', 'aed', 'gbp', 'chf', 'cad', 'aud', 'cny'
 * @param {number|string} rawVal
 * @returns {number}
 */
export function normalizeForexToUsdCrossRate(priceType, rawVal) {
  const num = Number(rawVal);
  if (!num || num <= 0) return 0;

  const p = (priceType || '').toLowerCase();
  // Currencies typically stronger than USD (EUR, GBP, CHF, KWD, BHD, OMR, JOD)
  if (['eur', 'gbp', 'chf', 'kwd', 'bhd', 'omr', 'jod', 'kyd', 'gip'].includes(p)) {
    return num < 1 ? parseFloat((1 / num).toFixed(5)) : parseFloat(num.toFixed(5));
  }
  // All other currencies (TRY, AED, CAD, AUD, CNY, etc.)
  if (num > 1) {
    return parseFloat((1 / num).toFixed(5));
  }
  return parseFloat(num.toFixed(5));
}

/**
 * Calculate pure 999 silver gram value in Tomans
 * @param {number} silverUsd - Spot price of 1 troy ounce of silver in USD
 * @param {number} usdToman - USD price in Tomans
 * @returns {number}
 */
export function calculateSilverGram(silverUsd, usdToman) {
  if (!silverUsd || !usdToman || silverUsd <= 0 || usdToman <= 0) return 0;
  return (silverUsd / TROY_OUNCE_GRAMS) * usdToman;
}

/**
 * Calculate sterling silver 925 gram value in Tomans
 * @param {number} silverUsd
 * @param {number} usdToman
 * @returns {number}
 */
export function calculateSilver925(silverUsd, usdToman) {
  return calculateSilverGram(silverUsd, usdToman) * 0.925;
}

/**
 * Calculate silver ounce value in Tomans
 * @param {number} silverUsd
 * @param {number} usdToman
 * @returns {number}
 */
export function calculateSilverOunce(silverUsd, usdToman) {
  if (!silverUsd || !usdToman || silverUsd <= 0 || usdToman <= 0) return 0;
  return silverUsd * usdToman;
}

/**
 * Calculate bubble amount and percentage for any market price vs intrinsic value
 * @param {number} marketPrice
 * @param {number} intrinsicPrice
 * @returns {{ bubble: number|null, bubblePct: number|null }}
 */
export function calculateBubble(marketPrice, intrinsicPrice) {
  const market = Number(marketPrice) || 0;
  const intrinsic = Number(intrinsicPrice) || 0;
  if (!market || !intrinsic || intrinsic <= 0) {
    return { bubble: null, bubblePct: null };
  }
  const bubble = market - intrinsic;
  const bubblePct = parseFloat(((bubble / intrinsic) * 100).toFixed(1));
  return { bubble: Math.round(bubble), bubblePct };
}

// ── 9. Dynamic Proxies for Single Source of Truth Forex & Currency Metadata ──

/**
 * Dynamic Proxy providing localized Persian names for world forex currencies
 * eliminating hardcoded dictionaries anywhere in the app.
 */
export const WORLD_FOREX_NAMES = new Proxy({}, {
  get(target, prop) {
    if (typeof prop !== 'string') return target[prop];
    return getCanonicalAssetName(prop, prop);
  },
  has(target, prop) {
    if (typeof prop !== 'string') return false;
    return Boolean(getCanonicalAssetSpec(prop));
  },
});

/**
 * Dynamic Proxy providing complete currency metadata (name, flag, symbol)
 * for all world currencies directly resolved from canonical specifications.
 */
export const CURRENCY_METADATA_MAP = new Proxy({}, {
  get(target, prop) {
    if (typeof prop !== 'string') return target[prop];
    const spec = getCanonicalAssetSpec(prop);
    if (spec) {
      return {
        name: spec.name,
        flag: spec.flag || '🌐',
        symbol: spec.symbol || prop,
      };
    }
    return { name: prop, flag: '🌐', symbol: prop };
  },
  has(target, prop) {
    if (typeof prop !== 'string') return false;
    return Boolean(getCanonicalAssetSpec(prop));
  },
});


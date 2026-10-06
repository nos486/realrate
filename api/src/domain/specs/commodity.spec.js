/**
 * commodity.spec.js — World commodities priced in dollars: the precious metals other than gold and
 * silver, and crude oil. Their sources quote dollars (`quote: "usd"` in sources.config.js), so the
 * price book gives each `currency: "usd"` and its dollar price (`priceUsd`), and its toman price
 * at the book's dollar. `unit` is what one unit is (an ounce, a barrel).
 */

import { TROY_OUNCE_GRAMS } from './gold.spec.js';

export const COMMODITY_SPECS = {
  ons_platinum: {
    id: 'ons_platinum',
    code: 'XPT',
    symbol: 'XPT',
    flag: '⚪',
    name: 'انس پلاتین جهانی',
    category: 'commodity',
    badge: 'انس',
    unit: 'اونس',
    weight: TROY_OUNCE_GRAMS,
    formulaText: 'نرخ لحظه‌ای هر تروا انس پلاتین در بازارهای جهانی (دلار)',
    aliases: ['پلاتین', 'انس پلاتین', 'اونس پلاتین', 'XPT', 'platinum'],
  },
  ons_palladium: {
    id: 'ons_palladium',
    code: 'XPD',
    symbol: 'XPD',
    flag: '⚪',
    name: 'انس پالادیوم جهانی',
    category: 'commodity',
    badge: 'انس',
    unit: 'اونس',
    weight: TROY_OUNCE_GRAMS,
    formulaText: 'نرخ لحظه‌ای هر تروا انس پالادیوم در بازارهای جهانی (دلار)',
    aliases: ['پالادیوم', 'انس پالادیوم', 'اونس پالادیوم', 'XPD', 'palladium'],
  },
  oil_brent: {
    id: 'oil_brent',
    code: 'BRENT',
    symbol: 'BRENT',
    flag: '🛢️',
    name: 'نفت برنت',
    category: 'commodity',
    badge: 'نفت',
    unit: 'بشکه',
    formulaText: 'قیمت هر بشکه نفت خام برنت (قرارداد آتی نزدیک، دلار)',
    aliases: ['نفت', 'نفت برنت', 'برنت', 'نفت خام', 'brent', 'BRENT', 'oil'],
  },
  oil_wti: {
    id: 'oil_wti',
    code: 'WTI',
    symbol: 'WTI',
    flag: '🛢️',
    name: 'نفت WTI (وست تگزاس)',
    category: 'commodity',
    badge: 'نفت',
    unit: 'بشکه',
    formulaText: 'قیمت هر بشکه نفت خام وست تگزاس اینترمدیت (قرارداد آتی نزدیک، دلار)',
    aliases: ['نفت آمریکا', 'وست تگزاس', 'نفت تگزاس', 'WTI', 'wti'],
  },
};

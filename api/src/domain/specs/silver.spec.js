/**
 * silver.spec.js — Silver Domain Specifications
 */

import { TROY_OUNCE_GRAMS } from './gold.spec.js';

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

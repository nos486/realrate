/**
 * coin.spec.js — Iranian Bahar Azadi Coin Domain Specifications
 */

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

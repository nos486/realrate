/**
 * bubble.spec.js — Coin bubbles as market indicators: how much a coin trades above the value of
 * its gold, in tomans per coin
 *
 * Computed by the price book, never taken from a feed: the coin's market price less its gold value
 * (its intrinsic value, from the world ounce and the dollar — priceBook.js), the same bubble the
 * coin's own card shows in percent. Not assets: their category (`bubble`) is not holdable, so they
 * stay out of the portfolio and its search, and show on cards and charts only. `bubbleOf` names
 * the coin they belong to. A coin given a bubble here gets its standard price from the bubble's
 * mean over the last year (priceAverages.js).
 */

export const BUBBLE_SPECS = {
  bubble_full_coin: {
    id: 'bubble_full_coin',
    name: 'حباب سکه امامی',
    category: 'bubble',
    badge: 'حباب',
    unit: 'عدد',
    bubbleOf: 'full_coin',
    formulaText: 'قیمت بازار سکه امامی منهای ارزش طلای آن (انس جهانی × دلار)',
    aliases: ['حباب سکه', 'حباب سکه امامی', 'حباب سکه تمام', 'حباب امامی'],
  },
  bubble_half_coin: {
    id: 'bubble_half_coin',
    name: 'حباب نیم سکه',
    category: 'bubble',
    badge: 'حباب',
    unit: 'عدد',
    bubbleOf: 'half_coin',
    formulaText: 'قیمت بازار نیم سکه منهای ارزش طلای آن (انس جهانی × دلار)',
    aliases: ['حباب نیم سکه', 'حباب نیم'],
  },
  bubble_quarter_coin: {
    id: 'bubble_quarter_coin',
    name: 'حباب ربع سکه',
    category: 'bubble',
    badge: 'حباب',
    unit: 'عدد',
    bubbleOf: 'quarter_coin',
    formulaText: 'قیمت بازار ربع سکه منهای ارزش طلای آن (انس جهانی × دلار)',
    aliases: ['حباب ربع سکه', 'حباب ربع'],
  },
  bubble_gerami_coin: {
    id: 'bubble_gerami_coin',
    name: 'حباب سکه گرمی',
    category: 'bubble',
    badge: 'حباب',
    unit: 'عدد',
    bubbleOf: 'gerami_coin',
    formulaText: 'قیمت بازار سکه گرمی منهای ارزش طلای آن (انس جهانی × دلار)',
    aliases: ['حباب سکه گرمی', 'حباب گرمی'],
  },
};

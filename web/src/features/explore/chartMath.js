/**
 * chartMath.js — The numbers behind the explorer's price chart: moving averages and the period's
 * statistics (change, high, low, average). Pure, no DOM.
 * Candles are [open, high, low, close] per day, oldest first.
 */

/**
 * Simple moving average of the closes
 * @param {number[][]} candles
 * @param {number} period - days
 * @returns {Array<number|null>} one value per candle; null until `period` closes exist
 */
export function movingAverage(candles, period) {
  const out = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i += 1) {
    sum += candles[i][3];
    if (i >= period) sum -= candles[i - period][3];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

/**
 * The period at a glance
 * @param {number[][]} candles
 * @returns {{ changePct: number|null, high: number, highIndex: number, low: number, lowIndex: number,
 *   average: number, rangePct: number|null }|null} null without candles. changePct: first open →
 *   last close; rangePct: the low → high spread
 */
export function periodStats(candles) {
  if (!candles?.length) return null;
  let high = -Infinity;
  let low = Infinity;
  let highIndex = 0;
  let lowIndex = 0;
  let closeSum = 0;
  candles.forEach(([, h, l, c], i) => {
    if (h > high) { high = h; highIndex = i; }
    if (l < low) { low = l; lowIndex = i; }
    closeSum += c;
  });
  const first = candles[0][0];
  const last = candles[candles.length - 1][3];
  return {
    changePct: first > 0 ? ((last - first) / first) * 100 : null,
    high,
    highIndex,
    low,
    lowIndex,
    average: closeSum / candles.length,
    rangePct: low > 0 ? ((high - low) / low) * 100 : null,
  };
}

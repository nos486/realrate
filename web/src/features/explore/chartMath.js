/**
 * chartMath.js — The numbers behind the explorer's price chart: moving averages, the period's
 * statistics (change, high, low, average) and round axis ticks. Pure, no DOM.
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

/**
 * Round tick values inside [min, max] (1, 2 or 5 times a power of ten apart)
 * @param {number} min
 * @param {number} max
 * @param {number} [count] - about how many
 * @returns {number[]}
 */
export function niceTicks(min, max, count = 5) {
  const span = max - min;
  if (!(span > 0) || !Number.isFinite(span)) return Number.isFinite(min) ? [min] : [];
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) || raw;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) {
    ticks.push(Number(v.toPrecision(12)));
  }
  return ticks;
}

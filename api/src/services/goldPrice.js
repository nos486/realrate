import { getLatestMarketRates } from "./priceSources.js";

/**
 * Fetch the live spot gold price in USD (XAU/USD)
 * Reads directly from unified latest market rates (sub-2ms)
 * @param {object} env
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<number>} price per troy ounce in USD
 */
export async function fetchGlobalSpotGold(env, forceRefresh = false) {
  try {
    const rates = await getLatestMarketRates(env);
    if (rates?.ons_gold?.price && Number(rates.ons_gold.price) > 0) {
      return Number(rates.ons_gold.price);
    }
  } catch (e) {
    console.error("Error reading spot gold from unified rates:", e);
  }

  return 2890;
}

/**
 * Fetch the live spot silver price in USD (XAG/USD)
 * Reads directly from unified latest market rates (sub-2ms)
 * @param {object} env
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<number>} price per troy ounce in USD
 */
export async function fetchGlobalSpotSilver(env, forceRefresh = false) {
  try {
    const rates = await getLatestMarketRates(env);
    if (rates?.ons_silver?.price && Number(rates.ons_silver.price) > 0) {
      return Number(rates.ons_silver.price);
    }
  } catch (e) {
    console.error("Error reading spot silver from unified rates:", e);
  }

  return 33.5;
}



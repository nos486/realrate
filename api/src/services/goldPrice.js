import { getLatestMarketRates } from "./priceSources.js";

/**
 * Fetch the live spot gold price in USD (XAU/USD)
 * Reads directly from KV / unified sources system (sub-5ms)
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

  if (env && env.REALRATE_KV) {
    try {
      const kvVal = await env.REALRATE_KV.get("spot_gold_usd", "json");
      if (kvVal && kvVal.price) return Number(kvVal.price);
    } catch (e) {}
  }

  return 2890;
}

/**
 * Fetch the live spot silver price in USD (XAG/USD)
 * Reads directly from KV / unified sources system (sub-5ms)
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

  if (env && env.REALRATE_KV) {
    try {
      const kvVal = await env.REALRATE_KV.get("spot_silver_usd", "json");
      if (kvVal && kvVal.price) return Number(kvVal.price);
    } catch (e) {}
  }

  return 33.5;
}



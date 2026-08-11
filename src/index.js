/**
 * RealRate — Iranian Gold & Currency Price Calculator & Telegram Arbitrage Engine
 * Cloudflare Worker Engine
 */

// In-memory fallback cache if KV is not bound
let inMemoryCache = {};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // API Routes
    if (url.pathname === "/api/calculate") {
      return handleCalculate(url, env);
    }

    if (url.pathname === "/api/rates") {
      return handleFetchRates(env);
    }

    if (url.pathname === "/api/telegram") {
      const forceRefresh = url.searchParams.get("force") === "true";
      const tgData = await fetchTelegramPrices(env, forceRefresh);
      return new Response(JSON.stringify(tgData, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // Default route: Serve Web UI
    return new Response(getHTMLContent(env), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
};

/**
 * Fetch Live International Forex Exchange Rates against USD
 */
async function fetchForexRates() {
  const fallback = {
    EUR: 0.915,  // 1 EUR = 1.093 USD
    AED: 3.6725, // 1 AED = 0.2723 USD
    TRY: 33.50,  // 1 TRY = 0.0298 USD
    CNY: 7.18,   // 1 CNY = 0.1392 USD
    GBP: 0.782,  // 1 GBP = 1.278 USD
    CAD: 1.370   // 1 CAD = 0.7299 USD
  };

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (res.ok) {
      const data = await res.json();
      if (data && data.rates) {
        return {
          EUR: data.rates.EUR || fallback.EUR,
          AED: data.rates.AED || fallback.AED,
          TRY: data.rates.TRY || fallback.TRY,
          CNY: data.rates.CNY || fallback.CNY,
          GBP: data.rates.GBP || fallback.GBP,
          CAD: data.rates.CAD || fallback.CAD
        };
      }
    }
  } catch (e) {
    console.error("Forex fetch error:", e);
  }

  return fallback;
}

/**
 * Fetch and parse market prices (https://t.me/s/zarmagoldd)
 * If last check was less than 1 minute (60,000ms) ago, returns cached KV data.
 * Otherwise, fetches fresh market posts and updates Cloudflare KV Storage.
 */
async function fetchTelegramPrices(env, forceRefresh = false) {
  let stored = { ...inMemoryCache };
  const nowMs = Date.now();

  // Read stored prices from Cloudflare KV Storage if bound
  if (env && env.REALRATE_KV) {
    try {
      const kvVal = await env.REALRATE_KV.get("tg_prices", "json");
      if (kvVal) stored = { ...stored, ...kvVal };
    } catch (e) {
      console.error("KV Read Error:", e);
    }
  }

  // Check if cache is still fresh (< 1 minute / 60,000 ms old)
  const lastCheckMs = stored.last_channel_check_time ? new Date(stored.last_channel_check_time).getTime() : 0;
  const isFresh = (nowMs - lastCheckMs) < 60000;

  if (isFresh && !forceRefresh && Object.keys(stored).length > 1) {
    return stored;
  }

  // Cache is older than 1 minute or force refresh requested: Fetch fresh market data
  try {
    const res = await fetch("https://t.me/s/zarmagoldd", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (res.ok) {
      const html = await res.text();
      const parsed = parseTelegramHtml(html);

      // Merge newly parsed items with stored items
      for (const [key, item] of Object.entries(parsed)) {
        if (item && item.price) {
          stored[key] = item;
        }
      }

      stored.last_channel_check_time = new Date().toISOString();
      inMemoryCache = { ...stored };

      // Persist updated prices in Cloudflare KV Storage
      if (env && env.REALRATE_KV) {
        try {
          await env.REALRATE_KV.put("tg_prices", JSON.stringify(stored));
        } catch (e) {
          console.error("KV Write Error:", e);
        }
      }
    }
  } catch (err) {
    console.error("Market fetch error:", err);
  }

  return stored;
}

/**
 * Parse HTML for Gold & Coin Prices
 * Stores the EXACT raw price numbers as Toman without any division
 */
function parseTelegramHtml(html) {
  const result = {};
  const messageBlocks = html.split(/<div class="tgme_widget_message\b/);

  // Iterate messages from newest to oldest
  for (let bIdx = messageBlocks.length - 1; bIdx >= 0; bIdx--) {
    const block = messageBlocks[bIdx];

    const timeMatch = block.match(/<time datetime="([^"]+)"/);
    const datetime = timeMatch ? timeMatch[1] : null;

    const textMatch = block.match(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (!textMatch) continue;

    const rawText = textMatch[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();
    const lines = rawText.split("\n").map(l => l.trim()).filter(Boolean);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 1. Gram 18K Gold (گرم 18 عیار)
      if (!result.gold_18k && (line.includes("گرم 18 عیار") || line.includes("18 عیار") || line.includes("۱۸ عیار"))) {
        const chunk = lines.slice(i, i + 3).join(" ");
        const saleMatch = chunk.match(/فروش:\s*([\d,]+)/);
        if (saleMatch) {
          const rawNum = parseInt(saleMatch[1].replace(/,/g, ""), 10);
          if (rawNum > 0) {
            result.gold_18k = { price: rawNum, datetime, label: "طلا ۱۸ عیار" };
          }
        }
      }

      // 2. Full Coin 86 (سکه تمام 86 / سکه تمام / تمام سکه)
      if (!result.full_coin && (line.includes("سکه تمام 86") || line.includes("سکه تمام") || line.includes("تمام سکه") || line.includes("سکه امامی"))) {
        const chunk = lines.slice(i, i + 3).join(" ");
        const saleMatch = chunk.match(/فروش:\s*([\d,]+)/);
        if (saleMatch) {
          const rawNum = parseInt(saleMatch[1].replace(/,/g, ""), 10);
          if (rawNum > 0) {
            result.full_coin = { price: rawNum, datetime, label: "سکه تمام ۸۶" };
          }
        }
      }

      // 3. Mesghal (آبشده نقد / مثقال)
      if (!result.mesghal && (line.includes("آبشده نقد") || line.includes("آبشده") || line.includes("مثقال"))) {
        const chunk = lines.slice(i, i + 3).join(" ");
        const saleMatch = chunk.match(/فروش:\s*([\d,]+)/);
        if (saleMatch) {
          const rawNum = parseInt(saleMatch[1].replace(/,/g, ""), 10);
          if (rawNum > 0) {
            result.mesghal = { price: rawNum, datetime, label: "مثقال طلا (۱۷ عیار)" };
          }
        }
      }

      // 4. Half Coin (نیم سکه)
      if (!result.half_coin && line.includes("نیم سکه")) {
        const chunk = lines.slice(i, i + 3).join(" ");
        const saleMatch = chunk.match(/فروش:\s*([\d,]+)/);
        if (saleMatch) {
          const rawNum = parseInt(saleMatch[1].replace(/,/g, ""), 10);
          if (rawNum > 0) {
            result.half_coin = { price: rawNum, datetime, label: "نیم سکه بهار آزادی" };
          }
        }
      }

      // 5. Quarter Coin (ربع سکه)
      if (!result.quarter_coin && line.includes("ربع سکه")) {
        const chunk = lines.slice(i, i + 3).join(" ");
        const saleMatch = chunk.match(/فروش:\s*([\d,]+)/);
        if (saleMatch) {
          const rawNum = parseInt(saleMatch[1].replace(/,/g, ""), 10);
          if (rawNum > 0) {
            result.quarter_coin = { price: rawNum, datetime, label: "ربع سکه بهار آزادی" };
          }
        }
      }
    }
  }

  return result;
}

/**
 * Handle Price Calculation & Arbitrage Analysis + World Currency Cross Rates
 */
async function handleCalculate(url, env) {
  const usd_toman_raw = url.searchParams.get("usd_toman");
  const usd_toman = usd_toman_raw ? parseFloat(usd_toman_raw) : null;
  const gold_usd = parseFloat(url.searchParams.get("gold_usd")) || parseFloat(env?.DEFAULT_GOLD_USD || "2450");

  if (!usd_toman || isNaN(usd_toman) || usd_toman <= 0) {
    return new Response(
      JSON.stringify({
        success: false,
        requires_usd: true,
        message: "لطفاً ابتدا قیمت دلار (تومان) را وارد کنید."
      }),
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  // Fetch parallel market gold prices & forex rates
  const [tgPrices, forex] = await Promise.all([
    fetchTelegramPrices(env),
    fetchForexRates()
  ]);

  // Real Intrinsic Gold Calculations
  const gold_24k_gram = (gold_usd / 31.1034768) * usd_toman;
  const gold_18k_gram = gold_24k_gram * 0.75;
  const mesghal_17k = gold_24k_gram * 4.608 * 0.705;

  const full_intrinsic = gold_24k_gram * 7.3197;
  const half_intrinsic = gold_24k_gram * 3.6594;
  const quarter_intrinsic = gold_24k_gram * 1.8297;

  // Gold & Coin Analysis
  function analyzeItem(id, name, intrinsic, tgItem) {
    const market = (tgItem && typeof tgItem.price === "number") ? tgItem.price : null;
    let bubble = null;
    let bubble_pct = null;

    if (market !== null) {
      bubble = market - intrinsic;
      bubble_pct = parseFloat(((bubble / intrinsic) * 100).toFixed(1));
    }

    return {
      id,
      name,
      intrinsic: Math.round(intrinsic),
      market: market ? Math.round(market) : null,
      bubble: bubble !== null ? Math.round(bubble) : null,
      bubble_pct,
      updated_at: tgItem ? tgItem.datetime : null
    };
  }

  const itemsAnalysis = [
    analyzeItem("gold_18k", "طلا ۱۸ عیار", gold_18k_gram, tgPrices.gold_18k),
    analyzeItem("full_coin", "سکه تمام ۸۶", full_intrinsic, tgPrices.full_coin),
    analyzeItem("half_coin", "نیم سکه بهار آزادی", half_intrinsic, tgPrices.half_coin),
    analyzeItem("quarter_coin", "ربع سکه بهار آزادی", quarter_intrinsic, tgPrices.quarter_coin)
  ];

  // Best Purchase Recommendation
  const availableItems = itemsAnalysis.filter(i => i.market !== null && i.bubble_pct !== null);
  let bestItem = null;
  let recommendation = null;

  if (availableItems.length > 0) {
    const sortedByBubble = [...availableItems].sort((a, b) => a.bubble_pct - b.bubble_pct);
    bestItem = sortedByBubble[0];
    recommendation = {
      best_id: bestItem.id,
      best_name: bestItem.name,
      best_bubble_pct: bestItem.bubble_pct,
      reason: `«${bestItem.name}» با حباب ${bestItem.bubble_pct}٪ دارای کمترین حباب و بالاترین ارزش خرید اقتصادی می‌باشد.`
    };
  }

  // Major World Currencies Calculation based on USD cross-rates
  const currencies = [
    {
      code: "EUR",
      name: "یورو",
      flag: "🇪🇺",
      symbol: "€",
      usd_cross_rate: parseFloat((1 / forex.EUR).toFixed(4)),
      toman_price: Math.round((1 / forex.EUR) * usd_toman),
      note: `۱ یورو = ${(1 / forex.EUR).toFixed(4)} دلار آمریکا`
    },
    {
      code: "AED",
      name: "درهم امارات",
      flag: "🇦🇪",
      symbol: "د.إ",
      usd_cross_rate: parseFloat((1 / forex.AED).toFixed(4)),
      toman_price: Math.round((1 / forex.AED) * usd_toman),
      note: `۱ دلار = ${forex.AED.toFixed(4)} درهم`
    },
    {
      code: "TRY",
      name: "لیر ترکیه",
      flag: "🇹🇷",
      symbol: "₺",
      usd_cross_rate: parseFloat((1 / forex.TRY).toFixed(4)),
      toman_price: Math.round((1 / forex.TRY) * usd_toman),
      note: `۱ دلار = ${forex.TRY.toFixed(2)} لیر`
    },
    {
      code: "CNY",
      name: "یوان چین",
      flag: "🇨🇳",
      symbol: "¥",
      usd_cross_rate: parseFloat((1 / forex.CNY).toFixed(4)),
      toman_price: Math.round((1 / forex.CNY) * usd_toman),
      note: `۱ دلار = ${forex.CNY.toFixed(2)} یوان`
    },
    {
      code: "GBP",
      name: "پوند انگلیس",
      flag: "🇬🇧",
      symbol: "£",
      usd_cross_rate: parseFloat((1 / forex.GBP).toFixed(4)),
      toman_price: Math.round((1 / forex.GBP) * usd_toman),
      note: `۱ پوند = ${(1 / forex.GBP).toFixed(4)} دلار آمریکا`
    },
    {
      code: "CAD",
      name: "دلار کانادا",
      flag: "🇨🇦",
      symbol: "C$",
      usd_cross_rate: parseFloat((1 / forex.CAD).toFixed(4)),
      toman_price: Math.round((1 / forex.CAD) * usd_toman),
      note: `۱ دلار کانادا = ${(1 / forex.CAD).toFixed(4)} دلار آمریکا`
    }
  ];

  const responseObj = {
    success: true,
    timestamp: new Date().toISOString(),
    inputs: { usd_toman, gold_usd },
    gold: {
      gold_24k_gram: Math.round(gold_24k_gram),
      gold_18k_gram: Math.round(gold_18k_gram),
      mesghal_17k: Math.round(mesghal_17k)
    },
    currencies,
    market_data: tgPrices,
    analysis: itemsAnalysis,
    recommendation
  };

  return new Response(JSON.stringify(responseObj, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/**
 * Fetch Live Gold Spot Price & Currencies
 */
async function handleFetchRates(env) {
  try {
    let gold_usd = parseFloat(env?.DEFAULT_GOLD_USD || "2450");
    try {
      const goldRes = await fetch("https://api.gold-api.com/price/XAU");
      if (goldRes.ok) {
        const gData = await goldRes.json();
        if (gData && gData.price) {
          gold_usd = Math.round(gData.price * 100) / 100;
        }
      }
    } catch (e) {}

    const [tgPrices, forex] = await Promise.all([
      fetchTelegramPrices(env),
      fetchForexRates()
    ]);

    return new Response(
      JSON.stringify({
        success: true,
        gold_usd,
        forex,
        market_prices: tgPrices
      }),
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}

/**
 * Embedded HTML Web Application
 */
function getHTMLContent(env) {
  const defaultGoldUsd = env?.DEFAULT_GOLD_USD || "2450";

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RealRate | محاسبه‌گر طلا، سکه و ارزهای جهان</title>
  <meta name="description" content="محاسبه قیمت واقعی طلا، سکه و ارزهای مطرح جهان (یورو، درهم، لیر، یوان) بر اساس دلار و انس جهانی">
  
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">

  <style>
    :root {
      --bg-primary: #0a0d14;
      --bg-glass: rgba(18, 24, 36, 0.75);
      --bg-card: rgba(26, 34, 52, 0.65);
      --border-color: rgba(255, 255, 255, 0.08);
      --border-glow: rgba(245, 158, 11, 0.35);
      
      --gold-primary: #f59e0b;
      --gold-light: #fbbf24;
      --gold-gradient: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      
      --success: #10b981;
      --danger: #ef4444;
      --warning: #f59e0b;
      --info-blue: #3b82f6;

      --radius-md: 14px;
      --radius-lg: 20px;
      --radius-xl: 28px;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Vazirmatn', sans-serif;
    }

    body {
      background-color: var(--bg-primary);
      background-image: 
        radial-gradient(circle at 10% 20%, rgba(245, 158, 11, 0.08) 0%, transparent 40%),
        radial-gradient(circle at 90% 80%, rgba(16, 185, 129, 0.05) 0%, transparent 40%);
      color: var(--text-main);
      min-height: 100vh;
      padding: 24px 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .container {
      width: 100%;
      max-width: 1050px;
      margin: 0 auto;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding: 16px 24px;
      background: var(--bg-glass);
      backdrop-filter: blur(16px);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      flex-wrap: wrap;
      gap: 16px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-logo {
      width: 44px;
      height: 44px;
      background: var(--gold-gradient);
      border-radius: var(--radius-md);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      box-shadow: 0 4px 20px rgba(245, 158, 11, 0.35);
    }

    .brand-title h1 {
      font-size: 20px;
      font-weight: 800;
      background: linear-gradient(135deg, #fff 0%, #fde047 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .brand-title p {
      font-size: 12px;
      color: var(--text-muted);
    }

    .header-controls {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    /* Auto Refresh Widget UI */
    .auto-refresh-widget {
      display: flex;
      align-items: center;
      gap: 10px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-color);
      padding: 6px 14px;
      border-radius: 30px;
      backdrop-filter: blur(10px);
    }

    .toggle-switch {
      position: relative;
      display: inline-block;
      width: 38px;
      height: 22px;
    }

    .toggle-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .slider {
      position: absolute;
      cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background-color: rgba(255, 255, 255, 0.2);
      transition: .3s;
      border-radius: 22px;
    }

    .slider:before {
      position: absolute;
      content: "";
      height: 16px;
      width: 16px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: .3s;
      border-radius: 50%;
    }

    input:checked + .slider {
      background-color: var(--success);
    }

    input:checked + .slider:before {
      transform: translateX(16px);
    }

    .refresh-timer-info {
      display: flex;
      flex-direction: column;
      font-size: 11px;
      line-height: 1.3;
    }

    .status-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
      padding: 6px 14px;
      border-radius: 30px;
      font-size: 12px;
      color: var(--success);
      font-weight: 600;
    }

    .dot {
      width: 8px;
      height: 8px;
      background-color: var(--success);
      border-radius: 50%;
      box-shadow: 0 0 10px var(--success);
    }

    /* Warning Alert Banner when Dollar is null */
    .alert-banner {
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid var(--gold-primary);
      border-radius: var(--radius-md);
      padding: 14px 20px;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--gold-light);
      font-size: 14px;
      font-weight: 700;
    }

    /* Inputs Panel */
    .input-panel {
      background: var(--bg-glass);
      backdrop-filter: blur(16px);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-xl);
      padding: 24px;
      margin-bottom: 28px;
    }

    .inputs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
    }

    .input-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .input-group label {
      font-size: 14px;
      font-weight: 600;
      display: flex;
      justify-content: space-between;
    }

    .input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }

    .input-wrapper input {
      width: 100%;
      background: rgba(10, 13, 20, 0.7);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 14px 16px;
      padding-left: 80px;
      color: #fff;
      font-size: 18px;
      font-weight: 700;
      outline: none;
      transition: all 0.25s ease;
    }

    .input-wrapper input:focus {
      border-color: var(--gold-primary);
      box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.2);
    }

    .input-suffix {
      position: absolute;
      left: 16px;
      font-size: 13px;
      font-weight: 600;
      color: var(--gold-light);
      pointer-events: none;
    }

    .quick-btns {
      display: flex;
      gap: 6px;
      margin-top: 6px;
    }

    .q-btn {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      color: var(--text-muted);
      padding: 4px 10px;
      font-size: 11px;
      cursor: pointer;
      transition: 0.2s;
    }

    .q-btn:hover {
      background: rgba(245, 158, 11, 0.15);
      border-color: var(--gold-primary);
      color: var(--gold-light);
    }

    /* Tabs */
    .tabs-nav {
      display: flex;
      gap: 8px;
      margin-bottom: 24px;
      background: rgba(18, 24, 36, 0.5);
      padding: 6px;
      border-radius: var(--radius-lg);
      border: 1px solid var(--border-color);
    }

    .tab-btn {
      flex: 1;
      padding: 12px 16px;
      border: none;
      background: transparent;
      color: var(--text-muted);
      font-size: 14px;
      font-weight: 700;
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: 0.25s;
    }

    .tab-btn.active {
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid var(--gold-primary);
      color: var(--gold-light);
    }

    /* Recommendation Box */
    .rec-box {
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(10, 13, 20, 0.8) 100%);
      border: 1.5px solid var(--success);
      border-radius: var(--radius-lg);
      padding: 20px 24px;
      margin-bottom: 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      box-shadow: 0 10px 30px rgba(16, 185, 129, 0.15);
    }

    .rec-info h3 {
      font-size: 18px;
      font-weight: 800;
      color: #fff;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .rec-info p {
      font-size: 13px;
      color: var(--text-muted);
    }

    .rec-badge {
      background: var(--success);
      color: #000;
      font-weight: 800;
      padding: 8px 18px;
      border-radius: 30px;
      font-size: 13px;
      white-space: nowrap;
    }

    /* Comparison Cards Grid - 2 CARDS PER ROW */
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
      margin-bottom: 32px;
    }

    @media (max-width: 768px) {
      .cards-grid {
        grid-template-columns: 1fr;
      }
    }

    .card {
      background: var(--bg-card);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 22px;
      position: relative;
      transition: transform 0.25s, border-color 0.25s;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .card:hover {
      border-color: rgba(245, 158, 11, 0.3);
      transform: translateY(-2px);
    }

    .card.highlight {
      border-color: var(--success);
      box-shadow: 0 0 24px rgba(16, 185, 129, 0.2);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 16px;
    }

    .card-title h3 {
      font-size: 18px;
      font-weight: 800;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .card-title span {
      font-size: 11px;
      color: var(--text-muted);
    }

    .bubble-badge {
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
    }

    .bubble-badge.disabled {
      background: rgba(156, 163, 175, 0.1);
      border: 1px solid rgba(156, 163, 175, 0.2);
      color: var(--text-muted);
    }

    .bubble-badge.negative {
      background: rgba(59, 130, 246, 0.15);
      border: 1px solid var(--info-blue);
      color: #60a5fa;
      box-shadow: 0 0 12px rgba(59, 130, 246, 0.25);
    }

    .bubble-badge.good {
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid var(--success);
      color: var(--success);
    }

    .bubble-badge.warn {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid var(--danger);
      color: #f87171;
    }

    .price-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 10px;
    }

    .price-label {
      font-size: 13px;
      color: var(--text-muted);
    }

    .price-val {
      font-size: 20px;
      font-weight: 800;
      color: #fff;
    }

    .price-val.gold {
      color: var(--gold-light);
    }

    .timestamp-tag {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 14px;
      padding-top: 10px;
      border-top: 1px dashed var(--border-color);
      display: flex;
      justify-content: space-between;
    }

    /* Jewelry Tab */
    .calc-box {
      background: var(--bg-glass);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-xl);
      padding: 24px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }

    @media (max-width: 768px) {
      .calc-box { grid-template-columns: 1fr; }
    }

    .receipt-line {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px dashed var(--border-color);
      font-size: 14px;
    }

    .receipt-line.total {
      border-bottom: none;
      border-top: 2px solid var(--gold-primary);
      margin-top: 12px;
      padding-top: 16px;
      font-weight: 800;
      font-size: 18px;
      color: var(--gold-light);
    }

    footer {
      margin-top: 40px;
      text-align: center;
      font-size: 12px;
      color: var(--text-muted);
      border-top: 1px solid var(--border-color);
      padding-top: 20px;
      width: 100%;
    }
  </style>
</head>
<body>

  <div class="container">
    <!-- Header -->
    <header>
      <div class="brand">
        <div class="brand-logo">🪙</div>
        <div class="brand-title">
          <h1>RealRate</h1>
          <p>تحلیل قیمت واقعی طلا، سکه و ارزهای جهان بر اساس دلار</p>
        </div>
      </div>

      <div class="header-controls">
        <!-- Auto Refresh Toggle Switch Widget -->
        <div class="auto-refresh-widget">
          <label class="toggle-switch">
            <input type="checkbox" id="autoRefreshToggle" onchange="toggleAutoRefresh(this.checked)">
            <span class="slider"></span>
          </label>
          <div class="refresh-timer-info">
            <span style="font-weight: 700; color: #fff;">بروزرسانی خودکار</span>
            <span id="countdownTimer" style="font-size: 11px; color: var(--gold-light);">غیرفعال</span>
          </div>
        </div>

        <div class="status-badge" id="statusBadge">
          <span class="dot"></span>
          <span id="statusText">در حال دریافت نرخ‌ها...</span>
        </div>
      </div>
    </header>

    <!-- Alert Banner (shown when Dollar is null) -->
    <div class="alert-banner" id="usdAlert" style="display: flex;">
      <span>⚠️ لطفاً ابتدا نرخ دلار آزاد (تومان) را وارد کنید تا محاسبات انجام شود.</span>
    </div>

    <!-- Inputs Panel -->
    <div class="input-panel">
      <div class="inputs-grid">
        <div class="input-group">
          <label for="usdToman">
            <span>قیمت دلار آزاد (تومان)</span>
            <span style="font-size: 11px; color: var(--gold-light); font-weight: 700;">✍️ ورودی دستی شما</span>
          </label>
          <div class="input-wrapper">
            <input type="text" id="usdToman" placeholder="مثلاً ۶۲,۰۰۰" oninput="onInputsChanged()">
            <span class="input-suffix">تومان</span>
          </div>
          <div class="quick-btns">
            <button class="q-btn" onclick="adjustInput('usdToman', 500)">+۵۰۰</button>
            <button class="q-btn" onclick="adjustInput('usdToman', 1000)">+۱,۰۰۰</button>
            <button class="q-btn" onclick="adjustInput('usdToman', -500)">-۵۰۰</button>
            <button class="q-btn" onclick="adjustInput('usdToman', -1000)">-۱,۰۰۰</button>
          </div>
        </div>

        <div class="input-group">
          <label for="goldUsd">
            <span>انس جهانی طلا ($)</span>
            <span style="font-size: 11px; color: var(--success); font-weight: 700;">🌐 خودکار (قابل ویرایش)</span>
          </label>
          <div class="input-wrapper">
            <input type="text" id="goldUsd" value="${defaultGoldUsd}" oninput="onInputsChanged()">
            <span class="input-suffix">USD</span>
          </div>
          <div class="quick-btns">
            <button class="q-btn" onclick="adjustInput('goldUsd', 5)">+۵</button>
            <button class="q-btn" onclick="adjustInput('goldUsd', 10)">+۱۰</button>
            <button class="q-btn" onclick="adjustInput('goldUsd', -5)">-۵</button>
            <button class="q-btn" onclick="adjustInput('goldUsd', -10)">-۱۰</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div class="tabs-nav">
      <button class="tab-btn active" onclick="switchTab('analysisTab', this)">📊 حباب طلا و سکه</button>
      <button class="tab-btn" onclick="switchTab('currenciesTab', this)">💱 قیمت روز ارزهای جهان</button>
      <button class="tab-btn" onclick="switchTab('jewelryTab', this)">💎 محاسبه‌گر طلا و اجرت</button>
    </div>

    <!-- Tab 1: Analysis & Comparison -->
    <div id="analysisTab" class="tab-content">
      <!-- Best Recommendation Box -->
      <div class="rec-box" id="recBox" style="display: none;">
        <div class="rec-info">
          <h3 id="recTitle">🏆 بهترین گزینه برای خرید: -</h3>
          <p id="recReason">در حال بررسی حباب قیمت‌ها...</p>
        </div>
        <div class="rec-badge" id="recBadge">پیشنهادی RealRate</div>
      </div>

      <!-- Items Grid (2 Cards per Row) -->
      <div class="cards-grid" id="cardsGrid">
        <!-- Dynamic Cards Inserted via JS -->
      </div>
    </div>

    <!-- Tab 2: World Currencies -->
    <div id="currenciesTab" class="tab-content" style="display: none;">
      <div class="cards-grid" id="currenciesGrid">
        <!-- Dynamic Currency Cards Inserted via JS -->
      </div>
    </div>

    <!-- Tab 3: Jewelry Calculator -->
    <div id="jewelryTab" class="tab-content" style="display: none;">
      <div class="calc-box">
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <h3 style="font-size: 16px; font-weight: 700; color: var(--gold-light);">فاکتور خرید طلا</h3>
          
          <div class="input-group">
            <label>وزن طلا (گرم)</label>
            <div class="input-wrapper">
              <input type="number" id="jWeight" value="5.5" step="0.1" oninput="calculateJewelry()">
              <span class="input-suffix">گرم</span>
            </div>
          </div>

          <div class="input-group">
            <label>درصد اجرت ساخت (٪)</label>
            <div class="input-wrapper">
              <input type="number" id="jWage" value="15" step="1" oninput="calculateJewelry()">
              <span class="input-suffix">درصد</span>
            </div>
          </div>

          <div class="input-group">
            <label>درصد سود طلافروش (٪)</label>
            <div class="input-wrapper">
              <input type="number" id="jProfit" value="7" step="1" oninput="calculateJewelry()">
              <span class="input-suffix">درصد</span>
            </div>
          </div>

          <div class="input-group">
            <label>درصد مالیات (٪)</label>
            <div class="input-wrapper">
              <input type="number" id="jTax" value="9" step="1" oninput="calculateJewelry()">
              <span class="input-suffix">روی اجرت و سود</span>
            </div>
          </div>
        </div>

        <div style="background: rgba(10, 13, 20, 0.8); border: 1px solid var(--border-glow); border-radius: var(--radius-lg); padding: 20px; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <h4 style="font-size: 15px; color: #fff; margin-bottom: 16px; font-weight: 800;">📝 صورت‌حساب پرداختی شما</h4>
            
            <div class="receipt-line">
              <span>قیمت طلا ۱۸ عیار خام:</span>
              <strong id="rec_raw_gram">-</strong>
            </div>
            <div class="receipt-line">
              <span>ارزش کل طلا خام:</span>
              <strong id="rec_raw_total">-</strong>
            </div>
            <div class="receipt-line">
              <span>اجرت ساخت:</span>
              <strong id="rec_wage_val">-</strong>
            </div>
            <div class="receipt-line">
              <span>سود طلافروش:</span>
              <strong id="rec_profit_val">-</strong>
            </div>
            <div class="receipt-line">
              <span>مالیات بر ارزش افزوده:</span>
              <strong id="rec_tax_val">-</strong>
            </div>
          </div>

          <div>
            <div class="receipt-line total">
              <span>مبلغ نهایی پرداختی:</span>
              <span id="rec_final_total">-</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <footer>
      <p>منبع اطلاعات: قیمت روز بازار طلا و نرخ برابری ارزهای جهان | اجرا در Cloudflare Worker</p>
    </footer>
  </div>

  <script>
    let currentCalcData = null;
    let countdownInterval = null;
    let secondsRemaining = 300; // 5 minutes timer

    function formatNum(num) {
      if (num === null || num === undefined || isNaN(num)) return '-';
      return Math.round(num).toLocaleString('fa-IR');
    }

    function parsePersianNum(str) {
      if (!str) return 0;
      const pers = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
      let s = str.toString();
      for (let i = 0; i < 10; i++) {
        s = s.replace(new RegExp(pers[i], 'g'), i);
      }
      return parseFloat(s.replace(/,/g, '')) || 0;
    }

    function formatRelativeTime(isoStr) {
      if (!isoStr) return 'ثبت نشده';
      try {
        const d = new Date(isoStr);
        const diffMins = Math.floor((new Date() - d) / 60000);
        if (diffMins < 1) return 'چند لحظه پیش';
        if (diffMins < 60) return diffMins.toLocaleString('fa-IR') + ' دقیقه پیش';
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return diffHours.toLocaleString('fa-IR') + ' ساعت پیش';
        return d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
      } catch (e) {
        return 'ثبت نشده';
      }
    }

    /* Auto Refresh Timer Logic */
    function toggleAutoRefresh(enabled) {
      try {
        localStorage.setItem('realrate_auto_refresh', enabled ? 'true' : 'false');
      } catch (e) {}

      if (enabled) {
        startAutoRefreshTimer();
      } else {
        stopAutoRefreshTimer();
      }
    }

    function startAutoRefreshTimer() {
      stopAutoRefreshTimer();
      secondsRemaining = 300;
      updateCountdownDisplay();

      countdownInterval = setInterval(() => {
        secondsRemaining--;
        if (secondsRemaining <= 0) {
          secondsRemaining = 300;
          triggerAutoRefresh();
        }
        updateCountdownDisplay();
      }, 1000);
    }

    function stopAutoRefreshTimer() {
      if (countdownInterval) clearInterval(countdownInterval);
      countdownInterval = null;
      const el = document.getElementById('countdownTimer');
      if (el) el.innerText = 'غیرفعال';
    }

    function updateCountdownDisplay() {
      const el = document.getElementById('countdownTimer');
      if (!el) return;
      const mins = Math.floor(secondsRemaining / 60);
      const secs = secondsRemaining % 60;
      const formattedMins = mins.toLocaleString('fa-IR');
      const formattedSecs = secs < 10 ? '۰' + secs.toLocaleString('fa-IR') : secs.toLocaleString('fa-IR');
      el.innerText = '⏳ بعدی در: ' + formattedMins + ':' + formattedSecs;
    }

    async function triggerAutoRefresh() {
      const statusText = document.getElementById('statusText');
      if (statusText) statusText.innerText = '🔄 در حال بروزرسانی خودکار...';
      
      try {
        await fetch('/api/telegram?force=true');
      } catch (e) {}

      onInputsChanged();
    }

    function loadAutoRefreshPref() {
      try {
        const saved = localStorage.getItem('realrate_auto_refresh');
        const toggle = document.getElementById('autoRefreshToggle');
        if (saved === 'true') {
          toggle.checked = true;
          startAutoRefreshTimer();
        } else {
          toggle.checked = false;
          stopAutoRefreshTimer();
        }
      } catch (e) {}
    }

    function saveLocalUsd() {
      const el = document.getElementById('usdToman');
      if (el && el.value) {
        try { localStorage.setItem('realrate_usd_toman', el.value); } catch (e) {}
      } else {
        try { localStorage.removeItem('realrate_usd_toman'); } catch (e) {}
      }
    }

    function loadLocalUsd() {
      try {
        const savedUsd = localStorage.getItem('realrate_usd_toman');
        if (savedUsd) {
          document.getElementById('usdToman').value = savedUsd;
        } else {
          document.getElementById('usdToman').value = '';
        }
      } catch (e) {}
    }

    function adjustInput(id, delta) {
      const el = document.getElementById(id);
      let val = parsePersianNum(el.value);
      val = Math.max(0, val + delta);
      el.value = val > 0 ? val.toLocaleString('en-US') : '';
      if (id === 'usdToman') saveLocalUsd();
      onInputsChanged();
    }

    function switchTab(tabId, btn) {
      document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
      document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
      
      document.getElementById(tabId).style.display = 'block';
      btn.classList.add('active');
    }

    function onInputsChanged() {
      const usdToman = parsePersianNum(document.getElementById('usdToman').value);
      const usdAlert = document.getElementById('usdAlert');
      const recBox = document.getElementById('recBox');

      if (usdToman <= 0) {
        usdAlert.style.display = 'flex';
        recBox.style.display = 'none';
        document.getElementById('cardsGrid').innerHTML = '';
        document.getElementById('currenciesGrid').innerHTML = '';
        return;
      }

      usdAlert.style.display = 'none';
      saveLocalUsd();
      calculateAll();
    }

    async function calculateAll() {
      const usdToman = parsePersianNum(document.getElementById('usdToman').value);
      const goldUsd = parsePersianNum(document.getElementById('goldUsd').value);
      
      if (usdToman <= 0) return;

      const params = new URLSearchParams({
        usd_toman: usdToman,
        gold_usd: goldUsd
      });

      try {
        const res = await fetch('/api/calculate?' + params.toString());
        if (!res.ok) throw new Error('API Error');
        const data = await res.json();

        if (data.success) {
          currentCalcData = data;
          renderAnalysis(data);
          renderCurrencies(data);
          calculateJewelry();
        }
      } catch (err) {
        console.error('Calculation error:', err);
      }
    }

    function renderCurrencies(data) {
      const grid = document.getElementById('currenciesGrid');
      grid.innerHTML = '';

      if (!data.currencies || data.currencies.length === 0) return;

      data.currencies.forEach(c => {
        const card = document.createElement('div');
        card.className = 'card';

        card.innerHTML = \`
          <div>
            <div class="card-header">
              <div class="card-title">
                <h3><span>\${c.flag}</span> \${c.name} (\${c.code})</h3>
                <span>بر اساس نرخ برابری جهانی با دلار</span>
              </div>
              <span class="bubble-badge good">\${c.symbol}</span>
            </div>

            <div class="price-row" style="margin-top: 8px;">
              <span class="price-label">قیمت محاسباتی به تومان:</span>
              <span class="price-val gold">\${formatNum(c.toman_price)} تومان</span>
            </div>

            <div class="price-row" style="margin-top: 14px; border-top: 1px dashed var(--border-color); padding-top: 10px;">
              <span class="price-label">نرخ برابری با دلار:</span>
              <span style="font-weight: 700; font-size: 14px; color: var(--gold-light);">\${c.note}</span>
            </div>
          </div>

          <div class="timestamp-tag">
            <span>محاسبه با دلار: <strong>\${formatNum(data.inputs.usd_toman)} تومان</strong></span>
            <span>ارز جهانی</span>
          </div>
        \`;

        grid.appendChild(card);
      });
    }

    function renderAnalysis(data) {
      const grid = document.getElementById('cardsGrid');
      grid.innerHTML = '';

      if (!data.analysis || data.analysis.length === 0) return;

      // Update Header Check Time
      const rawData = data.market_data || data.telegram_raw;
      if (rawData && rawData.last_channel_check_time) {
        const statusText = document.getElementById('statusText');
        statusText.innerText = 'بروزرسانی قیمت روز: ' + formatRelativeTime(rawData.last_channel_check_time);
      }

      // Show Recommendation Box
      const recBox = document.getElementById('recBox');
      if (data.recommendation) {
        recBox.style.display = 'flex';
        document.getElementById('recTitle').innerText = '🏆 بهترین گزینه برای خرید: ' + data.recommendation.best_name;
        document.getElementById('recReason').innerText = data.recommendation.reason;
        
        const bestPct = data.recommendation.best_bubble_pct;
        document.getElementById('recBadge').innerText = (bestPct < 0 ? 'حباب منفی: ' : 'حباب: ') + bestPct.toLocaleString('fa-IR') + '٪';
      } else {
        recBox.style.display = 'none';
      }

      data.analysis.forEach(item => {
        const isBest = data.recommendation && data.recommendation.best_id === item.id;
        const hasMarket = item.market !== null;
        const isNegative = hasMarket && item.bubble < 0;
        
        const card = document.createElement('div');
        card.className = 'card ' + (isBest ? 'highlight' : '');

        // Determine badge styling
        let bubbleClass = 'disabled';
        let badgeText = 'ناموجود در بازار';

        if (hasMarket) {
          if (isNegative) {
            bubbleClass = 'negative';
            badgeText = 'حباب منفی: ' + item.bubble_pct.toLocaleString('fa-IR') + '٪';
          } else if (item.bubble_pct <= 10) {
            bubbleClass = 'good';
            badgeText = 'حباب: +' + item.bubble_pct.toLocaleString('fa-IR') + '٪';
          } else {
            bubbleClass = 'warn';
            badgeText = 'حباب: +' + item.bubble_pct.toLocaleString('fa-IR') + '٪';
          }
        }

        const timeStr = formatRelativeTime(item.updated_at);
        
        let marketDisplayStr = '<span class="price-val" style="color: var(--text-muted); font-size: 16px;">ناموجود در بازار</span>';
        let bubbleDisplayStr = '<span style="color: var(--text-muted); font-size: 13px;">اطلاعات بازار موجود نیست</span>';

        if (hasMarket) {
          marketDisplayStr = '<span class="price-val">' + formatNum(item.market) + ' تومان</span>';
          const bubbleColor = isNegative ? '#60a5fa' : (item.bubble_pct <= 10 ? 'var(--success)' : '#f87171');
          bubbleDisplayStr = isNegative ? 
            ('حباب منفی ' + formatNum(Math.abs(item.bubble)) + ' تومان (' + item.bubble_pct.toLocaleString('fa-IR') + '٪)') : 
            ('+' + formatNum(item.bubble) + ' تومان (' + item.bubble_pct.toLocaleString('fa-IR') + '٪)');
          bubbleDisplayStr = '<span style="font-weight: 800; font-size: 15px; color: ' + bubbleColor + ';">' + bubbleDisplayStr + '</span>';
        }

        card.innerHTML = \`
          <div>
            <div class="card-header">
              <div class="card-title">
                <h3>\${item.name}</h3>
                <span>ارزش واقعی vs قیمت روز بازار</span>
              </div>
              <span class="bubble-badge \${bubbleClass}">\${badgeText}</span>
            </div>

            <div class="price-row">
              <span class="price-label">ارزش واقعی (دلار و انس):</span>
              <span class="price-val gold">\${formatNum(item.intrinsic)} تومان</span>
            </div>

            <div class="price-row">
              <span class="price-label">قیمت روز بازار:</span>
              \${marketDisplayStr}
            </div>

            <div class="price-row" style="margin-top: 14px; border-top: 1px dashed var(--border-color); padding-top: 10px;">
              <span class="price-label">وضعیت حباب:</span>
              \${bubbleDisplayStr}
            </div>
          </div>

          <div class="timestamp-tag">
            <span>منبع: قیمت روز بازار</span>
            <span>زمان بروزرسانی: <strong>\${timeStr}</strong></span>
          </div>
        \`;

        grid.appendChild(card);
      });
    }

    function calculateJewelry() {
      if (!currentCalcData) return;
      const g18k = currentCalcData.gold.gold_18k_gram;

      const weight = parseFloat(document.getElementById('jWeight').value) || 0;
      const wagePct = parseFloat(document.getElementById('jWage').value) || 0;
      const profitPct = parseFloat(document.getElementById('jProfit').value) || 0;
      const taxPct = parseFloat(document.getElementById('jTax').value) || 0;

      const rawTotal = g18k * weight;
      const wageVal = rawTotal * (wagePct / 100);
      const profitVal = (rawTotal + wageVal) * (profitPct / 100);
      const taxVal = (wageVal + profitVal) * (taxPct / 100);
      const finalTotal = rawTotal + wageVal + profitVal + taxVal;

      document.getElementById('rec_raw_gram').innerText = formatNum(g18k) + ' تومان';
      document.getElementById('rec_raw_total').innerText = formatNum(rawTotal) + ' تومان';
      document.getElementById('rec_wage_val').innerText = formatNum(wageVal) + ' تومان';
      document.getElementById('rec_profit_val').innerText = formatNum(profitVal) + ' تومان';
      document.getElementById('rec_tax_val').innerText = formatNum(taxVal) + ' تومان';
      document.getElementById('rec_final_total').innerText = formatNum(finalTotal) + ' تومان';
    }

    async function initPage() {
      loadLocalUsd();
      loadAutoRefreshPref();

      // Fetch live gold spot price & KV market data
      try {
        const res = await fetch('/api/rates');
        const data = await res.json();
        if (data.success && data.gold_usd) {
          document.getElementById('goldUsd').value = data.gold_usd.toLocaleString('en-US');
        }
        document.getElementById('statusText').innerText = 'قیمت انس و بازار بروز است';
      } catch (e) {
        document.getElementById('statusText').innerText = 'آماده';
      }

      onInputsChanged();
    }

    window.addEventListener('DOMContentLoaded', initPage);
  </script>
</body>
</html>`;
}

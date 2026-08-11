/**
 * RealRate — Iranian Gold & Currency Price Calculator & Telegram Arbitrage Engine
 * Cloudflare Worker Engine
 */

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
      const tgData = await fetchTelegramPrices(env);
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
 * Fetch and parse Telegram Channel posts (https://t.me/s/zarmagoldd)
 * Remembers last known prices and timestamps even if missing from the latest message.
 */
async function fetchTelegramPrices(env) {
  let stored = {};

  // Read stored prices from Cloudflare KV if available
  if (env && env.REALRATE_KV) {
    try {
      const kvVal = await env.REALRATE_KV.get("tg_prices", "json");
      if (kvVal) stored = kvVal;
    } catch (e) {
      console.error("KV Read Error:", e);
    }
  }

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

      // Write updated prices back to Cloudflare KV if available
      if (env && env.REALRATE_KV) {
        try {
          await env.REALRATE_KV.put("tg_prices", JSON.stringify(stored));
        } catch (e) {
          console.error("KV Write Error:", e);
        }
      }
    }
  } catch (err) {
    console.error("Telegram fetch error:", err);
  }

  return stored;
}

/**
 * Parse Telegram Channel Web Preview HTML for Gold & Coin Prices
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
    const lines = rawText.split("\n");

    // 1. Gram 18K Gold (گرم 18 عیار) - In zarmagoldd quoted per 5 grams (e.g. 18,914,000 Toman)
    if (!result.gold_18k && (rawText.includes("18 عیار") || rawText.includes("۱۸ عیار"))) {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("18 عیار") || lines[i].includes("۱۸ عیار")) {
          const chunk = lines.slice(i, i + 4).join(" ");
          const saleMatch = chunk.match(/فروش:\s*([\d,]+)/);
          if (saleMatch) {
            const rawNum = parseInt(saleMatch[1].replace(/,/g, ""), 10);
            if (rawNum > 0) {
              const pricePerGram = Math.round(rawNum / 5);
              result.gold_18k = { price: pricePerGram, datetime, label: "طلا ۱۸ عیار" };
            }
          }
        }
      }
    }

    // 2. Mesghal (آبشده / مظنه) - In zarmagoldd quoted per 10 mesghal (e.g. 81,920,000 Toman)
    if (!result.mesghal && (rawText.includes("آبشده") || rawText.includes("مثقال") || rawText.includes("مظنه"))) {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("آبشده") || lines[i].includes("مثقال")) {
          const chunk = lines.slice(i, i + 4).join(" ");
          const saleMatch = chunk.match(/فروش:\s*([\d,]+)/);
          if (saleMatch) {
            const rawNum = parseInt(saleMatch[1].replace(/,/g, ""), 10);
            if (rawNum > 0) {
              const pricePerMesghal = Math.round(rawNum / 10);
              result.mesghal = { price: pricePerMesghal, datetime, label: "مثقال طلا (۱۷ عیار)" };
            }
          }
        }
      }
    }

    // 3. Coins (تمام سکه، نیم سکه، ربع سکه)
    const coinRules = [
      { key: "full_coin", keywords: ["تمام سکه", "سکه امامی", "امامی"], label: "تمام سکه امامی", minVal: 20000000 },
      { key: "half_coin", keywords: ["نیم سکه"], label: "نیم سکه بهار آزادی", minVal: 10000000 },
      { key: "quarter_coin", keywords: ["ربع سکه"], label: "ربع سکه بهار آزادی", minVal: 5000000 }
    ];

    for (const rule of coinRules) {
      if (!result[rule.key]) {
        for (const kw of rule.keywords) {
          if (rawText.includes(kw)) {
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].includes(kw)) {
                const chunk = lines.slice(i, i + 4).join(" ");
                const saleMatch = chunk.match(/(?:فروش:|قیمت:)?\s*([\d,]{7,12})/);
                if (saleMatch) {
                  const rawNum = parseInt(saleMatch[1].replace(/,/g, ""), 10);
                  if (rawNum > rule.minVal) {
                    const priceToman = rawNum > 100000000 ? Math.round(rawNum / 10) : rawNum;
                    result[rule.key] = { price: priceToman, datetime, label: rule.label };
                    break;
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return result;
}

/**
 * Handle Price Calculation & Arbitrage Analysis
 */
async function handleCalculate(url, env) {
  const usd_toman_raw = url.searchParams.get("usd_toman");
  const usd_toman = usd_toman_raw ? parseFloat(usd_toman_raw) : null;
  const gold_usd = parseFloat(url.searchParams.get("gold_usd")) || 2450;

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

  // Fetch or get last telegram prices
  const tgPrices = await fetchTelegramPrices(env);

  // Real Intrinsic Gold Calculations
  const gold_24k_gram = (gold_usd / 31.1034768) * usd_toman;
  const gold_18k_gram = gold_24k_gram * 0.75;
  const mesghal_17k = gold_24k_gram * 4.608 * 0.705;

  const full_intrinsic = gold_24k_gram * 7.3197;
  const half_intrinsic = gold_24k_gram * 3.6594;
  const quarter_intrinsic = gold_24k_gram * 1.8297;

  // Comparison & Bubble Calculation against Telegram Market Prices
  const itemsAnalysis = [];

  // 18K Gold
  const tg_18k = tgPrices.gold_18k ? tgPrices.gold_18k.price : null;
  const bubble_18k = tg_18k ? (tg_18k - gold_18k_gram) : (gold_18k_gram * 0.03); // fallback 3%
  const market_18k = tg_18k ? tg_18k : (gold_18k_gram + bubble_18k);
  const bubble_18k_pct = ((bubble_18k / gold_18k_gram) * 100);
  itemsAnalysis.push({
    id: "gold_18k",
    name: "طلا ۱۸ عیار (هر گرم)",
    intrinsic: Math.round(gold_18k_gram),
    market: Math.round(market_18k),
    bubble: Math.round(bubble_18k),
    bubble_pct: parseFloat(bubble_18k_pct.toFixed(1)),
    updated_at: tgPrices.gold_18k ? tgPrices.gold_18k.datetime : null
  });

  // Full Coin
  const tg_full = tgPrices.full_coin ? tgPrices.full_coin.price : null;
  const bubble_full = tg_full ? (tg_full - full_intrinsic) : (full_intrinsic * 0.12);
  const market_full = tg_full ? tg_full : (full_intrinsic + bubble_full);
  const bubble_full_pct = ((bubble_full / full_intrinsic) * 100);
  itemsAnalysis.push({
    id: "full_coin",
    name: "تمام سکه امامی",
    intrinsic: Math.round(full_intrinsic),
    market: Math.round(market_full),
    bubble: Math.round(bubble_full),
    bubble_pct: parseFloat(bubble_full_pct.toFixed(1)),
    updated_at: tgPrices.full_coin ? tgPrices.full_coin.datetime : null
  });

  // Half Coin
  const tg_half = tgPrices.half_coin ? tgPrices.half_coin.price : null;
  const bubble_half = tg_half ? (tg_half - half_intrinsic) : (half_intrinsic * 0.15);
  const market_half = tg_half ? tg_half : (half_intrinsic + bubble_half);
  const bubble_half_pct = ((bubble_half / half_intrinsic) * 100);
  itemsAnalysis.push({
    id: "half_coin",
    name: "نیم سکه بهار آزادی",
    intrinsic: Math.round(half_intrinsic),
    market: Math.round(market_half),
    bubble: Math.round(bubble_half),
    bubble_pct: parseFloat(bubble_half_pct.toFixed(1)),
    updated_at: tgPrices.half_coin ? tgPrices.half_coin.datetime : null
  });

  // Quarter Coin
  const tg_quarter = tgPrices.quarter_coin ? tgPrices.quarter_coin.price : null;
  const bubble_quarter = tg_quarter ? (tg_quarter - quarter_intrinsic) : (quarter_intrinsic * 0.20);
  const market_quarter = tg_quarter ? tg_quarter : (quarter_intrinsic + bubble_quarter);
  const bubble_quarter_pct = ((bubble_quarter / quarter_intrinsic) * 100);
  itemsAnalysis.push({
    id: "quarter_coin",
    name: "ربع سکه بهار آزادی",
    intrinsic: Math.round(quarter_intrinsic),
    market: Math.round(market_quarter),
    bubble: Math.round(bubble_quarter),
    bubble_pct: parseFloat(bubble_quarter_pct.toFixed(1)),
    updated_at: tgPrices.quarter_coin ? tgPrices.quarter_coin.datetime : null
  });

  // Determine Best Purchase Recommendation (Lowest Bubble Percentage)
  const sortedByBubble = [...itemsAnalysis].sort((a, b) => a.bubble_pct - b.bubble_pct);
  const bestItem = sortedByBubble[0];

  const responseObj = {
    success: true,
    timestamp: new Date().toISOString(),
    inputs: { usd_toman, gold_usd },
    gold: {
      gold_24k_gram: Math.round(gold_24k_gram),
      gold_18k_gram: Math.round(gold_18k_gram),
      mesghal_17k: Math.round(mesghal_17k)
    },
    telegram_channel: "t.me/zarmagoldd",
    telegram_raw: tgPrices,
    analysis: itemsAnalysis,
    recommendation: {
      best_id: bestItem.id,
      best_name: bestItem.name,
      best_bubble_pct: bestItem.bubble_pct,
      reason: `«${bestItem.name}» با حباب ${bestItem.bubble_pct}٪ دارای کمترین حباب و بالاترین ارزش خرید اقتصادی می‌باشد.`
    }
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
    let gold_usd = 2450;
    try {
      const goldRes = await fetch("https://api.gold-api.com/price/XAU");
      if (goldRes.ok) {
        const gData = await goldRes.json();
        if (gData && gData.price) {
          gold_usd = Math.round(gData.price * 100) / 100;
        }
      }
    } catch (e) {}

    const tgPrices = await fetchTelegramPrices(env);

    return new Response(
      JSON.stringify({
        success: true,
        gold_usd,
        telegram_prices: tgPrices
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
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RealRate | تحلیل حباب واقعی سکه و طلا</title>
  <meta name="description" content="محاسبه قیمت واقعی طلا و سکه بر اساس دلار و انس و تحلیل هوشمند بهترین گزینه برای خرید با اطلاعات کانال تلگرام زرماگلد">
  
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
      max-width: 1000px;
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

    /* Comparison Cards Grid */
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      margin-bottom: 32px;
    }

    .card {
      background: var(--bg-card);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 20px;
      position: relative;
      transition: transform 0.25s, border-color 0.25s;
    }

    .card.highlight {
      border-color: var(--success);
      box-shadow: 0 0 20px rgba(16, 185, 129, 0.2);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 14px;
    }

    .card-title h3 {
      font-size: 17px;
      font-weight: 800;
      color: #fff;
    }

    .card-title span {
      font-size: 11px;
      color: var(--text-muted);
    }

    .bubble-badge {
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 700;
    }

    .bubble-badge.good {
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid var(--success);
      color: var(--success);
    }

    .bubble-badge.warn {
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid var(--warning);
      color: var(--gold-light);
    }

    .price-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 8px;
    }

    .price-label {
      font-size: 12px;
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
      margin-top: 10px;
      padding-top: 8px;
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
          <p>تحلیل قیمت واقعی طلا و سکه بر اساس تلگرام زرماگلد</p>
        </div>
      </div>
      <div class="status-badge" id="statusBadge">
        <span class="dot"></span>
        <span id="statusText">در حال دریافت نرخ‌ها...</span>
      </div>
    </header>

    <!-- Alert Banner (shown when Dollar is null) -->
    <div class="alert-banner" id="usdAlert" style="display: flex;">
      <span>⚠️ لطفاً ابتدا نرخ دلار آزاد (تومان) را وارد کنید تا محاسبات و تحلیل خرید انجام شود.</span>
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
            <input type="text" id="goldUsd" value="2450" oninput="onInputsChanged()">
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
      <button class="tab-btn active" onclick="switchTab('analysisTab', this)">📊 مقایسه قیمت‌ها و پیشنهاد خرید</button>
      <button class="tab-btn" onclick="switchTab('jewelryTab', this)">💎 محاسبه‌گر خرید و اجرت طلا</button>
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

      <!-- Items Grid -->
      <div class="cards-grid" id="cardsGrid">
        <!-- Dynamic Cards Inserted via JS -->
      </div>
    </div>

    <!-- Tab 2: Jewelry Calculator -->
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
      <p>منبع اطلاعات بازار: کانال تلگرام زرماگلد (t.me/zarmagoldd) | اجرا در Cloudflare Worker</p>
    </footer>
  </div>

  <script>
    let currentCalcData = null;

    function formatNum(num) {
      if (num === null || num === undefined || isNaN(num) || num <= 0) return '-';
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
      if (!isoStr) return 'ثبت شده';
      try {
        const d = new Date(isoStr);
        const diffMins = Math.floor((new Date() - d) / 60000);
        if (diffMins < 1) return 'چند لحظه پیش';
        if (diffMins < 60) return diffMins.toLocaleString('fa-IR') + ' دقیقه پیش';
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return diffHours.toLocaleString('fa-IR') + ' ساعت پیش';
        return d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
      } catch (e) {
        return 'ثبت شده';
      }
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

    // Reactive input handler (calculates live automatically as inputs change)
    function onInputsChanged() {
      const usdToman = parsePersianNum(document.getElementById('usdToman').value);
      const usdAlert = document.getElementById('usdAlert');
      const recBox = document.getElementById('recBox');

      if (usdToman <= 0) {
        usdAlert.style.display = 'flex';
        recBox.style.display = 'none';
        document.getElementById('cardsGrid').innerHTML = '';
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
          calculateJewelry();
        }
      } catch (err) {
        console.error('Calculation error:', err);
      }
    }

    function renderAnalysis(data) {
      const grid = document.getElementById('cardsGrid');
      grid.innerHTML = '';

      if (!data.analysis || data.analysis.length === 0) return;

      // Show Recommendation Box
      if (data.recommendation) {
        const recBox = document.getElementById('recBox');
        recBox.style.display = 'flex';
        document.getElementById('recTitle').innerText = '🏆 پیشنهاد خرید: ' + data.recommendation.best_name;
        document.getElementById('recReason').innerText = data.recommendation.reason;
        document.getElementById('recBadge').innerText = 'کمترین حباب: ' + data.recommendation.best_bubble_pct + '٪';
      }

      data.analysis.forEach(item => {
        const isBest = data.recommendation && data.recommendation.best_id === item.id;
        
        const card = document.createElement('div');
        card.className = 'card ' + (isBest ? 'highlight' : '');

        const bubbleClass = item.bubble_pct <= 10 ? 'good' : 'warn';
        const timeStr = formatRelativeTime(item.updated_at);

        card.innerHTML = \`
          <div class="card-header">
            <div class="card-title">
              <h3>\${item.name}</h3>
              <span>ارزش واقعی vs قیمت بازار تلگرام</span>
            </div>
            <span class="bubble-badge \${bubbleClass}">حباب: \${item.bubble_pct}٪</span>
          </div>

          <div class="price-row">
            <span class="price-label">ارزش واقعی طلا (بر اساس دلار):</span>
            <span class="price-val gold">\${formatNum(item.intrinsic)} تومان</span>
          </div>

          <div class="price-row">
            <span class="price-label">قیمت بازار زرماگلد:</span>
            <span class="price-val">\${item.market ? formatNum(item.market) + ' تومان' : 'ناموجود در پیام جدید'}</span>
          </div>

          <div class="price-row" style="margin-top: 10px; border-top: 1px dashed var(--border-color); padding-top: 8px;">
            <span class="price-label">مقدار حباب ریالی:</span>
            <span style="font-weight: 700; color: var(--gold-light);">\${formatNum(item.bubble)} تومان</span>
          </div>

          <div class="timestamp-tag">
            <span>منبع: کانال تلگرام zarmagoldd</span>
            <span>زمان دریافت قیمت: <strong>\${timeStr}</strong></span>
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

      // Fetch live gold spot price
      try {
        const res = await fetch('/api/rates');
        const data = await res.json();
        if (data.success && data.gold_usd) {
          document.getElementById('goldUsd').value = data.gold_usd.toLocaleString('en-US');
        }
        document.getElementById('statusText').innerText = 'قیمت انس و تلگرام بروز است';
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

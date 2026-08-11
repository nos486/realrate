/**
 * RealRate — Iranian Gold & Currency Price Calculator
 * Cloudflare Worker Engine & Embedded Glassmorphism Web App
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
      return handleCalculate(url);
    }

    if (url.pathname === "/api/rates") {
      return handleFetchRates(env);
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
 * Perform price calculations based on USD/Toman and Gold Ounce inputs
 */
function handleCalculate(url) {
  const usd_toman = parseFloat(url.searchParams.get("usd_toman")) || 62000;
  const gold_usd = parseFloat(url.searchParams.get("gold_usd")) || 2450;
  
  // Coin Bubbles in Percentage (%)
  const bubble_full = parseFloat(url.searchParams.get("bubble_full")) || 12.0;
  const bubble_half = parseFloat(url.searchParams.get("bubble_half")) || 15.0;
  const bubble_quarter = parseFloat(url.searchParams.get("bubble_quarter")) || 20.0;

  // Live currency cross-rates vs USD (default fallback rates if not passed)
  const eur_usd = parseFloat(url.searchParams.get("eur_usd")) || 1.092;
  const try_usd = parseFloat(url.searchParams.get("try_usd")) || 0.0294; 
  const aed_usd = parseFloat(url.searchParams.get("aed_usd")) || 0.2723; 
  const gbp_usd = parseFloat(url.searchParams.get("gbp_usd")) || 1.285;
  const cad_usd = parseFloat(url.searchParams.get("cad_usd")) || 0.732;

  // Gold Calculations
  // 1 Troy Ounce = 31.1034768 grams
  const gold_24k_gram = (gold_usd / 31.1034768) * usd_toman;
  const gold_18k_gram = gold_24k_gram * 0.75; // 750 purity ratio
  
  // Mesghal (مظنه طلا)
  // Standard Iranian retail mesghal quote is 4.608g of 17K gold (705 purity)
  const mesghal_17k = gold_24k_gram * 4.608 * 0.705; 
  const mesghal_24k = gold_24k_gram * 4.608;

  // Coin Intrinsic Pure Gold Weights (22K = 900 purity)
  // Full Coin: 8.133g * 0.900 = 7.3197g pure gold
  // Half Coin: 4.066g * 0.900 = 3.6594g pure gold
  // Quarter Coin: 2.033g * 0.900 = 1.8297g pure gold
  const full_intrinsic = gold_24k_gram * 7.3197;
  const half_intrinsic = gold_24k_gram * 3.6594;
  const quarter_intrinsic = gold_24k_gram * 1.8297;

  const full_market = full_intrinsic * (1 + bubble_full / 100);
  const half_market = half_intrinsic * (1 + bubble_half / 100);
  const quarter_market = quarter_intrinsic * (1 + bubble_quarter / 100);

  // Currency Prices in Toman
  const eur_toman = usd_toman * eur_usd;
  const try_toman = usd_toman * try_usd;
  const aed_toman = usd_toman * aed_usd;
  const gbp_toman = usd_toman * gbp_usd;
  const cad_toman = usd_toman * cad_usd;

  const result = {
    timestamp: new Date().toISOString(),
    inputs: {
      usd_toman,
      gold_usd,
      bubble_full,
      bubble_half,
      bubble_quarter
    },
    gold: {
      gold_24k_gram: Math.round(gold_24k_gram),
      gold_18k_gram: Math.round(gold_18k_gram),
      mesghal_17k: Math.round(mesghal_17k),
      mesghal_24k: Math.round(mesghal_24k)
    },
    coins: {
      full: {
        intrinsic: Math.round(full_intrinsic),
        market: Math.round(full_market),
        bubble_amount: Math.round(full_market - full_intrinsic),
        bubble_percent: bubble_full
      },
      half: {
        intrinsic: Math.round(half_intrinsic),
        market: Math.round(half_market),
        bubble_amount: Math.round(half_market - half_intrinsic),
        bubble_percent: bubble_half
      },
      quarter: {
        intrinsic: Math.round(quarter_intrinsic),
        market: Math.round(quarter_market),
        bubble_amount: Math.round(quarter_market - quarter_intrinsic),
        bubble_percent: bubble_quarter
      }
    },
    currencies: {
      usd: Math.round(usd_toman),
      eur: Math.round(eur_toman),
      aed: Math.round(aed_toman),
      try: Math.round(try_toman),
      gbp: Math.round(gbp_toman),
      cad: Math.round(cad_toman)
    }
  };

  return new Response(JSON.stringify(result, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/**
 * Fetch live gold spot price & exchange rates from public APIs
 */
async function handleFetchRates(env) {
  try {
    let gold_usd = 2450;
    
    // 1. Fetch Live Gold Ounce Spot Price (USD / oz)
    try {
      const goldRes = await fetch("https://api.gold-api.com/price/XAU");
      if (goldRes.ok) {
        const gData = await goldRes.json();
        if (gData && gData.price) {
          gold_usd = Math.round(gData.price * 100) / 100;
        }
      }
    } catch (gErr) {
      console.error("Gold spot API error:", gErr);
    }

    // 2. Fetch free global currency rates relative to USD
    let eur_usd = 1.092;
    let try_usd = 0.0294;
    let aed_usd = 0.2723;
    let gbp_usd = 1.285;
    let cad_usd = 0.732;

    const erRes = await fetch("https://open.er-api.com/v6/latest/USD");
    if (erRes.ok) {
      const erData = await erRes.json();
      if (erData && erData.rates) {
        if (erData.rates.EUR) eur_usd = 1 / erData.rates.EUR;
        if (erData.rates.TRY) try_usd = 1 / erData.rates.TRY;
        if (erData.rates.AED) aed_usd = 1 / erData.rates.AED;
        if (erData.rates.GBP) gbp_usd = 1 / erData.rates.GBP;
        if (erData.rates.CAD) cad_usd = 1 / erData.rates.CAD;
      }
    }

    // 3. Optional Navasan API integration
    let navasanData = null;
    if (env && env.NAVASAN_API_KEY) {
      try {
        const navRes = await fetch(`https://api.navasan.tech/latest/?api_key=${env.NAVASAN_API_KEY}`);
        if (navRes.ok) {
          navasanData = await navRes.json();
        }
      } catch (e) {
        console.error("Navasan API fetch failed:", e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        gold_usd,
        rates: {
          eur_usd,
          try_usd,
          aed_usd,
          gbp_usd,
          cad_usd
        },
        navasan: navasanData,
        source: "gold-api.com + open.er-api.com"
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
 * Returns embedded HTML/CSS/JS web application
 */
function getHTMLContent(env) {
  const defaultUsdToman = env?.DEFAULT_USD_TOMAN || "62000";
  const defaultGoldUsd = env?.DEFAULT_GOLD_USD || "2450";

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RealRate | محاسبه‌گر واقعی طلا، سکه و ارز</title>
  <meta name="description" content="محاسبه‌گر پیشرفته قیمت طلا 18 و 24 عیار، سکه و ارزها بر اساس نرخ دلار دستی و انس جهانی طلا خودکار در کلاودفلر ورکر">
  
  <!-- Google Fonts: Vazirmatn -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">

  <style>
    :root {
      --bg-primary: #0a0d14;
      --bg-surface: #121824;
      --bg-glass: rgba(18, 24, 36, 0.75);
      --bg-card: rgba(26, 34, 52, 0.65);
      --border-color: rgba(255, 255, 255, 0.08);
      --border-glow: rgba(245, 158, 11, 0.3);
      
      --gold-primary: #f59e0b;
      --gold-light: #fbbf24;
      --gold-dark: #d97706;
      --gold-gradient: linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #b45309 100%);
      --gold-glass-grad: linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(217, 119, 6, 0.05) 100%);

      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --text-gold: #fde047;
      
      --success: #10b981;
      --danger: #ef4444;
      --info: #3b82f6;

      --radius-sm: 8px;
      --radius-md: 14px;
      --radius-lg: 20px;
      --radius-xl: 28px;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Vazirmatn', -apple-system, BlinkMacSystemFont, sans-serif;
    }

    body {
      background-color: var(--bg-primary);
      background-image: 
        radial-gradient(circle at 10% 20%, rgba(245, 158, 11, 0.08) 0%, transparent 40%),
        radial-gradient(circle at 90% 80%, rgba(59, 130, 246, 0.05) 0%, transparent 40%);
      color: var(--text-main);
      min-height: 100vh;
      padding: 24px 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .container {
      width: 100%;
      max-width: 1040px;
      margin: 0 auto;
    }

    /* Header */
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 28px;
      padding: 16px 24px;
      background: var(--bg-glass);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
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
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
      100% { opacity: 1; transform: scale(1); }
    }

    /* Input Panel */
    .input-panel {
      background: var(--bg-glass);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-xl);
      padding: 24px;
      margin-bottom: 28px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
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
      color: var(--text-main);
      display: flex;
      justify-content: space-between;
      align-items: center;
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
      border-radius: var(--radius-sm);
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

    .actions-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid var(--border-color);
      flex-wrap: wrap;
      gap: 12px;
    }

    .btn-primary {
      background: var(--gold-gradient);
      color: #000;
      border: none;
      border-radius: var(--radius-md);
      padding: 12px 28px;
      font-size: 15px;
      font-weight: 800;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(245, 158, 11, 0.3);
      transition: transform 0.2s, box-shadow 0.2s;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(245, 158, 11, 0.45);
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.06);
      color: var(--text-main);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 12px 20px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: 0.2s;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: var(--text-muted);
    }

    /* Tabs Navigation */
    .tabs-nav {
      display: flex;
      gap: 8px;
      margin-bottom: 24px;
      background: rgba(18, 24, 36, 0.5);
      padding: 6px;
      border-radius: var(--radius-lg);
      border: 1px solid var(--border-color);
      overflow-x: auto;
    }

    .tab-btn {
      flex: 1;
      padding: 10px 16px;
      border: none;
      background: transparent;
      color: var(--text-muted);
      font-size: 14px;
      font-weight: 600;
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: all 0.25s ease;
      white-space: nowrap;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    .tab-btn.active {
      background: var(--gold-glass-grad);
      border: 1px solid var(--gold-primary);
      color: var(--gold-light);
      box-shadow: 0 4px 12px rgba(245, 158, 11, 0.15);
    }

    /* Tab Content */
    .tab-content {
      display: none;
    }

    .tab-content.active {
      display: block;
      animation: fadeIn 0.3s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Section Titles */
    .section-title {
      font-size: 16px;
      font-weight: 700;
      color: var(--text-main);
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .section-title::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--border-color);
    }

    /* Cards Grid */
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
      margin-bottom: 32px;
    }

    .card {
      background: var(--bg-card);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 20px;
      position: relative;
      overflow: hidden;
      transition: all 0.3s ease;
    }

    .card::before {
      content: '';
      position: absolute;
      top: 0;
      right: 0;
      width: 4px;
      height: 100%;
      background: var(--gold-gradient);
      opacity: 0.8;
    }

    .card:hover {
      transform: translateY(-4px);
      border-color: var(--border-glow);
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 14px;
    }

    .card-info h3 {
      font-size: 17px;
      font-weight: 800;
      color: #fff;
    }

    .card-info span {
      font-size: 12px;
      color: var(--text-muted);
    }

    .card-badge {
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: var(--gold-light);
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 700;
    }

    .card-price {
      font-size: 26px;
      font-weight: 900;
      color: var(--gold-light);
      margin-bottom: 8px;
      letter-spacing: -0.5px;
    }

    .card-subtext {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: var(--text-muted);
      border-top: 1px dashed var(--border-color);
      padding-top: 10px;
      margin-top: 10px;
    }

    /* Currency Cards */
    .currency-card::before {
      background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    }

    .currency-card .card-price {
      color: #60a5fa;
    }

    /* Jewelry Calculator Tab */
    .calc-box {
      background: var(--bg-glass);
      backdrop-filter: blur(16px);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-xl);
      padding: 24px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }

    @media (max-width: 768px) {
      .calc-box {
        grid-template-columns: 1fr;
      }
    }

    .calc-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .calc-receipt {
      background: rgba(10, 13, 20, 0.8);
      border: 1px solid var(--border-glow);
      border-radius: var(--radius-lg);
      padding: 20px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
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

    /* Bubble Sliders */
    .slider-box {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 20px;
      margin-bottom: 16px;
    }

    .slider-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 12px;
    }

    .slider-input {
      width: 100%;
      accent-color: var(--gold-primary);
      cursor: pointer;
    }

    /* Reverse Calculator */
    .reverse-box {
      background: var(--bg-glass);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-xl);
      padding: 24px;
    }

    .results-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-top: 20px;
    }

    .res-card {
      background: rgba(26, 34, 52, 0.5);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 16px;
      text-align: center;
    }

    .res-card h4 {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 8px;
    }

    .res-card p {
      font-size: 20px;
      font-weight: 800;
      color: var(--gold-light);
    }

    /* Toast Notification */
    .toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: var(--gold-gradient);
      color: #000;
      font-weight: 700;
      padding: 12px 24px;
      border-radius: 30px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
      transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      z-index: 1000;
    }

    .toast.show {
      transform: translateX(-50%) translateY(0);
    }

    footer {
      margin-top: 40px;
      text-align: center;
      font-size: 13px;
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
          <p>محاسبه‌گر واقعی طلا، سکه و ارز بر پایه دلار</p>
        </div>
      </div>
      <div class="status-badge" id="statusBadge">
        <span class="dot"></span>
        <span>در حال بارگذاری نرخ‌ها...</span>
      </div>
    </header>

    <!-- Main Input Panel -->
    <div class="input-panel">
      <div class="inputs-grid">
        <div class="input-group">
          <label for="usdToman">
            <span>قیمت دلار آزاد (تومان)</span>
            <span style="font-size: 11px; color: var(--gold-light); font-weight: 700;">💾 ذخیره خودکار در مرورگر</span>
          </label>
          <div class="input-wrapper">
            <input type="text" id="usdToman" value="${defaultUsdToman}">
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
            <span style="font-size: 11px; color: var(--success); font-weight: 700;">🌐 دریافت اتوماتیک (قابل ویرایش)</span>
          </label>
          <div class="input-wrapper">
            <input type="text" id="goldUsd" value="${defaultGoldUsd}">
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

      <div class="actions-row">
        <button class="btn-primary" onclick="calculateAll()">
          ⚡ محاسبه قیمت‌های جدید
        </button>
        <div style="display: flex; gap: 10px;">
          <button class="btn-secondary" onclick="fetchLiveRates()">
            🌐 بروزرسانی نرخ جهانی انس و ارزها
          </button>
          <button class="btn-secondary" onclick="copyTelegramReport()">
            📲 کپی گزارش تلگرام
          </button>
        </div>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div class="tabs-nav">
      <button class="tab-btn active" onclick="switchTab('pricesTab', this)">📊 قیمت‌های لحظه‌ای</button>
      <button class="tab-btn" onclick="switchTab('jewelryTab', this)">💎 محاسبه‌گر اجرت و خرید طلا</button>
      <button class="tab-btn" onclick="switchTab('bubbleTab', this)">🎈 تنظیم حباب سکه‌ها</button>
      <button class="tab-btn" onclick="switchTab('reverseTab', this)">🔄 بودجه‌بندی معکوس</button>
    </div>

    <!-- Tab 1: Prices Grid -->
    <div id="pricesTab" class="tab-content active">
      <!-- Gold Items -->
      <div class="section-title">✨ قیمت طلای خام (بدون اجرت)</div>
      <div class="cards-grid">
        <div class="card">
          <div class="card-header">
            <div class="card-info">
              <h3>طلا ۱۸ عیار</h3>
              <span>Gold 18K (750) / gram</span>
            </div>
            <span class="card-badge">هر گرم</span>
          </div>
          <div class="card-price" id="p_gold_18k">-</div>
          <div class="card-subtext">
            <span>مبنا: ۷۵٪ طلا ۲۴ عیار</span>
            <span>ریال: <strong id="p_gold_18k_rial">-</strong></span>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-info">
              <h3>طلا ۲۴ عیار</h3>
              <span>Gold 24K (1000) / gram</span>
            </div>
            <span class="card-badge">طلای خالص</span>
          </div>
          <div class="card-price" id="p_gold_24k">-</div>
          <div class="card-subtext">
            <span>محاسبه مستقیم از انس</span>
            <span>ریال: <strong id="p_gold_24k_rial">-</strong></span>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-info">
              <h3>مثقال طلا (مظنه ۱۷ عیار)</h3>
              <span>Mesghal 17K (4.608g)</span>
            </div>
            <span class="card-badge">بازار تهران</span>
          </div>
          <div class="card-price" id="p_mesghal_17k">-</div>
          <div class="card-subtext">
            <span>۴.۶۰۸ گرم ۱۷ عیار</span>
            <span>معیار بنکداران</span>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-info">
              <h3>مثقال طلا ۲۴ عیار</h3>
              <span>Mesghal 24K (4.608g)</span>
            </div>
            <span class="card-badge">خالص</span>
          </div>
          <div class="card-price" id="p_mesghal_24k">-</div>
          <div class="card-subtext">
            <span>۴.۶۰۸ گرم ۲۴ عیار</span>
            <span>شمش خام</span>
          </div>
        </div>
      </div>

      <!-- Coins -->
      <div class="section-title">🪙 سکه بهار آزادی (قیمت روز با حباب)</div>
      <div class="cards-grid">
        <div class="card">
          <div class="card-header">
            <div class="card-info">
              <h3>تمام سکه امامی</h3>
              <span>Full Coin (8.133g 22K)</span>
            </div>
            <span class="card-badge" id="b_full_tag">حباب: ۱۲٪</span>
          </div>
          <div class="card-price" id="p_full_market">-</div>
          <div class="card-subtext">
            <span>ارزش ذاتی: <strong id="p_full_intrinsic">-</strong></span>
            <span>حباب: <strong id="p_full_bubble" style="color: var(--gold-light);">-</strong></span>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-info">
              <h3>نیم سکه بهار آزادی</h3>
              <span>Half Coin (4.066g 22K)</span>
            </div>
            <span class="card-badge" id="b_half_tag">حباب: ۱۵٪</span>
          </div>
          <div class="card-price" id="p_half_market">-</div>
          <div class="card-subtext">
            <span>ارزش ذاتی: <strong id="p_half_intrinsic">-</strong></span>
            <span>حباب: <strong id="p_half_bubble" style="color: var(--gold-light);">-</strong></span>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-info">
              <h3>ربع سکه بهار آزادی</h3>
              <span>Quarter Coin (2.033g 22K)</span>
            </div>
            <span class="card-badge" id="b_quarter_tag">حباب: ۲۰٪</span>
          </div>
          <div class="card-price" id="p_quarter_market">-</div>
          <div class="card-subtext">
            <span>ارزش ذاتی: <strong id="p_quarter_intrinsic">-</strong></span>
            <span>حباب: <strong id="p_quarter_bubble" style="color: var(--gold-light);">-</strong></span>
          </div>
        </div>
      </div>

      <!-- Foreign Currencies -->
      <div class="section-title">💶 ارزهای جهانی بر اساس قیمت دلار</div>
      <div class="cards-grid">
        <div class="card currency-card">
          <div class="card-header">
            <div class="card-info">
              <h3>یورو اروپا (EUR)</h3>
              <span>Euro / Toman</span>
            </div>
            <span class="card-badge">یک یورو</span>
          </div>
          <div class="card-price" id="c_eur">-</div>
          <div class="card-subtext">
            <span>بر اساس Cross-Rate دلار</span>
          </div>
        </div>

        <div class="card currency-card">
          <div class="card-header">
            <div class="card-info">
              <h3>درهم امارات (AED)</h3>
              <span>Emirates Dirham</span>
            </div>
            <span class="card-badge">ثابت ۳.۶۷ دلار</span>
          </div>
          <div class="card-price" id="c_aed">-</div>
          <div class="card-subtext">
            <span>پگ رسمی به دلار</span>
          </div>
        </div>

        <div class="card currency-card">
          <div class="card-header">
            <div class="card-info">
              <h3>لیر ترکیه (TRY)</h3>
              <span>Turkish Lira</span>
            </div>
            <span class="card-badge">یک لیر</span>
          </div>
          <div class="card-price" id="c_try">-</div>
          <div class="card-subtext">
            <span>نرخ زنده جهانی</span>
          </div>
        </div>

        <div class="card currency-card">
          <div class="card-header">
            <div class="card-info">
              <h3>پوند انگلیس (GBP)</h3>
              <span>British Pound</span>
            </div>
            <span class="card-badge">یک پوند</span>
          </div>
          <div class="card-price" id="c_gbp">-</div>
          <div class="card-subtext">
            <span>نرخ جهانی</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Tab 2: Jewelry Calculator -->
    <div id="jewelryTab" class="tab-content">
      <div class="calc-box">
        <div class="calc-form">
          <h3 style="font-size: 16px; font-weight: 700; color: var(--gold-light);">فاکتور حساب طلافروشی</h3>
          
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
            <label>درصد مالیات بر ارزش افزوده (٪)</label>
            <div class="input-wrapper">
              <input type="number" id="jTax" value="9" step="1" oninput="calculateJewelry()">
              <span class="input-suffix">درصد روی اجرت و سود</span>
            </div>
          </div>
        </div>

        <div class="calc-receipt">
          <div>
            <h4 style="font-size: 15px; color: #fff; margin-bottom: 16px; font-weight: 800;">📝 صورت‌حساب پرداختی شما</h4>
            
            <div class="receipt-line">
              <span>قیمت طلا ۱۸ عیار خام:</span>
              <strong id="rec_raw_gram">-</strong>
            </div>
            <div class="receipt-line">
              <span>ارزش کل طلا خام (<span id="rec_w_disp">5.5</span> گرم):</span>
              <strong id="rec_raw_total">-</strong>
            </div>
            <div class="receipt-line">
              <span>اجرت ساخت (<span id="rec_wage_disp">15</span>٪):</span>
              <strong id="rec_wage_val">-</strong>
            </div>
            <div class="receipt-line">
              <span>سود طلافروش (<span id="rec_profit_disp">7</span>٪):</span>
              <strong id="rec_profit_val">-</strong>
            </div>
            <div class="receipt-line">
              <span>مالیات بر ارزش افزوده (<span id="rec_tax_disp">9</span>٪):</span>
              <strong id="rec_tax_val">-</strong>
            </div>
          </div>

          <div>
            <div class="receipt-line total">
              <span>مبلغ نهایی پرداختی:</span>
              <span id="rec_final_total">-</span>
            </div>
            <p style="font-size: 11px; color: var(--text-muted); margin-top: 8px;">
              * طبق قانون جدید، مالیات فقط روی مجموع اجرت و سود محاسبه می‌شود، نه روی اصل طلا.
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Tab 3: Coin Bubble Adjuster -->
    <div id="bubbleTab" class="tab-content">
      <div class="section-title">🎈 تنظیم درصد حباب سکه‌ها</div>
      <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 20px;">
        می‌توانید درصد حباب روز بازار را تغییر دهید تا قیمت تمام شده و حباب ریالی به صورت لحظه‌ای محاسبه شود.
      </p>

      <div class="slider-box">
        <div class="slider-header">
          <span>تمام سکه امامی (وزن: ۸.۱۳۳ گرم ۲۲ عیار)</span>
          <strong id="sl_full_val" style="color: var(--gold-light);">۱۲ ٪</strong>
        </div>
        <input type="range" class="slider-input" id="sl_full" min="0" max="40" step="0.5" value="12" oninput="updateBubbles()">
      </div>

      <div class="slider-box">
        <div class="slider-header">
          <span>نیم سکه (وزن: ۴.۰۶۶ گرم ۲۲ عیار)</span>
          <strong id="sl_half_val" style="color: var(--gold-light);">۱۵ ٪</strong>
        </div>
        <input type="range" class="slider-input" id="sl_half" min="0" max="40" step="0.5" value="15" oninput="updateBubbles()">
      </div>

      <div class="slider-box">
        <div class="slider-header">
          <span>ربع سکه (وزن: ۲.۰۳۳ گرم ۲۲ عیار)</span>
          <strong id="sl_quarter_val" style="color: var(--gold-light);">۲۰ ٪</strong>
        </div>
        <input type="range" class="slider-input" id="sl_quarter" min="0" max="50" step="0.5" value="20" oninput="updateBubbles()">
      </div>
    </div>

    <!-- Tab 4: Reverse Budget Calculator -->
    <div id="reverseTab" class="tab-content">
      <div class="reverse-box">
        <h3 style="font-size: 16px; font-weight: 700; color: var(--gold-light); margin-bottom: 12px;">🔄 چقدر طلا یا دلار می‌تونم بخرم؟</h3>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 20px;">مبلغ بودجه خود به تومان را وارد کنید تا معادل دقیق طلا و سکه را مشاهده کنید.</p>

        <div class="input-group" style="max-width: 400px; margin-bottom: 24px;">
          <label>مبلغ سرمایه (تومان)</label>
          <div class="input-wrapper">
            <input type="text" id="budgetInput" value="50,000,000" oninput="calculateReverse()">
            <span class="input-suffix">تومان</span>
          </div>
        </div>

        <div class="results-grid">
          <div class="res-card">
            <h4>طلا ۱۸ عیار خام</h4>
            <p id="rev_18k">- گرم</p>
          </div>
          <div class="res-card">
            <h4>طلا ۲۴ عیار خالص</h4>
            <p id="rev_24k">- گرم</p>
          </div>
          <div class="res-card">
            <h4>دلار آمریکا</h4>
            <p id="rev_usd">- $</p>
          </div>
          <div class="res-card">
            <h4>تعداد تمام سکه</h4>
            <p id="rev_full">- عدد</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <footer>
      <p>طراحی و توسعه برای اجرا در Cloudflare Workers Edge Node | RealRate App 2026</p>
    </footer>
  </div>

  <!-- Toast Notification -->
  <div class="toast" id="toast">گزارش تلگرام با موفقیت کپی شد!</div>

  <script>
    // State Data
    let currentCalcData = null;
    let liveCrossRates = {
      eur_usd: 1.092,
      try_usd: 0.0294,
      aed_usd: 0.2723,
      gbp_usd: 1.285,
      cad_usd: 0.732
    };

    // Save & Restore LocalStorage
    function saveLocalUsd() {
      const el = document.getElementById('usdToman');
      if (el && el.value) {
        try {
          localStorage.setItem('realrate_usd_toman', el.value);
        } catch (e) {}
      }
    }

    function loadLocalUsd() {
      try {
        const savedUsd = localStorage.getItem('realrate_usd_toman');
        if (savedUsd) {
          document.getElementById('usdToman').value = savedUsd;
        }
      } catch (e) {}
    }

    // Formatters
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

    function adjustInput(id, delta) {
      const el = document.getElementById(id);
      let val = parsePersianNum(el.value);
      val = Math.max(0, val + delta);
      el.value = val.toLocaleString('en-US');
      if (id === 'usdToman') saveLocalUsd();
      calculateAll();
    }

    // Tab Switching
    function switchTab(tabId, btn) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
      
      document.getElementById(tabId).classList.add('active');
      btn.classList.add('active');
    }

    // Primary Calculation Trigger
    async function calculateAll() {
      const usdToman = parsePersianNum(document.getElementById('usdToman').value);
      const goldUsd = parsePersianNum(document.getElementById('goldUsd').value);
      
      const bFull = parseFloat(document.getElementById('sl_full').value) || 12;
      const bHalf = parseFloat(document.getElementById('sl_half').value) || 15;
      const bQuarter = parseFloat(document.getElementById('sl_quarter').value) || 20;

      const params = new URLSearchParams({
        usd_toman: usdToman,
        gold_usd: goldUsd,
        bubble_full: bFull,
        bubble_half: bHalf,
        bubble_quarter: bQuarter,
        eur_usd: liveCrossRates.eur_usd,
        try_usd: liveCrossRates.try_usd,
        aed_usd: liveCrossRates.aed_usd,
        gbp_usd: liveCrossRates.gbp_usd,
        cad_usd: liveCrossRates.cad_usd
      });

      try {
        const res = await fetch('/api/calculate?' + params.toString());
        if (!res.ok) throw new Error('API Error');
        const data = await res.json();
        currentCalcData = data;
        renderData(data);
        calculateJewelry();
        calculateReverse();
      } catch (err) {
        console.error('Calculation failed:', err);
      }
    }

    // Render calculated prices to DOM
    function renderData(data) {
      // Gold
      document.getElementById('p_gold_18k').innerText = formatNum(data.gold.gold_18k_gram) + ' تومان';
      document.getElementById('p_gold_18k_rial').innerText = formatNum(data.gold.gold_18k_gram * 10);

      document.getElementById('p_gold_24k').innerText = formatNum(data.gold.gold_24k_gram) + ' تومان';
      document.getElementById('p_gold_24k_rial').innerText = formatNum(data.gold.gold_24k_gram * 10);

      document.getElementById('p_mesghal_17k').innerText = formatNum(data.gold.mesghal_17k) + ' تومان';
      document.getElementById('p_mesghal_24k').innerText = formatNum(data.gold.mesghal_24k) + ' تومان';

      // Coins
      document.getElementById('p_full_market').innerText = formatNum(data.coins.full.market) + ' تومان';
      document.getElementById('p_full_intrinsic').innerText = formatNum(data.coins.full.intrinsic) + ' تومان';
      document.getElementById('p_full_bubble').innerText = formatNum(data.coins.full.bubble_amount) + ' تومان';

      document.getElementById('p_half_market').innerText = formatNum(data.coins.half.market) + ' تومان';
      document.getElementById('p_half_intrinsic').innerText = formatNum(data.coins.half.intrinsic) + ' تومان';
      document.getElementById('p_half_bubble').innerText = formatNum(data.coins.half.bubble_amount) + ' تومان';

      document.getElementById('p_quarter_market').innerText = formatNum(data.coins.quarter.market) + ' تومان';
      document.getElementById('p_quarter_intrinsic').innerText = formatNum(data.coins.quarter.intrinsic) + ' تومان';
      document.getElementById('p_quarter_bubble').innerText = formatNum(data.coins.quarter.bubble_amount) + ' تومان';

      // Currencies
      document.getElementById('c_eur').innerText = formatNum(data.currencies.eur) + ' تومان';
      document.getElementById('c_aed').innerText = formatNum(data.currencies.aed) + ' تومان';
      document.getElementById('c_try').innerText = formatNum(data.currencies.try) + ' تومان';
      document.getElementById('c_gbp').innerText = formatNum(data.currencies.gbp) + ' تومان';
    }

    // Jewelry Calculator Tab
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

      document.getElementById('rec_w_disp').innerText = weight.toLocaleString('fa-IR');
      document.getElementById('rec_wage_disp').innerText = wagePct.toLocaleString('fa-IR');
      document.getElementById('rec_profit_disp').innerText = profitPct.toLocaleString('fa-IR');
      document.getElementById('rec_tax_disp').innerText = taxPct.toLocaleString('fa-IR');

      document.getElementById('rec_raw_gram').innerText = formatNum(g18k) + ' تومان';
      document.getElementById('rec_raw_total').innerText = formatNum(rawTotal) + ' تومان';
      document.getElementById('rec_wage_val').innerText = formatNum(wageVal) + ' تومان';
      document.getElementById('rec_profit_val').innerText = formatNum(profitVal) + ' تومان';
      document.getElementById('rec_tax_val').innerText = formatNum(taxVal) + ' تومان';
      document.getElementById('rec_final_total').innerText = formatNum(finalTotal) + ' تومان';
    }

    // Slider Bubbles Update
    function updateBubbles() {
      const bFull = document.getElementById('sl_full').value;
      const bHalf = document.getElementById('sl_half').value;
      const bQuarter = document.getElementById('sl_quarter').value;

      document.getElementById('sl_full_val').innerText = bFull + ' ٪';
      document.getElementById('sl_half_val').innerText = bHalf + ' ٪';
      document.getElementById('sl_quarter_val').innerText = bQuarter + ' ٪';

      document.getElementById('b_full_tag').innerText = 'حباب: ' + bFull + '٪';
      document.getElementById('b_half_tag').innerText = 'حباب: ' + bHalf + '٪';
      document.getElementById('b_quarter_tag').innerText = 'حباب: ' + bQuarter + '٪';

      calculateAll();
    }

    // Reverse Budget Calculator
    function calculateReverse() {
      if (!currentCalcData) return;
      const budget = parsePersianNum(document.getElementById('budgetInput').value);

      const g18k = currentCalcData.gold.gold_18k_gram;
      const g24k = currentCalcData.gold.gold_24k_gram;
      const usd = currentCalcData.currencies.usd;
      const fullCoin = currentCalcData.coins.full.market;

      const w18k = (budget / g18k).toFixed(2);
      const w24k = (budget / g24k).toFixed(2);
      const usdAmt = (budget / usd).toFixed(1);
      const fullAmt = (budget / fullCoin).toFixed(2);

      document.getElementById('rev_18k').innerText = parseFloat(w18k).toLocaleString('fa-IR') + ' گرم';
      document.getElementById('rev_24k').innerText = parseFloat(w24k).toLocaleString('fa-IR') + ' گرم';
      document.getElementById('rev_usd').innerText = '$ ' + parseFloat(usdAmt).toLocaleString('fa-IR');
      document.getElementById('rev_full').innerText = parseFloat(fullAmt).toLocaleString('fa-IR') + ' عدد';
    }

    // Fetch Live Exchange Rates & Auto Gold Spot Price
    async function fetchLiveRates() {
      const badge = document.getElementById('statusBadge');
      badge.innerHTML = '<span class="dot" style="background:var(--gold-primary)"></span> در حال دریافت نرخ انس و ارزها...';

      try {
        const res = await fetch('/api/rates');
        const data = await res.json();
        if (data.success) {
          if (data.rates) {
            liveCrossRates = data.rates;
          }
          if (data.gold_usd) {
            document.getElementById('goldUsd').value = data.gold_usd.toLocaleString('en-US');
          }
          badge.innerHTML = '<span class="dot"></span> نرخ انس جهانی و ارزها بروزرسانی شد';
          calculateAll();
        }
      } catch (err) {
        badge.innerHTML = '<span class="dot" style="background:var(--danger)"></span> خطا در دریافت نرخ';
      }
    }

    // Copy Formatted Report for Telegram Channels
    function copyTelegramReport() {
      if (!currentCalcData) return;
      const d = currentCalcData;
      
      const text = \`👑 گزارش لحظه‌ای بازار طلا و ارز - RealRate
📅 \${new Date().toLocaleDateString('fa-IR')}

💵 دلار آمریکا: \${formatNum(d.currencies.usd)} تومان
⚜️ انس جهانی طلا: \${d.inputs.gold_usd.toLocaleString('fa-IR')} دلار

✨ طلا ۱۸ عیار: \${formatNum(d.gold.gold_18k_gram)} تومان
✨ طلا ۲۴ عیار: \${formatNum(d.gold.gold_24k_gram)} تومان
✨ مثقال طلا (۱۷ عیار): \${formatNum(d.gold.mesghal_17k)} تومان

🪙 تمام سکه امامی: \${formatNum(d.coins.full.market)} تومان (حباب: \${formatNum(d.coins.full.bubble_amount)})
🪙 نیم سکه آزادی: \${formatNum(d.coins.half.market)} تومان
🪙 ربع سکه آزادی: \${formatNum(d.coins.quarter.market)} تومان

💶 یورو: \${formatNum(d.currencies.eur)} تومان
🇦🇪 درهم امارات: \${formatNum(d.currencies.aed)} تومان
🇹🇷 لیر ترکیه: \${formatNum(d.currencies.try)} تومان

⚡ محاسبه در سیستم RealRate Cloudflare Worker\`;

      navigator.clipboard.writeText(text).then(() => {
        const toast = document.getElementById('toast');
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
      });
    }

    // Number Input Formatting listeners & LocalStorage persistence
    ['usdToman', 'goldUsd', 'budgetInput'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('keyup', (e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') {
            const raw = parsePersianNum(el.value);
            if (raw > 0) {
              el.value = raw.toLocaleString('en-US');
            }
          }
          if (id === 'usdToman') {
            saveLocalUsd();
          }
          calculateAll();
        });
      }
    });

    // Initial Load: Restore saved USD price & Auto-fetch Gold Spot Price
    window.addEventListener('DOMContentLoaded', () => {
      loadLocalUsd();
      fetchLiveRates();
    });
  </script>
</body>
</html>`;
}

/**
 * telegramPrices.js — Fetch & parse live Iranian market prices from public Telegram channels
 * Gold/Coin: @zarmagoldd | USD/Toman: @tahran_sabza
 * Throttled to 1 minute. Cached in KV + in-memory.
 */

// Module-level in-memory cache
let tgCache = {};

/**
 * Fetch and cache market prices from Telegram channels
 * @param {object} env
 * @param {boolean} [forceRefresh=false]
 * @returns {object} market prices object
 */
export async function fetchTelegramPrices(env, forceRefresh = false) {
  let stored = { ...tgCache };
  const nowMs = Date.now();

  if (env && env.REALRATE_KV) {
    try {
      const kvVal = await env.REALRATE_KV.get("tg_prices", "json");
      if (kvVal) stored = { ...stored, ...kvVal };
    } catch (e) {
      console.error("KV Read Error:", e);
    }
  }

  const lastCheckMs = stored.last_channel_check_time
    ? new Date(stored.last_channel_check_time).getTime()
    : 0;
  const isFresh = (nowMs - lastCheckMs) < 60000; // 1-minute throttle

  if (isFresh && !forceRefresh && Object.keys(stored).length > 1) {
    return stored;
  }

  try {
    const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    const [goldRes, usdRes] = await Promise.all([
      fetch("https://t.me/s/zarmagoldd", { headers: { "User-Agent": UA } }).catch(() => null),
      fetch("https://t.me/s/tahran_sabza", { headers: { "User-Agent": UA } }).catch(() => null),
    ]);

    if (goldRes && goldRes.ok) {
      const goldHtml = await goldRes.text();
      const parsedGold = parseGoldTelegramHtml(goldHtml);
      for (const [key, item] of Object.entries(parsedGold)) {
        if (item && item.price) {
          const existingItem = stored[key];
          stored[key] = (existingItem && existingItem.price === item.price)
            ? { ...item, datetime: existingItem.datetime || item.datetime }
            : item;
        }
      }
    }

    if (usdRes && usdRes.ok) {
      const usdHtml = await usdRes.text();
      const parsedUsd = parseUsdTelegramHtml(usdHtml);
      if (parsedUsd && parsedUsd.price) {
        const existingUsd = stored.usd_toman;
        stored.usd_toman = (existingUsd && existingUsd.price === parsedUsd.price)
          ? { price: existingUsd.price, datetime: existingUsd.datetime || parsedUsd.datetime, label: "دلار نقدی تهران" }
          : { price: parsedUsd.price, datetime: parsedUsd.datetime || new Date().toISOString(), label: "دلار نقدی تهران" };
      }
    }

    stored.last_channel_check_time = new Date().toISOString();
    tgCache = { ...stored };

    if (env && env.REALRATE_KV) {
      try {
        await env.REALRATE_KV.put("tg_prices", JSON.stringify(stored));
      } catch (e) {
        console.error("KV Write Error:", e);
      }
    }
  } catch (err) {
    console.error("Market fetch error:", err);
  }

  return stored;
}

/**
 * Parse gold and coin prices from Telegram channel HTML
 * @param {string} html
 * @returns {object}
 */
export function parseGoldTelegramHtml(html) {
  const result = {};
  const messageBlocks = html.split(/<div class="tgme_widget_message\b/);

  for (let bIdx = messageBlocks.length - 1; bIdx >= 0; bIdx--) {
    const block = messageBlocks[bIdx];

    const timeMatch = block.match(/<time datetime="([^"]+)"/);
    const datetime = timeMatch ? timeMatch[1] : null;

    const textMatch = block.match(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (!textMatch) continue;

    const rawText = textMatch[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();
    const lines = rawText.split("\n").map(l => l.trim()).filter(Boolean);

    const tryParse = (key, label, matcher) => {
      if (result[key]) return;
      for (let i = 0; i < lines.length; i++) {
        if (matcher(lines[i])) {
          const chunk = lines.slice(i, i + 3).join(" ");
          const saleMatch = chunk.match(/فروش:\s*([\d,]+)/);
          if (saleMatch) {
            const rawNum = parseInt(saleMatch[1].replace(/,/g, ""), 10);
            if (rawNum > 0) result[key] = { price: rawNum, datetime, label };
          }
        }
      }
    };

    tryParse("gold_18k",     "طلا ۱۸ عیار",              l => l.includes("گرم 18 عیار") || l.includes("18 عیار") || l.includes("۱۸ عیار"));
    tryParse("full_coin",    "سکه تمام ۸۶",               l => l.includes("سکه تمام 86") || l.includes("سکه تمام") || l.includes("تمام سکه") || l.includes("سکه امامی"));
    tryParse("mesghal",      "مثقال طلا (۱۷ عیار)",       l => l.includes("آبشده نقد") || l.includes("آبشده") || l.includes("مثقال"));
    tryParse("half_coin",    "نیم سکه بهار آزادی",        l => l.includes("نیم سکه"));
    tryParse("quarter_coin", "ربع سکه بهار آزادی",        l => l.includes("ربع سکه"));
  }

  return result;
}

/**
 * Parse USD/Toman price from Telegram channel HTML
 * @param {string} html
 * @returns {{ price: number, datetime: string, label: string }|null}
 */
export function parseUsdTelegramHtml(html) {
  const messageBlocks = html.split(/<div class="tgme_widget_message\b/);

  for (let bIdx = messageBlocks.length - 1; bIdx >= 0; bIdx--) {
    const block = messageBlocks[bIdx];

    const timeMatch = block.match(/<time datetime="([^"]+)"/);
    const datetime = timeMatch ? timeMatch[1] : null;

    const textMatch = block.match(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (!textMatch) continue;

    const rawText = textMatch[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();
    if ((rawText.includes("دلار") || rawText.includes("تهران")) && (rawText.includes("نقدی") || rawText.includes("نــقدی"))) {
      const lines = rawText.split("\n").map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        if ((line.includes("نقدی") || line.includes("نــقدی")) && line.includes("فروش")) {
          const match = line.match(/([\d,]+)\s*فروش/);
          if (match) {
            const rawNum = parseInt(match[1].replace(/,/g, ""), 10);
            if (rawNum > 0) return { price: rawNum, datetime, label: "دلار نقدی تهران" };
          }
        }
      }
    }
  }

  return null;
}

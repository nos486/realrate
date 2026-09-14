import { describe, it, expect } from "vitest";
import { extractValueByPath } from "../../src/services/market/sources/parsingUtils.js";
import { apiUrlSourceAdapter } from "../../src/services/market/sources/apiUrl.source.adapter.js";

describe("parsingUtils — extractValueByPath with predicate filtering", () => {
  const sampleData = {
    gold: [
      { symbol: "IR_GOLD_18K", name: "طلای ۱۸ عیار", price: 23476800 },
      { symbol: "IR_COIN_EMAMI", name: "سکه امامی", price: 236005000 },
    ],
    currency: [
      { symbol: "USD", name: "دلار", price: 228600 },
      { symbol: "USDT_IRT", name: "دلار تتر", price: 233408 },
    ],
    cryptocurrency: [
      { symbol: "BTC", name: "بیت‌کوین", price: "77643" },
      { symbol: "USDT", name: "تتر", price: "0.9996" },
    ],
  };

  it("extracts item by predicate filter from array", () => {
    const usdtToman = extractValueByPath(sampleData, "currency[symbol=USDT_IRT].price");
    expect(usdtToman).toBe(233408);

    const usdtUsd = extractValueByPath(sampleData, "cryptocurrency[symbol=USDT].price");
    expect(usdtUsd).toBe(0.9996);

    const gold18k = extractValueByPath(sampleData, "gold[symbol=IR_GOLD_18K].price");
    expect(gold18k).toBe(23476800);
  });

  it("handles case-insensitive and whitespace-tolerant predicate values", () => {
    const result = extractValueByPath(sampleData, "currency[symbol=usdt_irt].price");
    expect(result).toBe(233408);
  });

  it("parses correctly through apiUrlSourceAdapter", () => {
    const parsed = apiUrlSourceAdapter.parse(JSON.stringify(sampleData), {
      id: "test_usdt",
      name: "تتر تومانی",
      priceType: "usdt",
      sourceType: "api_url",
      jsonPath: "currency[symbol=USDT_IRT].price",
    });

    expect(parsed.price).toBe(233408);
    expect(parsed.label).toBe("تتر تومانی");
  });

  it("parses correctly using customParser function", () => {
    const parsed = apiUrlSourceAdapter.parse(JSON.stringify(sampleData), {
      id: "test_custom_usdt",
      name: "تتر تومانی با فانکشن اختصاصی",
      priceType: "usdt",
      sourceType: "api_url",
      customParser: (data) => {
        const item = data.currency?.find((c) => c.symbol === "USDT_IRT");
        return item ? item.price : 0;
      },
    });

    expect(parsed.price).toBe(233408);
    expect(parsed.label).toBe("تتر تومانی با فانکشن اختصاصی");
  });

  it("injects BRS API key securely from env into apiUrl without hardcoding", async () => {
    const { resolveApiUrl } = await import("../../src/services/market/sources/apiUrl.source.adapter.js");
    const mockEnv = { BRS_API_KEY: "secret123" };

    // Should append ?key=secret123 when missing
    const url1 = resolveApiUrl("https://api.brsapi.ir/Market/Gold_Currency.php", mockEnv);
    expect(url1).toBe("https://api.brsapi.ir/Market/Gold_Currency.php?key=secret123");

    // Should append &key=secret123 when query string already exists
    const url2 = resolveApiUrl("https://api.brsapi.ir/Tsetmc/AllSymbols.php?type=1", mockEnv);
    expect(url2).toBe("https://api.brsapi.ir/Tsetmc/AllSymbols.php?type=1&key=secret123");

    // Should replace {BRS_API_KEY} placeholder
    const url3 = resolveApiUrl("https://api.brsapi.ir/Market/Gold.php?token={BRS_API_KEY}", mockEnv);
    expect(url3).toBe("https://api.brsapi.ir/Market/Gold.php?token=secret123");

    // Should not modify non-BRS URLs
    const url4 = resolveApiUrl("https://open.er-api.com/v6/latest/USD", mockEnv);
    expect(url4).toBe("https://open.er-api.com/v6/latest/USD");
  });
});


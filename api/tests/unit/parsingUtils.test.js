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

  it("universally interpolates any environment variables and secrets into endpoints without vendor coupling", async () => {
    const { resolveApiUrl, interpolateEnvVariables } = await import("../../src/services/market/sources/apiUrl.source.adapter.js");
    const mockEnv = {
      API_SECRET_TOKEN: "xyz_token_999",
      CUSTOM_CLIENT_ID: "client_456",
    };

    // 1. Template variable interpolation ${VAR}
    const url1 = resolveApiUrl("https://example.com/v1/feed?secret=${API_SECRET_TOKEN}&client=${CUSTOM_CLIENT_ID}", mockEnv);
    expect(url1).toBe("https://example.com/v1/feed?secret=xyz_token_999&client=client_456");

    // 2. Mustache variable interpolation {{VAR}}
    const url2 = resolveApiUrl("https://example.org/api/rates?auth={{API_SECRET_TOKEN}}", mockEnv);
    expect(url2).toBe("https://example.org/api/rates?auth=xyz_token_999");

    // 3. Declarative apiKeyEnv config on source object
    const url3 = resolveApiUrl({
      endpoint: "https://api.external-feed.com/live",
      apiKeyEnv: "API_SECRET_TOKEN",
      apiKeyParam: "token",
    }, mockEnv);
    expect(url3).toBe("https://api.external-feed.com/live?token=xyz_token_999");

    // 4. String interpolation utility directly
    const authHeader = interpolateEnvVariables("Bearer ${API_SECRET_TOKEN}", mockEnv);
    expect(authHeader).toBe("Bearer xyz_token_999");
  });

  it("dispatches to adapters purely by configuration contracts without URL sniffing", async () => {
    const { getAdapterForSource } = await import("../../src/services/market/sources/index.js");

    // Any source explicitly declared as api_url goes to apiUrlSourceAdapter, regardless of endpoint
    const customApiSource = {
      id: "any_custom_source",
      sourceType: "api_url",
      endpoint: "https://arbitrary-service.com/arbitrary/endpoint",
    };
    expect(getAdapterForSource(customApiSource).id).toBe("api_url");

    // Explicit bourse_symbols
    const bourseSource = {
      id: "custom_stocks",
      sourceType: "bourse_symbols",
      endpoint: "https://custom-broker.net/symbols",
    };
    expect(getAdapterForSource(bourseSource).id).toBe("bourse_symbols");

    // Explicit forex_api
    const forexSource = {
      id: "custom_forex",
      sourceType: "forex_api",
      endpoint: "https://any-forex-provider.org/latest",
    };
    expect(getAdapterForSource(forexSource).id).toBe("forex_api");

    // Explicit telegram
    const telegramSource = {
      id: "custom_channel",
      sourceType: "telegram",
      channelUsername: "my_rate_channel",
    };
    expect(getAdapterForSource(telegramSource).id).toBe("telegram");

    // Fallback: legacy source without sourceType defaults to api_url if endpoint is given
    const untypedHttpSource = {
      id: "legacy_http",
      endpoint: "https://unknown-service.io/data.json",
    };
    expect(getAdapterForSource(untypedHttpSource).id).toBe("api_url");
  });

  it("executes customParser for bourse and returns structured catalog items", async () => {
    const { getMasterPriceSourceById } = await import("../../src/config/sources.config.js");
    const bourseSrc = getMasterPriceSourceById("src_def_bourse");
    expect(bourseSrc).toBeDefined();
    expect(typeof bourseSrc.customParser).toBe("function");

    const sampleBourseApiData = [
      { l18: "فملی", l30: "ملی صنایع مس ایران", pl: 263900, pc: 264000 },
      { l18: "عیار", l30: "صندوق طلای عیار مفید", pl: 145000, pc: 144500 },
      { l18: "شپنا", l30: "پالایش نفت اصفهان", pl: 48000, pc: 48200 },
    ];

    const parsed = apiUrlSourceAdapter.parse(JSON.stringify(sampleBourseApiData), bourseSrc);
    expect(parsed.isCatalog).toBe(true);
    expect(parsed.price).toBe(3);
    expect(parsed.compactList).toHaveLength(3);
    expect(parsed.compactList[0].id).toBe("فملی");
    expect(parsed.compactList[0].name).toBe("ملی صنایع مس ایران");
    expect(parsed.compactList[0].price).toBe(26390); // 263900 / 10
    expect(Object.keys(parsed.compactList[0]).sort()).toEqual(["id", "name", "price"]);

    expect(parsed.compactList[1].id).toBe("عیار");
    expect(parsed.compactList[1].name).toBe("صندوق طلای عیار مفید");
    expect(parsed.compactList[1].price).toBe(14500); // 145000 / 10
    expect(Object.keys(parsed.compactList[1]).sort()).toEqual(["id", "name", "price"]);
  });
});



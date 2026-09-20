import { describe, it, expect } from "vitest";
import {
  mergeCharismaPlans,
  charismaPlansSourceAdapter,
  KNOWN_CHARISMA_PLAN_SYMBOLS,
} from "../../src/services/market/sources/charismaPlans.source.adapter.js";

describe("Charisma Investment Plans Adapter & Incremental Merge Tests", () => {
  const samplePlansArray = [
    {
      id: "gold",
      symbol: "GOLD",
      category: "COMMODITY",
      planTitle: "طرح سرمایه گذاری در طلا",
      priceToman: 32316516,
    },
    {
      id: "silver",
      symbol: "SILVER",
      category: "COMMODITY",
      planTitle: "طرح سرمایه گذاری در نقره",
      priceToman: 502396,
    },
    {
      id: "copper",
      symbol: "COPPER",
      category: "COMMODITY",
      planTitle: "طرح سرمایه گذاری در مس",
      priceToman: 2827,
    },
    {
      id: "stocks-index",
      symbol: "STOCKS_INDEX",
      category: "STOCK_MARKET",
      planTitle: "طرح سرمایه‌گذاری استاکس",
      priceToman: 718972,
    },
    {
      id: "real-estate",
      symbol: "REAL_ESTATE",
      category: "REAL_ESTATE",
      planTitle: "طرح سرمایه گذاری مِلک",
      priceToman: 1261,
    },
  ];

  it("extracts plan prices and normalizes to standard catalog format", () => {
    const { mergedList, stats } = mergeCharismaPlans([], samplePlansArray);

    expect(stats.totalPlans).toBe(5);
    expect(stats.addedCount).toBe(5);
    expect(stats.updatedCount).toBe(0);

    const gold = mergedList.find((p) => p.symbol === "GOLD");
    expect(gold).toBeDefined();
    expect(gold.name).toBe("طرح سرمایه گذاری در طلا");
    expect(gold.priceToman).toBe(32316516);
    expect(gold.priceRial).toBe(323165160);
    expect(gold.unit).toBe("واحد");
    expect(gold.isFund).toBe(false);
    expect(gold.category).toBe("charisma_plans");
    expect(gold.badge).toBe("طرح");

    const silver = mergedList.find((p) => p.symbol === "SILVER");
    expect(silver).toBeDefined();
    expect(silver.priceToman).toBe(502396);
    expect(silver.name).toBe("طرح سرمایه گذاری در نقره");

    const copper = mergedList.find((p) => p.symbol === "COPPER");
    expect(copper).toBeDefined();
    expect(copper.priceToman).toBe(2827);

    const stocks = mergedList.find((p) => p.symbol === "STOCKS_INDEX");
    expect(stocks).toBeDefined();
    expect(stocks.priceToman).toBe(718972);

    const realEstate = mergedList.find((p) => p.symbol === "REAL_ESTATE");
    expect(realEstate).toBeDefined();
    expect(realEstate.priceToman).toBe(1261);
  });

  it("preserves missing plans cumulatively when network or payload is partial (zero loss)", () => {
    const { mergedList: initialList } = mergeCharismaPlans([], samplePlansArray);
    expect(initialList.length).toBe(5);

    // Partial payload missing silver, copper, and real-estate
    const partialPayload = [
      {
        id: "gold",
        symbol: "GOLD",
        category: "COMMODITY",
        planTitle: "طرح سرمایه گذاری در طلا",
        priceToman: 32500000, // Price updated
      },
      {
        id: "stocks-index",
        symbol: "STOCKS_INDEX",
        category: "STOCK_MARKET",
        planTitle: "طرح سرمایه‌گذاری استاکس",
        priceToman: 718972, // Price unchanged
      },
    ];

    const { mergedList, stats } = mergeCharismaPlans(initialList, partialPayload);

    expect(stats.totalPlans).toBe(5);
    expect(stats.updatedCount).toBe(1); // Only gold changed
    expect(stats.retainedCount).toBe(3); // silver, copper, real-estate retained

    const gold = mergedList.find((p) => p.symbol === "GOLD");
    expect(gold.priceToman).toBe(32500000);

    const silver = mergedList.find((p) => p.symbol === "SILVER");
    expect(silver).toBeDefined();
    expect(silver.priceToman).toBe(502396);
  });

  it("never overwrites existing valid price with zero, null, or undefined", () => {
    const { mergedList: initialList } = mergeCharismaPlans([], samplePlansArray);

    const zeroPayload = [
      {
        id: "gold",
        symbol: "GOLD",
        category: "COMMODITY",
        planTitle: "طرح طلا",
        priceToman: 0, // Corrupted / zero price
      },
    ];

    const { mergedList } = mergeCharismaPlans(initialList, zeroPayload);
    const gold = mergedList.find((p) => p.symbol === "GOLD");

    expect(gold.priceToman).toBe(32316516); // Preserved previous valid price
  });

  it("adapter supports charisma_plans and parses envelope response", async () => {
    expect(charismaPlansSourceAdapter.supports({ sourceType: "charisma_plans" })).toBe(true);
    expect(charismaPlansSourceAdapter.supports({ priceType: "charisma_plans" })).toBe(true);
    expect(
      charismaPlansSourceAdapter.supports({
        endpoint: "https://n8n.geekio.ir/webhook/38899601-0906-4aa4-aedb-8f7de5493894",
      })
    ).toBe(true);

    const parsed = await charismaPlansSourceAdapter.parse(samplePlansArray, { id: "src_def_charisma_plans" });
    expect(parsed.price).toBe(5);
    expect(parsed.priceType).toBe("charisma_plans");
    expect(parsed.multiData.isCatalog).toBe(true);
    expect(parsed.multiData.totalCount).toBe(5);
    expect(parsed.compactList.length).toBe(5);
  });
});

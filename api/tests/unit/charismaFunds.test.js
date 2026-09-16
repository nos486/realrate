import { describe, it, expect } from "vitest";
import {
  mergeCharismaFunds,
  charismaFundsSourceAdapter,
  KNOWN_CHARISMA_SYMBOLS,
} from "../../src/services/market/sources/charismaFunds.source.adapter.js";

describe("Charisma Investment Funds Adapter & Incremental Merge Tests", () => {
  const sampleFundsArray = [
    {
      id: "a3c9d4f2-8b61-4e7a-9c5d-2f8a6b1e9c47",
      title: "صندوق نقره",
      subtitle: "صندوق سرمایه‌گذاری نقره کاریزما",
      englishTitle: "noghran",
      shortSymbol: "نقران",
      fields: [
        { key: "buyOrLastPriceInfo", title: "قیمت آخرین معامله", value: 12214 },
        { key: "sellOrClosedPriceInfo", title: "قیمت پایانی", value: 12232 },
        { key: "nav", title: "ارزش دارایی‌ها", value: 6507868133109 },
      ],
    },
    {
      id: "8bc93733-33da-4ff4-a778-e4e99ea679de",
      title: "صندوق طلا",
      subtitle: "صندوق سرمایه گذاری طلا کهربا",
      englishTitle: "kahroba",
      shortSymbol: "کهربا",
      fields: [
        { key: "buyOrLastPriceInfo", title: "قیمت آخرین معامله", value: 216790 },
        { key: "sellOrClosedPriceInfo", title: "قیمت پایانی", value: 217652 },
      ],
    },
    {
      id: "f910340f-3ab2-492b-ab39-4740a08ad95f",
      title: "صندوق اهرمی",
      subtitle: "صندوق سرمایه‌گذاری اهرمی کاریزما (واحدهای ممتاز)",
      englishTitle: "ahrom",
      shortSymbol: "اهرم",
      fields: [
        { key: "buyOrLastPriceInfo", title: "قیمت آخرین معامله", value: 74989 },
        { key: "sellOrClosedPriceInfo", title: "قیمت پایانی", value: 75592 },
      ],
    },
  ];

  it("extracts closing price (sellOrClosedPriceInfo) and converts Rials to Tomans", () => {
    const { mergedList, stats } = mergeCharismaFunds([], sampleFundsArray);

    expect(stats.totalFunds).toBe(3);
    expect(stats.addedCount).toBe(3);
    expect(stats.updatedCount).toBe(0);

    const noghran = mergedList.find((f) => f.symbol === "نقران");
    expect(noghran).toBeDefined();
    expect(noghran.name).toBe("صندوق سرمایه‌گذاری نقره کاریزما");
    expect(noghran.priceRial).toBe(12232); // Closing price
    expect(noghran.priceToman).toBe(1223); // 12232 / 10
    expect(noghran.price).toBe(1223);
    expect(noghran.isFund).toBe(true);

    const kahroba = mergedList.find((f) => f.symbol === "کهربا");
    expect(kahroba).toBeDefined();
    expect(kahroba.priceRial).toBe(217652);
    expect(kahroba.priceToman).toBe(21765);

    const ahrom = mergedList.find((f) => f.symbol === "اهرم");
    expect(ahrom).toBeDefined();
    expect(ahrom.priceRial).toBe(75592);
    expect(ahrom.priceToman).toBe(7559);
  });

  it("falls back to buyOrLastPriceInfo if closing price is missing or 0", () => {
    const testList = [
      {
        id: "test-last-price-only",
        title: "صندوق تستی",
        englishTitle: "noghran",
        fields: [
          { key: "buyOrLastPriceInfo", value: 50000 },
          { key: "sellOrClosedPriceInfo", value: 0 },
        ],
      },
    ];

    const { mergedList } = mergeCharismaFunds([], testList);
    const item = mergedList.find((f) => f.symbol === "نقران");
    expect(item).toBeDefined();
    expect(item.priceRial).toBe(50000);
    expect(item.priceToman).toBe(5000);
  });

  it("retains previous valid price when missing or 0 in new response", () => {
    const existing = [
      {
        symbol: "کهربا",
        name: "صندوق سرمایه گذاری طلا کهربا",
        priceRial: 200000,
        priceToman: 20000,
        price: 20000,
      },
    ];

    const rawWithZero = [
      {
        id: "8bc93733-33da-4ff4-a778-e4e99ea679de",
        shortSymbol: "کهربا",
        title: "صندوق طلا",
        fields: [
          { key: "sellOrClosedPriceInfo", value: 0 },
        ],
      },
    ];

    const { mergedList, stats } = mergeCharismaFunds(existing, rawWithZero);
    const kahroba = mergedList.find((f) => f.symbol === "کهربا");
    expect(kahroba.priceRial).toBe(200000);
    expect(kahroba.priceToman).toBe(20000);
    expect(stats.updatedCount).toBe(0);
  });

  it("retains missing funds when not present in latest API response", () => {
    const existing = [
      {
        symbol: "نقران",
        name: "صندوق سرمایه‌گذاری نقره کاریزما",
        priceRial: 12000,
        priceToman: 1200,
        price: 1200,
      },
      {
        symbol: "کهربا",
        name: "صندوق سرمایه گذاری طلا کهربا",
        priceRial: 210000,
        priceToman: 21000,
        price: 21000,
      },
    ];

    // Only kahroba in response, noghran is omitted
    const newApi = [
      {
        id: "8bc93733-33da-4ff4-a778-e4e99ea679de",
        shortSymbol: "کهربا",
        fields: [
          { key: "sellOrClosedPriceInfo", value: 220000 },
        ],
      },
    ];

    const { mergedList, stats } = mergeCharismaFunds(existing, newApi);
    expect(mergedList.length).toBe(2);
    expect(stats.retainedCount).toBe(1);
    expect(stats.updatedCount).toBe(1);

    const noghran = mergedList.find((f) => f.symbol === "نقران");
    expect(noghran).toBeDefined();
    expect(noghran.priceToman).toBe(1200);

    const kahroba = mergedList.find((f) => f.symbol === "کهربا");
    expect(kahroba.priceToman).toBe(22000);
  });

  it("adapter supports charisma_funds and parses envelope response", async () => {
    expect(charismaFundsSourceAdapter.supports({ sourceType: "charisma_funds" })).toBe(true);
    expect(charismaFundsSourceAdapter.supports({ priceType: "charisma_funds" })).toBe(true);
    expect(charismaFundsSourceAdapter.supports({ endpoint: "https://charisma.ir/funds" })).toBe(true);

    const parsed = await charismaFundsSourceAdapter.parse(sampleFundsArray, { id: "src_def_charisma" });
    expect(parsed).toBeDefined();
    expect(parsed.priceType).toBe("charisma_funds");
    expect(Array.isArray(parsed.multiOutput)).toBe(true);
    expect(parsed.multiOutput.length).toBe(3);
  });

  it("contains known Bourse symbol mappings for Charisma funds", () => {
    expect(KNOWN_CHARISMA_SYMBOLS.noghran).toBe("نقران");
    expect(KNOWN_CHARISMA_SYMBOLS.kahroba).toBe("کهربا");
    expect(KNOWN_CHARISMA_SYMBOLS.ahrom).toBe("اهرم");
    expect(KNOWN_CHARISMA_SYMBOLS.kara).toBe("کارا");
    expect(KNOWN_CHARISMA_SYMBOLS.metal).toBe("متال");
    expect(KNOWN_CHARISMA_SYMBOLS.kamand).toBe("کمند");
  });
});

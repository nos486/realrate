import { describe, it, expect } from "vitest";
import {
  mergeCharismaPlans,
  charismaPlansSourceAdapter,
  KNOWN_CHARISMA_PLAN_SYMBOLS,
} from "../../src/services/market/sources/charismaPlans.source.adapter.js";

describe("Charisma Investment Plans Adapter & Incremental Merge Tests", () => {
  const samplePlansApiResponse = [
    {
      id: "c7afa789-f7d9-490b-aff3-030e18521f87",
      order: 0,
      generalInformation: {
        title: "از طلا و نقره تا ملک با طرح‌های سرمایه گذاری ۲۴ ساعته کاریزما",
        faSymbol: "صفحه اصلی طرح ها",
        enSymbol: "main",
      },
      calculatorInformation: {
        lastPrice: 0,
      },
    },
    {
      id: "82c9944a-fddf-45ac-b406-7a26ce62d084",
      order: 10,
      generalInformation: {
        title: "طرح سرمایه گذاری در طلا",
        faSymbol: "طلا",
        enSymbol: "gold",
        imageUri: "https://chr-static-site.charisma.ir/assets/solutions/media/goldNew.svg",
      },
      calculatorInformation: {
        title: { normal: "هر گرم شمش", strong: "طلا ۲۴ عیار" },
        investmentUri: "https://inv.charisma.ir/plans/Gold/buy",
        installmentInvestmentUri: "https://inv.charisma.ir/plans/Gold/buy",
        lastPrice: 323650879.2,
        last24HChange: 0.017,
        lastUpdateDateTime: "2026-09-20T13:04:31.419+03:30",
      },
    },
    {
      id: "04689a46-3eff-45d4-a070-f83f7d4d20d8",
      order: 20,
      generalInformation: {
        title: "طرح سرمایه گذاری در نقره",
        faSymbol: "نقره",
        enSymbol: "silver",
        imageUri: "https://chr-static-site.charisma.ir/assets/solutions/media/silverNew.svg",
      },
      calculatorInformation: {
        title: { normal: "هر گرم شمش", strong: "نقره" },
        investmentUri: "https://inv.charisma.ir/plans/Silver/buy",
        installmentInvestmentUri: "https://inv.charisma.ir/plans/Silver/buy",
        lastPrice: 5033812.04,
        last24HChange: 0.0107,
        lastUpdateDateTime: "2026-09-20T13:06:40.496+03:30",
      },
    },
    {
      id: "4f2b9d7c-6a13-4e8f-b5c2-91d7a3e6c4f8",
      order: 30,
      generalInformation: {
        title: "طرح سرمایه گذاری در مس",
        faSymbol: "مس",
        enSymbol: "copper",
        imageUri: "https://chr-static-site.charisma.ir/assets/solutions/media/copper.svg",
      },
      calculatorInformation: {
        title: { normal: "هر گرم", strong: "کاتد مس" },
        investmentUri: "https://inv.charisma.ir/plans/Copper/buy",
        installmentInvestmentUri: "https://inv.charisma.ir/plans/Copper/buy",
        lastPrice: 28168.13,
        last24HChange: -0.003,
        lastUpdateDateTime: "2026-09-20T13:05:44.36+03:30",
      },
    },
    {
      id: "96cc1c44-0df3-4345-802c-32a83abcf129",
      order: 40,
      generalInformation: {
        title: "طرح سرمایه گذاری درآمد ثابت",
        faSymbol: "درآمد ثابت",
        enSymbol: "fixed-income",
        imageUri: "https://chr-static-site.charisma.ir/assets/solutions/media/fixed-incomeNew.svg",
      },
      calculatorInformation: {
        title: { normal: "نرخ سود سالانه", strong: "۳۸.۵٪+" },
        investmentUri: "https://inv.charisma.ir/plans/FixedIncome/buy",
        lastPrice: 0,
        last24HChange: 0,
      },
    },
  ];

  it("filters out 'main' overview landing and parses investable plans with Toman and Rial prices", () => {
    const { mergedList, stats } = mergeCharismaPlans([], samplePlansApiResponse);

    // 'main' is filtered out -> 4 plans
    expect(stats.totalPlans).toBe(4);
    expect(stats.addedCount).toBe(4);
    expect(stats.updatedCount).toBe(0);

    const main = mergedList.find((p) => p.symbol === "main");
    expect(main).toBeUndefined();

    const gold = mergedList.find((p) => p.symbol === "gold");
    expect(gold).toBeDefined();
    expect(gold.name).toBe("طرح سرمایه گذاری در طلا");
    expect(gold.faSymbol).toBe("طلا");
    expect(gold.priceRial).toBe(323650879);
    expect(gold.priceToman).toBe(32365088);
    expect(gold.price).toBe(32365088);
    expect(gold.isPlan).toBe(true);
    expect(gold.unit).toBe("IRR");
    expect(gold.planData.investmentUri).toBe("https://inv.charisma.ir/plans/Gold/buy");

    const silver = mergedList.find((p) => p.symbol === "silver");
    expect(silver).toBeDefined();
    expect(silver.priceRial).toBe(5033812);
    expect(silver.priceToman).toBe(503381);

    const copper = mergedList.find((p) => p.symbol === "copper");
    expect(copper).toBeDefined();
    expect(copper.priceRial).toBe(28168);
    expect(copper.priceToman).toBe(2817);

    const fixedIncome = mergedList.find((p) => p.symbol === "fixed-income");
    expect(fixedIncome).toBeDefined();
    expect(fixedIncome.priceToman).toBe(0);
  });

  it("retains previous valid price when latest API returns 0 or null", () => {
    const existing = [
      {
        symbol: "gold",
        name: "طرح سرمایه گذاری در طلا",
        priceRial: 320000000,
        priceToman: 32000000,
        price: 32000000,
        updatedAt: "2026-09-20T12:00:00.000Z",
      },
    ];

    // API returns price 0 for gold
    const rawWithZero = [
      {
        generalInformation: {
          enSymbol: "gold",
          title: "طرح سرمایه گذاری در طلا",
        },
        calculatorInformation: {
          lastPrice: 0,
        },
      },
    ];

    const { mergedList, stats } = mergeCharismaPlans(existing, rawWithZero);
    const gold = mergedList.find((p) => p.symbol === "gold");
    expect(gold).toBeDefined();
    expect(gold.priceRial).toBe(320000000);
    expect(gold.priceToman).toBe(32000000);
    expect(stats.updatedCount).toBe(0);
  });

  it("retains missing plans when omitted from latest API response (Cumulative Merge)", () => {
    const existing = [
      {
        symbol: "silver",
        name: "طرح سرمایه گذاری در نقره",
        priceRial: 5000000,
        priceToman: 500000,
        price: 500000,
      },
      {
        symbol: "gold",
        name: "طرح سرمایه گذاری در طلا",
        priceRial: 320000000,
        priceToman: 32000000,
        price: 32000000,
      },
    ];

    // New response only includes gold, silver is missing
    const newApi = [
      {
        generalInformation: {
          enSymbol: "gold",
          title: "طرح طلا",
        },
        calculatorInformation: {
          lastPrice: 325000000,
        },
      },
    ];

    const { mergedList, stats } = mergeCharismaPlans(existing, newApi);
    expect(mergedList.length).toBe(2);
    expect(stats.retainedCount).toBe(1);
    expect(stats.updatedCount).toBe(1);

    const silver = mergedList.find((p) => p.symbol === "silver");
    expect(silver).toBeDefined();
    expect(silver.priceToman).toBe(500000);

    const gold = mergedList.find((p) => p.symbol === "gold");
    expect(gold.priceToman).toBe(32500000);
  });

  it("adapter supports charisma_plans and parses envelope response", async () => {
    expect(charismaPlansSourceAdapter.supports({ sourceType: "charisma_plans" })).toBe(true);
    expect(charismaPlansSourceAdapter.supports({ priceType: "charisma_plans" })).toBe(true);
    expect(charismaPlansSourceAdapter.supports({ endpoint: "https://webapi.charisma.ir/api/Plan/plans" })).toBe(true);

    const parsed = await charismaPlansSourceAdapter.parse(samplePlansApiResponse, { id: "src_def_charisma_plans" });
    expect(parsed).toBeDefined();
    expect(parsed.priceType).toBe("charisma_plans");
    expect(parsed.price).toBe(4); // 4 investable plans
    expect(Array.isArray(parsed.multiOutput)).toBe(true);
    expect(parsed.multiData.isCatalog).toBe(true);
    expect(parsed.multiData.totalCount).toBe(4);
  });

  it("contains known Persian titles for Charisma plan symbols", () => {
    expect(KNOWN_CHARISMA_PLAN_SYMBOLS.gold).toBe("طرح طلا");
    expect(KNOWN_CHARISMA_PLAN_SYMBOLS.silver).toBe("طرح نقره");
    expect(KNOWN_CHARISMA_PLAN_SYMBOLS.copper).toBe("طرح مس");
    expect(KNOWN_CHARISMA_PLAN_SYMBOLS["stocks-index"]).toBe("طرح استاکس");
    expect(KNOWN_CHARISMA_PLAN_SYMBOLS["real-estate"]).toBe("طرح ملک");
  });
});

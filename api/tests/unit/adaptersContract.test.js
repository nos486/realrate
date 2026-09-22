import { describe, it, test, expect } from "vitest";
import {
  telegramSourceAdapter,
  forexApiSourceAdapter,
  apiUrlSourceAdapter,
  bourseSymbolsSourceAdapter,
  emofidFundsSourceAdapter,
  charismaFundsSourceAdapter,
  charismaPlansSourceAdapter,
  sourceAdapters,
} from "../../src/services/market/sources/index.js";

describe("Phase 1 Contract Verification — All Adapters output strictly {items: [{id, name, price}], datetime}", () => {
  const EXPECTED_ITEM_KEYS = ["id", "name", "price"];

  function assertStrictAdapterItem(item, adapterName) {
    expect(item, `Item in ${adapterName} must be an object`).toBeDefined();
    expect(typeof item, `Item in ${adapterName} must be an object`).toBe("object");

    // Must have EXACTLY 3 keys: id, name, price
    const keys = Object.keys(item).sort();
    expect(
      keys,
      `Item in ${adapterName} must strictly contain only [id, name, price], got: [${keys.join(", ")}]`
    ).toEqual(EXPECTED_ITEM_KEYS);

    // Key specifications
    expect(typeof item.id, `${adapterName}: item.id must be a string`).toBe("string");
    expect(item.id.trim().length, `${adapterName}: item.id must not be empty`).toBeGreaterThan(0);

    expect(typeof item.name, `${adapterName}: item.name must be a string`).toBe("string");
    expect(item.name.trim().length, `${adapterName}: item.name must not be empty`).toBeGreaterThan(0);

    expect(typeof item.price, `${adapterName}: item.price must be a number`).toBe("number");
    expect(isNaN(item.price), `${adapterName}: item.price must not be NaN`).toBe(false);
    expect(item.price, `${adapterName}: item.price must be greater than 0`).toBeGreaterThan(0);
  }

  function assertStrictParseResult(result, adapterName) {
    expect(result, `Result from ${adapterName}.parse must be defined`).toBeDefined();
    expect(Array.isArray(result.items), `${adapterName}: result.items must be an Array`).toBe(true);
    expect(result.items.length, `${adapterName}: result.items must not be empty`).toBeGreaterThan(0);

    expect(result.datetime, `${adapterName}: result.datetime must be defined`).toBeDefined();
    expect(typeof result.datetime, `${adapterName}: result.datetime must be string`).toBe("string");
    expect(new Date(result.datetime).getTime(), `${adapterName}: result.datetime must be valid ISO date`).not.toBeNaN();

    for (const item of result.items) {
      assertStrictAdapterItem(item, adapterName);
    }
  }

  // 1. telegramSourceAdapter
  test("1. telegramSourceAdapter.parse returns {items: [{id, name, price}], datetime}", () => {
    const sampleHtml = `
      <div class="tgme_widget_message" data-post="tahran_sabza/1234">
        <div class="tgme_widget_message_text">دلار سبزه 🟢 62,500 تومان</div>
        <time datetime="2026-09-21T10:00:00Z"></time>
      </div>
    `;
    const sourceConfig = {
      id: "src_def_usd",
      name: "دلار تهران سبزه میدان",
      priceType: "usd",
      sourceType: "telegram",
      endpoint: "tahran_sabza",
    };

    const parsed = telegramSourceAdapter.parse(sampleHtml, sourceConfig);
    assertStrictParseResult(parsed, "telegramSourceAdapter");
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toEqual({
      id: "src_def_usd",
      name: "دلار تهران سبزه میدان",
      price: 62500,
    });
  });

  // 2. forexApiSourceAdapter
  test("2. forexApiSourceAdapter.parse returns {items: [{id, name, price}], datetime}", async () => {
    const sampleForexRates = {
      result: "success",
      rates: {
        USD: 1,
        EUR: 0.92,
        AED: 3.6725,
        TRY: 33.5,
        GBP: 0.78,
        CHF: 0.88,
        CAD: 1.35,
        AUD: 1.5,
        CNY: 7.2,
      },
    };
    const sourceConfig = {
      id: "src_def_forex",
      name: "نرخ‌های جهانی فارکس (Open ER-API)",
      priceType: "forex",
      sourceType: "forex_api",
    };

    const parsed = await forexApiSourceAdapter.parse(sampleForexRates, sourceConfig);
    assertStrictParseResult(parsed, "forexApiSourceAdapter");
    expect(parsed.items.length).toBeGreaterThan(5);
    for (const it of parsed.items) {
      expect(EXPECTED_ITEM_KEYS).toEqual(Object.keys(it).sort());
    }
  });

  // 3. apiUrlSourceAdapter (both Single-Output and Multi-Output)
  test("3. apiUrlSourceAdapter.parse returns {items: [{id, name, price}], datetime}", () => {
    // 3a. Single-output JSON
    const singleData = { price: 2650.5 };
    const singleConfig = {
      id: "src_def_ons_gold",
      name: "انس طلا جهانی (XAU)",
      priceType: "ons_gold",
      sourceType: "api_url",
      jsonPath: "price",
    };
    const parsedSingle = apiUrlSourceAdapter.parse(JSON.stringify(singleData), singleConfig);
    assertStrictParseResult(parsedSingle, "apiUrlSourceAdapter (single)");
    expect(parsedSingle.items).toHaveLength(1);
    expect(parsedSingle.items[0]).toEqual({
      id: "src_def_ons_gold",
      name: "انس طلا جهانی (XAU)",
      price: 2650.5,
    });

    // 3b. Multi-output Array
    const multiArray = [
      { code: "USD_IRT", title: "دلار تهران", val: 620000 },
      { code: "EUR_IRT", title: "یورو تهران", val: 680000 },
    ];
    const multiConfig = {
      id: "custom_multi",
      name: "فید چند ارز",
      category: "multi_output",
      fieldMapping: {
        symbolField: "code",
        nameField: "title",
        priceField: "val",
        priceUnit: "rial",
      },
    };
    const parsedMulti = apiUrlSourceAdapter.parse(JSON.stringify(multiArray), multiConfig);
    assertStrictParseResult(parsedMulti, "apiUrlSourceAdapter (multi)");
    expect(parsedMulti.items).toHaveLength(2);
    expect(parsedMulti.items[0]).toEqual({
      id: "USD_IRT",
      name: "دلار تهران",
      price: 62000,
    });
  });

  // 4. bourseSymbolsSourceAdapter
  test("4. bourseSymbolsSourceAdapter.parse returns {items: [{id, name, price}], datetime}", async () => {
    const rawSymbols = [
      { l18: "فولاد", l30: "فولاد مبارکه اصفهان", pl: 5200 },
      { l18: "فملی", l30: "ملی صنایع مس ایران", pl: 7300 },
    ];
    const sourceConfig = {
      id: "src_def_bourse",
      name: "بورس اوراق بهادار تهران",
      priceType: "bourse",
    };

    const parsed = await bourseSymbolsSourceAdapter.parse(rawSymbols, sourceConfig);
    assertStrictParseResult(parsed, "bourseSymbolsSourceAdapter");
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]).toEqual({
      id: "فولاد",
      name: "فولاد مبارکه اصفهان",
      price: 520,
    });
  });

  // 5. emofidFundsSourceAdapter
  test("5. emofidFundsSourceAdapter.parse returns {items: [{id, name, price}], datetime}", async () => {
    const rawFunds = [
      { key: "ayyar", fullTitle: "صندوق طلای عیار مفید", subscriptionNav: "145000" },
      { key: "pishtaz", fullTitle: "صندوق پیشتاز مفید", subscriptionNav: "250000" },
    ];
    const sourceConfig = {
      id: "src_def_emofid",
      name: "صندوق‌های مفید",
      priceType: "emofid_funds",
    };

    const parsed = await emofidFundsSourceAdapter.parse(rawFunds, sourceConfig);
    assertStrictParseResult(parsed, "emofidFundsSourceAdapter");
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]).toEqual({
      id: "ayyar",
      name: "صندوق طلای عیار مفید",
      price: 14500,
    });
  });

  // 6. charismaFundsSourceAdapter
  test("6. charismaFundsSourceAdapter.parse returns {items: [{id, name, price}], datetime}", async () => {
    const rawFunds = [
      { symbol: "اهرم", subtitle: "صندوق اهرمی کاریزما", closedPriceRials: 75230 },
      { symbol: "کهربا", subtitle: "صندوق طلا کهربا", closedPriceRials: 217650 },
    ];
    const sourceConfig = {
      id: "src_def_charisma",
      name: "صندوق‌های کاریزما",
      priceType: "charisma_funds",
    };

    const parsed = await charismaFundsSourceAdapter.parse(rawFunds, sourceConfig);
    assertStrictParseResult(parsed, "charismaFundsSourceAdapter");
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]).toEqual({
      id: "اهرم",
      name: "صندوق اهرمی کاریزما",
      price: 7523,
    });
  });

  // 7. charismaPlansSourceAdapter
  test("7. charismaPlansSourceAdapter.parse returns {items: [{id, name, price}], datetime}", async () => {
    const rawPlans = [
      { key: "gold", name: "طرح طلا", price: 45000 },
      { key: "silver", name: "طرح نقره", price: 12000 },
    ];
    const sourceConfig = {
      id: "src_def_charisma_plans",
      name: "طرح‌های کاریزما",
      priceType: "charisma_plans",
    };

    const parsed = await charismaPlansSourceAdapter.parse(rawPlans, sourceConfig);
    assertStrictParseResult(parsed, "charismaPlansSourceAdapter");
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]).toEqual({
      id: "gold",
      name: "طرح طلا",
      price: 45000,
    });
  });

  // 8. Catalog adapters method hygiene (deprecated methods removed, getItems active)
  test("8. Catalog adapters only expose getItems(env) and removed legacy method names", () => {
    // bourseSymbols
    expect(typeof bourseSymbolsSourceAdapter.getItems).toBe("function");
    expect(bourseSymbolsSourceAdapter.getSymbols).toBeUndefined();

    // emofidFunds
    expect(typeof emofidFundsSourceAdapter.getItems).toBe("function");
    expect(emofidFundsSourceAdapter.getFunds).toBeUndefined();

    // charismaFunds
    expect(typeof charismaFundsSourceAdapter.getItems).toBe("function");
    expect(charismaFundsSourceAdapter.getLatestFunds).toBeUndefined();

    // charismaPlans
    expect(typeof charismaPlansSourceAdapter.getItems).toBe("function");
    expect(charismaPlansSourceAdapter.getLatestPlans).toBeUndefined();
  });

  // 9. All 7 adapters have getItems()
  test("9. All registered adapters in sourceAdapters implement getItems()", () => {
    expect(sourceAdapters.length).toBe(7);
    for (const adapter of sourceAdapters) {
      expect(
        typeof adapter.getItems,
        `Adapter ${adapter.id} (${adapter.name}) must implement getItems()`
      ).toBe("function");
    }
  });

  // 10. Universal Contract Compliance: Generic runner over ALL adapters from sources/index.js
  describe("10. Universal Source Adapter Compliance Suite (sources/index.js)", () => {
    const SAMPLE_FIXTURES = {
      telegram: {
        raw: `<div class="tgme_widget_message"><div class="tgme_widget_message_text">نرخ دلار 65,000 فروش</div></div>`,
        config: { id: "src_test_tg", name: "تست تلگرام", priceType: "usd", sourceType: "telegram" },
      },
      forex_api: {
        raw: { rates: { EUR: 0.92, GBP: 0.79, USD: 1 } },
        config: { id: "src_test_forex", name: "تست فارکس", priceType: "forex", sourceType: "forex_api" },
      },
      bourse_symbols: {
        raw: [{ s: "فولاد", n: "فولاد مبارکه", p: 5400 }],
        config: { id: "src_def_bourse", name: "بورس", priceType: "bourse" },
      },
      emofid_funds: {
        raw: [{ symbol: "عیار", name: "صندوق عیار", price: 18500 }],
        config: { id: "src_def_emofid", name: "صندوق‌های مفید", priceType: "emofid_funds" },
      },
      charisma_funds: {
        raw: [{ symbol: "اهرم", subtitle: "صندوق اهرمی", closedPriceRials: 84000 }],
        config: { id: "src_def_charisma", name: "صندوق‌های کاریزما", priceType: "charisma_funds" },
      },
      charisma_plans: {
        raw: [{ key: "gold", name: "طرح طلای کاریزما", price: 42000 }],
        config: { id: "src_def_charisma_plans", name: "طرح‌های سرمایه‌گذاری کاریزما", priceType: "charisma_plans" },
      },
      api_url: {
        raw: { price: "72000" },
        config: { id: "src_test_api", name: "تست وب سرویس", priceType: "custom", endpoint: "https://api.test/price" },
      },
    };

    sourceAdapters.forEach((adapter) => {
      describe(`Adapter: ${adapter.name} (${adapter.id})`, () => {
        it(`implements all required ISourceAdapter methods and fields`, () => {
          expect(typeof adapter.id, `${adapter.id}: id must be string`).toBe("string");
          expect(adapter.id.length, `${adapter.id}: id must not be empty`).toBeGreaterThan(0);

          expect(typeof adapter.name, `${adapter.id}: name must be string`).toBe("string");
          expect(adapter.name.length, `${adapter.id}: name must not be empty`).toBeGreaterThan(0);

          expect(typeof adapter.supports, `${adapter.id}: supports must be function`).toBe("function");
          expect(typeof adapter.fetchRaw, `${adapter.id}: fetchRaw must be function`).toBe("function");
          expect(typeof adapter.parse, `${adapter.id}: parse must be function`).toBe("function");
          expect(typeof adapter.getItems, `${adapter.id}: getItems must be function`).toBe("function");
        });

        it(`parse() strictly outputs { items: [{ id, name, price }], datetime }`, async () => {
          const fixture = SAMPLE_FIXTURES[adapter.id];
          expect(fixture, `Fixture for adapter ${adapter.id} must be defined`).toBeDefined();

          const result = await adapter.parse(fixture.raw, fixture.config);
          assertStrictParseResult(result, adapter.id);

          // Deep validation of items array
          expect(Array.isArray(result.items)).toBe(true);
          expect(result.items.length).toBeGreaterThan(0);

          result.items.forEach((item, idx) => {
            expect(typeof item.id, `${adapter.id} item[${idx}].id must be string`).toBe("string");
            expect(item.id.trim().length, `${adapter.id} item[${idx}].id must not be empty`).toBeGreaterThan(0);

            expect(typeof item.name, `${adapter.id} item[${idx}].name must be string`).toBe("string");
            expect(item.name.trim().length, `${adapter.id} item[${idx}].name must not be empty`).toBeGreaterThan(0);

            expect(typeof item.price, `${adapter.id} item[${idx}].price must be number`).toBe("number");
            expect(isNaN(item.price), `${adapter.id} item[${idx}].price must not be NaN`).toBe(false);
            expect(item.price, `${adapter.id} item[${idx}].price must be > 0`).toBeGreaterThan(0);

            // Strict shape: only id, name, price
            const keys = Object.keys(item).sort();
            expect(keys, `${adapter.id} item[${idx}] keys must be exactly [id, name, price]`).toEqual(EXPECTED_ITEM_KEYS);
          });
        });
      });
    });
  });
});

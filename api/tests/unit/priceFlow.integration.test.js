/**
 * priceFlow.integration.test.js — One price, from the source's response to every screen
 *
 * The real source config and adapters sync against stubbed network responses into an in-memory
 * KV; then the price book route, the older routes and the web's views (assets, the calculator,
 * home cards, portfolio prices) must all show the same number for the same asset. Also: a source
 * that fails keeps its last prices (and everything computed from them), and a ×10 slip is held
 * back.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { syncAllSources } from '../../src/services/market/sourceSync.service.js';
import { resetPriceBookMemo } from '../../src/repositories/priceBookStore.repository.js';
import { memoryStateDb } from '../helpers/memoryStateDb.js';
import { handleGetPriceBook, handleGetPrices } from '../../src/handlers/apiRoutes.js';
import { handleGetUnifiedMarketItems } from '../../src/handlers/unifiedItemsRoute.js';
import { resolveHoldingUnitRealPrice } from '../../src/domain/formulas.js';
import { bookToAssets, priceOf } from '../../../web/src/features/market/priceBookAssets.js';
import { calculateMarketData } from '../../../web/src/utils/calculator.js';
import { buildAssetIndex, resolveHomeAsset } from '../../../web/src/features/home/homeAssets.js';

/** A Worker KV namespace in memory */

const telegramPage = (text) => `<div class="tgme_widget_message_wrap"><div class="tgme_widget_message js-widget_message">
  <div class="tgme_widget_message_text js-message_text" dir="auto">${text}</div>
  <time datetime="2026-09-27T08:00:00+00:00" class="time">08:00</time></div></div>`;

/** The network, as each source's endpoint answers */
let responses;
function stubNetwork() {
  vi.stubGlobal('fetch', vi.fn(async (input) => {
    const url = String(input?.url || input);
    const match = Object.keys(responses).find((part) => url.includes(part));
    const body = match ? responses[match] : null;
    if (body === null || body === undefined) return new Response('not here', { status: 404 });
    return typeof body === 'string'
      ? new Response(body, { status: 200, headers: { 'Content-Type': 'text/html' } })
      : new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
}

const json = async (response) => response.json();

describe('a price from its source to every screen', () => {
  let env;

  beforeEach(() => {
    resetPriceBookMemo();
    env = { DB: memoryStateDb() };
    responses = {
      tahran_sabza: telegramPage('دلار تهران<br/>234,000 فروش'),
      'gold-api.com/price/XAU': { price: 3700 },
      'gold-api.com/price/XAG': { price: 42 },
      'open.er-api.com': { rates: { USD: 1, EUR: 0.8, TRY: 40 } },
      'Gold_Currency.php': { currency: [{ symbol: 'USDT_IRT', price: 236000 }] },
    };
    stubNetwork();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('shows the same dollar, lira and ounce in the book, the older routes and the web', async () => {
    const tick = await syncAllSources(env, { forceAll: true });
    expect(tick.syncedCount).toBeGreaterThanOrEqual(5);

    // Only the book and one list per source are stored
    const keys = [...env.DB.rows.keys()];
    expect(keys.filter((k) => !k.startsWith('source_items:'))).toEqual(['prices']);

    const book = await json(await handleGetPriceBook(env, new Request('https://x/api/prices/book')));
    expect(book.items.usd.price).toBe(234000);
    expect(book.items.usdt.price).toBe(236000);
    expect(book.items.eur.price).toBe(Math.round(234000 * 1.25));
    expect(book.items.try.price).toBe(Math.round(234000 * 0.025));
    expect(book.items.ons_gold.price).toBe(3700 * 234000);
    expect(book.items.gold_18k.params.derived).toBe('intrinsic'); // no 18k source answered

    // The older routes read the same book
    const prices = await json(await handleGetPrices(env, new Request('https://x/api/prices')));
    expect(prices.live_usd_toman).toBe(234000);
    expect(prices.gold_usd).toBe(3700);
    expect(prices.forex.EUR).toBe(1.25);
    expect(prices.reference_rates.map((r) => [r.key, r.price])).toEqual([['usd', 234000], ['usdt', 236000]]);
    const market = await json(await handleGetUnifiedMarketItems(env, new Request('https://x/api/market/items')));
    expect(market.meta.live_usd_toman).toBe(234000);
    expect(market.currencies.find((c) => c.code === 'EUR').usdCrossRate).toBe(1.25);

    // The web: assets, the calculator (at another "what if" dollar), home cards, portfolio
    const { priceMap, itemMap } = bookToAssets(book);
    expect(priceOf(priceMap, 'src_def_usd')).toBe(234000);
    const calc = calculateMarketData({ usdToman: 250000, goldUsd: 3700, book, globalSettings: book.globalSettings });
    expect(calc.currencies.find((c) => c.code === 'TRY').toman_price).toBe(book.items.try.price);
    const index = buildAssetIndex({ itemMap, analysis: calc.analysis });
    expect(resolveHomeAsset('USD', index).price).toBe(234000);
    expect(resolveHoldingUnitRealPrice({ assetId: 'forex_eur' }, priceMap)).toBe(book.items.eur.price);
  });

  it('keeps a failed source\'s prices, and everything computed from them, and says it failed', async () => {
    await syncAllSources(env, { forceAll: true });
    responses.tahran_sabza = null; // the dollar's channel is down
    responses['open.er-api.com'] = { rates: { EUR: 0.8, TRY: 41 } };

    const tick = await syncAllSources(env, { forceAll: true });
    expect(tick.failedCount).toBeGreaterThanOrEqual(1);
    const book = env.DB.json('prices');
    expect(book.items.usd.price).toBe(234000);
    expect(book.items.try.price).toBe(Math.round(234000 / 41));
    expect(book.sources.src_def_usd.error).toBeTruthy();
  });

  it('holds back a price that suddenly jumps ×10 (rials instead of tomans)', async () => {
    await syncAllSources(env, { forceAll: true });
    responses.tahran_sabza = telegramPage('دلار تهران<br/>1,999,000 فروش');
    await syncAllSources(env, { forceAll: true });
    const book = env.DB.json('prices');
    expect(book.items.usd.price).toBe(234000);
    expect(book.sources.src_def_usd.held).toBeTruthy();
  });
});

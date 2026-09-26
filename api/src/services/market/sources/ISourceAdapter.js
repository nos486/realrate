/**
 * ISourceAdapter.js — Master Common Interface Definition for Price Source Adapters
 *
 * Each adapter encapsulates communication and parsing logic for a specific
 * external price source type (e.g., Telegram channels, Forex Open ER-API, Bourse BRS API, Generic JSON API).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FINAL ADAPTER CONTRACT (قرارداد نهایی ادپتورها):
 * ─────────────────────────────────────────────────────────────────────────────
 * Every source adapter MUST implement the following unified interface without exception:
 *
 * 1. id: string
 *    Unique identifier for the adapter (e.g. "telegram", "bourse_symbols", "emofid_funds",
 *    "charisma_funds", "charisma_plans", "forex_api", "api_url").
 *
 * 2. name: string
 *    Human-readable Persian display name.
 *
 * 3. supports(sourceConfig): boolean
 *    Determines whether this adapter handles the specified source configuration.
 *
 * 4. fetchRaw(sourceConfig, env?): Promise<any>
 *    Fetches raw payload/HTML/JSON from the external endpoint.
 *
 * 5. parse(raw, sourceConfig, env?): Promise<ParsedPriceResult> | ParsedPriceResult
 *    ALWAYS returns an object containing strictly:
 *      {
 *        items: [{ id: string, name: string, price: number }],
 *        datetime: string // ISO 8601 string
 *      }
 *    Single-output feeds return items with a single entry (e.g. USD, Gold).
 *    Multi-output or catalog feeds return items containing all parsed elements.
 *
 * 6. getItems(env?): Promise<Array<AdapterItem>>
 *    Unified method name across ALL adapters to retrieve current active items.
 *    Legacy method names (`getSymbols`, `getFunds`, `getLatestFunds`, `getLatestPlans`)
 *    have been completely retired.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CORE ARCHITECTURAL INVARIANTS (قواعد تغییرناپذیر معماری):
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Output Shape: Strictly `{ items: [{ id, name, price }], datetime }`.
 * 2. ID Convention: Always `${sourceId}__${itemKey}` for catalog items, or canonical source ID for single-rate.
 * 3. Metadata Invariant: Unit, category, badge, and color are defined ONLY at source and category level
 *    (in `sources.config.js` and `categories.config.js`). Items NEVER define independent units/categories.
 * 4. Presentation Invariant: Display name is strictly formatted by `displayEngine.js` as
 *    `"{item.name} ({sourceName})"`. No hardcoded strings or brand checks in frontend components.
 * 5. Storage Invariant: parse() never writes. The sync (sourceSync.service.js) stores a source's items
 *    once, under `source_items:${sourceId}`, and only when they changed.
 *
 * Optional Hooks:
 * - test(sourceConfig, env?): Run an end-to-end test without persisting to storage.
 */

/**
 * @typedef {Object} AdapterItem
 * @property {string} id - Canonical identifier for the asset/item (${sourceId}__${itemKey})
 * @property {string} name - Clean Persian display name (e.g. "فولاد مبارکه", "دلار تهران سبزه میدان", "طرح طلا")
 * @property {number} price - Numerical price in Tomans (or USD for international commodities)
 */

/**
 * Standard parse result contract returned by every adapter's parse() method.
 *
 * @typedef {Object} ParsedPriceResult
 * @property {Array<AdapterItem>} items - Array of standardized items: [{ id, name, price }]
 * @property {string} datetime - ISO 8601 date-time string of the price update
 */

/**
 * @typedef {Object} SourceAdapter
 * @property {string} id - Unique identifier for the adapter
 * @property {string} name - Friendly Persian name
 * @property {(sourceConfig: object) => boolean} supports - Check if sourceConfig matches this adapter
 * @property {(sourceConfig: object, env?: object) => Promise<any>} fetchRaw - Fetch raw content from endpoint
 * @property {(raw: any, sourceConfig: object, env?: object) => Promise<ParsedPriceResult>|ParsedPriceResult} parse - Parse raw content into standard clean price result: { items: [{ id, name, price }], datetime }
 * @property {(env?: object) => Promise<Array<AdapterItem>>} getItems - Unified method to retrieve items across all adapters
 * @property {(sourceConfig: object, env?: object) => Promise<object>} [test] - Run end-to-end test without saving
 */

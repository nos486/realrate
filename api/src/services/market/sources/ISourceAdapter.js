/**
 * ISourceAdapter.js — The contract every price source adapter keeps
 *
 * An adapter knows one kind of endpoint and nothing else: it reads it and turns the answer into
 * items. It is chosen by the `sourceType` a source names (sources/index.js) and never writes,
 * caches or remembers anything between calls — the pipeline (sourceSync.service.js) does all of
 * that, the same way for every source:
 *   fetchRaw → parse → (a catalog: merged with its previous list) → jump guard → stored →
 *   price book → history
 *
 * Rules:
 * 1. parse() returns `{ items: [{ id, name, price }], datetime }` — nothing more per item, and
 *    throws (with a message an admin can act on) when the answer holds no price.
 * 2. `id`: a single-price source's own id; a multi-output feed's item code; a catalog item's own
 *    symbol (the price book makes it `${market}__${symbol}`).
 * 3. `price`: in the source's `quote` (sources.config.js) — conversion and rounding are the price
 *    book's. Units, categories and names shown come from the config and the specs, not items.
 * 4. Everything an adapter needs is in its source's config (endpoint, paths, maps): no default
 *    URLs, ids or symbols in the adapter.
 */

/**
 * @typedef {Object} AdapterItem
 * @property {string} id - see rule 2
 * @property {string} name - the item's name as the feed gives it
 * @property {number} price - in the source's quote (see rule 3)
 */

/**
 * @typedef {Object} ParsedPriceResult
 * @property {Array<AdapterItem>} items
 * @property {string} datetime - ISO 8601 time of the prices
 */

/**
 * @typedef {Object} SourceAdapter
 * @property {string} id - the `sourceType` it serves
 * @property {string} name - its Persian name (shown to the admin)
 * @property {(src: object, env?: object) => Promise<any>} fetchRaw - read the endpoint
 * @property {(raw: any, src: object) => ParsedPriceResult|Promise<ParsedPriceResult>} parse - the answer as items
 */

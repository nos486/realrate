/**
 * ISourceAdapter.js — Common Interface Definition for Price Source Adapters
 *
 * Each adapter encapsulates the communication and parsing logic for a specific
 * external price source type (e.g., Telegram channels, Forex Open ER-API, Bourse BRS API, Generic JSON API).
 */

/**
 * @typedef {Object} CatalogItem
 * @property {string} s - Symbol code
 * @property {string} symbol - Symbol code
 * @property {string} n - Name/title
 * @property {string} name - Name/title
 * @property {number} p - Price in Tomans
 * @property {number} price - Price in Tomans
 * @property {number} priceToman - Price in Tomans
 * @property {number} priceRial - Price in Rials
 * @property {number} pl - Price in Rials
 * @property {string} unit - Currency unit ("IRR")
 * @property {boolean} isFund - Flag indicating if mutual fund
 * @property {string} category - Category label ("صندوق سرمایه‌گذاری" | "سهام بورس")
 * @property {string} type - "صندوق" | "سهام"
 * @property {string} sourceId - Unique source id (e.g. "src_def_bourse")
 * @property {string} sourceName - Friendly source name
 * @property {string} updatedAt - ISO date string
 */

/**
 * @typedef {Object} ParsedPriceResult
 * @property {number} price - Primary single price or count of items
 * @property {string} datetime - ISO date-time string of the price
 * @property {string} label - Friendly Persian label or channel name
 * @property {object} [multiData] - Dictionary of rates or catalog object { isCatalog: true, totalCount, items, ... }
 * @property {Array<CatalogItem>} [compactList] - Compact array of items
 * @property {Array<CatalogItem>} [sampleItems] - Up to 50 sample items for preview/test
 * @property {Array} [currencyList] - Detailed currency rate objects (for Forex)
 */

/**
 * @typedef {Object} SourceAdapter
 * @property {string} id - Unique identifier for the adapter
 * @property {string} name - Friendly Persian name
 * @property {(sourceConfig: object) => boolean} supports - Check if sourceConfig matches this adapter
 * @property {(sourceConfig: object, env?: object) => Promise<any>} fetchRaw - Fetch raw content from endpoint
 * @property {(raw: any, sourceConfig: object, env?: object) => Promise<ParsedPriceResult>|ParsedPriceResult} parse - Parse raw content into clean price result
 * @property {(env?: object) => Promise<Array<CatalogItem>>} [getItems] - Return catalog items array (for catalog adapters)
 * @property {(env: object) => Promise<boolean>} [handleScheduledSync] - Periodic background sync handler
 * @property {(sourceConfig: object, env?: object) => Promise<object>} [test] - Run end-to-end test without saving
 */

/**
 * ISourceAdapter.js — Common Interface Definition for Price Source Adapters
 *
 * Each adapter encapsulates the communication and parsing logic for a specific
 * external price source type (e.g., Telegram channels, Forex Open ER-API, Bourse BRS API, Generic JSON API).
 */

/**
 * @typedef {Object} ParsedPriceResult
 * @property {number} price - Primary single price or count of items
 * @property {string} datetime - ISO date-time string of the price
 * @property {string} label - Friendly Persian label or channel name
 * @property {object} [multiData] - Dictionary of codes to rates for multi-output feeds
 * @property {Array} [compactList] - Compact array of items { s, n, p, ... }
 * @property {Array} [sampleItems] - Up to 30 sample items for preview/test
 * @property {Array} [currencyList] - Detailed currency rate objects (for Forex)
 */

/**
 * @typedef {Object} SourceAdapter
 * @property {string} id - Unique identifier for the adapter
 * @property {string} name - Friendly Persian name
 * @property {(sourceConfig: object) => boolean} supports - Check if sourceConfig matches this adapter
 * @property {(sourceConfig: object, env?: object) => Promise<any>} fetchRaw - Fetch raw content from endpoint
 * @property {(raw: any, sourceConfig: object, env?: object) => Promise<ParsedPriceResult>|ParsedPriceResult} parse - Parse raw content into clean price result
 * @property {(sourceConfig: object, env?: object) => Promise<object>} [test] - Run end-to-end test without saving
 */

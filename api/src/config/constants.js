/**
 * constants.js — Centralized application-wide constants, cache TTLs, and query limits
 */

// ─── Sessions & Authentication ──────────────────────────────────────────────
/** Session duration: 30 days in seconds (2,592,000) */
export const SESSION_TTL_SECONDS = 30 * 24 * 3600;

/** Session cookie lifetime in seconds */
export const SESSION_COOKIE_MAX_AGE = 2592000;

/** OAuth PKCE and verifier cookie lifetime in seconds (10 minutes) */
export const OAUTH_VERIFIER_COOKIE_MAX_AGE = 600;

// ─── Cache TTLs & Fetch Intervals ──────────────────────────────────────────
/** Default price source fetch interval: 5 minutes in seconds */
export const DEFAULT_FETCH_INTERVAL_SEC = 300;

/** In-memory global settings cache TTL: 60 seconds in ms */
export const SETTINGS_MEMORY_CACHE_TTL_MS = 60000;

/** Forex rate history KV expiration TTL: 1 hour in seconds */
export const FOREX_HISTORY_EXPIRATION_TTL = 3600;

// ─── Query Limits ───────────────────────────────────────────────────────────
/** Default number of items returned in search queries */
export const DEFAULT_BOURSE_SEARCH_LIMIT = 50;

/** Maximum limit for market item queries */
export const MAX_MARKET_ITEMS_LIMIT = 2000;

/**
 * constants.js — Centralized application-wide constants, cache TTLs, intervals, and limits
 */

// ─── Sessions & Authentication ──────────────────────────────────────────────
/** Session duration: 30 days in seconds (2,592,000) */
export const SESSION_TTL_SECONDS = 30 * 24 * 3600;

/** Session duration: 30 days in milliseconds */
export const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;

/** Session cookie lifetime in seconds */
export const SESSION_COOKIE_MAX_AGE = 2592000;

/** OAuth PKCE and verifier cookie lifetime in seconds (10 minutes) */
export const OAUTH_VERIFIER_COOKIE_MAX_AGE = 600;

// ─── Intervals & Throttles ──────────────────────────────────────────────────
/** Active user window interval: 5 minutes in ms */
export const ACTIVE_USER_INTERVAL_MS = 5 * 60 * 1000;

/** Default price source fetch interval: 5 minutes in seconds */
export const DEFAULT_FETCH_INTERVAL_SEC = 300;

/** Forex API fetch throttling interval: 10 minutes in ms */
export const FOREX_CACHE_THROTTLE_MS = 10 * 60 * 1000;

/** Forex rate history KV expiration TTL: 1 hour in seconds */
export const FOREX_HISTORY_EXPIRATION_TTL = 3600;

/** In-memory global settings cache TTL: 60 seconds in ms */
export const SETTINGS_MEMORY_CACHE_TTL_MS = 60000;

// ─── Bourse (Tehran Stock Exchange) ────────────────────────────────────────
/** Bourse symbols full sync interval: 24 hours in ms */
export const BOURSE_SYNC_INTERVAL_MS = 86400 * 1000;

/** Bourse last sync record expiration TTL in KV: 3 days in seconds */
export const BOURSE_SYNC_EXPIRATION_TTL = 86400 * 3;

/** Default number of bourse symbols returned in search */
export const DEFAULT_BOURSE_SEARCH_LIMIT = 50;

/** Maximum limit for market item queries */
export const MAX_MARKET_ITEMS_LIMIT = 2000;

// ─── Emofid Mutual Funds ───────────────────────────────────────────────────
/** Emofid funds sync interval: 30 minutes in ms */
export const EMOFID_SYNC_INTERVAL_MS = 30 * 60 * 1000;

/** Emofid last sync record expiration TTL in KV: 1 day in seconds */
export const EMOFID_SYNC_EXPIRATION_TTL = 86400;


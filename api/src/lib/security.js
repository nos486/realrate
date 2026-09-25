/**
 * security.js — Trusted-origin checks, share-password hashing, and simple KV rate limiting
 */

import { getKv } from "../repositories/kvCache.repository.js";

/**
 * Domains whose origin (or any subdomain of it) may talk to the API with credentials and
 * receive the OAuth redirect. Matching is exact on a label boundary, so "evilrealrate.ir" or
 * "someone-else.pages.dev" never match.
 */
const TRUSTED_DOMAINS = [
  "realrate.ir",
  "geekio.org",
  "realrate-5pn.pages.dev", // Cloudflare Pages project + its preview deployments (<hash>.realrate-5pn.pages.dev)
  "realrate.pages.dev",
];

/**
 * Whether a hostname is one of our own frontend hosts
 * @param {string} hostname
 * @returns {boolean}
 */
export function isTrustedHostname(hostname) {
  if (!hostname) return false;
  const host = String(hostname).toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host === "127.0.0.1") return true;
  return TRUSTED_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/**
 * Whether a full URL/origin points to one of our frontends. Remote hosts must use https;
 * plain http is accepted only for local development.
 * @param {string} urlOrOrigin
 * @returns {boolean}
 */
export function isTrustedOrigin(urlOrOrigin) {
  if (!urlOrOrigin) return false;
  let parsed;
  try {
    parsed = new URL(urlOrOrigin);
  } catch {
    return false;
  }
  if (!isTrustedHostname(parsed.hostname)) return false;
  const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  return parsed.protocol === "https:" || (isLocal && parsed.protocol === "http:");
}

// ─── Share password hashing ────────────────────────────────────────────────────

const SHARE_HASH_PREFIX = "pbkdf2$";
// Cloudflare Workers cap PBKDF2 at 100,000 iterations
const SHARE_HASH_ITERATIONS = 100000;

function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function pbkdf2(password, salt, iterations) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    baseKey,
    256
  );
  return new Uint8Array(bits);
}

/**
 * Constant-time comparison of two strings
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function timingSafeEqual(a, b) {
  const aBytes = new TextEncoder().encode(String(a));
  const bBytes = new TextEncoder().encode(String(b));
  let diff = aBytes.length ^ bBytes.length;
  const len = Math.max(aBytes.length, bBytes.length);
  for (let i = 0; i < len; i++) {
    diff |= (aBytes[i] || 0) ^ (bBytes[i] || 0);
  }
  return diff === 0;
}

/**
 * Whether a stored share password is already a hash (vs. a legacy plaintext value)
 * @param {string} stored
 * @returns {boolean}
 */
export function isHashedSharePassword(stored) {
  return typeof stored === "string" && stored.startsWith(SHARE_HASH_PREFIX);
}

/**
 * Hash a share password for storage. Empty input yields "" (no password).
 * @param {string} password
 * @returns {Promise<string>} "pbkdf2$<iterations>$<salt>$<hash>"
 */
export async function hashSharePassword(password) {
  const clean = String(password || "").trim();
  if (!clean) return "";
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(clean, salt, SHARE_HASH_ITERATIONS);
  return `${SHARE_HASH_PREFIX}${SHARE_HASH_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

/**
 * Verify a submitted share password against the stored value (hash or legacy plaintext)
 * @param {string} submitted
 * @param {string} stored
 * @returns {Promise<boolean>}
 */
export async function verifySharePassword(submitted, stored) {
  const candidate = String(submitted ?? "").trim();
  const storedValue = String(stored ?? "").trim();
  if (!candidate || !storedValue) return false;

  if (!isHashedSharePassword(storedValue)) {
    return timingSafeEqual(candidate, storedValue);
  }

  const parts = storedValue.slice(SHARE_HASH_PREFIX.length).split("$");
  if (parts.length !== 3) return false;
  const iterations = parseInt(parts[0], 10);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  try {
    const salt = base64ToBytes(parts[1]);
    const expected = parts[2];
    const actual = bytesToBase64(await pbkdf2(candidate, salt, iterations));
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// ─── Account passwords & one-time tokens ───────────────────────────────────────

/**
 * Hash an account password for storage (same PBKDF2 format as share passwords). Unlike share
 * passwords it is used exactly as typed: spaces are part of a password.
 * @param {string} password
 * @returns {Promise<string>} "pbkdf2$<iterations>$<salt>$<hash>"
 */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(String(password), salt, SHARE_HASH_ITERATIONS);
  return `${SHARE_HASH_PREFIX}${SHARE_HASH_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

/**
 * Verify an account password. With no stored hash it still runs one PBKDF2 round, so a
 * missing account takes as long as a wrong password (no timing oracle for registered emails).
 * @param {string} submitted
 * @param {string} stored
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(submitted, stored) {
  const storedValue = String(stored ?? "");
  const parts = isHashedSharePassword(storedValue) ? storedValue.slice(SHARE_HASH_PREFIX.length).split("$") : [];
  if (parts.length !== 3) {
    await pbkdf2(String(submitted ?? ""), new Uint8Array(16), SHARE_HASH_ITERATIONS);
    return false;
  }
  const iterations = parseInt(parts[0], 10);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  try {
    const actual = bytesToBase64(await pbkdf2(String(submitted ?? ""), base64ToBytes(parts[1]), iterations));
    return timingSafeEqual(actual, parts[2]);
  } catch {
    return false;
  }
}

/** A random URL-safe token (256 bits) for email links */
export function generateUrlToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** SHA-256 hex digest — one-time tokens are stored only as their hash */
export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Rate limiting ───────────────────────────────────────────────────────────────

/**
 * Fixed-window counter in KV. KV is eventually consistent, so this is a best-effort brake
 * against brute force rather than an exact limit.
 * @param {object} env
 * @param {string} key
 * @param {{ limit: number, windowSec: number }} options
 * @returns {Promise<{ limited: boolean, count: number }>}
 */
export async function getRateLimitState(env, key, { limit }) {
  const kv = getKv(env);
  if (!kv) return { limited: false, count: 0 };
  try {
    const count = parseInt((await kv.get(`rl:${key}`)) || "0", 10) || 0;
    return { limited: count >= limit, count };
  } catch {
    return { limited: false, count: 0 };
  }
}

/**
 * Record one hit against a rate-limit key
 * @param {object} env
 * @param {string} key
 * @param {{ windowSec: number }} options
 */
export async function recordRateLimitHit(env, key, { windowSec }) {
  const kv = getKv(env);
  if (!kv) return;
  try {
    const count = parseInt((await kv.get(`rl:${key}`)) || "0", 10) || 0;
    // KV requires expirationTtl >= 60
    await kv.put(`rl:${key}`, String(count + 1), { expirationTtl: Math.max(60, windowSec) });
  } catch {}
}

/**
 * Clear a rate-limit key (e.g. after a successful attempt)
 * @param {object} env
 * @param {string} key
 */
export async function clearRateLimit(env, key) {
  const kv = getKv(env);
  if (!kv) return;
  try {
    await kv.delete(`rl:${key}`);
  } catch {}
}

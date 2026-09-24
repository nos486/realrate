/**
 * helpers.js — Shared HTTP response helpers, dynamic CORS, and common utilities
 */

import { isTrustedOrigin } from "./security.js";

/**
 * Allowed origins for CORS.
 * Add your Cloudflare Pages URL and any custom domains here.
 */
const ALLOWED_ORIGINS = [
  "http://localhost:5173",      // Vite dev server
  "http://localhost:4173",      // Vite preview
  "https://realrate-5pn.pages.dev", // Cloudflare Pages (production)
  "https://realrate.pages.dev",
  "https://realrate.geekio.org",
  "https://geekio.org",
  "https://realrate.ir",
  "https://www.realrate.ir",
];

function isOriginAllowed(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Subdomains of our own domains only (exact label-boundary match, https only)
  return isTrustedOrigin(origin) && new URL(origin).origin === origin;
}

/**
 * Build CORS headers for a given request origin.
 * Returns the specific request origin if it's in the allowed list,
 * otherwise returns the first allowed origin as default.
 * @param {Request|string|null} requestOrOrigin
 * @returns {object}
 */
export function getCorsHeaders(requestOrOrigin) {
  let origin = "";
  if (typeof requestOrOrigin === "string") {
    origin = requestOrOrigin;
  } else if (requestOrOrigin && requestOrOrigin.headers) {
    origin = requestOrOrigin.headers.get("Origin") || "";
  }

  const allowedOrigin = isOriginAllowed(origin)
    ? origin
    : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

/**
 * Build a JSON Response with standard content-type and dynamic CORS headers
 * @param {object} data
 * @param {number} [status=200]
 * @param {Request|null} [request=null]
 * @returns {Response}
 */
export function jsonResponse(data, status = 200, request = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...getCorsHeaders(request),
    },
  });
}

/**
 * Build a standard error JSON Response
 * @param {string} message
 * @param {number} [status=400]
 * @param {Request|null} [request=null]
 * @param {string|null} [code=null]
 * @returns {Response}
 */
export function errorResponse(message, status = 400, request = null, code = null) {
  const defaultCode = (
    status === 401 ? "UNAUTHORIZED" :
    status === 403 ? "FORBIDDEN" :
    status === 404 ? "NOT_FOUND" :
    status === 500 ? "INTERNAL_SERVER_ERROR" :
    "BAD_REQUEST"
  );
  return jsonResponse({
    success: false,
    message,
    error: {
      code: code || defaultCode,
      message,
    },
  }, status, request);
}

/**
 * Build a 403 Forbidden response for unauthorized access
 * @param {Request|null} [request=null]
 * @returns {Response}
 */
export function forbiddenResponse(request = null) {
  return errorResponse("دسترسی غیرمجاز. فقط مدیر سیستم مجاز است.", 403, request, "FORBIDDEN");
}

/**
 * Extract real client IP from Cloudflare/proxy headers
 * @param {Request} request
 * @returns {string}
 */
export function getClientIp(request) {
  return (
    request?.headers?.get("cf-connecting-ip") ||
    request?.headers?.get("x-real-ip") ||
    request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "127.0.0.1"
  );
}

/**
 * Safe ctx.waitUntil() wrapper — works even when ctx is undefined (e.g., unit tests)
 * @param {ExecutionContext|undefined} ctx
 * @param {Promise} promise
 */
export function safeWaitUntil(ctx, promise) {
  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(promise);
  } else if (promise && typeof promise.catch === "function") {
    promise.catch(() => {});
  }
}


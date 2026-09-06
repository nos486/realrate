/**
 * helpers.js — Shared HTTP response helpers, CORS, and common utilities
 */

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * Build a JSON Response with standard content-type and CORS headers
 * @param {object} data
 * @param {number} [status=200]
 * @returns {Response}
 */
export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
    },
  });
}

/**
 * Build a standard error JSON Response
 * @param {string} message
 * @param {number} [status=400]
 * @returns {Response}
 */
export function errorResponse(message, status = 400) {
  return jsonResponse({ success: false, message }, status);
}

/**
 * Build a 403 Forbidden response for unauthorized access
 * @returns {Response}
 */
export function forbiddenResponse() {
  return errorResponse("دسترسی غیرمجاز. فقط مدیر سیستم مجاز است.", 403);
}

/**
 * Extract real client IP from Cloudflare/proxy headers
 * @param {Request} request
 * @returns {string}
 */
export function getClientIp(request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
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

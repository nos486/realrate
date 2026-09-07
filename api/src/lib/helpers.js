/**
 * helpers.js — Shared HTTP response helpers, dynamic CORS, and common utilities
 */

/**
 * Allowed origins for CORS.
 * Add your Cloudflare Pages URL and any custom domains here.
 */
const ALLOWED_ORIGINS = [
  "http://localhost:5173",      // Vite dev server
  "http://localhost:4173",      // Vite preview
  "https://realrate.pages.dev", // Cloudflare Pages (production)
  // Add custom domain below if you have one, e.g.:
  // "https://realrate.ir",
];

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

  const allowedOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
 * @returns {Response}
 */
export function errorResponse(message, status = 400, request = null) {
  return jsonResponse({ success: false, message }, status, request);
}

/**
 * Build a 403 Forbidden response for unauthorized access
 * @param {Request|null} [request=null]
 * @returns {Response}
 */
export function forbiddenResponse(request = null) {
  return errorResponse("دسترسی غیرمجاز. فقط مدیر سیستم مجاز است.", 403, request);
}

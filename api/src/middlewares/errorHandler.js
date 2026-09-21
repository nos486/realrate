/**
 * errorHandler.js — Centralized route error handling middleware
 */

import { AppError } from "../lib/AppError.js";
import { logger } from "../lib/logger.js";
import { getCorsHeaders } from "../lib/helpers.js";

/**
 * Build a structured error Response with CORS headers
 * @param {Error|AppError|any} err
 * @param {Request|null} request
 * @returns {Response}
 */
export function handleRouteError(err, request = null) {
  const corsHeaders = getCorsHeaders(request);

  if (err instanceof AppError) {
    const statusCode = err.statusCode || 400;
    const body = {
      success: false,
      message: err.message,
      error: {
        code: err.code || "APP_ERROR",
        message: err.message,
      },
    };

    return new Response(JSON.stringify(body), {
      status: statusCode,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...corsHeaders,
      },
    });
  }

  // Unhandled / unexpected internal error
  const requestUrl = request?.url ? new URL(request.url).pathname : "unknown";
  logger.error("[ErrorHandler] Uncaught internal error in route:", {
    path: requestUrl,
    error: err?.message || String(err),
    stack: err?.stack,
  });

  const fallbackBody = {
    success: false,
    message: "خطای داخلی سرور رخ داده است.",
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "خطای داخلی سرور رخ داده است.",
    },
  };

  return new Response(JSON.stringify(fallbackBody), {
    status: 500,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders,
    },
  });
}

/**
 * Route handler wrapper that executes handler and catches any thrown errors
 * @param {Function} handler
 * @returns {Function}
 */
export function withErrorHandler(handler) {
  return async (...args) => {
    const request = args.find((a) => a && typeof a === "object" && typeof a.url === "string") || null;
    try {
      const res = await handler(...args);
      if (res instanceof Response && request) {
        const corsHeaders = getCorsHeaders(request);
        for (const [key, value] of Object.entries(corsHeaders)) {
          res.headers.set(key, value);
        }
      }
      return res;
    } catch (err) {
      return handleRouteError(err, request);
    }
  };
}

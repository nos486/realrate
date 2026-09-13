/**
 * RealRate API — Cloudflare Worker Entry Point & Router
 *
 * Architecture:
 *   src/lib/       — Shared utilities (db, auth, settings, analytics, helpers)
 *   src/services/  — External data fetchers (gold, forex, telegram)
 *   src/handlers/  — Route handlers (api, auth, admin)
 *
 * This Worker serves ONLY JSON API routes.
 * The frontend (React + Vite) is hosted separately on Cloudflare Pages.
 */

import { getGlobalSettings } from "./lib/settings.js";
import { getCorsHeaders } from "./lib/helpers.js";
import { validateEnv } from "./config/env.js";
import { withErrorHandler } from "./middlewares/errorHandler.js";
import { logger } from "./lib/logger.js";
import { DEFAULT_BOURSE_SEARCH_LIMIT } from "./config/constants.js";

import {
  handleGoogleAuth,
  handleGoogleLogin,
  handleGoogleCallback,
  handleGetMe,
  handleLogout,
} from "./handlers/authRoutes.js";
import {
  handleAdminStatsRoute,
  handleAdminUsersRoute,
  handleAdminSaveSettings,
  handleAdminGetUserPortfolio,
  handleAdminTestUsdSource,
  handleAdminGetPriceSources,
  handleAdminSavePriceSource,
  handleAdminDeletePriceSource,
  handleAdminSetPrimarySource,
  handleAdminTestPriceSource,
  handleAdminFetchAllSources,
  handleAdminGetSourceTypes,
  handleAdminSaveSourceType,
  handleAdminDeleteSourceType,
  handleAdminInspectApiRoute,
} from "./handlers/adminRoutes.js";
import { handleGetPrices, handleGetSparklines } from "./handlers/apiRoutes.js";
import { handleGetUnifiedMarketItems } from "./handlers/unifiedItemsRoute.js";
import {
  handleGetPortfolios,
  handleCreatePortfolio,
  handleUpdatePortfolio,
  handleDeletePortfolioGroup,
  handleGetPortfolio,
  handleAddPortfolio,
  handleDeletePortfolio,
  handleGetUserSettings,
  handleUpdateUserSettings,
  handleGetSharedPortfolio,
} from "./handlers/portfolioRoutes.js";
import { handleScheduledPriceExtraction, fetchAllPrices } from "./services/priceSources.js";
import { getBourseSymbols, fetchAndStoreBourseSymbols, handleScheduledBourseSync } from "./services/bourseSymbols.js";

export default {
  async fetch(request, env, ctx) {
    validateEnv(env);
    const url = new URL(request.url);
    const corsHeaders = getCorsHeaders(request);
    const wrap = withErrorHandler;

    // ── CORS Preflight ──────────────────────────────────────────────────────
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // ── 404 for non-API routes ──────────────────────────────────────────────
    if (!url.pathname.startsWith("/api/")) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Not found. API routes start with /api/",
          error: {
            code: "NOT_FOUND",
            message: "Not found. API routes start with /api/",
          },
        }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // ── Auth API Routes ─────────────────────────────────────────────────────
    if (url.pathname === "/api/auth/google/login" && request.method === "GET")    return wrap(handleGoogleLogin)(request, env);
    if (url.pathname === "/api/auth/google/callback" && request.method === "GET") return wrap(handleGoogleCallback)(request, env);
    if (url.pathname === "/api/auth/google" && request.method === "POST")         return wrap(handleGoogleAuth)(request, env);
    if (url.pathname === "/api/auth/me"     && request.method === "GET")          return wrap(handleGetMe)(request, env);
    if (url.pathname === "/api/auth/logout" && request.method === "POST")         return wrap(handleLogout)(request, env);

    // ── User Settings API Routes (Requires Login) ────────────────────────────
    if (url.pathname === "/api/user/settings") {
      if (request.method === "GET") return wrap(handleGetUserSettings)(request, env);
      if (request.method === "POST" || request.method === "PUT") return wrap(handleUpdateUserSettings)(request, env);
    }

    // ── Admin API Routes ────────────────────────────────────────────────────
    if (url.pathname === "/api/admin/stats")                                   return wrap(handleAdminStatsRoute)(request, env);
    if (url.pathname === "/api/admin/users/portfolio")                         return wrap(handleAdminGetUserPortfolio)(request, env);
    if (url.pathname === "/api/admin/users")                                   return wrap(handleAdminUsersRoute)(request, env);
    if (url.pathname === "/api/admin/settings" && request.method === "POST")   return wrap(handleAdminSaveSettings)(request, env);
    if (url.pathname === "/api/admin/test-usd-source" && request.method === "POST") return wrap(handleAdminTestUsdSource)(request, env);

    if (url.pathname === "/api/admin/price-sources") {
      if (request.method === "GET") return wrap(handleAdminGetPriceSources)(request, env);
      if (request.method === "POST" || request.method === "PUT") return wrap(handleAdminSavePriceSource)(request, env);
      if (request.method === "DELETE") return wrap(handleAdminDeletePriceSource)(request, env);
    }
    if (url.pathname === "/api/admin/price-sources/set-primary" && request.method === "POST") {
      return wrap(handleAdminSetPrimarySource)(request, env);
    }
    if (url.pathname === "/api/admin/price-sources/test" && request.method === "POST") {
      return wrap(handleAdminTestPriceSource)(request, env);
    }
    if (url.pathname === "/api/admin/price-sources/inspect-api" && request.method === "POST") {
      return wrap(handleAdminInspectApiRoute)(request, env);
    }
    if (url.pathname === "/api/admin/price-sources/fetch-all" && request.method === "POST") {
      return wrap(handleAdminFetchAllSources)(request, env);
    }

    if (url.pathname === "/api/admin/source-types") {
      if (request.method === "GET") return wrap(handleAdminGetSourceTypes)(request, env);
      if (request.method === "POST" || request.method === "PUT") return wrap(handleAdminSaveSourceType)(request, env);
      if (request.method === "DELETE") return wrap(handleAdminDeleteSourceType)(request, env);
    }

    // ── Portfolio API Routes ────────────────────────────────────────────────
    if (url.pathname === "/api/portfolio/shared")                              return wrap(handleGetSharedPortfolio)(request, env);
    if (url.pathname === "/api/portfolios") {
      if (request.method === "GET") return wrap(handleGetPortfolios)(request, env);
      if (request.method === "POST") return wrap(handleCreatePortfolio)(request, env);
      if (request.method === "PUT") return wrap(handleUpdatePortfolio)(request, env);
      if (request.method === "DELETE") return wrap(handleDeletePortfolioGroup)(request, env);
    }
    if (url.pathname === "/api/portfolio") {
      if (request.method === "GET") return wrap(handleGetPortfolio)(request, env);
      if (request.method === "POST" || request.method === "PUT") return wrap(handleAddPortfolio)(request, env);
      if (request.method === "DELETE") return wrap(handleDeletePortfolio)(request, env);
    }

    // ── Public API Routes ───────────────────────────────────────────────────
    if (url.pathname === "/api/market/items" || url.pathname === "/api/market/unified" || url.pathname === "/api/items") {
      return wrap(handleGetUnifiedMarketItems)(env, request);
    }
    if (url.pathname === "/api/prices") return wrap(handleGetPrices)(env, request);
    if (url.pathname === "/api/sparklines" || url.pathname === "/api/prices/sparklines") {
      return wrap(handleGetSparklines)(env, request);
    }

    // ── Bourse (Tehran Stock Exchange) Routes ──────────────────────────────
    if (url.pathname === "/api/bourse/symbols" || url.pathname === "/api/bourse/search") {
      return wrap(async () => {
        const q = url.searchParams.get("q") || "";
        const limit = parseInt(url.searchParams.get("limit") || String(DEFAULT_BOURSE_SEARCH_LIMIT), 10);
        const force = url.searchParams.get("force") === "true";
        if (force) {
          await fetchAndStoreBourseSymbols(env);
        }
        const symbols = await getBourseSymbols(env, q, limit);
        return new Response(JSON.stringify({ success: true, count: symbols.length, symbols }), {
          headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
        });
      })(request, env);
    }
    if (url.pathname === "/api/bourse/sync" && request.method === "POST") {
      return wrap(async () => {
        const syncRes = await fetchAndStoreBourseSymbols(env);
        return new Response(JSON.stringify(syncRes), {
          headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
        });
      })(request, env);
    }

    if (url.pathname === "/api/telegram") {
      return wrap(async () => {
        const forceRefresh = url.searchParams.get("force") === "true";
        const globalSettings = await getGlobalSettings(env);
        const tgData = await fetchAllPrices(env, forceRefresh, globalSettings);
        return new Response(JSON.stringify(tgData, null, 2), {
          headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
        });
      })(request, env);
    }

    // ── 404 fallback ─────────────────────────────────────────────────────
    return new Response(
      JSON.stringify({
        success: false,
        message: "API endpoint not found",
        error: {
          code: "NOT_FOUND",
          message: "API endpoint not found",
        },
      }),
      { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  },

  /**
   * Cloudflare Workers Scheduled Cron Trigger Handler
   * Runs automatically every minute to extract due price sources based on fetchIntervalSec
   */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      Promise.all([
        handleScheduledPriceExtraction(env).catch(err => {
          logger.error("[Scheduled] Price extraction error:", { error: err.message, stack: err.stack });
        }),
        handleScheduledBourseSync(env).catch(err => {
          logger.error("[Scheduled] Bourse sync error:", { error: err.message, stack: err.stack });
        }),
      ])
    );
  },
};

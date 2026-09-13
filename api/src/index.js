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
  handleAdminGetPriceHistory,
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
    const url = new URL(request.url);
    const corsHeaders = getCorsHeaders(request);

    // ── CORS Preflight ──────────────────────────────────────────────────────
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // ── 404 for non-API routes ──────────────────────────────────────────────
    if (!url.pathname.startsWith("/api/")) {
      return new Response(
        JSON.stringify({ success: false, message: "Not found. API routes start with /api/" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // ── Auth API Routes ─────────────────────────────────────────────────────
    if (url.pathname === "/api/auth/google/login" && request.method === "GET")    return handleGoogleLogin(request, env);
    if (url.pathname === "/api/auth/google/callback" && request.method === "GET") return handleGoogleCallback(request, env);
    if (url.pathname === "/api/auth/google" && request.method === "POST")         return handleGoogleAuth(request, env);
    if (url.pathname === "/api/auth/me"     && request.method === "GET")          return handleGetMe(request, env);
    if (url.pathname === "/api/auth/logout" && request.method === "POST")         return handleLogout(request, env);

    // ── User Settings API Routes (Requires Login) ────────────────────────────
    if (url.pathname === "/api/user/settings") {
      if (request.method === "GET") return handleGetUserSettings(request, env);
      if (request.method === "POST" || request.method === "PUT") return handleUpdateUserSettings(request, env);
    }

    // ── Admin API Routes ────────────────────────────────────────────────────
    if (url.pathname === "/api/admin/stats")                                   return handleAdminStatsRoute(request, env);
    if (url.pathname === "/api/admin/users/portfolio")                         return handleAdminGetUserPortfolio(request, env);
    if (url.pathname === "/api/admin/users")                                   return handleAdminUsersRoute(request, env);
    if (url.pathname === "/api/admin/settings" && request.method === "POST")   return handleAdminSaveSettings(request, env);
    if (url.pathname === "/api/admin/test-usd-source" && request.method === "POST") return handleAdminTestUsdSource(request, env);

    if (url.pathname === "/api/admin/price-sources") {
      if (request.method === "GET") return handleAdminGetPriceSources(request, env);
      if (request.method === "POST" || request.method === "PUT") return handleAdminSavePriceSource(request, env);
      if (request.method === "DELETE") return handleAdminDeletePriceSource(request, env);
    }
    if (url.pathname === "/api/admin/price-sources/set-primary" && request.method === "POST") {
      return handleAdminSetPrimarySource(request, env);
    }
    if (url.pathname === "/api/admin/price-sources/test" && request.method === "POST") {
      return handleAdminTestPriceSource(request, env);
    }
    if (url.pathname === "/api/admin/price-sources/inspect-api" && request.method === "POST") {
      return handleAdminInspectApiRoute(request, env);
    }
    if (url.pathname === "/api/admin/price-sources/fetch-all" && request.method === "POST") {
      return handleAdminFetchAllSources(request, env);
    }
    if (url.pathname === "/api/admin/price-history" && request.method === "GET") {
      return handleAdminGetPriceHistory(request, env);
    }

    if (url.pathname === "/api/admin/source-types") {
      if (request.method === "GET") return handleAdminGetSourceTypes(request, env);
      if (request.method === "POST" || request.method === "PUT") return handleAdminSaveSourceType(request, env);
      if (request.method === "DELETE") return handleAdminDeleteSourceType(request, env);
    }

    // ── Portfolio API Routes ────────────────────────────────────────────────
    if (url.pathname === "/api/portfolio/shared")                              return handleGetSharedPortfolio(request, env);
    if (url.pathname === "/api/portfolios") {
      if (request.method === "GET") return handleGetPortfolios(request, env);
      if (request.method === "POST") return handleCreatePortfolio(request, env);
      if (request.method === "PUT") return handleUpdatePortfolio(request, env);
      if (request.method === "DELETE") return handleDeletePortfolioGroup(request, env);
    }
    if (url.pathname === "/api/portfolio") {
      if (request.method === "GET") return handleGetPortfolio(request, env);
      if (request.method === "POST" || request.method === "PUT") return handleAddPortfolio(request, env);
      if (request.method === "DELETE") return handleDeletePortfolio(request, env);
    }

    // ── Public API Routes ───────────────────────────────────────────────────
    if (url.pathname === "/api/market/items" || url.pathname === "/api/market/unified" || url.pathname === "/api/items") {
      return handleGetUnifiedMarketItems(env, request);
    }
    if (url.pathname === "/api/prices") return handleGetPrices(env, request);
    if (url.pathname === "/api/sparklines" || url.pathname === "/api/prices/sparklines") {
      return handleGetSparklines(env, request);
    }

    // ── Bourse (Tehran Stock Exchange) Routes ──────────────────────────────
    if (url.pathname === "/api/bourse/symbols" || url.pathname === "/api/bourse/search") {
      const q = url.searchParams.get("q") || "";
      const limit = parseInt(url.searchParams.get("limit") || "50", 10);
      const force = url.searchParams.get("force") === "true";
      if (force) {
        await fetchAndStoreBourseSymbols(env);
      }
      const symbols = await getBourseSymbols(env, q, limit);
      return new Response(JSON.stringify({ success: true, count: symbols.length, symbols }), {
        headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
      });
    }
    if (url.pathname === "/api/bourse/sync" && request.method === "POST") {
      const syncRes = await fetchAndStoreBourseSymbols(env);
      return new Response(JSON.stringify(syncRes), {
        headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
      });
    }

    if (url.pathname === "/api/telegram") {
      const forceRefresh = url.searchParams.get("force") === "true";
      const globalSettings = await getGlobalSettings(env);
      const tgData = await fetchAllPrices(env, forceRefresh, globalSettings);
      return new Response(JSON.stringify(tgData, null, 2), {
        headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
      });
    }

    // ── 404 fallback ─────────────────────────────────────────────────────
    return new Response(
      JSON.stringify({ success: false, message: "API endpoint not found" }),
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
          console.error("[Scheduled] Price extraction error:", err);
        }),
        handleScheduledBourseSync(env).catch(err => {
          console.error("[Scheduled] Bourse sync error:", err);
        }),
      ])
    );
  },
};

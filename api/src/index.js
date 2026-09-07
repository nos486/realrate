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

import { trackAnalytics } from "./lib/analytics.js";
import { getGlobalSettings } from "./lib/settings.js";
import { getCorsHeaders } from "./lib/helpers.js";

import { handleGoogleAuth, handleGetMe, handleLogout } from "./handlers/authRoutes.js";
import { handleAdminStatsRoute, handleAdminUsersRoute, handleAdminSaveSettings } from "./handlers/adminRoutes.js";
import { handleCalculate, handleFetchRates } from "./handlers/apiRoutes.js";
import { handleGetPortfolio, handleAddPortfolio, handleDeletePortfolio } from "./handlers/portfolioRoutes.js";
import { fetchTelegramPrices } from "./services/telegramPrices.js";

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

    // ── Analytics + Settings (needed for most routes) ───────────────────────
    const [analytics, globalSettings] = await Promise.all([
      trackAnalytics(request, env, ctx, url),
      getGlobalSettings(env),
    ]);

    // ── Auth API Routes ─────────────────────────────────────────────────────
    if (url.pathname === "/api/auth/google" && request.method === "POST") return handleGoogleAuth(request, env);
    if (url.pathname === "/api/auth/me"     && request.method === "GET")  return handleGetMe(request, env);
    if (url.pathname === "/api/auth/logout" && request.method === "POST") return handleLogout(request, env);

    // ── Admin API Routes ────────────────────────────────────────────────────
    if (url.pathname === "/api/admin/stats")                                   return handleAdminStatsRoute(request, env);
    if (url.pathname === "/api/admin/users")                                   return handleAdminUsersRoute(request, env);
    if (url.pathname === "/api/admin/settings" && request.method === "POST")   return handleAdminSaveSettings(request, env);

    // ── Portfolio API Routes (Requires Login) ────────────────────────────────
    if (url.pathname === "/api/portfolio") {
      if (request.method === "GET") return handleGetPortfolio(request, env);
      if (request.method === "POST" || request.method === "PUT") return handleAddPortfolio(request, env);
      if (request.method === "DELETE") return handleDeletePortfolio(request, env);
    }

    // ── Public API Routes ───────────────────────────────────────────────────
    if (url.pathname === "/api/calculate") return handleCalculate(url, env, analytics, globalSettings, request);
    if (url.pathname === "/api/rates")     return handleFetchRates(env, analytics, globalSettings, request);

    if (url.pathname === "/api/telegram") {
      const forceRefresh = url.searchParams.get("force") === "true";
      const tgData = await fetchTelegramPrices(env, forceRefresh);
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
};

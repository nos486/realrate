/**
 * RealRate — Iranian Gold & Currency Price Calculator
 * Cloudflare Worker — Entry Point & Router
 *
 * Architecture:
 *   src/lib/       — Shared utilities (db, auth, settings, analytics, helpers)
 *   src/services/  — External data fetchers (gold, forex, telegram)
 *   src/handlers/  — Route handlers (api, auth, admin)
 *   src/views/     — HTML page generators (main, admin, assets)
 */

import { trackAnalytics } from "./lib/analytics.js";
import { getGlobalSettings } from "./lib/settings.js";
import { CORS_HEADERS } from "./lib/helpers.js";

import { handleGoogleAuth, handleGetMe, handleLogout } from "./handlers/authRoutes.js";
import { handleAdminStatsRoute, handleAdminUsersRoute, handleAdminSaveSettings } from "./handlers/adminRoutes.js";
import { handleCalculate, handleFetchRates } from "./handlers/apiRoutes.js";
import { fetchTelegramPrices } from "./services/telegramPrices.js";

import { getManifestResponse, getServiceWorkerResponse } from "./views/assets.js";
import { getHTMLContent } from "./views/mainPage.js";
import { getAdminHTMLContent } from "./views/adminPage.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ── CORS Preflight ──────────────────────────────────────────────────────
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // ── PWA Assets ──────────────────────────────────────────────────────────
    if (url.pathname === "/manifest.json") return getManifestResponse();
    if (url.pathname === "/sw.js")         return getServiceWorkerResponse();

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

    // ── Public API Routes ───────────────────────────────────────────────────
    if (url.pathname === "/api/calculate") return handleCalculate(url, env, analytics, globalSettings);
    if (url.pathname === "/api/rates")     return handleFetchRates(env, analytics, globalSettings);

    if (url.pathname === "/api/telegram") {
      const forceRefresh = url.searchParams.get("force") === "true";
      const tgData = await fetchTelegramPrices(env, forceRefresh);
      return new Response(JSON.stringify(tgData, null, 2), {
        headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS },
      });
    }

    // ── HTML Page Routes ────────────────────────────────────────────────────
    if (url.pathname === "/admin") {
      return new Response(getAdminHTMLContent(env, globalSettings), {
        headers: { "Content-Type": "text/html; charset=utf-8", ...CORS_HEADERS },
      });
    }

    // Default: serve main web UI
    return new Response(getHTMLContent(env, analytics, globalSettings), {
      headers: { "Content-Type": "text/html; charset=utf-8", ...CORS_HEADERS },
    });
  },
};

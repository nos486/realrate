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

import { getGlobalSettings } from "./repositories/settings.repository.js";
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
import {
  handleGetTransactions,
  handleCreateTransaction,
  handleUpdateTransaction,
  handleDeleteTransaction,
} from "./handlers/transactionRoutes.js";
import {
  handleGetLoans,
  handleCreateLoan,
  handleGetLoan,
  handleUpdateLoan,
  handleDeleteLoan,
  handleUpdateInstallment,
  handleBulkDistributeInstallments,
  handleAddExtraPayment,
  handleGetLoanExtraPayments,
} from "./handlers/loanRoutes.js";
import { fetchAllPrices } from "./services/market/priceAggregator.service.js";
import {
  searchCatalogItems,
  syncCatalogSource,
  syncAllCatalogSources,
} from "./services/market/catalogFeeds.service.js";
import { runCronPolling } from "./jobs/cronPolling.job.js";

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

    // ── Route Normalization (Supports /api/... and /api/v1/...) ─────────────
    const normalizedPath = url.pathname.startsWith("/api/v1/")
      ? url.pathname.replace("/api/v1/", "/api/")
      : (url.pathname === "/api/v1" ? "/api" : url.pathname);

    // ── Auth API Routes ─────────────────────────────────────────────────────
    if (normalizedPath === "/api/auth/google/login" && request.method === "GET")    return wrap(handleGoogleLogin)(request, env);
    if (normalizedPath === "/api/auth/google/callback" && request.method === "GET") return wrap(handleGoogleCallback)(request, env);
    if (normalizedPath === "/api/auth/google" && request.method === "POST")         return wrap(handleGoogleAuth)(request, env);
    if (normalizedPath === "/api/auth/me"     && request.method === "GET")          return wrap(handleGetMe)(request, env);
    if (normalizedPath === "/api/auth/logout" && request.method === "POST")         return wrap(handleLogout)(request, env);

    // ── User Settings API Routes (Requires Login) ────────────────────────────
    if (normalizedPath === "/api/user/settings") {
      if (request.method === "GET") return wrap(handleGetUserSettings)(request, env);
      if (request.method === "POST" || request.method === "PUT") return wrap(handleUpdateUserSettings)(request, env);
    }

    // ── Admin API Routes ────────────────────────────────────────────────────
    if (normalizedPath === "/api/admin/stats")                                   return wrap(handleAdminStatsRoute)(request, env);
    if (normalizedPath === "/api/admin/users/portfolio")                         return wrap(handleAdminGetUserPortfolio)(request, env);
    if (normalizedPath === "/api/admin/users")                                   return wrap(handleAdminUsersRoute)(request, env);
    if (normalizedPath === "/api/admin/settings" && request.method === "POST")   return wrap(handleAdminSaveSettings)(request, env);
    if (normalizedPath === "/api/admin/test-usd-source" && request.method === "POST") return wrap(handleAdminTestUsdSource)(request, env);

    if (normalizedPath === "/api/admin/price-sources") {
      if (request.method === "GET") return wrap(handleAdminGetPriceSources)(request, env);
      if (request.method === "POST" || request.method === "PUT") return wrap(handleAdminSavePriceSource)(request, env);
      if (request.method === "DELETE") return wrap(handleAdminDeletePriceSource)(request, env);
    }
    if (normalizedPath === "/api/admin/price-sources/set-primary" && request.method === "POST") {
      return wrap(handleAdminSetPrimarySource)(request, env);
    }
    if (normalizedPath === "/api/admin/price-sources/test" && request.method === "POST") {
      return wrap(handleAdminTestPriceSource)(request, env);
    }
    if (normalizedPath === "/api/admin/price-sources/inspect-api" && request.method === "POST") {
      return wrap(handleAdminInspectApiRoute)(request, env);
    }
    if (normalizedPath === "/api/admin/price-sources/fetch-all" && request.method === "POST") {
      return wrap(handleAdminFetchAllSources)(request, env);
    }


    // ── Portfolio API Routes ────────────────────────────────────────────────
    if (normalizedPath === "/api/portfolio/shared")                              return wrap(handleGetSharedPortfolio)(request, env);
    if (normalizedPath === "/api/portfolios") {
      if (request.method === "GET") return wrap(handleGetPortfolios)(request, env);
      if (request.method === "POST") return wrap(handleCreatePortfolio)(request, env);
      if (request.method === "PUT") return wrap(handleUpdatePortfolio)(request, env);
      if (request.method === "DELETE") return wrap(handleDeletePortfolioGroup)(request, env);
    }
    if (normalizedPath === "/api/portfolio") {
      if (request.method === "GET") return wrap(handleGetPortfolio)(request, env);
      if (request.method === "POST" || request.method === "PUT") return wrap(handleAddPortfolio)(request, env);
      if (request.method === "DELETE") return wrap(handleDeletePortfolio)(request, env);
    }

    // ── Portfolio Transactions API Routes ───────────────────────────────────
    const portfolioTransactionsMatch = normalizedPath.match(/^\/api\/portfolios?\/([^/]+)\/transactions(?:\/([^/]+))?$/);
    if (portfolioTransactionsMatch) {
      const portfolioId = portfolioTransactionsMatch[1];
      const txId = portfolioTransactionsMatch[2];
      if (request.method === "GET")    return wrap((req, env) => handleGetTransactions(req, env, { portfolioId }))(request, env);
      if (request.method === "POST")   return wrap((req, env) => handleCreateTransaction(req, env, { portfolioId }))(request, env);
      if (request.method === "PUT")    return wrap((req, env) => handleUpdateTransaction(req, env, { portfolioId, txId }))(request, env);
      if (request.method === "DELETE") return wrap((req, env) => handleDeleteTransaction(req, env, { portfolioId, txId }))(request, env);
    }

    // ── Loans & Installments API Routes ─────────────────────────────────────
    const loanExtraPaymentsMatch = normalizedPath.match(/^\/api\/loans\/([^/]+)\/extra-payments$/);
    if (loanExtraPaymentsMatch) {
      const loanId = loanExtraPaymentsMatch[1];
      if (request.method === "GET")  return wrap((req, e) => handleGetLoanExtraPayments(req, e, { loanId }))(request, env);
      if (request.method === "POST") return wrap((req, e) => handleAddExtraPayment(req, e, { loanId }))(request, env);
    }

    // Must be matched before loanInstallmentMatch below, since that generic pattern would
    // otherwise treat "bulk" as an installmentId.
    const loanInstallmentsBulkMatch = normalizedPath.match(/^\/api\/loans\/([^/]+)\/installments\/bulk$/);
    if (loanInstallmentsBulkMatch) {
      const loanId = loanInstallmentsBulkMatch[1];
      if (request.method === "PUT") {
        return wrap((req, e) => handleBulkDistributeInstallments(req, e, { loanId }))(request, env);
      }
    }

    const loanInstallmentMatch = normalizedPath.match(/^\/api\/loans\/([^/]+)\/installments\/([^/]+)$/);
    if (loanInstallmentMatch) {
      const loanId = loanInstallmentMatch[1];
      const installmentId = loanInstallmentMatch[2];
      if (request.method === "PUT") {
        return wrap((req, e) => handleUpdateInstallment(req, e, { loanId, installmentId }))(request, env);
      }
    }

    const loanSingleMatch = normalizedPath.match(/^\/api\/loans\/([^/]+)$/);
    if (loanSingleMatch) {
      const loanId = loanSingleMatch[1];
      if (request.method === "GET")    return wrap((req, e) => handleGetLoan(req, e, { loanId }))(request, env);
      if (request.method === "PUT")    return wrap((req, e) => handleUpdateLoan(req, e, { loanId }))(request, env);
      if (request.method === "DELETE") return wrap((req, e) => handleDeleteLoan(req, e, { loanId }))(request, env);
    }

    if (normalizedPath === "/api/loans") {
      if (request.method === "GET")  return wrap(handleGetLoans)(request, env);
      if (request.method === "POST") return wrap(handleCreateLoan)(request, env);
    }

    // ── Public API Routes ───────────────────────────────────────────────────
    if (normalizedPath === "/api/market/items" || normalizedPath === "/api/market/unified" || normalizedPath === "/api/items") {
      return wrap(handleGetUnifiedMarketItems)(env, request);
    }
    if (normalizedPath === "/api/prices") return wrap(handleGetPrices)(env, request);
    if (normalizedPath === "/api/sparklines" || normalizedPath === "/api/prices/sparklines") {
      return wrap(handleGetSparklines)(env, request);
    }

    // ── Bourse (Tehran Stock Exchange) Routes ──────────────────────────────
    if (normalizedPath === "/api/bourse/symbols" || normalizedPath === "/api/bourse/search") {
      return wrap(async () => {
        const q = url.searchParams.get("q") || "";
        const limit = parseInt(url.searchParams.get("limit") || String(DEFAULT_BOURSE_SEARCH_LIMIT), 10);
        const force = url.searchParams.get("force") === "true";
        if (force) {
          await syncCatalogSource(env, "src_def_bourse");
        }
        const symbols = await searchCatalogItems(env, { q, sourceId: "src_def_bourse", limit });
        return new Response(JSON.stringify({ success: true, count: symbols.length, symbols }), {
          headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
        });
      })(request, env);
    }
    if (normalizedPath === "/api/bourse/sync" && request.method === "POST") {
      return wrap(async () => {
        const syncRes = await syncCatalogSource(env, "src_def_bourse");
        return new Response(JSON.stringify(syncRes), {
          headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
        });
      })(request, env);
    }

    // ── Investment Funds (Charisma, Emofid, etc.) Routes ────────────────────
    if (normalizedPath === "/api/funds" || normalizedPath === "/api/funds/search") {
      return wrap(async () => {
        const q = url.searchParams.get("q") || "";
        const limit = parseInt(url.searchParams.get("limit") || "200", 10);
        const funds = await searchCatalogItems(env, { q, category: "bourse_fund", limit });
        return new Response(JSON.stringify({ success: true, count: funds.length, funds }), {
          headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
        });
      })(request, env);
    }
    if (normalizedPath === "/api/funds/sync" && request.method === "POST") {
      return wrap(async () => {
        const syncRes = await syncAllCatalogSources(env);
        return new Response(JSON.stringify({ success: true, results: syncRes }), {
          headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
        });
      })(request, env);
    }

    if (normalizedPath === "/api/telegram") {
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
    await runCronPolling(event, env, ctx);
  },
};

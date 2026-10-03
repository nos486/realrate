/**
 * demoRoutes.test.js — Tests for demo routes (auth, admin, me, rejection)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleDemoLogin,
  handleAdminGetDemo,
  handleAdminCreateDemo,
  handleAdminCreateDemoEditSession,
  handleAdminResetDemo,
} from "../../src/handlers/demoRoutes.js";
import { handleGetMe } from "../../src/handlers/authRoutes.js";
import { handleLogin, handleRegister } from "../../src/handlers/accountRoutes.js";

// These tests cover the demo itself, so it is switched on here (it is off in config/constants.js)
vi.mock("../../src/config/constants.js", async (importOriginal) => ({ ...(await importOriginal()), DEMO_ENABLED: true }));

vi.mock("../../src/lib/auth.js", () => ({
  getAuthenticatedUser: vi.fn(),
  isUserAdmin: (email) => email === "admin@example.com",
}));

vi.mock("../../src/repositories/demo.repository.js", () => ({
  DEMO_EMAIL: "demo@realrate.invalid",
  DEMO_USER_ID: "usr_demo_account",
  DEMO_VIEW_TTL_SECONDS: 7200,
  DEMO_EDIT_TTL_SECONDS: 7200,
  getDemoVaultPassphrase: vi.fn(() => "RealRateDemoVault2026!"),
  dbGetDemoUser: vi.fn(),
  dbEnsureDemoUser: vi.fn(),
  dbGetDemoStats: vi.fn(),
  dbResetDemoData: vi.fn(),
}));

vi.mock("../../src/repositories/session.repository.js", () => ({
  dbSaveSession: vi.fn(),
}));

vi.mock("../../src/lib/maintenance.js", () => ({
  assertNotMaintenance: vi.fn(),
  getMaintenance: vi.fn(async () => ({ enabled: false })),
}));

vi.mock("../../src/lib/security.js", () => ({
  getRateLimitState: vi.fn(async () => ({ limited: false })),
  recordRateLimitHit: vi.fn(),
  verifyPassword: vi.fn(),
  hashPassword: vi.fn(async () => "hashed"),
}));

vi.mock("../../src/repositories/account.repository.js", () => ({
  dbGetUserAuthByEmail: vi.fn(),
  dbGetUserAuthById: vi.fn(),
  dbRecordLogin: vi.fn(),
  normalizeEmail: (e) => String(e || "").trim().toLowerCase(),
}));

import { getAuthenticatedUser } from "../../src/lib/auth.js";
import {
  dbGetDemoUser,
  dbEnsureDemoUser,
  dbGetDemoStats,
  dbResetDemoData,
  getDemoVaultPassphrase,
  DEMO_EMAIL,
} from "../../src/repositories/demo.repository.js";
import { dbSaveSession } from "../../src/repositories/session.repository.js";
import { dbGetUserAuthByEmail } from "../../src/repositories/account.repository.js";
import { getRateLimitState } from "../../src/lib/security.js";

function req(method, path, body = null) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("Demo Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/auth/demo", () => {
    it("returns 404 DEMO_NOT_FOUND when demo user does not exist", async () => {
      dbGetDemoUser.mockResolvedValueOnce(null);

      await expect(handleDemoLogin(req("POST", "/api/auth/demo"), {})).rejects.toMatchObject({
        statusCode: 404,
        code: "DEMO_NOT_FOUND",
      });
    });

    it("creates a demo_view session with 2h expiry and returns token + demoVaultPassphrase", async () => {
      const demoUser = {
        id: "usr_demo",
        email: "demo@realrate.invalid",
        name: "کاربر دمو",
        customName: "حساب نمایشی دمو",
        picture: "",
        disabled: false,
      };
      dbGetDemoUser.mockResolvedValueOnce(demoUser);

      const res = await handleDemoLogin(req("POST", "/api/auth/demo"), {});
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.token).toBeDefined();
      expect(data.user.id).toBe("usr_demo");
      expect(data.demo).toEqual({ mode: "view" });
      expect(data.demoVaultPassphrase).toBe("RealRateDemoVault2026!");

      expect(dbSaveSession).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          userId: "usr_demo",
          kind: "demo_view",
        }),
        7200
      );
      expect(res.headers.get("Set-Cookie")).toContain("realrate_session=");
    });

    it("respects IP rate limit", async () => {
      getRateLimitState.mockResolvedValueOnce({ limited: true });
      await expect(handleDemoLogin(req("POST", "/api/auth/demo"), {})).rejects.toMatchObject({
        statusCode: 429,
        code: "TOO_MANY_REQUESTS",
      });
    });
  });

  describe("GET /api/auth/me", () => {
    it("returns demo info and passphrase ONLY for demo sessions", async () => {
      // 1. Regular session
      getAuthenticatedUser.mockResolvedValueOnce({
        id: "usr_reg",
        email: "regular@example.com",
        name: "کاربر عادی",
        role: "user",
        kind: "",
      });
      const regRes = await handleGetMe(req("GET", "/api/auth/me"), {});
      const regData = await regRes.json();
      expect(regData.demo).toBeUndefined();
      expect(regData.demoVaultPassphrase).toBeUndefined();

      // 2. demo_view session
      getAuthenticatedUser.mockResolvedValueOnce({
        id: "usr_demo",
        email: "demo@realrate.invalid",
        name: "کاربر دمو",
        role: "user",
        kind: "demo_view",
      });
      const viewRes = await handleGetMe(req("GET", "/api/auth/me"), {});
      const viewData = await viewRes.json();
      expect(viewData.demo).toEqual({ mode: "view" });
      expect(viewData.demoVaultPassphrase).toBe("RealRateDemoVault2026!");

      // 3. demo_edit session
      getAuthenticatedUser.mockResolvedValueOnce({
        id: "usr_demo",
        email: "demo@realrate.invalid",
        name: "کاربر دمو",
        role: "user",
        kind: "demo_edit",
      });
      const editRes = await handleGetMe(req("GET", "/api/auth/me"), {});
      const editData = await editRes.json();
      expect(editData.demo).toEqual({ mode: "edit" });
      expect(editData.demoVaultPassphrase).toBe("RealRateDemoVault2026!");
    });
  });

  describe("Admin demo routes (/api/admin/demo*)", () => {
    it("refuses non-admin access with 403", async () => {
      getAuthenticatedUser.mockResolvedValue({ id: "usr_user", role: "user" });

      await expect(handleAdminGetDemo(req("GET", "/api/admin/demo"), {})).rejects.toMatchObject({
        statusCode: 403,
      });
      await expect(handleAdminCreateDemo(req("POST", "/api/admin/demo"), {})).rejects.toMatchObject({
        statusCode: 403,
      });
      await expect(
        handleAdminCreateDemoEditSession(req("POST", "/api/admin/demo/edit-session"), {})
      ).rejects.toMatchObject({
        statusCode: 403,
      });
      await expect(handleAdminResetDemo(req("POST", "/api/admin/demo/reset"), {})).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it("allows admin to inspect stats, create demo user, generate edit session, and reset data", async () => {
      getAuthenticatedUser.mockResolvedValue({ id: "usr_admin", role: "admin", email: "admin@example.com" });

      // Stats
      dbGetDemoStats.mockResolvedValueOnce({ exists: true, counts: { portfolios: 2, vaultRecords: 10 } });
      const statsRes = await handleAdminGetDemo(req("GET", "/api/admin/demo"), {});
      const statsData = await statsRes.json();
      expect(statsData.counts.portfolios).toBe(2);

      // Create
      dbEnsureDemoUser.mockResolvedValueOnce({ id: "usr_demo", email: "demo@realrate.invalid" });
      const createRes = await handleAdminCreateDemo(req("POST", "/api/admin/demo"), {});
      const createData = await createRes.json();
      expect(createData.user.id).toBe("usr_demo");

      // Edit session
      dbGetDemoUser.mockResolvedValueOnce({ id: "usr_demo", email: "demo@realrate.invalid", name: "دمو" });
      const editRes = await handleAdminCreateDemoEditSession(req("POST", "/api/admin/demo/edit-session"), {});
      const editData = await editRes.json();
      expect(editData.demo.mode).toBe("edit");
      expect(dbSaveSession).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ kind: "demo_edit" }),
        7200
      );

      // Reset
      dbResetDemoData.mockResolvedValueOnce(true);
      const resetRes = await handleAdminResetDemo(req("POST", "/api/admin/demo/reset"), {});
      const resetData = await resetRes.json();
      expect(resetData.success).toBe(true);
    });
  });

  describe("Rejection of login & registration for demo user", () => {
    it("refuses registration with demo email", async () => {
      await expect(
        handleRegister(req("POST", "/api/auth/register", { email: DEMO_EMAIL, password: "Pass123456!" }), {})
      ).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it("refuses password login for demo account", async () => {
      dbGetUserAuthByEmail.mockResolvedValueOnce({
        id: "usr_demo",
        email: DEMO_EMAIL,
        isDemo: true,
      });

      await expect(
        handleLogin(req("POST", "/api/auth/login", { email: DEMO_EMAIL, password: "AnyPassword1!" }), {})
      ).rejects.toMatchObject({
        statusCode: 401,
        code: "INVALID_CREDENTIALS",
      });
    });
  });
});

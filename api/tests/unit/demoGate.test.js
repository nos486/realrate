/**
 * demoGate.test.js — Tests for server-side demo read-only gate and edit guardrails
 */

import { describe, it, expect, vi } from "vitest";
import { enforceDemoGate, DEMO_READ_ONLY_MESSAGE } from "../../src/lib/demoGate.js";

vi.mock("../../src/lib/auth.js", () => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock("../../src/repositories/vault.repository.js", () => ({
  dbHasUserVault: vi.fn(),
}));

import { getAuthenticatedUser } from "../../src/lib/auth.js";
import { dbHasUserVault } from "../../src/repositories/vault.repository.js";

function req(method, path, body = null) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("enforceDemoGate", () => {
  it("allows unauthenticated or regular sessions through", async () => {
    getAuthenticatedUser.mockResolvedValueOnce(null);
    await expect(enforceDemoGate(req("POST", "/api/portfolios"), {}, "/api/portfolios")).resolves.toBeUndefined();

    getAuthenticatedUser.mockResolvedValueOnce({ id: "usr_1", role: "user", kind: "" });
    await expect(enforceDemoGate(req("POST", "/api/portfolios"), {}, "/api/portfolios")).resolves.toBeUndefined();
  });

  describe("demo_view session", () => {
    const demoUser = { id: "usr_demo", role: "user", kind: "demo_view" };

    it("allows GET requests on any application route", async () => {
      getAuthenticatedUser.mockResolvedValue(demoUser);

      await expect(enforceDemoGate(req("GET", "/api/portfolios"), {}, "/api/portfolios")).resolves.toBeUndefined();
      await expect(enforceDemoGate(req("GET", "/api/loans"), {}, "/api/loans")).resolves.toBeUndefined();
      await expect(enforceDemoGate(req("GET", "/api/incomes"), {}, "/api/incomes")).resolves.toBeUndefined();
      await expect(enforceDemoGate(req("GET", "/api/cheques"), {}, "/api/cheques")).resolves.toBeUndefined();
      await expect(enforceDemoGate(req("GET", "/api/vault/records/loan"), {}, "/api/vault/records/loan")).resolves.toBeUndefined();
      await expect(enforceDemoGate(req("GET", "/api/user/home-layout"), {}, "/api/user/home-layout")).resolves.toBeUndefined();
    });

    it("allows POST /api/auth/logout", async () => {
      getAuthenticatedUser.mockResolvedValue(demoUser);
      await expect(enforceDemoGate(req("POST", "/api/auth/logout"), {}, "/api/auth/logout")).resolves.toBeUndefined();
    });

    it("blocks POST/PUT/PATCH/DELETE on application routes with 403 DEMO_READ_ONLY", async () => {
      getAuthenticatedUser.mockResolvedValue(demoUser);

      const cases = [
        ["POST", "/api/portfolios"],
        ["PUT", "/api/portfolios"],
        ["DELETE", "/api/portfolios"],
        ["POST", "/api/portfolio"],
        ["DELETE", "/api/portfolio"],
        ["POST", "/api/loans"],
        ["PUT", "/api/loans/loan_1"],
        ["DELETE", "/api/loans/loan_1"],
        ["PUT", "/api/vault/records/loan/l1"],
        ["DELETE", "/api/vault/records/loan/l1"],
        ["PUT", "/api/user/home-layout"],
        ["POST", "/api/user/settings"],
        ["POST", "/api/banks/custom"],
      ];

      for (const [method, path] of cases) {
        await expect(enforceDemoGate(req(method, path), {}, path)).rejects.toMatchObject({
          statusCode: 403,
          code: "DEMO_READ_ONLY",
          message: DEMO_READ_ONLY_MESSAGE,
        });
      }
    });

    it("blocks access to /api/admin/*", async () => {
      getAuthenticatedUser.mockResolvedValue(demoUser);
      await expect(enforceDemoGate(req("GET", "/api/admin/users"), {}, "/api/admin/users")).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  describe("demo_edit session", () => {
    const editUser = { id: "usr_demo", role: "user", kind: "demo_edit" };

    it("allows writing normal vault records and home layout", async () => {
      getAuthenticatedUser.mockResolvedValue(editUser);

      await expect(enforceDemoGate(req("PUT", "/api/vault/records/loan/l1", { payload: "enc:test" }), {}, "/api/vault/records/loan/l1")).resolves.toBeUndefined();
      await expect(enforceDemoGate(req("PUT", "/api/user/home-layout", { layout: {} }), {}, "/api/user/home-layout")).resolves.toBeUndefined();
      await expect(enforceDemoGate(req("POST", "/api/portfolios", { name: "پورتفوی دمو" }), {}, "/api/portfolios")).resolves.toBeUndefined();
    });

    it("blocks access to /api/admin/* for demo_edit", async () => {
      getAuthenticatedUser.mockResolvedValue(editUser);
      await expect(enforceDemoGate(req("GET", "/api/admin/stats"), {}, "/api/admin/stats")).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it("blocks changing vault passphrase when vault already exists", async () => {
      getAuthenticatedUser.mockResolvedValue(editUser);
      dbHasUserVault.mockResolvedValueOnce(true);

      await expect(enforceDemoGate(req("PUT", "/api/vault", { wrappedKey: "enc:x" }), {}, "/api/vault")).rejects.toMatchObject({
        statusCode: 403,
        code: "DEMO_EDIT_FORBIDDEN",
      });
    });

    it("allows initializing vault when vault does not exist yet", async () => {
      getAuthenticatedUser.mockResolvedValue(editUser);
      dbHasUserVault.mockResolvedValueOnce(false);

      await expect(enforceDemoGate(req("PUT", "/api/vault", { wrappedKey: "enc:x" }), {}, "/api/vault")).resolves.toBeUndefined();
    });

    it("blocks account deletion, password changes, and signout-all", async () => {
      getAuthenticatedUser.mockResolvedValue(editUser);

      await expect(enforceDemoGate(req("DELETE", "/api/user"), {}, "/api/user")).rejects.toMatchObject({
        statusCode: 403,
        code: "DEMO_EDIT_FORBIDDEN",
      });

      await expect(enforceDemoGate(req("POST", "/api/auth/password", { password: "x" }), {}, "/api/auth/password")).rejects.toMatchObject({
        statusCode: 403,
        code: "DEMO_EDIT_FORBIDDEN",
      });

      await expect(enforceDemoGate(req("POST", "/api/auth/signout-all"), {}, "/api/auth/signout-all")).rejects.toMatchObject({
        statusCode: 403,
        code: "DEMO_EDIT_FORBIDDEN",
      });
    });

    it("blocks enabling public portfolio sharing in demo_edit", async () => {
      getAuthenticatedUser.mockResolvedValue(editUser);

      await expect(
        enforceDemoGate(req("PUT", "/api/portfolios", { shareEnabled: true }), {}, "/api/portfolios")
      ).rejects.toMatchObject({
        statusCode: 403,
        code: "DEMO_EDIT_FORBIDDEN",
      });
    });
  });
});

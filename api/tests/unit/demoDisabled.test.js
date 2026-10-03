/**
 * demoDisabled.test.js — With the demo switched off (config/constants.js), its sign-in is refused
 * and an open demo visitor's session counts as signed out; other sessions are untouched
 */
import { describe, it, expect, vi } from "vitest";

const sessions = vi.hoisted(() => ({
  demo: { token: "d", userId: "u_demo", email: "demo@realrate.ir", kind: "demo_view" },
  edit: { token: "e", userId: "u_demo", email: "admin@x.com", kind: "demo_edit" },
  user: { token: "u", userId: "u1", email: "a@b.c" },
}));
vi.mock("../../src/repositories/session.repository.js", () => ({
  dbGetSession: async (_env, token) => Object.values(sessions).find((s) => s.token === token) || null,
  dbSaveSession: async () => {},
}));

const { DEMO_ENABLED } = await import("../../src/config/constants.js");
const { getAuthenticatedUser } = await import("../../src/lib/auth.js");
const { handleDemoLogin } = await import("../../src/handlers/demoRoutes.js");

const req = (token) => new Request("https://api.realrate.ir/api/auth/me", token ? { headers: { Authorization: `Bearer ${token}` } } : {});

describe("demo switched off", () => {
  it("is off", () => {
    expect(DEMO_ENABLED).toBe(false);
  });

  it("refuses the demo sign-in", async () => {
    await expect(handleDemoLogin(new Request("https://api.realrate.ir/api/auth/demo", { method: "POST" }), {})).rejects.toMatchObject({ statusCode: 403, code: "DEMO_DISABLED" });
  });

  it("an open demo visitor's session counts as signed out, other sessions don't", async () => {
    expect(await getAuthenticatedUser(req("d"), {})).toBe(null);
    expect(await getAuthenticatedUser(req("e"), {})).toMatchObject({ kind: "demo_edit" });
    expect(await getAuthenticatedUser(req("u"), {})).toMatchObject({ userId: "u1" });
  });
});

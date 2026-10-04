/**
 * demo.repository.js — Data access layer for the single shared read-only demo account
 */

import { ensureSchema } from "./schema.repository.js";
import { logger } from "../lib/logger.js";
import { forgetSessions } from "./session.repository.js";

export const DEMO_EMAIL = "demo@realrate.invalid";
export const DEMO_USER_ID = "usr_demo_account";
export const DEMO_VIEW_TTL_SECONDS = 2 * 3600; // 2 hours
export const DEMO_EDIT_TTL_SECONDS = 2 * 3600; // 2 hours

/**
 * Returns the public demo vault passphrase.
 * Priority: Worker Secret DEMO_VAULT_PASSPHRASE -> deterministic default
 */
export function getDemoVaultPassphrase(env) {
  return (env?.DEMO_VAULT_PASSPHRASE || "RealRateDemoVault2026!").trim();
}

/**
 * Get the demo user if it exists in the database
 * @param {object} env
 * @returns {Promise<object|null>}
 */
export async function dbGetDemoUser(env) {
  if (!env?.DB) return null;
  await ensureSchema(env);
  try {
    const row = await env.DB.prepare(`
      SELECT id, email, name, custom_name AS customName, picture, role,
             created_at AS createdAt, last_login AS lastLogin, login_count AS loginCount,
             disabled, is_demo AS isDemo, home_layout AS homeLayout
      FROM users
      WHERE is_demo = 1 OR email = ?
      LIMIT 1
    `).bind(DEMO_EMAIL).first();

    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      name: row.name || "کاربر دمو",
      customName: row.customName || "حساب نمایشی دمو",
      picture: row.picture || "",
      role: "user", // Demo role is strictly 'user'
      createdAt: row.createdAt,
      lastLogin: row.lastLogin,
      loginCount: Number(row.loginCount) || 0,
      disabled: Number(row.disabled) === 1,
      isDemo: true,
      homeLayout: row.homeLayout || "",
    };
  } catch (e) {
    logger.error("[DB] dbGetDemoUser error:", { error: e.message });
    return null;
  }
}

/**
 * Ensure the demo user exists (idempotent creation)
 * @param {object} env
 * @returns {Promise<object>}
 */
export async function dbEnsureDemoUser(env) {
  if (!env?.DB) throw new Error("Database connection required");
  await ensureSchema(env);

  const existing = await dbGetDemoUser(env);
  if (existing) return existing;

  const now = new Date().toISOString();
  try {
    await env.DB.prepare(`
      INSERT INTO users (
        id, email, name, custom_name, picture, role, created_at, last_login, login_count,
        password_hash, email_verified, disabled, google_linked, home_layout, is_demo
      ) VALUES (
        ?, ?, ?, ?, '', 'user', ?, ?, 0, '', 1, 0, 0, '', 1
      )
      ON CONFLICT(email) DO UPDATE SET
        is_demo = 1
    `).bind(
      DEMO_USER_ID,
      DEMO_EMAIL,
      "کاربر آزمایشی (دمو)",
      "حساب نمایشی دمو",
      now,
      now
    ).run();

    return await dbGetDemoUser(env);
  } catch (e) {
    logger.error("[DB] dbEnsureDemoUser error:", { error: e.message });
    throw e;
  }
}

/**
 * Get demo account status and metadata counts (without contents)
 * @param {object} env
 * @returns {Promise<object>}
 */
export async function dbGetDemoStats(env) {
  const user = await dbGetDemoUser(env);
  if (!user) {
    return {
      exists: false,
      user: null,
      counts: null,
      hasVault: false,
    };
  }

  const userId = user.id;
  try {
    const [pRow, lRow, iRow, cRow, vrRow, uvRow] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS n FROM portfolios WHERE user_id = ?").bind(userId).first("n"),
      env.DB.prepare("SELECT COUNT(*) AS n FROM vault_records WHERE user_id = ? AND kind = 'loan'").bind(userId).first("n"),
      env.DB.prepare("SELECT COUNT(*) AS n FROM vault_records WHERE user_id = ? AND kind = 'income'").bind(userId).first("n"),
      env.DB.prepare("SELECT COUNT(*) AS n FROM vault_records WHERE user_id = ? AND kind = 'cheque'").bind(userId).first("n"),
      env.DB.prepare("SELECT COUNT(*) AS n FROM vault_records WHERE user_id = ?").bind(userId).first("n"),
      env.DB.prepare("SELECT 1 FROM user_vaults WHERE user_id = ? LIMIT 1").bind(userId).first(),
    ]);

    return {
      exists: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        customName: user.customName,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        disabled: user.disabled,
      },
      counts: {
        portfolios: Number(pRow) || 0,
        loans: Number(lRow) || 0,
        incomes: Number(iRow) || 0,
        cheques: Number(cRow) || 0,
        vaultRecords: Number(vrRow) || 0,
      },
      hasVault: Boolean(uvRow),
    };
  } catch (e) {
    logger.error("[DB] dbGetDemoStats error:", { error: e.message });
    return {
      exists: true,
      user,
      counts: { portfolios: 0, loans: 0, incomes: 0, cheques: 0, vaultRecords: 0 },
      hasVault: false,
    };
  }
}

/**
 * Reset all financial and layout data for the demo user
 * @param {object} env
 * @returns {Promise<boolean>}
 */
export async function dbResetDemoData(env) {
  const user = await dbGetDemoUser(env);
  if (!user || !env?.DB) return false;
  const userId = user.id;

  try {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM portfolios WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM portfolio_holdings WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM transactions WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM loans WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM incomes WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM recurring_incomes WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM cheques WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM custom_banks WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM vault_records WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM vault_tombstones WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM vault_reminders WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM alert_email_prefs WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM alert_email_sent WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM user_vaults WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
      env.DB.prepare("UPDATE users SET home_layout = '' WHERE id = ?").bind(userId),
    ]);
    forgetSessions({ userId });
    return true;
  } catch (e) {
    logger.error("[DB] dbResetDemoData error:", { error: e.message });
    throw e;
  }
}

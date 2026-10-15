/**
 * portfolio.repository.js — Portfolio Data Access Layer (D1)
 *
 * A portfolio row holds its name, share settings and its own data key wrapped by the owner's
 * account key (e2ee_wrapped_key). Its items (holdings, transactions, layout, risk profile) are
 * encrypted vault records whose parent is the portfolio (vault.repository.js). The browser
 * creates every portfolio, its first one included, with its key.
 */

import { ensureSchema } from "./schema.repository.js";
import { generateRandomSlug } from "./user.repository.js";
import { logger } from "../lib/logger.js";
import { hashSharePassword, isHashedSharePassword } from "../lib/security.js";
import { AppError } from "../lib/AppError.js";
import { vaultTombstoneParentStatements } from "./vault.repository.js";

const PORTFOLIO_COLUMNS = `
  p.id, p.user_id AS userId, p.name, p.is_default AS isDefault,
  p.share_slug AS shareSlug, p.share_password AS sharePassword, p.share_enabled AS shareEnabled,
  p.e2ee_wrapped_key AS e2eeWrappedKey, p.created_at AS createdAt, p.updated_at AS updatedAt
`;

// A portfolio's items: its vault records
const ITEM_COUNT_SQL = `(SELECT COUNT(*) FROM vault_records v WHERE v.user_id = p.user_id AND v.kind = 'holding' AND v.parent_id = p.id)`;
const TX_COUNT_SQL = `(SELECT COUNT(*) FROM vault_records v WHERE v.user_id = p.user_id AND v.kind = 'transaction' AND v.parent_id = p.id)`;

/**
 * All portfolios of a user, the default first, with their item counts
 * @returns {Promise<Array>}
 */
export async function dbGetUserPortfolios(env, userId) {
  if (!userId || !env?.DB) return [];
  await ensureSchema(env);
  try {
    const { results } = await env.DB.prepare(`
      SELECT ${PORTFOLIO_COLUMNS}, ${ITEM_COUNT_SQL} AS itemCount, ${TX_COUNT_SQL} AS transactionCount
      FROM portfolios p
      WHERE p.user_id = ?
      ORDER BY p.is_default DESC, p.created_at ASC
    `).bind(userId).all();
    return Array.isArray(results) ? results : [];
  } catch (e) {
    logger.error("[DB] dbGetUserPortfolios error:", { error: e.message });
    return [];
  }
}

/**
 * One portfolio of the user
 * @returns {Promise<object|null>}
 */
export async function dbGetPortfolioById(env, portfolioId, userId) {
  if (!portfolioId || !userId || !env?.DB) return null;
  await ensureSchema(env);
  try {
    return (await env.DB.prepare(`SELECT ${PORTFOLIO_COLUMNS} FROM portfolios p WHERE p.id = ? AND p.user_id = ?`)
      .bind(portfolioId, userId).first()) || null;
  } catch (e) {
    logger.error("[DB] dbGetPortfolioById error:", { error: e.message });
    return null;
  }
}

/**
 * Create a portfolio with its wrapped data key; the user's first one is their default
 * @param {{ name: string, e2eeWrappedKey: string }} options
 * @returns {Promise<object>}
 */
export async function dbCreatePortfolio(env, userId, { name, e2eeWrappedKey }) {
  if (!userId) throw new Error("شناسه کاربر الزامی است.");
  const portfolioName = String(name || "").trim() || "پورتفوی جدید";
  const now = new Date().toISOString();
  const id = `p_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const shareSlug = generateRandomSlug(8);
  let isDefault = 0;

  if (env?.DB) {
    await ensureSchema(env);
    const { results } = await env.DB.prepare(`
      INSERT INTO portfolios (id, user_id, name, is_default, share_slug, share_password, share_enabled, e2ee_wrapped_key, created_at, updated_at)
      VALUES (?1, ?2, ?3, NOT EXISTS (SELECT 1 FROM portfolios WHERE user_id = ?2), ?4, '', 0, ?5, ?6, ?6)
      RETURNING is_default AS isDefault
    `).bind(id, userId, portfolioName, shareSlug, e2eeWrappedKey, now).all();
    isDefault = Number(results?.[0]?.isDefault) || 0;
  }

  return {
    id,
    userId,
    name: portfolioName,
    isDefault,
    shareSlug,
    sharePassword: "",
    shareEnabled: 0,
    e2eeWrappedKey,
    itemCount: 0,
    transactionCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update a portfolio's name, share settings, default flag or wrapped key
 * @returns {Promise<object|null>}
 */
export async function dbUpdatePortfolio(env, portfolioId, userId, { name, shareSlug, sharePassword, shareEnabled, isDefault, e2eeWrappedKey }) {
  if (!portfolioId || !userId) throw new Error("شناسه پورتفو و کاربر الزامی است.");
  if (!env?.DB) return null;
  await ensureSchema(env);

  if (shareSlug) {
    const cleanedSlug = shareSlug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    if (cleanedSlug.length < 2) {
      throw AppError.badRequest("آدرس اختصاصی باید حداقل ۲ کاراکتر و از حروف یا اعداد انگلیسی باشد.");
    }
    const existing = await env.DB.prepare("SELECT id FROM portfolios WHERE LOWER(share_slug) = LOWER(?) AND id != ?")
      .bind(cleanedSlug, portfolioId).first();
    if (existing) {
      throw new AppError("این آدرس اختصاصی (slug) قبلاً برای پورتفوی دیگری ثبت شده است.", 409, "SLUG_TAKEN");
    }
    shareSlug = cleanedSlug;
  }

  if (isDefault) {
    // One default per user
    await env.DB.prepare("UPDATE portfolios SET is_default = 0 WHERE user_id = ?").bind(userId).run();
  }

  const updates = ["updated_at = ?"];
  const bindings = [new Date().toISOString()];
  if (name !== undefined && String(name).trim()) {
    updates.push("name = ?");
    bindings.push(String(name).trim());
  }
  if (shareSlug !== undefined) {
    updates.push("share_slug = ?");
    bindings.push(shareSlug);
  }
  if (sharePassword !== undefined) {
    // Never store the share password in plaintext; "" clears it. An already-hashed value
    // (e.g. a lazy upgrade of a legacy plaintext password) is stored as-is.
    const cleanPassword = String(sharePassword || "").trim();
    updates.push("share_password = ?");
    bindings.push(isHashedSharePassword(cleanPassword) ? cleanPassword : await hashSharePassword(cleanPassword));
  }
  if (shareEnabled !== undefined) {
    updates.push("share_enabled = ?");
    bindings.push(shareEnabled ? 1 : 0);
  }
  if (isDefault !== undefined) {
    updates.push("is_default = ?");
    bindings.push(isDefault ? 1 : 0);
  }
  if (e2eeWrappedKey !== undefined) {
    updates.push("e2ee_wrapped_key = ?");
    bindings.push(String(e2eeWrappedKey || "").trim());
  }

  bindings.push(portfolioId, userId);
  await env.DB.prepare(`UPDATE portfolios SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`).bind(...bindings).run();

  return env.DB.prepare(`
    SELECT ${PORTFOLIO_COLUMNS}, ${ITEM_COUNT_SQL} AS itemCount, ${TX_COUNT_SQL} AS transactionCount
    FROM portfolios p
    WHERE p.id = ? AND p.user_id = ?
  `).bind(portfolioId, userId).first();
}

/**
 * Delete a portfolio and its encrypted items (telling devices that keep a copy); the user's
 * only portfolio cannot be deleted, and when the default goes another becomes the default
 * @returns {Promise<boolean>}
 */
export async function dbDeletePortfolio(env, portfolioId, userId) {
  if (!portfolioId || !userId) throw new Error("شناسه پورتفو و کاربر الزامی است.");
  if (!env?.DB) return false;
  await ensureSchema(env);

  const countRow = await env.DB.prepare("SELECT COUNT(*) AS total FROM portfolios WHERE user_id = ?").bind(userId).first();
  if (countRow && countRow.total <= 1) {
    throw new Error("امکان حذف تنها پورتفوی فعال وجود ندارد. هر کاربر باید حداقل یک پورتفو داشته باشد.");
  }

  await env.DB.batch([
    ...vaultTombstoneParentStatements(env, userId, portfolioId, ["holding", "transaction", "portfolio_layout", "risk_profile"]),
    env.DB.prepare(`
      DELETE FROM vault_records WHERE user_id = ? AND parent_id = ? AND kind IN ('holding', 'transaction', 'portfolio_layout', 'risk_profile')
    `).bind(userId, portfolioId),
    env.DB.prepare("DELETE FROM portfolios WHERE id = ? AND user_id = ?").bind(portfolioId, userId),
    // The default went: the oldest one left takes its place
    env.DB.prepare(`
      UPDATE portfolios SET is_default = 1
      WHERE id = (SELECT id FROM portfolios WHERE user_id = ?1 ORDER BY created_at ASC LIMIT 1)
        AND NOT EXISTS (SELECT 1 FROM portfolios WHERE user_id = ?1 AND is_default = 1)
    `).bind(userId),
  ]);
  return true;
}

/**
 * A shared portfolio by its slug, with its owner's display name
 * @returns {Promise<object|null>}
 */
export async function dbGetPortfolioByShareSlug(env, slug) {
  if (!slug || !env?.DB) return null;
  await ensureSchema(env);
  try {
    return (await env.DB.prepare(`
      SELECT ${PORTFOLIO_COLUMNS}, u.name AS userName, u.custom_name AS userCustomName, u.email AS userEmail
      FROM portfolios p
      JOIN users u ON p.user_id = u.id
      WHERE LOWER(p.share_slug) = LOWER(?)
    `).bind(slug.trim()).first()) || null;
  } catch (e) {
    logger.error("[DB] dbGetPortfolioShareSlug error:", { error: e.message });
    return null;
  }
}

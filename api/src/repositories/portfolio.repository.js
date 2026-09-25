/**
 * portfolio.repository.js — Cloudflare D1 Portfolio Data Access Layer
 */

import { ensureD1Tables } from "./migration.repository.js";
import { dbGetUserById, generateRandomSlug } from "./user.repository.js";
import { logger } from "../lib/logger.js";
import { hashSharePassword, isHashedSharePassword } from "../lib/security.js";
import { AppError } from "../lib/AppError.js";

/**
 * Fetch all portfolios for a user (with auto-bootstrap default portfolio if none exist)
 * @param {object} env
 * @param {string} userId
 * @returns {Promise<Array>}
 */
export async function dbGetUserPortfolios(env, userId) {
  if (!userId) return [];

  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      let { results } = await env.DB.prepare(`
        SELECT p.id, p.user_id AS userId, p.name, p.is_default AS isDefault,
               p.share_slug AS shareSlug, p.share_password AS sharePassword,
               p.share_enabled AS shareEnabled, p.is_e2ee AS isE2ee,
               p.e2ee_salt AS e2eeSalt, p.e2ee_verifier AS e2eeVerifier,
               p.e2ee_wrapped_key AS e2eeWrappedKey,
               p.created_at AS createdAt, p.updated_at AS updatedAt,
               COUNT(DISTINCT h.id) AS itemCount,
               COUNT(DISTINCT t.id) AS transactionCount
        FROM portfolios p
        LEFT JOIN portfolio_holdings h ON p.id = h.portfolio_id
        LEFT JOIN transactions t ON p.id = t.portfolio_id
        WHERE p.user_id = ?
        GROUP BY p.id
        ORDER BY p.is_default DESC, p.created_at ASC
      `).bind(userId).all();

      // If user has no portfolio records yet, auto-bootstrap default portfolio
      if (!results || results.length === 0) {
        const userData = await dbGetUserById(env, userId);
        const defaultPortfolioId = `p_def_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
        const shareSlug = userData?.shareSlug || generateRandomSlug(8);
        const sharePassword = userData?.sharePassword || '';
        const shareEnabled = userData?.shareEnabled ? 1 : 0;
        const now = new Date().toISOString();

        await env.DB.prepare(`
          INSERT INTO portfolios (id, user_id, name, is_default, share_slug, share_password, share_enabled, is_e2ee, e2ee_salt, e2ee_verifier, created_at, updated_at)
          VALUES (?, ?, ?, 1, ?, ?, ?, 0, '', '', ?, ?)
        `).bind(
          defaultPortfolioId,
          userId,
          'پورتفوی اصلی',
          shareSlug,
          sharePassword,
          shareEnabled,
          now,
          now
        ).run();

        // Migrate any unassigned holdings for this user
        await env.DB.prepare(`
          UPDATE portfolio_holdings
          SET portfolio_id = ?
          WHERE user_id = ? AND (portfolio_id IS NULL OR portfolio_id = '')
        `).bind(defaultPortfolioId, userId).run();

        const reQuery = await env.DB.prepare(`
          SELECT p.id, p.user_id AS userId, p.name, p.is_default AS isDefault,
                 p.share_slug AS shareSlug, p.share_password AS sharePassword,
                 p.share_enabled AS shareEnabled, p.is_e2ee AS isE2ee,
                 p.e2ee_salt AS e2eeSalt, p.e2ee_verifier AS e2eeVerifier,
               p.e2ee_wrapped_key AS e2eeWrappedKey,
                 p.created_at AS createdAt, p.updated_at AS updatedAt,
                 COUNT(DISTINCT h.id) AS itemCount,
                 COUNT(DISTINCT t.id) AS transactionCount
          FROM portfolios p
          LEFT JOIN portfolio_holdings h ON p.id = h.portfolio_id
          LEFT JOIN transactions t ON p.id = t.portfolio_id
          WHERE p.user_id = ?
          GROUP BY p.id
          ORDER BY p.is_default DESC, p.created_at ASC
        `).bind(userId).all();
        results = reQuery.results;
      }

      return Array.isArray(results) ? results : [];
    } catch (e) {
      logger.error("D1 dbGetUserPortfolios error:", { error: e.message });
    }
  }

  return [];
}

/**
 * Get a single portfolio by ID and userId
 * @param {object} env
 * @param {string} portfolioId
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function dbGetPortfolioById(env, portfolioId, userId) {
  if (!portfolioId || !userId) return null;
  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      const row = await env.DB.prepare(`
        SELECT p.id, p.user_id AS userId, p.name, p.is_default AS isDefault,
               p.share_slug AS shareSlug, p.share_password AS sharePassword,
               p.share_enabled AS shareEnabled, p.is_e2ee AS isE2ee,
               p.e2ee_salt AS e2eeSalt, p.e2ee_verifier AS e2eeVerifier,
               p.e2ee_wrapped_key AS e2eeWrappedKey,
               p.created_at AS createdAt, p.updated_at AS updatedAt
        FROM portfolios p
        WHERE p.id = ? AND p.user_id = ?
      `).bind(portfolioId, userId).first();
      return row || null;
    } catch (e) {
      logger.error("D1 dbGetPortfolioById error:", { error: e.message });
    }
  }
  return null;
}

/**
 * Create a new portfolio for user
 * @param {object} env
 * @param {string} userId
 * @param {object} options
 * @returns {Promise<object>}
 */
export async function dbCreatePortfolio(env, userId, { name, isE2ee = false, e2eeSalt = "", e2eeVerifier = "", e2eeWrappedKey = "" }) {
  if (!userId) throw new Error("شناسه کاربر الزامی است.");
  const portfolioName = String(name || "").trim() || "پورتفوی جدید";
  const now = new Date().toISOString();
  const id = `p_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const shareSlug = generateRandomSlug(8);
  const e2eeVal = isE2ee ? 1 : 0;

  if (env && env.DB) {
    await ensureD1Tables(env);
    await env.DB.prepare(`
      INSERT INTO portfolios (id, user_id, name, is_default, share_slug, share_password, share_enabled, is_e2ee, e2ee_salt, e2ee_verifier, e2ee_wrapped_key, created_at, updated_at)
      VALUES (?, ?, ?, 0, ?, '', 0, ?, ?, ?, ?, ?, ?)
    `).bind(id, userId, portfolioName, shareSlug, e2eeVal, e2eeSalt || "", e2eeVerifier || "", e2eeWrappedKey || "", now, now).run();
  }

  return {
    id,
    userId,
    name: portfolioName,
    isDefault: 0,
    shareSlug,
    sharePassword: '',
    shareEnabled: 0,
    isE2ee: !!e2eeVal,
    e2eeSalt: e2eeSalt || '',
    e2eeVerifier: e2eeVerifier || '',
    e2eeWrappedKey: e2eeWrappedKey || '',
    itemCount: 0,
    transactionCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update portfolio name and share settings
 * @param {object} env
 * @param {string} portfolioId
 * @param {string} userId
 * @param {object} options
 * @returns {Promise<object|null>}
 */
export async function dbUpdatePortfolio(env, portfolioId, userId, { name, shareSlug, sharePassword, shareEnabled, isDefault, isE2ee, e2eeSalt, e2eeVerifier, e2eeWrappedKey }) {
  if (!portfolioId || !userId) throw new Error("شناسه پورتفو و کاربر الزامی است.");
  if (env && env.DB) {
    await ensureD1Tables(env);

    // Validate shareSlug uniqueness if provided
    if (shareSlug) {
      const cleanedSlug = shareSlug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      if (cleanedSlug.length < 2) {
        throw AppError.badRequest("آدرس اختصاصی باید حداقل ۲ کاراکتر و از حروف یا اعداد انگلیسی باشد.");
      }
      const existing = await env.DB.prepare(`
        SELECT id FROM portfolios WHERE LOWER(share_slug) = LOWER(?) AND id != ?
      `).bind(cleanedSlug, portfolioId).first();
      if (existing) {
        throw new AppError("این آدرس اختصاصی (slug) قبلاً برای پورتفوی دیگری ثبت شده است.", 409, "SLUG_TAKEN");
      }
      shareSlug = cleanedSlug;
    }

    if (isDefault) {
      // Clear default flag on other portfolios of this user
      await env.DB.prepare(`
        UPDATE portfolios SET is_default = 0 WHERE user_id = ?
      `).bind(userId).run();
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
      const cleanPassword = String(sharePassword || '').trim();
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
    if (isE2ee !== undefined) {
      updates.push("is_e2ee = ?");
      bindings.push(isE2ee ? 1 : 0);
    }
    if (e2eeSalt !== undefined) {
      updates.push("e2ee_salt = ?");
      bindings.push(String(e2eeSalt || '').trim());
    }
    if (e2eeVerifier !== undefined) {
      updates.push("e2ee_verifier = ?");
      bindings.push(String(e2eeVerifier || '').trim());
    }
    if (e2eeWrappedKey !== undefined) {
      updates.push("e2ee_wrapped_key = ?");
      bindings.push(String(e2eeWrappedKey || '').trim());
    }

    bindings.push(portfolioId, userId);
    await env.DB.prepare(`
      UPDATE portfolios
      SET ${updates.join(", ")}
      WHERE id = ? AND user_id = ?
    `).bind(...bindings).run();

    const updated = await env.DB.prepare(`
      SELECT p.id, p.user_id AS userId, p.name, p.is_default AS isDefault,
             p.share_slug AS shareSlug, p.share_password AS sharePassword,
             p.share_enabled AS shareEnabled, p.is_e2ee AS isE2ee,
             p.e2ee_salt AS e2eeSalt, p.e2ee_verifier AS e2eeVerifier,
               p.e2ee_wrapped_key AS e2eeWrappedKey,
             p.created_at AS createdAt, p.updated_at AS updatedAt,
             COUNT(DISTINCT h.id) AS itemCount,
             COUNT(DISTINCT t.id) AS transactionCount
      FROM portfolios p
      LEFT JOIN portfolio_holdings h ON p.id = h.portfolio_id
      LEFT JOIN transactions t ON p.id = t.portfolio_id
      WHERE p.id = ? AND p.user_id = ?
      GROUP BY p.id
    `).bind(portfolioId, userId).first();

    return updated;
  }

  return null;
}

/**
 * Delete a portfolio and its holdings
 * @param {object} env
 * @param {string} portfolioId
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function dbDeletePortfolio(env, portfolioId, userId) {
  if (!portfolioId || !userId) throw new Error("شناسه پورتفو و کاربر الزامی است.");
  if (env && env.DB) {
    await ensureD1Tables(env);

    const countRow = await env.DB.prepare(`
      SELECT COUNT(*) AS total FROM portfolios WHERE user_id = ?
    `).bind(userId).first();

    if (countRow && countRow.total <= 1) {
      throw new Error("امکان حذف تنها پورتفوی فعال وجود ندارد. هر کاربر باید حداقل یک پورتفو داشته باشد.");
    }

    // Delete holdings
    await env.DB.prepare(`
      DELETE FROM portfolio_holdings WHERE portfolio_id = ? AND user_id = ?
    `).bind(portfolioId, userId).run();

    // Delete transactions
    await env.DB.prepare(`
      DELETE FROM transactions WHERE portfolio_id = ? AND user_id = ?
    `).bind(portfolioId, userId).run();

    // Delete portfolio
    await env.DB.prepare(`
      DELETE FROM portfolios WHERE id = ? AND user_id = ?
    `).bind(portfolioId, userId).run();

    // If default was deleted, assign default to another
    const remaining = await env.DB.prepare(`
      SELECT id FROM portfolios WHERE user_id = ? ORDER BY is_default DESC, created_at ASC LIMIT 1
    `).bind(userId).first();

    if (remaining) {
      await env.DB.prepare(`
        UPDATE portfolios SET is_default = 1 WHERE id = ?
      `).bind(remaining.id).run();
    }

    return true;
  }
  return false;
}

/**
 * Fetch portfolio by share slug for public sharing
 * @param {object} env
 * @param {string} slug
 * @returns {Promise<object|null>}
 */
export async function dbGetPortfolioByShareSlug(env, slug) {
  if (!slug) return null;
  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      // 1. Search in portfolios table
      const portfolio = await env.DB.prepare(`
        SELECT p.id, p.user_id AS userId, p.name, p.is_default AS isDefault,
               p.share_slug AS shareSlug, p.share_password AS sharePassword,
               p.share_enabled AS shareEnabled, p.is_e2ee AS isE2ee,
               p.e2ee_salt AS e2eeSalt, p.e2ee_verifier AS e2eeVerifier,
               p.e2ee_wrapped_key AS e2eeWrappedKey,
               u.name AS userName, u.custom_name AS userCustomName, u.email AS userEmail
        FROM portfolios p
        JOIN users u ON p.user_id = u.id
        WHERE LOWER(p.share_slug) = LOWER(?)
      `).bind(slug.trim()).first();

      if (portfolio) {
        return portfolio;
      }

      // 2. Fallback: Search in users table (old slug before migration)
      const user = await env.DB.prepare(`
        SELECT id, email, name, custom_name AS customName, picture, role,
               share_slug AS shareSlug, share_password AS sharePassword,
               share_enabled AS shareEnabled
        FROM users
        WHERE LOWER(share_slug) = LOWER(?)
      `).bind(slug.trim()).first();

      if (user) {
        const defP = await env.DB.prepare(`
          SELECT id, user_id AS userId, name, is_default AS isDefault,
                 share_slug AS shareSlug, share_password AS sharePassword,
                 share_enabled AS shareEnabled
          FROM portfolios
          WHERE user_id = ?
          ORDER BY is_default DESC, created_at ASC LIMIT 1
        `).bind(user.id).first();

        return {
          id: defP?.id || `p_${user.id}`,
          userId: user.id,
          name: defP?.name || 'پورتفوی اصلی',
          isDefault: 1,
          shareSlug: user.shareSlug,
          sharePassword: user.sharePassword,
          shareEnabled: user.shareEnabled,
          userName: user.name,
          userCustomName: user.customName,
          userEmail: user.email,
        };
      }
    } catch (e) {
      logger.error("D1 dbGetPortfolioShareSlug error:", { error: e.message });
    }
  }
  return null;
}

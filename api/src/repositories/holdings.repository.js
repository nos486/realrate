/**
 * holdings.repository.js — Cloudflare D1 Portfolio Holdings Data Access Layer
 */

import { ensureD1Tables } from "./migration.repository.js";
import { dbGetUserPortfolios } from "./portfolio.repository.js";
import { logger } from "../lib/logger.js";

/**
 * Fetch all portfolio holdings for a user and optionally a specific portfolio
 * @param {object} env
 * @param {string} userId
 * @param {string} [portfolioId=null]
 * @returns {Promise<Array>}
 */
export async function dbGetPortfolioHoldings(env, userId, portfolioId = null) {
  if (!userId) return [];

  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      let query = `
        SELECT id, user_id AS userId, portfolio_id AS portfolioId, asset_id AS assetId,
               asset_name AS assetName, asset_type AS assetType, unit, amount,
               buy_price AS buyPrice, current_price AS currentPrice, buy_date AS buyDate,
               notes, created_at AS createdAt, updated_at AS updatedAt
        FROM portfolio_holdings
        WHERE user_id = ?
      `;
      const bindings = [userId];

      if (portfolioId) {
        query += ` AND (portfolio_id = ? OR (portfolio_id IS NULL AND ? = (SELECT id FROM portfolios WHERE user_id = ? AND is_default = 1 LIMIT 1)))`;
        bindings.push(portfolioId, portfolioId, userId);
      }

      query += ` ORDER BY created_at DESC`;

      const { results } = await env.DB.prepare(query).bind(...bindings).all();
      if (Array.isArray(results)) {
        return results;
      }
    } catch (e) {
      logger.error("D1 dbGetPortfolioHoldings error:", { error: e.message });
    }
  }

  return [];
}

/**
 * Add or update a portfolio holding for a user in a portfolio
 * @param {object} env
 * @param {object} item
 * @returns {Promise<object>}
 */
export async function dbAddPortfolioHolding(env, item) {
  const now = new Date().toISOString();
  let portfolioId = item.portfolioId;

  // If no portfolioId provided, resolve user's default portfolio
  if (!portfolioId && env && env.DB) {
    await ensureD1Tables(env);
    const defP = await env.DB.prepare(`
      SELECT id FROM portfolios WHERE user_id = ? ORDER BY is_default DESC, created_at ASC LIMIT 1
    `).bind(item.userId).first();
    if (defP) {
      portfolioId = defP.id;
    } else {
      const pList = await dbGetUserPortfolios(env, item.userId);
      if (pList && pList[0]) portfolioId = pList[0].id;
    }
  }

  const holding = {
    id: item.id || `h_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
    userId: item.userId,
    portfolioId: portfolioId || '',
    assetId: item.assetId,
    assetName: item.assetName || item.assetId,
    assetType: item.assetType || 'custom',
    unit: item.unit || 'واحد',
    amount: Number(item.amount) || 0,
    buyPrice: Number(item.buyPrice) || 0,
    currentPrice: Number(item.currentPrice) || 0,
    buyDate: item.buyDate || '',
    notes: item.notes || '',
    createdAt: item.createdAt || now,
    updatedAt: now,
  };

  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      await env.DB.prepare(`
        INSERT INTO portfolio_holdings (
          id, user_id, portfolio_id, asset_id, asset_name, asset_type, unit,
          amount, buy_price, current_price, buy_date, notes, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          portfolio_id = excluded.portfolio_id,
          asset_id = excluded.asset_id,
          asset_name = excluded.asset_name,
          asset_type = excluded.asset_type,
          unit = excluded.unit,
          amount = excluded.amount,
          buy_price = excluded.buy_price,
          current_price = excluded.current_price,
          buy_date = excluded.buy_date,
          notes = excluded.notes,
          updated_at = excluded.updated_at
      `).bind(
        holding.id,
        holding.userId,
        holding.portfolioId,
        holding.assetId,
        holding.assetName,
        holding.assetType,
        holding.unit,
        holding.amount,
        holding.buyPrice,
        holding.currentPrice,
        holding.buyDate,
        holding.notes,
        holding.createdAt,
        holding.updatedAt
      ).run();
    } catch (e) {
      logger.error("D1 dbAddPortfolioHolding error:", { error: e.message });
    }
  }

  return holding;
}

/**
 * Delete a portfolio holding
 * @param {object} env
 * @param {string} id
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function dbDeletePortfolioHolding(env, id, userId) {
  if (!id || !userId) return false;

  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      await env.DB.prepare(`
        DELETE FROM portfolio_holdings WHERE id = ? AND user_id = ?
      `).bind(id, userId).run();
    } catch (e) {
      logger.error("D1 dbDeletePortfolioHolding error:", { error: e.message });
    }
  }

  return true;
}

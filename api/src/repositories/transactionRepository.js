/**
 * transactionRepository.js — Cloudflare D1 Portfolio Transactions Data Access Layer
 *
 * Persists client-side encrypted transactions for Zero-Knowledge portfolio management.
 */

import { ensureD1Tables } from "./migration.repository.js";
import { logger } from "../lib/logger.js";

/**
 * Fetch all transactions for a user in a specific portfolio
 * @param {object} env
 * @param {string} userId
 * @param {string} portfolioId
 * @returns {Promise<Array>}
 */
export async function dbGetTransactionsByPortfolio(env, userId, portfolioId) {
  if (!userId || !portfolioId) return [];

  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      const query = `
        SELECT id, user_id AS userId, portfolio_id AS portfolioId,
               encrypted_payload AS encryptedPayload,
               created_at AS createdAt, updated_at AS updatedAt
        FROM transactions
        WHERE user_id = ? AND portfolio_id = ?
        ORDER BY created_at DESC
      `;
      const { results } = await env.DB.prepare(query).bind(userId, portfolioId).all();
      if (Array.isArray(results)) {
        return results;
      }
    } catch (e) {
      logger.error("D1 dbGetTransactionsByPortfolio error:", { error: e.message, userId, portfolioId });
    }
  }

  return [];
}

/**
 * Get a single transaction by ID and user ID
 * @param {object} env
 * @param {string} id
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function dbGetTransactionById(env, id, userId) {
  if (!id || !userId) return null;

  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      const query = `
        SELECT id, user_id AS userId, portfolio_id AS portfolioId,
               encrypted_payload AS encryptedPayload,
               created_at AS createdAt, updated_at AS updatedAt
        FROM transactions
        WHERE id = ? AND user_id = ?
        LIMIT 1
      `;
      const row = await env.DB.prepare(query).bind(id, userId).first();
      return row || null;
    } catch (e) {
      logger.error("D1 dbGetTransactionById error:", { error: e.message, id, userId });
    }
  }

  return null;
}

/**
 * Create a new transaction in a portfolio
 * @param {object} env
 * @param {object} item
 * @returns {Promise<object>}
 */
export async function dbCreateTransaction(env, item) {
  const now = new Date().toISOString();
  const tx = {
    id: item.id || `tx_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
    userId: item.userId,
    portfolioId: item.portfolioId,
    encryptedPayload: typeof item.encryptedPayload === "string"
      ? item.encryptedPayload
      : JSON.stringify(item.encryptedPayload || {}),
    createdAt: item.createdAt || now,
    updatedAt: now,
  };

  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      await env.DB.prepare(`
        INSERT INTO transactions (id, user_id, portfolio_id, encrypted_payload, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        tx.id,
        tx.userId,
        tx.portfolioId,
        tx.encryptedPayload,
        tx.createdAt,
        tx.updatedAt
      ).run();
    } catch (e) {
      logger.error("D1 dbCreateTransaction error:", { error: e.message, txId: tx.id });
      throw e;
    }
  }

  return tx;
}

/**
 * Update an existing transaction
 * @param {object} env
 * @param {object} item
 * @returns {Promise<object|null>}
 */
export async function dbUpdateTransaction(env, item) {
  const now = new Date().toISOString();
  const id = item.id;
  const userId = item.userId;
  const portfolioId = item.portfolioId;
  const encryptedPayload = typeof item.encryptedPayload === "string"
    ? item.encryptedPayload
    : JSON.stringify(item.encryptedPayload || {});

  if (!id || !userId) return null;

  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      let query = `
        UPDATE transactions
        SET encrypted_payload = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
      `;
      const bindings = [encryptedPayload, now, id, userId];

      if (portfolioId) {
        query = `
          UPDATE transactions
          SET encrypted_payload = ?, updated_at = ?
          WHERE id = ? AND user_id = ? AND portfolio_id = ?
        `;
        bindings.push(portfolioId);
      }

      const res = await env.DB.prepare(query).bind(...bindings).run();
      if (res && res.meta && res.meta.changes === 0) {
        return null;
      }

      return {
        id,
        userId,
        portfolioId: portfolioId || item.portfolioId,
        encryptedPayload,
        updatedAt: now,
      };
    } catch (e) {
      logger.error("D1 dbUpdateTransaction error:", { error: e.message, id, userId });
      throw e;
    }
  }

  return null;
}

/**
 * Delete a transaction
 * @param {object} env
 * @param {string} id
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function dbDeleteTransaction(env, id, userId) {
  if (!id || !userId) return false;

  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      await env.DB.prepare(`
        DELETE FROM transactions WHERE id = ? AND user_id = ?
      `).bind(id, userId).run();
      return true;
    } catch (e) {
      logger.error("D1 dbDeleteTransaction error:", { error: e.message, id, userId });
      return false;
    }
  }

  return true;
}

// Aliases matching prompt conventions
export const createTransaction = dbCreateTransaction;
export const listTransactionsByPortfolio = dbGetTransactionsByPortfolio;
export const updateTransaction = dbUpdateTransaction;
export const deleteTransaction = dbDeleteTransaction;
export const getTransactionById = dbGetTransactionById;

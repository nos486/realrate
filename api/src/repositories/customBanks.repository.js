/**
 * customBanks.repository.js — User-defined banks (anything missing from the standard registry
 * in config/banks.config.js). Referenced from other tables by `bank_id`, exactly like a
 * standard bank id, so loans today and bank accounts later can use either transparently.
 */

import { ensureD1Tables } from "./migration.repository.js";
import { AppError } from "../lib/AppError.js";
import { CUSTOM_BANK_PREFIX, normalizeBankName } from "../config/banks.config.js";

export const CUSTOM_BANK_NAME_MAX_LENGTH = 60;
export const MAX_CUSTOM_BANKS_PER_USER = 50;

function formatRow(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, createdAt: row.created_at || row.createdAt };
}

/**
 * @param {object} env
 * @param {string} userId
 * @returns {Promise<Array<{ id: string, name: string, createdAt: string }>>}
 */
export async function dbListCustomBanks(env, userId) {
  if (!env?.DB || !userId) return [];
  await ensureD1Tables(env);
  const { results } = await env.DB.prepare(
    "SELECT id, name, created_at FROM custom_banks WHERE user_id = ? ORDER BY created_at ASC"
  ).bind(userId).all();
  return (results || []).map(formatRow);
}

/**
 * @param {object} env
 * @param {string} userId
 * @param {string} bankId
 */
export async function dbGetCustomBank(env, userId, bankId) {
  if (!env?.DB || !userId || !bankId) return null;
  await ensureD1Tables(env);
  const row = await env.DB.prepare(
    "SELECT id, name, created_at FROM custom_banks WHERE id = ? AND user_id = ?"
  ).bind(bankId, userId).first();
  return formatRow(row);
}

/**
 * Create a custom bank, or return the user's existing one with the same (normalized) name.
 * @param {object} env
 * @param {string} userId
 * @param {string} rawName
 */
export async function dbCreateCustomBank(env, userId, rawName) {
  const name = String(rawName || "").trim().replace(/\s+/g, " ");
  if (!name) throw AppError.badRequest("نام بانک نمی‌تواند خالی باشد.");
  if (name.length > CUSTOM_BANK_NAME_MAX_LENGTH) {
    throw AppError.badRequest(`نام بانک حداکثر ${CUSTOM_BANK_NAME_MAX_LENGTH} کاراکتر است.`);
  }

  const existing = await dbListCustomBanks(env, userId);
  const key = normalizeBankName(name);
  const duplicate = existing.find((bank) => normalizeBankName(bank.name) === key);
  if (duplicate) return duplicate;
  if (existing.length >= MAX_CUSTOM_BANKS_PER_USER) {
    throw AppError.badRequest(`حداکثر ${MAX_CUSTOM_BANKS_PER_USER} بانک سفارشی می‌توانید ثبت کنید.`);
  }

  const bank = {
    id: `${CUSTOM_BANK_PREFIX}${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
    name,
    createdAt: new Date().toISOString(),
  };
  await env.DB.prepare(
    "INSERT INTO custom_banks (id, user_id, name, created_at) VALUES (?, ?, ?, ?)"
  ).bind(bank.id, userId, bank.name, bank.createdAt).run();
  return bank;
}

/**
 * Delete a custom bank. Loans that used it keep their lender name and just lose the link.
 * @returns {Promise<boolean>} whether a bank was deleted
 */
export async function dbDeleteCustomBank(env, userId, bankId) {
  if (!env?.DB || !userId || !bankId) return false;
  await ensureD1Tables(env);
  const results = await env.DB.batch([
    env.DB.prepare("DELETE FROM custom_banks WHERE id = ? AND user_id = ?").bind(bankId, userId),
    env.DB.prepare("UPDATE loans SET bank_id = '' WHERE bank_id = ? AND user_id = ?").bind(bankId, userId),
  ]);
  return Number(results?.[0]?.meta?.changes || 0) > 0;
}

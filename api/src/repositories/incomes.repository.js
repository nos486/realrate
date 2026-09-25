/**
 * incomes.repository.js — Cloudflare D1 Data Access Layer for user income entries
 *
 * Each row is one income event (salary, freelance payment, rent, ...) owned by a single user.
 * Input is expected to be validated & normalized by the route handler (see incomeRoutes.js);
 * this layer only persists and maps rows to camelCase objects.
 */

import { ensureD1Tables } from "./migration.repository.js";

const INCOME_COLUMNS = `
  id, user_id AS userId, title, category, amount,
  income_date AS incomeDate, notes, recurring_id AS recurringId,
  created_at AS createdAt, updated_at AS updatedAt
`;

/**
 * Helper to generate random IDs
 * @param {string} prefix
 * @returns {string}
 */
function generateId(prefix = "inc") {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Normalize a raw (aliased) SQL row into the public income shape
 */
function formatIncomeRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    category: row.category || "other",
    amount: Number(row.amount ?? 0),
    incomeDate: row.incomeDate,
    notes: row.notes || "",
    recurringId: row.recurringId || "",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * List every income of a user, newest income date first
 * @param {object} env
 * @param {string} userId
 * @returns {Promise<Array<object>>}
 */
export async function dbGetUserIncomes(env, userId) {
  if (!userId || !env || !env.DB) return [];

  await ensureD1Tables(env);

  const { results = [] } = await env.DB.prepare(`
    SELECT ${INCOME_COLUMNS}
    FROM incomes
    WHERE user_id = ?
    ORDER BY income_date DESC, created_at DESC
  `).bind(userId).all();

  return results.map(formatIncomeRow);
}

/**
 * Fetch a single income owned by the user
 * @param {object} env
 * @param {string} userId
 * @param {string} incomeId
 * @returns {Promise<object|null>}
 */
export async function dbGetIncomeById(env, userId, incomeId) {
  if (!userId || !incomeId || !env || !env.DB) return null;

  await ensureD1Tables(env);

  const row = await env.DB.prepare(`
    SELECT ${INCOME_COLUMNS}
    FROM incomes
    WHERE id = ? AND user_id = ?
  `).bind(incomeId, userId).first();

  return formatIncomeRow(row);
}

/**
 * Insert a new income
 * @param {object} env
 * @param {string} userId
 * @param {{ title: string, category: string, amount: number, incomeDate: string, notes: string }} data
 * @returns {Promise<object|null>} The created income
 */
export async function dbCreateIncome(env, userId, data) {
  if (!userId || !data || !env || !env.DB) return null;

  await ensureD1Tables(env);

  const nowIso = new Date().toISOString();
  const income = {
    id: generateId("inc"),
    userId,
    title: data.title,
    category: data.category,
    amount: data.amount,
    incomeDate: data.incomeDate,
    notes: data.notes || "",
    recurringId: data.recurringId || "",
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  await env.DB.prepare(`
    INSERT INTO incomes (id, user_id, title, category, amount, income_date, notes, recurring_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    income.id,
    income.userId,
    income.title,
    income.category,
    income.amount,
    income.incomeDate,
    income.notes,
    income.recurringId,
    income.createdAt,
    income.updatedAt
  ).run();

  return income;
}

/**
 * Replace the editable fields of an existing income
 * @param {object} env
 * @param {string} userId
 * @param {string} incomeId
 * @param {{ title: string, category: string, amount: number, incomeDate: string, notes: string }} data
 * @returns {Promise<object|null>} The updated income, or null when it doesn't exist for this user
 */
export async function dbUpdateIncome(env, userId, incomeId, data) {
  if (!userId || !incomeId || !data || !env || !env.DB) return null;

  await ensureD1Tables(env);

  const res = await env.DB.prepare(`
    UPDATE incomes
    SET title = ?, category = ?, amount = ?, income_date = ?, notes = ?, recurring_id = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).bind(
    data.title,
    data.category,
    data.amount,
    data.incomeDate,
    data.notes || "",
    data.recurringId || "",
    new Date().toISOString(),
    incomeId,
    userId
  ).run();

  if (!res?.meta?.changes) return null;
  return dbGetIncomeById(env, userId, incomeId);
}

/**
 * Delete an income owned by the user
 * @param {object} env
 * @param {string} userId
 * @param {string} incomeId
 * @returns {Promise<boolean>} true when a row was removed
 */
export async function dbDeleteIncome(env, userId, incomeId) {
  if (!userId || !incomeId || !env || !env.DB) return false;

  await ensureD1Tables(env);

  const res = await env.DB.prepare(`DELETE FROM incomes WHERE id = ? AND user_id = ?`)
    .bind(incomeId, userId)
    .run();

  return Boolean(res?.meta?.changes);
}

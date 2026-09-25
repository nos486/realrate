/**
 * recurringIncomes.repository.js — D1 access for fixed (recurring) income rules
 *
 * Input is validated by the route handler with domain/recurringIncome.js; this layer persists
 * rules and maps rows to camelCase objects.
 */

import { ensureD1Tables } from "./migration.repository.js";

const COLUMNS = `
  id, user_id AS userId, title, category, amount, day_of_month AS dayOfMonth,
  interval_months AS intervalMonths, start_date AS startDate, end_date AS endDate, notes, active,
  generated_through AS generatedThrough, created_at AS createdAt, updated_at AS updatedAt
`;

export function formatRecurringRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    category: row.category || "other",
    amount: Number(row.amount ?? 0),
    dayOfMonth: Number(row.dayOfMonth ?? 1),
    intervalMonths: Number(row.intervalMonths ?? 1),
    startDate: row.startDate,
    endDate: row.endDate || "",
    notes: row.notes || "",
    active: Number(row.active) === 1,
    generatedThrough: row.generatedThrough || "",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function dbGetUserRecurringIncomes(env, userId) {
  if (!userId || !env?.DB) return [];
  await ensureD1Tables(env);
  const { results = [] } = await env.DB.prepare(`
    SELECT ${COLUMNS} FROM recurring_incomes WHERE user_id = ? ORDER BY created_at ASC
  `).bind(userId).all();
  return results.map(formatRecurringRow);
}

export async function dbGetRecurringIncomeById(env, userId, ruleId) {
  if (!userId || !ruleId || !env?.DB) return null;
  await ensureD1Tables(env);
  const row = await env.DB.prepare(`SELECT ${COLUMNS} FROM recurring_incomes WHERE id = ? AND user_id = ?`)
    .bind(ruleId, userId)
    .first();
  return formatRecurringRow(row);
}

/** INSERT for a full rule (also used to restore one out of the account vault) */
export function insertRecurringStatement(env, userId, rule) {
  return env.DB.prepare(`
    INSERT INTO recurring_incomes (
      id, user_id, title, category, amount, day_of_month, interval_months, start_date, end_date,
      notes, active, generated_through, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    rule.id, userId, rule.title, rule.category, rule.amount, rule.dayOfMonth, rule.intervalMonths,
    rule.startDate, rule.endDate || "", rule.notes || "", rule.active ? 1 : 0, rule.generatedThrough || "",
    rule.createdAt, rule.updatedAt
  );
}

export async function dbCreateRecurringIncome(env, userId, data) {
  if (!userId || !data || !env?.DB) return null;
  await ensureD1Tables(env);
  const now = new Date().toISOString();
  const rule = { id: `rinc_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`, userId, ...data, createdAt: now, updatedAt: now };
  await insertRecurringStatement(env, userId, rule).run();
  return rule;
}

export async function dbUpdateRecurringIncome(env, userId, ruleId, data) {
  if (!userId || !ruleId || !data || !env?.DB) return null;
  await ensureD1Tables(env);
  const res = await env.DB.prepare(`
    UPDATE recurring_incomes
    SET title = ?, category = ?, amount = ?, day_of_month = ?, interval_months = ?, start_date = ?,
        end_date = ?, notes = ?, active = ?, generated_through = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).bind(
    data.title, data.category, data.amount, data.dayOfMonth, data.intervalMonths, data.startDate,
    data.endDate || "", data.notes || "", data.active ? 1 : 0, data.generatedThrough || "",
    new Date().toISOString(), ruleId, userId
  ).run();
  if (!res?.meta?.changes) return null;
  return dbGetRecurringIncomeById(env, userId, ruleId);
}

/** Deleting a rule stops future entries; the ones it already created stay */
export async function dbDeleteRecurringIncome(env, userId, ruleId) {
  if (!userId || !ruleId || !env?.DB) return false;
  await ensureD1Tables(env);
  const res = await env.DB.prepare(`DELETE FROM recurring_incomes WHERE id = ? AND user_id = ?`).bind(ruleId, userId).run();
  return Boolean(res?.meta?.changes);
}

/**
 * cheques.repository.js — Cloudflare D1 Data Access Layer for user cheques
 *
 * Each row is one received or issued cheque owned by a single user; `history` holds its tracking
 * log (status changes) as JSON. Input is validated & normalized by the route handler with the
 * shared domain/chequeDocument.js; this layer only persists and maps rows to camelCase objects.
 */

import { ensureD1Tables } from "./migration.repository.js";

const CHEQUE_COLUMNS = `
  id, user_id AS userId, direction, status, amount, due_date AS dueDate, issue_date AS issueDate,
  counterparty, bank_id AS bankId, bank_name AS bankName, cheque_number AS chequeNumber,
  sayad_id AS sayadId, notes, history, created_at AS createdAt, updated_at AS updatedAt
`;

function generateId() {
  return `chq_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function parseHistory(raw) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Normalize a raw (aliased) SQL row into the public cheque shape */
export function formatChequeRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    direction: row.direction === "issued" ? "issued" : "received",
    status: row.status || "pending",
    amount: Number(row.amount ?? 0),
    dueDate: row.dueDate,
    issueDate: row.issueDate || "",
    counterparty: row.counterparty || "",
    bankId: row.bankId || "",
    bankName: row.bankName || "",
    chequeNumber: row.chequeNumber || "",
    sayadId: row.sayadId || "",
    notes: row.notes || "",
    history: parseHistory(row.history),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * List every cheque of a user, earliest due date first
 * @returns {Promise<Array<object>>}
 */
export async function dbGetUserCheques(env, userId) {
  if (!userId || !env || !env.DB) return [];
  await ensureD1Tables(env);
  const { results = [] } = await env.DB.prepare(`
    SELECT ${CHEQUE_COLUMNS}
    FROM cheques
    WHERE user_id = ?
    ORDER BY due_date ASC, created_at ASC
  `).bind(userId).all();
  return results.map(formatChequeRow);
}

export async function dbGetChequeById(env, userId, chequeId) {
  if (!userId || !chequeId || !env || !env.DB) return null;
  await ensureD1Tables(env);
  const row = await env.DB.prepare(`SELECT ${CHEQUE_COLUMNS} FROM cheques WHERE id = ? AND user_id = ?`)
    .bind(chequeId, userId)
    .first();
  return formatChequeRow(row);
}

/** INSERT statement for a full cheque (also used to restore one out of the account vault) */
export function insertChequeStatement(env, userId, cheque) {
  return env.DB.prepare(`
    INSERT INTO cheques (
      id, user_id, direction, status, amount, due_date, issue_date, counterparty, bank_id,
      bank_name, cheque_number, sayad_id, notes, history, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    cheque.id,
    userId,
    cheque.direction,
    cheque.status,
    cheque.amount,
    cheque.dueDate,
    cheque.issueDate || "",
    cheque.counterparty,
    cheque.bankId || "",
    cheque.bankName || "",
    cheque.chequeNumber || "",
    cheque.sayadId || "",
    cheque.notes || "",
    JSON.stringify(cheque.history || []),
    cheque.createdAt,
    cheque.updatedAt
  );
}

/**
 * Insert a new cheque
 * @param {object} data validated by validateChequeInput
 * @returns {Promise<object|null>} The created cheque
 */
export async function dbCreateCheque(env, userId, data) {
  if (!userId || !data || !env || !env.DB) return null;
  await ensureD1Tables(env);
  const nowIso = new Date().toISOString();
  const cheque = { id: generateId(), userId, ...data, createdAt: nowIso, updatedAt: nowIso };
  await insertChequeStatement(env, userId, cheque).run();
  return cheque;
}

/**
 * Replace the editable fields (status and history included) of an existing cheque
 * @returns {Promise<object|null>} The updated cheque, or null when it doesn't exist for this user
 */
export async function dbUpdateCheque(env, userId, chequeId, data) {
  if (!userId || !chequeId || !data || !env || !env.DB) return null;
  await ensureD1Tables(env);
  const res = await env.DB.prepare(`
    UPDATE cheques
    SET direction = ?, status = ?, amount = ?, due_date = ?, issue_date = ?, counterparty = ?,
        bank_id = ?, bank_name = ?, cheque_number = ?, sayad_id = ?, notes = ?, history = ?,
        updated_at = ?
    WHERE id = ? AND user_id = ?
  `).bind(
    data.direction,
    data.status,
    data.amount,
    data.dueDate,
    data.issueDate || "",
    data.counterparty,
    data.bankId || "",
    data.bankName || "",
    data.chequeNumber || "",
    data.sayadId || "",
    data.notes || "",
    JSON.stringify(data.history || []),
    new Date().toISOString(),
    chequeId,
    userId
  ).run();
  if (!res?.meta?.changes) return null;
  return dbGetChequeById(env, userId, chequeId);
}

/** @returns {Promise<boolean>} true when a row was removed */
export async function dbDeleteCheque(env, userId, chequeId) {
  if (!userId || !chequeId || !env || !env.DB) return false;
  await ensureD1Tables(env);
  const res = await env.DB.prepare(`DELETE FROM cheques WHERE id = ? AND user_id = ?`)
    .bind(chequeId, userId)
    .run();
  return Boolean(res?.meta?.changes);
}

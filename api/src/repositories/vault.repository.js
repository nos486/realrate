/**
 * vault.repository.js — Account-wide end-to-end encryption storage
 *
 * The server never sees a key or plaintext here:
 *  - user_vaults holds the passphrase salt and the account data key *wrapped* (encrypted) with
 *    the passphrase-derived key — useless without the passphrase, which never leaves the browser.
 *  - vault_records holds browser-encrypted records (loans, incomes, cheques) as opaque ciphertext.
 *    The only plaintext beside the kind and id is the record's primary date (record_date, for
 *    range queries and sorting) and its parent (parent_id, e.g. the portfolio of an item).
 * Moving a record from the older plaintext tables into the vault happens in one database batch, so a
 * record is never lost or duplicated halfway. The vault is never turned off and nothing is
 * written back to the plaintext tables.
 */

import { ensureSchema } from "./schema.repository.js";
import { AppError } from "../lib/AppError.js";

export const VAULT_RECORD_KINDS = [
  "loan", "income", "cheque", "recurring_income", "holding", "transaction", "portfolio_layout",
  // Expenses: a section (a project, ...) and the expenses in it (parent_id = the section)
  "expense_group", "expense",
  // The user's money accounts (bank accounts, cash, ...), the source an expense points to
  "bank_account",
];

/** Kinds that exist only for users of a feature (config/features.js); others get 404 */
export const VAULT_KIND_FEATURES = { expense_group: "expenses", expense: "expenses", bank_account: "bank_accounts" };
/** Kinds that belong to a portfolio: parent_id is the portfolio, encrypted with its own key */
export const PORTFOLIO_ITEM_KINDS = ["holding", "transaction", "portfolio_layout"];
export const E2EE_CIPHER_PREFIX = "enc:e2ee:v1:";
const MAX_PAYLOAD_LENGTH = 512 * 1024;
const RECORD_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const RECORD_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isCipherText(value) {
  return typeof value === "string" && value.startsWith(E2EE_CIPHER_PREFIX) && value.length > E2EE_CIPHER_PREFIX.length;
}

function assertKind(kind) {
  if (!VAULT_RECORD_KINDS.includes(kind)) throw AppError.badRequest("نوع رکورد نامعتبر است.");
}

function assertRecordId(id) {
  if (!RECORD_ID_RE.test(String(id || ""))) throw AppError.badRequest("شناسه رکورد نامعتبر است.");
}

/** '' (no date) or a real YYYY-MM-DD day */
function parseRecordDate(value) {
  const date = String(value ?? "").trim();
  if (!date) return "";
  if (!RECORD_DATE_RE.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) {
    throw AppError.badRequest("تاریخ رکورد نامعتبر است.");
  }
  return date;
}

/** '' (no parent) or an id like the record ids */
function parseParentId(value) {
  const parentId = String(value ?? "").trim();
  if (parentId && !RECORD_ID_RE.test(parentId)) throw AppError.badRequest("شناسه والد رکورد نامعتبر است.");
  return parentId;
}

function assertPayload(payload) {
  if (!isCipherText(payload)) throw AppError.badRequest("داده باید پیش از ارسال رمزنگاری شده باشد.");
  if (payload.length > MAX_PAYLOAD_LENGTH) throw AppError.badRequest("حجم رکورد رمزنگاری‌شده بیش از حد مجاز است.");
}

// ── Account vault ───────────────────────────────────────────────────────────

/** @returns {Promise<{salt: string, wrappedKey: string, version: number, createdAt: string, updatedAt: string}|null>} */
export async function dbGetUserVault(env, userId) {
  if (!userId || !env?.DB) return null;
  await ensureSchema(env);
  const row = await env.DB.prepare(`
    SELECT salt, wrapped_key AS wrappedKey, version, created_at AS createdAt, updated_at AS updatedAt
    FROM user_vaults WHERE user_id = ?
  `).bind(userId).first();
  return row ? { ...row, version: Number(row.version) || 1 } : null;
}

export async function dbHasUserVault(env, userId) {
  return Boolean(await dbGetUserVault(env, userId));
}

/**
 * Turn the vault on, or re-wrap its data key (passphrase change). Re-wrapping must name the
 * wrapped key it replaces, so a stale device can never overwrite a newer key and orphan data.
 */
export async function dbSaveUserVault(env, userId, { salt, wrappedKey, previousWrappedKey }) {
  if (!String(salt || "").trim()) throw AppError.badRequest("salt رمزنگاری الزامی است.");
  if (!isCipherText(wrappedKey)) throw AppError.badRequest("کلید رمزنگاری‌شده نامعتبر است.");

  const existing = await dbGetUserVault(env, userId);
  const now = new Date().toISOString();

  if (!existing) {
    await env.DB.prepare(`
      INSERT INTO user_vaults (user_id, salt, wrapped_key, version, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?)
    `).bind(userId, String(salt).trim(), wrappedKey, now, now).run();
  } else {
    if (previousWrappedKey !== existing.wrappedKey) {
      throw new AppError("رمزنگاری حساب از دستگاه دیگری تغییر کرده است. صفحه را تازه کنید و دوباره تلاش کنید.", 409, "VAULT_CONFLICT");
    }
    await env.DB.prepare(`
      UPDATE user_vaults SET salt = ?, wrapped_key = ?, updated_at = ? WHERE user_id = ?
    `).bind(String(salt).trim(), wrappedKey, now, userId).run();
  }
  return dbGetUserVault(env, userId);
}

/** Plaintext tables of a user's own data (an empty auto-created portfolio does not count) */
const PLAINTEXT_DATA_TABLES = ["portfolio_holdings", "transactions", "loans", "incomes", "cheques", "recurring_incomes"];

/** Whether the user has any data stored in the plaintext tables */
export async function dbUserHasPlaintextData(env, userId) {
  await ensureSchema(env);
  const checks = PLAINTEXT_DATA_TABLES.map((table) => `EXISTS (SELECT 1 FROM ${table} WHERE user_id = ?1)`);
  const row = await env.DB.prepare(`SELECT (${checks.join(" OR ")}) AS has`).bind(userId).first();
  return Number(row?.has) === 1;
}

/**
 * With account-wide encryption on, new records are stored only as vault ciphertext — a
 * plaintext create can only come from an outdated client and must not leak data.
 */
export async function rejectWhenVaultEnabled(env, userId) {
  if (await dbHasUserVault(env, userId)) {
    throw new AppError("رمزنگاری سرتاسری حساب فعال است؛ لطفاً صفحه را تازه کنید تا داده رمزنگاری‌شده ذخیره شود.", 409, "VAULT_ENABLED");
  }
}

async function requireVault(env, userId) {
  const vault = await dbGetUserVault(env, userId);
  if (!vault) {
    throw new AppError("رمزنگاری سرتاسری برای این حساب فعال نیست.", 409, "VAULT_DISABLED");
  }
  return vault;
}

/**
 * Tables holding a user's own financial data (plaintext or encrypted) and the vault itself:
 * everything a vault reset deletes. Sign-in, sessions and preferences (the home layout) stay.
 */
const USER_DATA_TABLES = [
  "portfolios",
  "portfolio_holdings",
  "transactions",
  "loans",
  "loan_installment_states",
  "loan_extra_payments",
  "incomes",
  "recurring_incomes",
  "cheques",
  "custom_banks",
  "vault_records",
  "vault_tombstones",
  "user_vaults",
];

/**
 * Forgotten passphrase: without it the encrypted data can never be read again, so the only way
 * back is to start over — every record of the user and the vault are deleted in one batch. The
 * account then sets up a new vault like a new one; devices keeping a copy see a new epoch and
 * start their copy over.
 */
export async function dbResetUserVaultData(env, userId) {
  if (!userId || !env?.DB) throw new Error("Database connection required");
  await ensureSchema(env);
  await env.DB.batch(USER_DATA_TABLES.map((table) => env.DB.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(userId)));
}

// ── Encrypted records ───────────────────────────────────────────────────────

const MAX_PAGE_SIZE = 200;

/**
 * Records of one kind, newest date first. Every filter works on the plaintext metadata only:
 * `from` / `to` (inclusive YYYY-MM-DD on record_date), `parentId`, and `undated` (records whose
 * date is missing or not yet Gregorian — the browser fixes those). `order` is "desc" (default) or
 * "asc". With `limit`, one page is returned (`offset` rows skipped) plus the `total` matching.
 * @returns {Promise<Array<object>>|Promise<{ records: Array<object>, total: number }>}
 */
export async function dbListVaultRecords(env, userId, kind, {
  from = "", to = "", parentId = "", undated = false, order = "desc", limit = null, offset = 0,
} = {}) {
  assertKind(kind);
  await ensureSchema(env);
  const conditions = ["user_id = ?", "kind = ?"];
  const params = [userId, kind];
  const fromDate = parseRecordDate(from);
  const toDate = parseRecordDate(to);
  const parent = parseParentId(parentId);
  if (fromDate) { conditions.push("record_date >= ?"); params.push(fromDate); }
  if (toDate) { conditions.push("record_date != '' AND record_date <= ?"); params.push(toDate); }
  if (parent) { conditions.push("parent_id = ?"); params.push(parent); }
  if (undated) conditions.push("(record_date = '' OR record_date < '1700')");
  const where = conditions.join(" AND ");
  const dir = order === "asc" ? "ASC" : "DESC";
  const page = parsePage(limit, offset);

  const { results = [] } = await env.DB.prepare(`
    SELECT id, kind, payload, record_date AS recordDate, parent_id AS parentId,
           created_at AS createdAt, updated_at AS updatedAt
    FROM vault_records WHERE ${where}
    ORDER BY record_date ${dir}, created_at ${dir}${page ? " LIMIT ? OFFSET ?" : ""}
  `).bind(...params, ...(page ? [page.limit, page.offset] : [])).all();
  if (!page) return results;

  const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM vault_records WHERE ${where}`).bind(...params).first();
  return { records: results, total: Number(count?.n) || 0 };
}

/** A page request, or null for every record */
function parsePage(limit, offset) {
  if (limit === null || limit === undefined || limit === "") return null;
  const size = Number(limit);
  const skip = Number(offset || 0);
  if (!Number.isInteger(size) || size < 1 || size > MAX_PAGE_SIZE || !Number.isInteger(skip) || skip < 0) {
    throw AppError.badRequest("صفحه‌بندی نامعتبر است.");
  }
  return { limit: size, offset: skip };
}

function deletePlainStatements(env, userId, kind, id) {
  if (kind === "loan") {
    return [
      env.DB.prepare(`DELETE FROM loan_installment_states WHERE loan_id = ? AND user_id = ?`).bind(id, userId),
      env.DB.prepare(`DELETE FROM loan_extra_payments WHERE loan_id = ? AND user_id = ?`).bind(id, userId),
      env.DB.prepare(`DELETE FROM loans WHERE id = ? AND user_id = ?`).bind(id, userId),
    ];
  }
  if (kind === "cheque") {
    return [env.DB.prepare(`DELETE FROM cheques WHERE id = ? AND user_id = ?`).bind(id, userId)];
  }
  if (kind === "recurring_income") {
    return [env.DB.prepare(`DELETE FROM recurring_incomes WHERE id = ? AND user_id = ?`).bind(id, userId)];
  }
  if (kind === "holding") {
    return [env.DB.prepare(`DELETE FROM portfolio_holdings WHERE id = ? AND user_id = ?`).bind(id, userId)];
  }
  if (kind === "transaction") {
    return [env.DB.prepare(`DELETE FROM transactions WHERE id = ? AND user_id = ?`).bind(id, userId)];
  }
  if (kind === "income") {
    return [env.DB.prepare(`DELETE FROM incomes WHERE id = ? AND user_id = ?`).bind(id, userId)];
  }
  // Kinds that were never stored in plaintext (portfolio_layout, expenses) have nothing to delete
  return [];
}

/**
 * Create or replace an encrypted record. With `replacePlain`, the plaintext record with the same
 * id is deleted in the same batch (used when encrypting existing data).
 */
export async function dbPutVaultRecord(env, userId, kind, id, { payload, replacePlain = false, recordDate = "", parentId = "", vaultEpoch = "" }) {
  assertKind(kind);
  assertRecordId(id);
  assertPayload(payload);
  const date = parseRecordDate(recordDate);
  const parent = parseParentId(parentId);
  if (PORTFOLIO_ITEM_KINDS.includes(kind) && !parent) throw AppError.badRequest("پورتفوی این مورد مشخص نشده است.");
  if (kind === "expense" && !parent) throw AppError.badRequest("بخش این هزینه مشخص نشده است.");
  const vault = await requireVault(env, userId);
  // Encrypted with the key of a vault since reset (a device that was offline): unreadable now
  if (vaultEpoch && vaultEpoch !== vault.createdAt) {
    throw new AppError("رمزنگاری حساب از نو راه‌اندازی شده است؛ این تغییر با کلید قبلی بود و ذخیره نشد.", 409, "VAULT_CHANGED");
  }

  const now = new Date().toISOString();
  const statements = [
    // Stored again after a delete: no longer deleted
    env.DB.prepare(`DELETE FROM vault_tombstones WHERE user_id = ? AND kind = ? AND id = ?`).bind(userId, kind, id),
    env.DB.prepare(`
      INSERT INTO vault_records (user_id, kind, id, payload, record_date, parent_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, kind, id) DO UPDATE SET
        payload = excluded.payload, record_date = excluded.record_date,
        parent_id = excluded.parent_id, updated_at = excluded.updated_at
    `).bind(userId, kind, id, payload, date, parent, now, now),
  ];
  if (replacePlain) statements.push(...deletePlainStatements(env, userId, kind, id));
  await env.DB.batch(statements);
  return { id, kind, payload, recordDate: date, parentId: parent, updatedAt: now };
}

export async function dbDeleteVaultRecord(env, userId, kind, id) {
  assertKind(kind);
  await ensureSchema(env);
  const now = new Date().toISOString();
  const [res] = await env.DB.batch([
    env.DB.prepare(`DELETE FROM vault_records WHERE user_id = ? AND kind = ? AND id = ?`).bind(userId, kind, id),
    // Devices keeping a copy learn of the deletion at their next sync
    env.DB.prepare(`
      INSERT INTO vault_tombstones (user_id, kind, id, deleted_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, kind, id) DO UPDATE SET deleted_at = excluded.deleted_at
    `).bind(userId, kind, id, now),
  ]);
  return (res?.meta?.changes ?? 0) > 0;
}

/**
 * Statements that record the deletion of a portfolio's items (tombstones), to run in the same
 * batch before they are deleted (portfolio.repository.js: deleting a portfolio)
 */
export function vaultTombstoneParentStatements(env, userId, parentId, kinds) {
  const now = new Date().toISOString();
  const marks = kinds.map(() => "?").join(", ");
  return [env.DB.prepare(`
    INSERT INTO vault_tombstones (user_id, kind, id, deleted_at)
    SELECT user_id, kind, id, ? FROM vault_records WHERE user_id = ? AND parent_id = ? AND kind IN (${marks})
    ON CONFLICT(user_id, kind, id) DO UPDATE SET deleted_at = excluded.deleted_at
  `).bind(now, userId, parentId, ...kinds)];
}

// ── Incremental sync ────────────────────────────────────────────────────────

export const VAULT_SYNC_PAGE = 200;
export const VAULT_SYNC_MAX_PAGE = 500;
export const VAULT_TOMBSTONE_RETENTION_DAYS = 180;
const DAY_MS = 86_400_000;

/**
 * A sync position: the (time, kind, id) of the last change a device has, "time|kind|id"
 * @returns {{ time: string, kind: string, id: string }|null} null = from the start
 */
export function parseSyncCursor(cursor) {
  const raw = String(cursor || "");
  if (!raw) return null;
  const [time, kind = "", id = ""] = raw.split("|");
  if (Number.isNaN(Date.parse(time)) || (kind && !VAULT_RECORD_KINDS.includes(kind)) || (id && !RECORD_ID_RE.test(id))) {
    throw AppError.badRequest("موقعیت همگام‌سازی نامعتبر است.");
  }
  return { time: new Date(time).toISOString(), kind, id };
}

const cursorOf = (time, kind, id) => `${time}|${kind}|${id}`;
const compareChange = (a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * The changes to a user's encrypted records after `cursor`, oldest first: records stored or
 * replaced (with their ciphertext) and records deleted (tombstones), one page at a time.
 *
 * - `epoch`: the vault's identity (when it was created); a device holding another epoch's copy
 *   (the demo account was reset, …) starts over
 * - `reset`: the cursor is older than the tombstones kept: deletions may be missing, so the device
 *   starts over (from an empty cursor)
 * - `cursor` / `more`: where the next page starts, and whether there is one
 * @param {{ cursor?: string, limit?: number, kinds: string[] }} options `kinds`: those the user may see
 * @returns {Promise<{ epoch: string, records: object[], deleted: object[], cursor: string, more: boolean, reset?: boolean }>}
 */
export async function dbSyncVaultRecords(env, userId, { cursor = "", limit = VAULT_SYNC_PAGE, kinds }) {
  await ensureSchema(env);
  const vault = await dbGetUserVault(env, userId);
  const epoch = vault?.createdAt || "";
  const from = parseSyncCursor(cursor);
  const size = Math.min(Math.max(Number(limit) || VAULT_SYNC_PAGE, 1), VAULT_SYNC_MAX_PAGE);
  const allowed = (kinds || []).filter((k) => VAULT_RECORD_KINDS.includes(k));
  const empty = { epoch, records: [], deleted: [], cursor: String(cursor || ""), more: false };
  if (!vault || allowed.length === 0) return empty;

  const oldest = new Date(Date.now() - VAULT_TOMBSTONE_RETENTION_DAYS * DAY_MS).toISOString();
  if (from && from.time < oldest) return { ...empty, cursor: "", reset: true };

  const marks = allowed.map(() => "?").join(", ");
  const after = from ? "AND (TIME, kind, id) > (?, ?, ?)" : "";
  const afterParams = from ? [from.time, from.kind, from.id] : [];
  const [recordRows, tombRows] = await Promise.all([
    env.DB.prepare(`
      SELECT kind, id, payload, record_date AS recordDate, parent_id AS parentId,
             created_at AS createdAt, updated_at AS updatedAt
      FROM vault_records WHERE user_id = ? AND kind IN (${marks}) ${after.replace("TIME", "updated_at")}
      ORDER BY updated_at, kind, id LIMIT ?
    `).bind(userId, ...allowed, ...afterParams, size).all(),
    // From the start there is nothing to delete on the device
    from
      ? env.DB.prepare(`
          SELECT kind, id, deleted_at AS deletedAt FROM vault_tombstones
          WHERE user_id = ? AND kind IN (${marks}) ${after.replace("TIME", "deleted_at")}
          ORDER BY deleted_at, kind, id LIMIT ?
        `).bind(userId, ...allowed, ...afterParams, size).all()
      : Promise.resolve({ results: [] }),
  ]);
  const records = recordRows?.results || [];
  const tombs = tombRows?.results || [];

  // One ordered stream of changes; a page ends at its size
  const changes = [
    ...records.map((r) => ({ time: r.updatedAt, kind: r.kind, id: r.id, record: r })),
    ...tombs.map((t) => ({ time: t.deletedAt, kind: t.kind, id: t.id, deleted: t })),
  ].sort(compareChange);
  const page = changes.slice(0, size);
  const last = page[page.length - 1];
  const more = records.length === size || tombs.length === size || changes.length > size;

  // Old tombstones of this user, now and then
  if (Math.random() < 0.02) {
    env.DB.prepare(`DELETE FROM vault_tombstones WHERE user_id = ? AND deleted_at < ?`).bind(userId, oldest).run().catch(() => {});
  }

  return {
    epoch,
    records: page.filter((c) => c.record).map((c) => c.record),
    deleted: page.filter((c) => c.deleted).map(({ kind, id, time }) => ({ kind, id, deletedAt: time })),
    cursor: last ? cursorOf(last.time, last.kind, last.id) : String(cursor || ""),
    more,
  };
}

/**
 * admin.repository.js — Admin panel queries: the users list, headline counts, one user's
 * details, blocking, and the daily sign-up / active-user series
 *
 * Only counts are ever read from a user's financial tables: the admin sees how much someone
 * uses the app, never what they recorded.
 */

import { ensureD1Tables } from "./migration.repository.js";
import { logger } from "../lib/logger.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Sortable user columns (whitelisted: the value is interpolated into SQL) */
export const USER_SORTS = {
  lastLogin: "last_login",
  createdAt: "created_at",
};

/**
 * Quick filters of the users list. `where` is a fixed SQL condition; `since` filters take a
 * cutoff ISO date as their one parameter.
 */
export const USER_FILTERS = {
  all: { where: "" },
  new: { where: "created_at >= ?", since: 7 },
  inactive: { where: "last_login < ?", since: 30 },
  unverified: { where: "email_verified = 0" },
  google: { where: "google_linked = 1" },
  blocked: { where: "disabled = 1" },
  // Account-wide end-to-end encryption on / off (a user_vaults row means on)
  e2ee: { where: "id IN (SELECT user_id FROM user_vaults)" },
  noE2ee: { where: "id NOT IN (SELECT user_id FROM user_vaults)" },
};

const cutoffIso = (days, now = Date.now()) => new Date(now - days * DAY_MS).toISOString();

/** WHERE parts and parameters of a filter */
function filterClause(filter, now) {
  const def = USER_FILTERS[filter] || USER_FILTERS.all;
  if (!def.where) return { conditions: [], params: [] };
  return { conditions: [def.where], params: def.since ? [cutoffIso(def.since, now)] : [] };
}

/** ORDER BY clause for a sort key; users without a value always come last */
function userOrderBy(sort, dir) {
  const column = USER_SORTS[sort] || USER_SORTS.lastLogin;
  const direction = dir === "asc" ? "ASC" : "DESC";
  return `${column} IS NULL, ${column} ${direction}, id`;
}

const USER_LIST_COLUMNS = `
  id, email, name, custom_name AS customName, picture, role,
  share_slug AS shareSlug, share_enabled AS shareEnabled,
  created_at AS createdAt, last_login AS lastLogin, login_count AS loginCount,
  email_verified AS emailVerified, disabled, google_linked AS googleLinked,
  password_hash != '' AS hasPassword,
  EXISTS (SELECT 1 FROM user_vaults v WHERE v.user_id = users.id) AS e2eeEnabled
`;

/** Numeric SQLite flags as booleans */
function formatListRow(row) {
  return {
    ...row,
    shareEnabled: Number(row.shareEnabled) === 1,
    emailVerified: Number(row.emailVerified) === 1,
    disabled: Number(row.disabled) === 1,
    googleLinked: Number(row.googleLinked) === 1,
    hasPassword: Number(row.hasPassword) === 1,
    e2eeEnabled: Number(row.e2eeEnabled) === 1,
  };
}

/**
 * One page of registered users for the admin panel
 * @param {object} env
 * @param {{ q?: string, filter?: string, limit?: number, offset?: number, sort?: string, dir?: string }} [options]
 *   q matches name, custom name, email, id or share slug (case-insensitive substring); filter is
 *   a USER_FILTERS key; sort a USER_SORTS key; dir 'asc' | 'desc'
 * @returns {Promise<{ users: object[], total: number }>}
 */
export async function dbGetUsersPage(env, { q = "", filter = "all", limit = 20, offset = 0, sort = "lastLogin", dir = "desc", now = Date.now() } = {}) {
  if (!env || !env.DB) return { users: [], total: 0 };
  await ensureD1Tables(env);

  const { conditions, params } = filterClause(filter, now);
  const term = String(q || "").trim().toLowerCase();
  if (term) {
    // LIKE wildcards in the search text are matched literally
    const pattern = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conditions.push(`(${["LOWER(COALESCE(name, ''))", "LOWER(COALESCE(custom_name, ''))", "LOWER(email)", "LOWER(id)", "LOWER(COALESCE(share_slug, ''))"]
      .map((col) => `${col} LIKE ? ESCAPE '\\'`).join(" OR ")})`);
    params.push(pattern, pattern, pattern, pattern, pattern);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const countRow = await env.DB.prepare(`SELECT COUNT(*) AS total FROM users ${where}`).bind(...params).first();
    const { results } = await env.DB.prepare(`
      SELECT ${USER_LIST_COLUMNS}
      FROM users
      ${where}
      ORDER BY ${userOrderBy(sort, dir)}
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all();
    return { users: (results || []).map(formatListRow), total: Number(countRow?.total) || 0 };
  } catch (e) {
    logger.error("D1 dbGetUsersPage error:", { error: e.message });
    return { users: [], total: 0 };
  }
}

/**
 * Headline counts for the admin panel, including how many users each quick filter matches
 * @param {object} env
 * @returns {Promise<{ registeredUsers: number, publicPortfolios: number, activeToday: number,
 *   filters: Record<string, number> }>}
 */
export async function dbGetUserStats(env, { now = Date.now() } = {}) {
  const empty = { registeredUsers: 0, publicPortfolios: 0, activeToday: 0, filters: {} };
  if (!env || !env.DB) return empty;
  await ensureD1Tables(env);
  try {
    const filterKeys = Object.keys(USER_FILTERS).filter((k) => k !== "all");
    const parts = filterKeys.map((key) => {
      const { conditions } = filterClause(key, now);
      return `(SELECT COUNT(*) FROM users WHERE ${conditions[0]}) AS "${key}"`;
    });
    const params = filterKeys.flatMap((key) => filterClause(key, now).params);
    const row = await env.DB.prepare(`
      SELECT (SELECT COUNT(*) FROM users) AS registeredUsers,
             (SELECT COUNT(*) FROM portfolios WHERE share_enabled = 1) AS publicPortfolios,
             (SELECT COUNT(*) FROM user_activity WHERE day = ?) AS activeToday,
             ${parts.join(",\n             ")}
    `).bind(new Date(now).toISOString().slice(0, 10), ...params).first();
    return {
      registeredUsers: Number(row?.registeredUsers) || 0,
      publicPortfolios: Number(row?.publicPortfolios) || 0,
      activeToday: Number(row?.activeToday) || 0,
      filters: Object.fromEntries([
        ["all", Number(row?.registeredUsers) || 0],
        ...filterKeys.map((k) => [k, Number(row?.[k]) || 0]),
      ]),
    };
  } catch (e) {
    logger.error("D1 dbGetUserStats error:", { error: e.message });
    return empty;
  }
}

/** Block or unblock an account */
export async function dbSetUserDisabled(env, userId, disabled) {
  await ensureD1Tables(env);
  await env.DB.prepare("UPDATE users SET disabled = ? WHERE id = ?").bind(disabled ? 1 : 0, userId).run();
}

/** Tables counted on the user detail view: [key, table] (all keyed by user_id) */
const USAGE_TABLES = [
  ["portfolios", "portfolios"],
  ["holdings", "portfolio_holdings"],
  ["transactions", "transactions"],
  ["loans", "loans"],
  ["cheques", "cheques"],
  ["incomes", "incomes"],
  ["recurringIncomes", "recurring_incomes"],
];

/** Encrypted-account record kinds counted like the plain tables above */
const VAULT_KIND_KEYS = {
  loan: "loans",
  cheque: "cheques",
  income: "incomes",
  recurring_income: "recurringIncomes",
  holding: "holdings",
  transaction: "transactions",
};
/** Kinds whose plaintext rows are leftovers once the vault is on (portfolio items of a
 *  portfolio still behind its own older passphrase legitimately stay in their tables) */
const PENDING_KEYS = ["loans", "cheques", "incomes", "recurringIncomes"];

/**
 * One user's account facts and usage counts (never the records themselves)
 * @returns {Promise<object|null>}
 */
export async function dbGetUserDetail(env, userId, { now = Date.now() } = {}) {
  if (!env?.DB || !userId) return null;
  await ensureD1Tables(env);
  const user = await env.DB.prepare(`
    SELECT ${USER_LIST_COLUMNS}, password_updated_at AS passwordUpdatedAt
    FROM users WHERE id = ?
  `).bind(userId).first();
  if (!user) return null;

  const usageParts = USAGE_TABLES.map(([key, table]) => `(SELECT COUNT(*) FROM ${table} WHERE user_id = ?1) AS "${key}"`);
  const usageRow = await env.DB.prepare(`
    SELECT ${usageParts.join(", ")},
           (SELECT COUNT(*) FROM sessions WHERE user_id = ?1 AND expires_at > ?2) AS activeSessions,
           (SELECT COUNT(*) FROM user_vaults WHERE user_id = ?1) AS vaultEnabled,
           (SELECT COUNT(*) FROM user_activity WHERE user_id = ?1 AND day >= ?3) AS activeDays30
  `).bind(userId, now, new Date(now - 29 * DAY_MS).toISOString().slice(0, 10)).first();

  // `usage` counts the plaintext rows; `encrypted` the browser-encrypted vault records of the
  // same kinds, so the panel can tell stored-encrypted data from data still in plaintext
  const usage = Object.fromEntries(USAGE_TABLES.map(([key]) => [key, Number(usageRow?.[key]) || 0]));
  const encrypted = Object.fromEntries(Object.values(VAULT_KIND_KEYS).map((key) => [key, 0]));
  const vaultEnabled = Number(usageRow?.vaultEnabled) > 0;
  const { results: vaultCounts = [] } = await env.DB.prepare(`
    SELECT kind, COUNT(*) AS count FROM vault_records WHERE user_id = ? GROUP BY kind
  `).bind(userId).all();
  for (const { kind, count } of vaultCounts) {
    const key = VAULT_KIND_KEYS[kind];
    if (key) encrypted[key] += Number(count) || 0;
  }
  const encryptedPortfolios = await env.DB.prepare(`
    SELECT COUNT(*) AS count FROM portfolios WHERE user_id = ? AND is_e2ee = 1
  `).bind(userId).first();
  encrypted.portfolios = Number(encryptedPortfolios?.count) || 0;

  return {
    ...formatListRow(user),
    passwordUpdatedAt: user.passwordUpdatedAt || "",
    activeSessions: Number(usageRow?.activeSessions) || 0,
    activeDays30: Number(usageRow?.activeDays30) || 0,
    vaultEnabled,
    usage,
    encrypted,
    // With the vault on, plaintext loans / incomes / cheques / fixed incomes are leftovers of an
    // unfinished migration (new ones can only be stored encrypted)
    plaintextPending: vaultEnabled
      ? PENDING_KEYS.reduce((sum, key) => sum + (usage[key] || 0), 0)
      : 0,
  };
}

/**
 * Sign-ups and active users per UTC day over the last `days` days (oldest first, every day
 * present, zero when nothing happened)
 * @returns {Promise<Array<{ day: string, signups: number, active: number }>>}
 */
export async function dbGetDailyGrowth(env, days = 30, { now = Date.now() } = {}) {
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    series.push({ day: new Date(now - i * DAY_MS).toISOString().slice(0, 10), signups: 0, active: 0 });
  }
  if (!env?.DB || series.length === 0) return series;
  await ensureD1Tables(env);
  const from = series[0].day;
  const byDay = new Map(series.map((d) => [d.day, d]));
  try {
    const [signups, active] = await Promise.all([
      env.DB.prepare(`
        SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count FROM users
        WHERE created_at >= ? GROUP BY day
      `).bind(from).all(),
      env.DB.prepare(`
        SELECT day, COUNT(*) AS count FROM user_activity WHERE day >= ? GROUP BY day
      `).bind(from).all(),
    ]);
    for (const r of signups.results || []) if (byDay.has(r.day)) byDay.get(r.day).signups = Number(r.count) || 0;
    for (const r of active.results || []) if (byDay.has(r.day)) byDay.get(r.day).active = Number(r.count) || 0;
  } catch (e) {
    logger.error("D1 dbGetDailyGrowth error:", { error: e.message });
  }
  return series;
}

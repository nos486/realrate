/**
 * news.repository.js — The news section's items in D1 (table `news`): Telegram posts and the
 * international feeds' articles (`source`)
 */

import { ensureSchema } from "./schema.repository.js";

const hasDatabase = (env) => typeof env?.DB?.prepare === "function";

const toItem = (row) => ({
  id: row.id,
  channel: row.channel,
  channelTitle: row.channel_title || "",
  postId: row.post_id,
  url: row.url,
  title: row.title,
  summary: row.summary,
  text: row.text,
  category: row.category,
  importance: row.importance,
  image: row.image || "",
  publishedAt: row.published_at,
  source: row.source === "world" ? "world" : "telegram",
  ...(row.created_at ? { savedAt: row.created_at } : {}),
  ai: Boolean(row.ai),
});

/**
 * Save new items (one already saved is left as it is)
 * @param {object} env
 * @param {Array<object>} items - in the shape toItem gives
 */
export async function dbInsertNews(env, items) {
  if (!hasDatabase(env) || !items?.length) return;
  await ensureSchema(env);
  const now = Date.now();
  await env.DB.batch(items.map((n) => env.DB.prepare(
    `INSERT OR IGNORE INTO news (id, channel, channel_title, post_id, url, title, summary, text, category, importance,
       image, published_at, created_at, ai, hidden, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).bind(
    n.id, n.channel, n.channelTitle || "", n.postId, n.url, n.title, n.summary || "", n.text || "",
    n.category || "economy", n.importance || 1, n.image || "", n.publishedAt || now, now, n.ai ? 1 : 0,
    n.source === "world" ? "world" : "telegram",
  )));
}

/**
 * Published news, newest first
 * @param {object} env
 * @param {{ limit?: number, page?: number, before?: number, category?: string, importance?: number, source?: string }} [opts]
 *   page: 1-based page of `limit` items (with the total); before: only news published before this
 *   time (ms) — either one; source: "telegram" or "world" (the international feeds) only
 * @returns {Promise<{ items: object[], hasMore: boolean, total: number }>}
 */
export async function dbListNews(env, { limit = 20, page = 0, before = 0, category = "", importance = 0, source = "" } = {}) {
  if (!hasDatabase(env)) return { items: [], hasMore: false, total: 0 };
  await ensureSchema(env);
  const where = ["hidden = 0"];
  const params = [];
  if (before > 0) {
    where.push("published_at < ?");
    params.push(before);
  }
  if (category) {
    where.push("category = ?");
    params.push(category);
  }
  if (source) {
    where.push("source = ?");
    params.push(source);
  }
  if (importance > 1) {
    where.push("importance >= ?");
    params.push(importance);
  }
  const whereSql = where.join(" AND ");
  const offset = page > 1 ? (page - 1) * limit : 0;
  const [list, count] = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM news WHERE ${whereSql} ORDER BY published_at DESC, id DESC LIMIT ? OFFSET ?`)
      .bind(...params, limit + 1, offset),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM news WHERE ${whereSql}`).bind(...params),
  ]);
  const results = list?.results || [];
  return {
    items: results.slice(0, limit).map(toItem),
    hasMore: results.length > limit,
    total: Number(count?.results?.[0]?.n || 0),
  };
}

/**
 * The news published since `since` (ms), most important first then newest
 * @returns {Promise<object[]>}
 */
export async function dbTopNewsSince(env, since, limit = 8) {
  if (!hasDatabase(env)) return [];
  await ensureSchema(env);
  const { results = [] } = await env.DB.prepare(
    "SELECT * FROM news WHERE hidden = 0 AND published_at >= ? ORDER BY importance DESC, published_at DESC LIMIT ?"
  ).bind(since, limit).all();
  return results.map(toItem);
}

/** How many news items were published since `since` (ms), and when the newest was saved */
export async function dbNewsStatsSince(env, since) {
  if (!hasDatabase(env)) return { count: 0, lastSavedAt: 0 };
  await ensureSchema(env);
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n, MAX(created_at) AS last FROM news WHERE hidden = 0 AND published_at >= ?"
  ).bind(since).first();
  return { count: Number(row?.n || 0), lastSavedAt: Number(row?.last || 0) };
}

/** The text of news published since `since` (ms), hidden ones too: a post like them is a repeat */
export async function dbRecentNewsTexts(env, since) {
  if (!hasDatabase(env)) return [];
  await ensureSchema(env);
  const { results = [] } = await env.DB.prepare(
    "SELECT title, text FROM news WHERE published_at >= ? ORDER BY published_at DESC LIMIT 400"
  ).bind(since).all();
  return results;
}

/** Take an item down (admin) or put it back */
export async function dbSetNewsHidden(env, id, hidden) {
  if (!hasDatabase(env)) return false;
  await ensureSchema(env);
  const res = await env.DB.prepare("UPDATE news SET hidden = ? WHERE id = ?").bind(hidden ? 1 : 0, id).run();
  return Number(res?.meta?.changes ?? res?.changes ?? 0) > 0;
}

/** Delete news published before `before` (ms); run from the hourly cron */
export async function dbPurgeOldNews(env, before) {
  if (!hasDatabase(env)) return;
  await ensureSchema(env);
  await env.DB.prepare("DELETE FROM news WHERE published_at < ?").bind(before).run();
}

const toAiLogRow = (row) => ({
  id: row.id,
  at: row.at,
  requestId: row.request_id,
  reason: row.reason,
  post: row.post,
  channel: row.channel,
  url: row.url,
  source: row.source === "world" ? "world" : "telegram",
  text: row.text,
  tries: row.tries,
  error: row.error,
  answer: row.answer,
});

/**
 * Log the model's requests that published nothing, a row per post (written only when there is one)
 * @param {object} env
 * @param {Array<{ at: number, requestId?: string, reason: string, post: string, channel?: string, url?: string,
 *   source?: string, text?: string, tries?: number, error?: string, answer?: string }>} rows
 */
export async function dbInsertNewsAiLog(env, rows) {
  if (!hasDatabase(env) || !rows?.length) return;
  await ensureSchema(env);
  await env.DB.batch(rows.map((r) => env.DB.prepare(
    `INSERT INTO news_ai_log (at, request_id, reason, post, channel, url, source, text, tries, error, answer)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    r.at, r.requestId || "", r.reason, r.post, r.channel || "", r.url || "", r.source === "world" ? "world" : "telegram",
    r.text || "", r.tries || 0, r.error || "", r.answer || "",
  )));
}

/**
 * The log since `since` (ms), newest first, and how many rows each reason has in it
 * @param {object} env
 * @param {{ since: number, reason?: string, limit?: number }} opts - reason: that reason's rows only
 * @returns {Promise<{ items: object[], counts: Record<string, number> }>}
 */
export async function dbListNewsAiLog(env, { since, reason = "", limit = 300 }) {
  if (!hasDatabase(env)) return { items: [], counts: {} };
  await ensureSchema(env);
  const where = reason ? "at >= ? AND reason = ?" : "at >= ?";
  const params = reason ? [since, reason] : [since];
  const [list, counts] = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM news_ai_log WHERE ${where} ORDER BY at DESC, id DESC LIMIT ?`).bind(...params, limit),
    env.DB.prepare("SELECT reason, COUNT(*) AS n FROM news_ai_log WHERE at >= ? GROUP BY reason").bind(since),
  ]);
  return {
    items: (list?.results || []).map(toAiLogRow),
    counts: Object.fromEntries((counts?.results || []).map((r) => [r.reason, Number(r.n) || 0])),
  };
}

/** Delete the log's rows before `before` (ms); run from the hourly cron */
export async function dbPurgeNewsAiLog(env, before) {
  if (!hasDatabase(env)) return;
  await ensureSchema(env);
  await env.DB.prepare("DELETE FROM news_ai_log WHERE at < ?").bind(before).run();
}

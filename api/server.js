/**
 * server.js — The API on Node (Docker / a Linux host) instead of Cloudflare Workers
 *
 * Runs the very same Worker (src/index.js): each HTTP request becomes a standard Request for its
 * fetch(), and the per-minute cron calls its scheduled(). What Cloudflare gave is replaced here:
 *   - Hyperdrive → one shared pg.Pool (pgClientFactory.js); DATABASE_URL is the connection
 *   - wrangler vars / secrets → environment variables (all of process.env is the Worker's env)
 *   - Cron Trigger "* * * * *" → a timer on the start of every minute (CRON_ENABLED=false turns
 *     it off, e.g. while the Cloudflare Worker still runs its own cron)
 *   - ctx.waitUntil → work still running after the response is awaited before shutting down
 *
 * Only Node's own modules and `pg` are used. Start: `node server.js` (PORT, HOST).
 */

import http from "node:http";
import { Readable } from "node:stream";
import pg from "pg";
import worker from "./src/index.js";
import { setPgClientFactory } from "./src/lib/pgClientFactory.js";

const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || "0.0.0.0";
const DATABASE_URL = process.env.DATABASE_URL || "";
const CRON_ENABLED = !/^(0|false|no|off)$/i.test(process.env.CRON_ENABLED || "true");

const log = (msg, extra) => console.log(JSON.stringify({ t: new Date().toISOString(), msg, ...extra }));

if (!DATABASE_URL) {
  log("DATABASE_URL is not set: the API cannot reach Postgres");
}

// ── Postgres: one pool, lent out per request ────────────────────────────────
const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX) || 20,
  idleTimeoutMillis: 30_000,
});
pool.on("error", (err) => log("Postgres pool error", { error: err.message }));

setPgClientFactory((_connectionString, options) => {
  let client = null;
  return {
    async connect() {
      client = await pool.connect();
    },
    query(text, params) {
      return client.query({ text, values: params, query_timeout: options.query_timeout });
    },
    async end() {
      const c = client;
      client = null;
      c?.release();
    },
  };
});

// The Worker's env: every environment variable, plus the "Hyperdrive" binding it reads
const env = {
  ...process.env,
  HYPERDRIVE: { connectionString: DATABASE_URL },
};

// ── waitUntil: background work, awaited on shutdown ─────────────────────────
const background = new Set();
function makeCtx() {
  return {
    waitUntil(promise) {
      const p = Promise.resolve(promise)
        .catch((err) => log("Background task failed", { error: err?.message }))
        .finally(() => background.delete(p));
      background.add(p);
    },
    passThroughOnException() {},
  };
}

// ── HTTP ────────────────────────────────────────────────────────────────────
function toRequest(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
  const host = req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`;
  const url = new URL(req.url || "/", `${proto}://${host}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else if (value !== undefined) headers.set(key, value);
  }
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? Readable.toWeb(req) : undefined,
    duplex: hasBody ? "half" : undefined,
  });
}

async function sendResponse(res, response, method) {
  const headers = {};
  response.headers.forEach((value, key) => {
    if (key !== "set-cookie") headers[key] = value;
  });
  const cookies = response.headers.getSetCookie?.() || [];
  if (cookies.length) headers["set-cookie"] = cookies;
  res.writeHead(response.status, response.statusText, headers);
  if (method === "HEAD" || !response.body) {
    res.end();
    return;
  }
  for await (const chunk of response.body) res.write(chunk);
  res.end();
}

const server = http.createServer(async (req, res) => {
  try {
    const response = await worker.fetch(toRequest(req), env, makeCtx());
    await sendResponse(res, response, req.method);
  } catch (err) {
    log("Request failed", { error: err?.message, url: req.url });
    if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ success: false, error: { code: "INTERNAL", message: "Internal server error" } }));
  }
});
server.keepAliveTimeout = 65_000;

// ── Cron: every minute, on the minute (like "* * * * *") ─────────────────────
let cronTimer = null;
function scheduleNextTick() {
  const now = Date.now();
  const next = Math.floor(now / 60_000) * 60_000 + 60_000;
  cronTimer = setTimeout(() => {
    const ctx = makeCtx();
    ctx.waitUntil(worker.scheduled({ scheduledTime: next, cron: "* * * * *" }, env, ctx));
    scheduleNextTick();
  }, next - now);
}

server.listen(PORT, HOST, () => {
  log("RealRate API listening", { port: PORT, host: HOST, cron: CRON_ENABLED });
  if (CRON_ENABLED) scheduleNextTick();
});

// ── Shutdown: stop taking requests, finish background work, close the pool ──
let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  log("Shutting down", { signal, background: background.size });
  clearTimeout(cronTimer);
  server.close();
  const deadline = new Promise((resolve) => setTimeout(resolve, 20_000));
  await Promise.race([Promise.allSettled([...background]), deadline]);
  await pool.end().catch(() => {});
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

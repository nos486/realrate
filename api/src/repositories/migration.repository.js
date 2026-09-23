/**
 * migration.repository.js — Cloudflare D1 SQL Schema Auto-Migration and Initialization
 */

import { logger } from "../lib/logger.js";
import { PRICE_SOURCES_CONFIG } from "../config/sources.config.js";

// In-memory flag to avoid re-running CREATE TABLE IF NOT EXISTS on every request
let d1Initialized = false;

/**
 * Automatically create D1 SQL tables if they don't exist yet (auto-bootstrapping)
 * @param {object} env
 */
export async function ensureD1Tables(env) {
  if (!env || !env.DB) return;
  if (d1Initialized) return;

  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      custom_name TEXT,
      picture TEXT,
      role TEXT DEFAULT 'user',
      share_slug TEXT UNIQUE,
      share_password TEXT,
      share_enabled INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      last_login TEXT NOT NULL,
      login_count INTEGER DEFAULT 1
    )`,
    `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
    `CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login DESC)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_share_slug ON users(share_slug)`,
    `CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      name TEXT,
      picture TEXT,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`,
    `CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      default_usd_toman REAL DEFAULT 62000,
      default_gold_usd REAL DEFAULT 2450,
      bubble_pct_full REAL DEFAULT 15,
      bubble_pct_half REAL DEFAULT 20,
      bubble_pct_quarter REAL DEFAULT 25,
      announcement TEXT DEFAULT '',
      usd_source_type TEXT DEFAULT 'telegram',
      usd_telegram_channel TEXT DEFAULT 'tahran_sabza',
      usd_api_url TEXT DEFAULT '',
      usd_api_json_path TEXT DEFAULT '',
      updated_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS portfolios (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      share_slug TEXT UNIQUE,
      share_password TEXT,
      share_enabled INTEGER DEFAULT 0,
      is_e2ee INTEGER DEFAULT 0,
      e2ee_salt TEXT DEFAULT '',
      e2ee_verifier TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_portfolios_user ON portfolios(user_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_portfolios_slug ON portfolios(share_slug)`,
    `CREATE TABLE IF NOT EXISTS portfolio_holdings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      portfolio_id TEXT,
      asset_id TEXT NOT NULL,
      amount REAL NOT NULL,
      buy_price REAL NOT NULL,
      current_price REAL DEFAULT 0,
      buy_date TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_portfolio_holdings_user ON portfolio_holdings(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_portfolio_holdings_portfolio ON portfolio_holdings(portfolio_id)`,
    `CREATE INDEX IF NOT EXISTS idx_portfolio_holdings_created ON portfolio_holdings(created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS price_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price_type TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'telegram',
      endpoint TEXT NOT NULL,
      regex TEXT DEFAULT '',
      json_path TEXT DEFAULT '',
      field_mapping TEXT DEFAULT '',
      excluded_outputs TEXT DEFAULT '',
      display_config TEXT DEFAULT '',
      fetch_interval_sec INTEGER DEFAULT 60,
      is_active INTEGER DEFAULT 1,
      is_primary INTEGER DEFAULT 0,
      last_price REAL DEFAULT 0,
      last_multi_data TEXT DEFAULT '',
      last_fetched TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_price_sources_type ON price_sources(price_type)`,
    `CREATE INDEX IF NOT EXISTS idx_price_sources_primary ON price_sources(is_primary)`,
    `CREATE INDEX IF NOT EXISTS idx_price_sources_active ON price_sources(is_active)`,
    `CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      portfolio_id TEXT NOT NULL,
      encrypted_payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_portfolio ON transactions(portfolio_id)`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS loans (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      lender_name TEXT DEFAULT '',
      principal_amount REAL NOT NULL,
      annual_interest_rate REAL NOT NULL DEFAULT 0,
      installment_count INTEGER NOT NULL,
      interval_months INTEGER NOT NULL DEFAULT 1,
      start_date TEXT NOT NULL,
      annual_fee_amount REAL NOT NULL DEFAULT 0,
      schedule_mode TEXT NOT NULL DEFAULT 'formula',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_loans_user ON loans(user_id)`,
    `CREATE TABLE IF NOT EXISTS loan_installment_states (
      id TEXT PRIMARY KEY,
      loan_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      installment_number INTEGER NOT NULL,
      due_date TEXT NOT NULL,
      principal_portion REAL NOT NULL,
      interest_portion REAL NOT NULL,
      total_amount REAL NOT NULL,
      remaining_balance_after REAL NOT NULL,
      is_paid INTEGER DEFAULT 0,
      paid_date TEXT DEFAULT '',
      paid_amount REAL DEFAULT 0,
      is_manual_override INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_loan_installment_states_loan ON loan_installment_states(loan_id)`,
    `CREATE INDEX IF NOT EXISTS idx_loan_installment_states_user ON loan_installment_states(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_loan_installment_states_due ON loan_installment_states(due_date)`,
    `CREATE TABLE IF NOT EXISTS loan_extra_payments (
      id TEXT PRIMARY KEY,
      loan_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      amount REAL NOT NULL,
      payment_date TEXT NOT NULL,
      reduction_mode TEXT NOT NULL DEFAULT 'reduce_amount',
      notes TEXT DEFAULT '',
      anchor_installment_number INTEGER NOT NULL DEFAULT 0,
      resulting_balance REAL NOT NULL DEFAULT 0,
      resulting_installment_count INTEGER,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_loan_extra_payments_loan ON loan_extra_payments(loan_id)`,
    `CREATE INDEX IF NOT EXISTS idx_loan_extra_payments_user ON loan_extra_payments(user_id)`,
    `DROP TABLE IF EXISTS price_history`,
    `DROP TABLE IF EXISTS source_types`,
    `DROP TABLE IF EXISTS derived_assets`,
  ];

  try {
    // Each statement runs independently: a failure in one (e.g. a single CREATE TABLE)
    // must not silently block every statement after it in the list from ever running,
    // on every future request, for the lifetime of the isolate.
    for (const sql of statements) {
      try {
        await env.DB.prepare(sql).run();
      } catch (stmtErr) {
        logger.error("D1 schema statement failed:", { sql, error: stmtErr.message });
      }
    }

    // Backward-compat: ensure reference-asset cost-basis columns exist on portfolio_holdings.
    // A holding can be recorded as acquired by paying/swapping with ANY other asset (a
    // currency, gold, a bourse stock, ...) instead of a plain Toman amount — referenceAssetId
    // identifies that asset (empty = plain Toman, every pre-existing row keeps its behavior)
    // and referenceQuantity is the TOTAL amount of it that was given up.
    try {
      await env.DB.prepare("ALTER TABLE portfolio_holdings ADD COLUMN reference_asset_id TEXT NOT NULL DEFAULT ''").run();
    } catch (ignore) {}
    try {
      await env.DB.prepare("ALTER TABLE portfolio_holdings ADD COLUMN reference_quantity REAL NOT NULL DEFAULT 0").run();
    } catch (ignore) {}

    // Backward-compat: ensure the optional annual fee column exists on loans
    try {
      await env.DB.prepare("ALTER TABLE loans ADD COLUMN annual_fee_amount REAL NOT NULL DEFAULT 0").run();
    } catch (ignore) {}
    // Backward-compat: ensure the schedule_mode column exists on loans ('formula' | 'distributed')
    try {
      await env.DB.prepare("ALTER TABLE loans ADD COLUMN schedule_mode TEXT NOT NULL DEFAULT 'formula'").run();
    } catch (ignore) {}

    // Backward-compat: ensure Virtual Schedule columns exist on loan_extra_payments
    try {
      await env.DB.prepare("ALTER TABLE loan_extra_payments ADD COLUMN anchor_installment_number INTEGER NOT NULL DEFAULT 0").run();
    } catch (ignore) {}
    try {
      await env.DB.prepare("ALTER TABLE loan_extra_payments ADD COLUMN resulting_balance REAL NOT NULL DEFAULT 0").run();
    } catch (ignore) {}
    try {
      await env.DB.prepare("ALTER TABLE loan_extra_payments ADD COLUMN resulting_installment_count INTEGER").run();
    } catch (ignore) {}

    // Backward-compat: migrate any existing paid or overridden rows from legacy loan_installments to loan_installment_states
    try {
      await env.DB.prepare(`
        INSERT OR IGNORE INTO loan_installment_states (
          id, loan_id, user_id, installment_number, due_date,
          principal_portion, interest_portion, total_amount,
          remaining_balance_after, is_paid, paid_date, paid_amount,
          is_manual_override, created_at, updated_at
        )
        SELECT id, loan_id, user_id, installment_number, due_date,
               principal_portion, interest_portion, total_amount,
               remaining_balance_after, is_paid, paid_date, paid_amount,
               is_manual_override, created_at, updated_at
        FROM loan_installments
        WHERE is_paid = 1 OR is_manual_override = 1
      `).run();
    } catch (ignore) {}

    // Programmatic seed of master price sources from PRICE_SOURCES_CONFIG to prevent drift
    try {
      const nowIso = new Date().toISOString();

      // Automatically migrate and clean up old separate forex seed rows into unified multi-output source
      await env.DB.prepare(`
        DELETE FROM price_sources WHERE id IN ('src_def_eur', 'src_def_try', 'src_def_aed', 'src_def_gbp', 'src_def_chf', 'src_def_cad', 'src_def_aud', 'src_def_cny')
      `).run().catch(() => {});

      // Clean up legacy separate funds feed if present
      await env.DB.prepare(`
        DELETE FROM price_sources WHERE id = 'src_def_bourse_funds' OR endpoint LIKE '%Fund.php%'
      `).run().catch(() => {});

      // Programmatically seed or update each source defined in PRICE_SOURCES_CONFIG
      for (const src of PRICE_SOURCES_CONFIG) {
        if (!src || !src.id) continue;

        await env.DB.prepare(`
          INSERT INTO price_sources (
            id, name, price_type, source_type, endpoint, regex, json_path,
            fetch_interval_sec, is_active, is_primary, last_price, last_multi_data,
            last_fetched, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?, 0, '', '', ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            price_type = excluded.price_type,
            source_type = excluded.source_type,
            fetch_interval_sec = excluded.fetch_interval_sec,
            updated_at = excluded.updated_at
        `).bind(
          src.id,
          src.name,
          src.priceType || src.id,
          src.sourceType || "api_url",
          src.endpoint || "",
          src.jsonPath || "",
          src.fetchIntervalSec || 60,
          src.isActive ? 1 : 0,
          src.isPrimary ? 1 : 0,
          nowIso,
          nowIso
        ).run().catch(() => {});
      }
    } catch (e) {
      logger.error("Price sources seed error:", { error: e.message });
    }

    d1Initialized = true;
  } catch (e) {
    logger.error("D1 schema bootstrap error:", { error: e.message, stack: e.stack });
  }
}

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
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_loans_user ON loans(user_id)`,
    `CREATE TABLE IF NOT EXISTS loan_installments (
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
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_loan_installments_loan ON loan_installments(loan_id)`,
    `CREATE INDEX IF NOT EXISTS idx_loan_installments_user ON loan_installments(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_loan_installments_due ON loan_installments(due_date)`,
    `DROP TABLE IF EXISTS price_history`,
    `DROP TABLE IF EXISTS source_types`,
    `DROP TABLE IF EXISTS derived_assets`,
  ];

  try {
    for (const sql of statements) {
      await env.DB.prepare(sql).run();
    }
    // Backward-compat: ensure E2EE columns exist on portfolios
    try {
      await env.DB.prepare("ALTER TABLE portfolios ADD COLUMN is_e2ee INTEGER DEFAULT 0").run();
    } catch (ignore) {}
    try {
      await env.DB.prepare("ALTER TABLE portfolios ADD COLUMN e2ee_salt TEXT DEFAULT ''").run();
    } catch (ignore) {}
    try {
      await env.DB.prepare("ALTER TABLE portfolios ADD COLUMN e2ee_verifier TEXT DEFAULT ''").run();
    } catch (ignore) {}

    // Backward-compat: ensure current_price and portfolio_id columns exist
    try {
      await env.DB.prepare("ALTER TABLE portfolio_holdings ADD COLUMN current_price REAL DEFAULT 0").run();
    } catch (ignore) {}
    try {
      await env.DB.prepare("ALTER TABLE portfolio_holdings ADD COLUMN portfolio_id TEXT").run();
    } catch (ignore) {}
    try {
      await env.DB.prepare("ALTER TABLE portfolio_holdings DROP COLUMN encrypted_data").run();
    } catch (ignore) {}
    try {
      await env.DB.prepare("ALTER TABLE portfolio_holdings DROP COLUMN asset_name").run();
    } catch (ignore) {}
    try {
      await env.DB.prepare("ALTER TABLE portfolio_holdings DROP COLUMN asset_type").run();
    } catch (ignore) {}
    try {
      await env.DB.prepare("ALTER TABLE portfolio_holdings DROP COLUMN unit").run();
    } catch (ignore) {}
    try {
      await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_portfolio_holdings_portfolio ON portfolio_holdings(portfolio_id)").run();
    } catch (ignore) {}

    // Backward-compat: ensure share columns exist on users
    try {
      await env.DB.prepare("ALTER TABLE users ADD COLUMN custom_name TEXT").run();
    } catch (ignore) {}
    try {
      await env.DB.prepare("ALTER TABLE users ADD COLUMN share_slug TEXT").run();
    } catch (ignore) {}
    try {
      await env.DB.prepare("ALTER TABLE users ADD COLUMN share_password TEXT").run();
    } catch (ignore) {}
    try {
      await env.DB.prepare("ALTER TABLE users ADD COLUMN share_enabled INTEGER DEFAULT 0").run();
    } catch (ignore) {}
    try {
      await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_share_slug ON users(share_slug)").run();
    } catch (ignore) {}

    // Backward-compat: ensure USD source columns exist on settings
    try {
      await env.DB.prepare("ALTER TABLE settings ADD COLUMN usd_source_type TEXT DEFAULT 'telegram'").run();
    } catch (ignore) {}
    try {
      await env.DB.prepare("ALTER TABLE settings ADD COLUMN usd_telegram_channel TEXT DEFAULT 'tahran_sabza'").run();
    } catch (ignore) {}
    try {
      await env.DB.prepare("ALTER TABLE settings ADD COLUMN usd_api_url TEXT DEFAULT ''").run();
    } catch (ignore) {}
    try {
      await env.DB.prepare("ALTER TABLE settings ADD COLUMN usd_api_json_path TEXT DEFAULT ''").run();
    } catch (ignore) {}

    // Backward-compat: ensure last_multi_data column exists on price_sources for multi-output / large sources
    try {
      await env.DB.prepare("ALTER TABLE price_sources ADD COLUMN last_multi_data TEXT DEFAULT ''").run();
    } catch (ignore) {}

    // Backward-compat: ensure field_mapping column exists on price_sources for dynamic schemas
    try {
      await env.DB.prepare("ALTER TABLE price_sources ADD COLUMN field_mapping TEXT DEFAULT ''").run();
    } catch (ignore) {}

    // Backward-compat: excluded_outputs — list of outputs to filter out (JSON array of strings)
    try {
      await env.DB.prepare("ALTER TABLE price_sources ADD COLUMN excluded_outputs TEXT DEFAULT ''").run();
    } catch (ignore) {}

    // Backward-compat: display_config — extra UI metadata (JSON: description, tags, color, icon)
    try {
      await env.DB.prepare("ALTER TABLE price_sources ADD COLUMN display_config TEXT DEFAULT ''").run();
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

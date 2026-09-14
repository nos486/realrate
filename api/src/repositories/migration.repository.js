/**
 * migration.repository.js — Cloudflare D1 SQL Schema Auto-Migration and Initialization
 */

import { logger } from "../lib/logger.js";

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
      asset_name TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      unit TEXT NOT NULL,
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

    // Seed default price sources if table is empty or ensure core sources exist
    try {
      const nowIso = new Date().toISOString();

      // Automatically migrate and clean up old separate forex seed rows into unified multi-output source
      await env.DB.prepare(`
        DELETE FROM price_sources WHERE id IN ('src_def_eur', 'src_def_try', 'src_def_aed', 'src_def_gbp', 'src_def_chf', 'src_def_cad', 'src_def_aud', 'src_def_cny')
      `).run().catch(() => {});

      const defaultForexJson = JSON.stringify({
        eur: 1.16,
        gbp: 1.35,
        aed: 0.272,
        try: 0.030,
        chf: 1.225,
        cad: 0.722,
        aud: 0.717,
        cny: 0.149,
        jpy: 0.0068,
        sar: 0.266,
        qar: 0.274,
        kwd: 3.26,
        omr: 2.60,
        bhd: 2.65,
        iqd: 0.00076,
        rub: 0.011,
        afn: 0.0155,
        azn: 0.588,
        inr: 0.0118,
        sek: 0.103,
        nok: 0.101,
        sgd: 0.789,
        krw: 0.00075,
        brl: 0.196,
      });

      // Ensure unified Forex source exists (all 24 prominent currencies)
      await env.DB.prepare(`
        INSERT OR IGNORE INTO price_sources (id, name, price_type, source_type, endpoint, regex, json_path, field_mapping, fetch_interval_sec, is_active, is_primary, last_price, last_multi_data, last_fetched, created_at, updated_at)
        VALUES ('src_def_forex', 'نرخ‌های جهانی فارکس (Open ER-API)', 'forex', 'api_url', 'https://open.er-api.com/v6/latest/USD', '', 'rates', '', 300, 1, 1, 24, ?, '', ?, ?)
      `).bind(defaultForexJson, nowIso, nowIso).run().catch(() => {});

      await env.DB.prepare(`
        UPDATE price_sources
        SET endpoint = 'https://open.er-api.com/v6/latest/USD', name = 'نرخ‌های جهانی فارکس (Open ER-API)', field_mapping = '', last_price = 24
        WHERE id = 'src_def_forex'
      `).run().catch(() => {});

      // Ensure Tehran Stock Exchange (Bourse) source exists (Daily interval = 86400s)
      await env.DB.prepare(`
        INSERT OR IGNORE INTO price_sources (id, name, price_type, source_type, endpoint, regex, json_path, field_mapping, fetch_interval_sec, is_active, is_primary, last_price, last_multi_data, last_fetched, created_at, updated_at)
        VALUES ('src_def_bourse', 'بورس اوراق بهادار تهران (TSETMC / BRS API)', 'bourse', 'api_url', 'https://api.brsapi.ir/Tsetmc/AllSymbols.php?type=1', '', '', '', 86400, 1, 1, 1567, '', '', ?, ?)
      `).bind(nowIso, nowIso).run().catch(() => {});

      await env.DB.prepare(`
        UPDATE price_sources
        SET endpoint = 'https://api.brsapi.ir/Tsetmc/AllSymbols.php?type=1', name = 'بورس اوراق بهادار تهران (TSETMC / BRS API)'
        WHERE id = 'src_def_bourse'
      `).run().catch(() => {});

      // Sanitize any existing BRS endpoints in DB to strip sensitive query parameters
      await env.DB.prepare(`
        UPDATE price_sources
        SET endpoint = CASE
          WHEN endpoint LIKE 'https://api.brsapi.ir/Tsetmc/AllSymbols.php%' THEN 'https://api.brsapi.ir/Tsetmc/AllSymbols.php?type=1'
          WHEN endpoint LIKE 'https://api.brsapi.ir/Market/Gold_Currency.php%' THEN 'https://api.brsapi.ir/Market/Gold_Currency.php'
          ELSE endpoint
        END
        WHERE endpoint LIKE '%api.brsapi.ir%'
      `).run().catch(() => {});

      // Clean up legacy separate funds feed if present
      await env.DB.prepare(`
        DELETE FROM price_sources WHERE id = 'src_def_bourse_funds' OR endpoint LIKE '%Fund.php%'
      `).run().catch(() => {});

      const existingSources = await env.DB.prepare("SELECT COUNT(*) AS total FROM price_sources").first();
      if (!existingSources || existingSources.total <= 2) {
        let usdType = 'telegram';
        let usdEndpoint = 'tahran_sabza';
        let usdJsonPath = '';
        try {
          const settingsRow = await env.DB.prepare("SELECT usd_source_type, usd_telegram_channel, usd_api_url, usd_api_json_path FROM settings WHERE id = 1").first();
          if (settingsRow) {
            if (settingsRow.usd_source_type === 'api_url' && settingsRow.usd_api_url) {
              usdType = 'api_url';
              usdEndpoint = settingsRow.usd_api_url;
              usdJsonPath = settingsRow.usd_api_json_path || '';
            } else if (settingsRow.usd_telegram_channel) {
              usdEndpoint = settingsRow.usd_telegram_channel;
            }
          }
        } catch (ignore) {}

        const seedInserts = [
          { sql: `INSERT OR IGNORE INTO price_sources (id, name, price_type, source_type, endpoint, regex, json_path, fetch_interval_sec, is_active, is_primary, last_price, last_fetched, created_at, updated_at) VALUES ('src_def_usd', 'دلار تهران سبزه میدان', 'usd', ?, ?, '', ?, 60, 1, 1, 0, '', ?, ?)`, binds: [usdType, usdEndpoint, usdJsonPath, nowIso, nowIso] },
          { sql: `INSERT OR IGNORE INTO price_sources (id, name, price_type, source_type, endpoint, regex, json_path, fetch_interval_sec, is_active, is_primary, last_price, last_fetched, created_at, updated_at) VALUES ('src_def_gold_18k', 'طلا ۱۸ عیار (زرما)', 'gold_18k', 'telegram', 'zarmagoldd', '', '', 60, 1, 1, 0, '', ?, ?)`, binds: [nowIso, nowIso] },
          { sql: `INSERT OR IGNORE INTO price_sources (id, name, price_type, source_type, endpoint, regex, json_path, fetch_interval_sec, is_active, is_primary, last_price, last_fetched, created_at, updated_at) VALUES ('src_def_full_coin', 'سکه تمام بهار آزادی (زرما)', 'full_coin', 'telegram', 'zarmagoldd', '', '', 60, 1, 1, 0, '', ?, ?)`, binds: [nowIso, nowIso] },
          { sql: `INSERT OR IGNORE INTO price_sources (id, name, price_type, source_type, endpoint, regex, json_path, fetch_interval_sec, is_active, is_primary, last_price, last_fetched, created_at, updated_at) VALUES ('src_def_half_coin', 'نیم سکه بهار آزادی (زرما)', 'half_coin', 'telegram', 'zarmagoldd', '', '', 60, 1, 1, 0, '', ?, ?)`, binds: [nowIso, nowIso] },
          { sql: `INSERT OR IGNORE INTO price_sources (id, name, price_type, source_type, endpoint, regex, json_path, fetch_interval_sec, is_active, is_primary, last_price, last_fetched, created_at, updated_at) VALUES ('src_def_quarter_coin', 'ربع سکه بهار آزادی (زرما)', 'quarter_coin', 'telegram', 'zarmagoldd', '', '', 60, 1, 1, 0, '', ?, ?)`, binds: [nowIso, nowIso] },
          { sql: `INSERT OR IGNORE INTO price_sources (id, name, price_type, source_type, endpoint, regex, json_path, fetch_interval_sec, is_active, is_primary, last_price, last_fetched, created_at, updated_at) VALUES ('src_def_mesghal', 'مثقال طلا ۱۷ عیار (زرما)', 'mesghal', 'telegram', 'zarmagoldd', '', '', 60, 1, 1, 0, '', ?, ?)`, binds: [nowIso, nowIso] },
          { sql: `INSERT OR IGNORE INTO price_sources (id, name, price_type, source_type, endpoint, regex, json_path, fetch_interval_sec, is_active, is_primary, last_price, last_fetched, created_at, updated_at) VALUES ('src_def_ons_gold', 'انس طلا جهانی (XAU)', 'ons_gold', 'api_url', 'https://api.gold-api.com/price/XAU', '', 'price', 60, 1, 1, 0, '', ?, ?)`, binds: [nowIso, nowIso] },
          { sql: `INSERT OR IGNORE INTO price_sources (id, name, price_type, source_type, endpoint, regex, json_path, fetch_interval_sec, is_active, is_primary, last_price, last_fetched, created_at, updated_at) VALUES ('src_def_ons_silver', 'انس نقره جهانی (XAG)', 'ons_silver', 'api_url', 'https://api.gold-api.com/price/XAG', '', 'price', 60, 1, 1, 0, '', ?, ?)`, binds: [nowIso, nowIso] },
        ];

        for (const item of seedInserts) {
          await env.DB.prepare(item.sql).bind(...item.binds).run().catch(() => {});
        }
      } else {
        // Ensure global gold and silver sources are seeded even if other sources exist
        await env.DB.prepare(`
          INSERT OR IGNORE INTO price_sources (id, name, price_type, source_type, endpoint, regex, json_path, fetch_interval_sec, is_active, is_primary, last_price, last_fetched, created_at, updated_at)
          VALUES ('src_def_ons_gold', 'انس طلا جهانی (XAU)', 'ons_gold', 'api_url', 'https://api.gold-api.com/price/XAU', '', 'price', 60, 1, 1, 0, '', ?, ?)
        `).bind(nowIso, nowIso).run().catch(() => {});

        await env.DB.prepare(`
          INSERT OR IGNORE INTO price_sources (id, name, price_type, source_type, endpoint, regex, json_path, fetch_interval_sec, is_active, is_primary, last_price, last_fetched, created_at, updated_at)
          VALUES ('src_def_ons_silver', 'انس نقره جهانی (XAG)', 'ons_silver', 'api_url', 'https://api.gold-api.com/price/XAG', '', 'price', 60, 1, 1, 0, '', ?, ?)
        `).bind(nowIso, nowIso).run().catch(() => {});
      }
    } catch (e) {
      logger.error("Price sources seed error:", { error: e.message });
    }

    d1Initialized = true;
  } catch (e) {
    logger.error("D1 schema bootstrap error:", { error: e.message, stack: e.stack });
  }
}

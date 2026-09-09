-- RealRate Cloudflare D1 Database Schema
-- Migration: Users, Sessions, and System Settings

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
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
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_share_slug ON users(share_slug);

-- 2. Sessions Table
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  picture TEXT,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_email ON sessions(email);

-- 3. System Settings Table (Single-row configuration)
CREATE TABLE IF NOT EXISTS settings (
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
);

-- Seed initial settings row if absent
INSERT OR IGNORE INTO settings (
  id,
  default_usd_toman,
  default_gold_usd,
  bubble_pct_full,
  bubble_pct_half,
  bubble_pct_quarter,
  announcement,
  usd_source_type,
  usd_telegram_channel,
  usd_api_url,
  usd_api_json_path,
  updated_at
) VALUES (
  1,
  62000,
  2450,
  15,
  20,
  25,
  '',
  'telegram',
  'tahran_sabza',
  '',
  '',
  datetime('now')
);

-- 4. Portfolios Table (Multi-portfolio support per user)
CREATE TABLE IF NOT EXISTS portfolios (
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
);

CREATE INDEX IF NOT EXISTS idx_portfolios_user ON portfolios(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_portfolios_slug ON portfolios(share_slug);

-- 5. Portfolio Holdings Table (Per-portfolio cloud asset tracking)
CREATE TABLE IF NOT EXISTS portfolio_holdings (
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
);

CREATE INDEX IF NOT EXISTS idx_portfolio_holdings_user ON portfolio_holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_holdings_portfolio ON portfolio_holdings(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_holdings_created ON portfolio_holdings(created_at DESC);

-- 6. Price Sources Table (Unified Price Feeds: Telegram & JSON APIs)
CREATE TABLE IF NOT EXISTS price_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_type TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'telegram',
  endpoint TEXT NOT NULL,
  regex TEXT DEFAULT '',
  json_path TEXT DEFAULT '',
  fetch_interval_sec INTEGER DEFAULT 60,
  is_active INTEGER DEFAULT 1,
  is_primary INTEGER DEFAULT 0,
  last_price REAL DEFAULT 0,
  last_fetched TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_price_sources_type ON price_sources(price_type);
CREATE INDEX IF NOT EXISTS idx_price_sources_primary ON price_sources(is_primary);
CREATE INDEX IF NOT EXISTS idx_price_sources_active ON price_sources(is_active);

-- Seed default price sources if absent
INSERT OR IGNORE INTO price_sources (id, name, price_type, source_type, endpoint, regex, json_path, fetch_interval_sec, is_active, is_primary, last_price, last_fetched, created_at, updated_at)
VALUES
  ('src_def_usd', 'دلار تهران سبزه میدان', 'usd', 'telegram', 'tahran_sabza', '', '', 60, 1, 1, 0, '', datetime('now'), datetime('now')),
  ('src_def_gold_18k', 'طلا ۱۸ عیار (زرما)', 'gold_18k', 'telegram', 'zarmagoldd', '', '', 60, 1, 1, 0, '', datetime('now'), datetime('now')),
  ('src_def_full_coin', 'سکه تمام بهار آزادی (زرما)', 'full_coin', 'telegram', 'zarmagoldd', '', '', 60, 1, 1, 0, '', datetime('now'), datetime('now')),
  ('src_def_half_coin', 'نیم سکه بهار آزادی (زرما)', 'half_coin', 'telegram', 'zarmagoldd', '', '', 60, 1, 1, 0, '', datetime('now'), datetime('now')),
  ('src_def_quarter_coin', 'ربع سکه بهار آزادی (زرما)', 'quarter_coin', 'telegram', 'zarmagoldd', '', '', 60, 1, 1, 0, '', datetime('now'), datetime('now')),
  ('src_def_mesghal', 'مثقال طلا ۱۷ عیار (زرما)', 'mesghal', 'telegram', 'zarmagoldd', '', '', 60, 1, 1, 0, '', datetime('now'), datetime('now'));



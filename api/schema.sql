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
  updated_at
) VALUES (
  1,
  62000,
  2450,
  15,
  20,
  25,
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


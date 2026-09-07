-- RealRate Cloudflare D1 Database Schema
-- Migration: Users, Sessions, and System Settings

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  picture TEXT,
  role TEXT DEFAULT 'user',
  created_at TEXT NOT NULL,
  last_login TEXT NOT NULL,
  login_count INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login DESC);

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

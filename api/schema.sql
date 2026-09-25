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
  login_count INTEGER DEFAULT 1,
  home_layout TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL DEFAULT '',        -- '' = no password (Google-only account)
  email_verified INTEGER NOT NULL DEFAULT 1,     -- email sign-ups start at 0 until the link is used
  password_updated_at TEXT NOT NULL DEFAULT ''
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
  e2ee_wrapped_key TEXT NOT NULL DEFAULT '',
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
  field_mapping TEXT DEFAULT '',
  fetch_interval_sec INTEGER DEFAULT 60,
  is_active INTEGER DEFAULT 1,
  is_primary INTEGER DEFAULT 0,
  last_price REAL DEFAULT 0,
  last_multi_data TEXT DEFAULT '',
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
-- 7. Transactions Table (Buy/Sell transaction tracking with E2EE payload)
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  portfolio_id TEXT NOT NULL,
  encrypted_payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_portfolio ON transactions(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC);

-- 8. Loans & Installments Tables
CREATE TABLE IF NOT EXISTS loans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  lender_name TEXT DEFAULT '',
  bank_id TEXT NOT NULL DEFAULT '',
  principal_amount REAL NOT NULL,
  annual_interest_rate REAL NOT NULL DEFAULT 0,
  installment_count INTEGER NOT NULL,
  interval_months INTEGER NOT NULL DEFAULT 1,
  start_date TEXT NOT NULL,
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_loans_user ON loans(user_id);

-- User-defined banks (standard banks live in api/src/config/banks.config.js)
CREATE TABLE IF NOT EXISTS custom_banks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_custom_banks_user ON custom_banks(user_id);

CREATE TABLE IF NOT EXISTS loan_installment_states (
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
);
CREATE INDEX IF NOT EXISTS idx_loan_installment_states_loan ON loan_installment_states(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_installment_states_user ON loan_installment_states(user_id);
CREATE INDEX IF NOT EXISTS idx_loan_installment_states_due ON loan_installment_states(due_date);

-- 9. Loan Extra Payments Table
CREATE TABLE IF NOT EXISTS loan_extra_payments (
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
);
CREATE INDEX IF NOT EXISTS idx_loan_extra_payments_loan ON loan_extra_payments(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_extra_payments_user ON loan_extra_payments(user_id);

-- 10. Incomes Table (user-recorded income entries: salary, freelance, rental, ...)
CREATE TABLE IF NOT EXISTS incomes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  amount REAL NOT NULL,
  income_date TEXT NOT NULL,
  notes TEXT DEFAULT '',
  recurring_id TEXT NOT NULL DEFAULT '',   -- the fixed income that created it ('' = entered by hand)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_incomes_user_date ON incomes(user_id, income_date DESC);

-- 10b. Fixed (recurring) incomes: the browser creates an income entry each time one comes due;
-- generated_through is the last date already created (a deleted entry is never re-created)
CREATE TABLE IF NOT EXISTS recurring_incomes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  amount REAL NOT NULL,
  day_of_month INTEGER NOT NULL,      -- Shamsi day, clamped to shorter months
  interval_months INTEGER NOT NULL DEFAULT 1,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  generated_through TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recurring_incomes_user ON recurring_incomes(user_id);

-- 11. Cheques Table (received / issued cheques; history is the JSON tracking log of status changes)
CREATE TABLE IF NOT EXISTS cheques (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  amount REAL NOT NULL,
  due_date TEXT NOT NULL,
  issue_date TEXT DEFAULT '',
  counterparty TEXT NOT NULL,
  bank_id TEXT DEFAULT '',
  bank_name TEXT DEFAULT '',
  cheque_number TEXT DEFAULT '',
  sayad_id TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  history TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cheques_user_due ON cheques(user_id, due_date);

-- 12. One-time email links (verify address, reset password); only the token's SHA-256 is stored
CREATE TABLE IF NOT EXISTS auth_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  purpose TEXT NOT NULL,            -- verify_email | reset_password
  expires_at INTEGER NOT NULL,      -- epoch ms
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id, purpose);

-- Account-wide end-to-end encryption (row present = vault on); wrapped_key is the random data
-- key encrypted with the passphrase-derived key
CREATE TABLE IF NOT EXISTS user_vaults (
  user_id TEXT PRIMARY KEY,
  salt TEXT NOT NULL,
  wrapped_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Encrypted records of an E2EE account (loans, incomes, cheques); payload is browser-side ciphertext
CREATE TABLE IF NOT EXISTS vault_records (
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, kind, id)
);

/**
 * pgSchema.js — The app's tables in Postgres
 *
 * Created on first use (schema.repository.js ensureSchema). Flags are 0/1 BIGINTs, times in
 * ms are BIGINTs, amounts DOUBLE PRECISION. The price history tables live in
 * priceHistory.repository.js. `npm run db:schema` prints this schema as SQL.
 */

/** @type {Array<{ name: string, columns: string[], ddl: string[] }>} */
export const APP_TABLES = [
  {
    name: "users",
    columns: ["id", "email", "name", "custom_name", "picture", "role", "share_slug", "share_password", "share_enabled",
      "created_at", "last_login", "login_count", "password_hash", "email_verified", "password_updated_at", "disabled",
      "google_linked", "home_layout", "is_demo"],
    ddl: [
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        custom_name TEXT,
        picture TEXT,
        role TEXT DEFAULT 'user',
        share_slug TEXT UNIQUE,
        share_password TEXT,
        share_enabled BIGINT DEFAULT 0,
        created_at TEXT NOT NULL,
        last_login TEXT NOT NULL,
        login_count BIGINT DEFAULT 1,
        password_hash TEXT NOT NULL DEFAULT '',
        email_verified BIGINT NOT NULL DEFAULT 1,
        password_updated_at TEXT NOT NULL DEFAULT '',
        disabled BIGINT NOT NULL DEFAULT 0,
        google_linked BIGINT NOT NULL DEFAULT 0,
        home_layout TEXT NOT NULL DEFAULT '',
        is_demo BIGINT NOT NULL DEFAULT 0
      )`,
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo BIGINT NOT NULL DEFAULT 0",
      "CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login DESC)",
      "CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at)",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_one_demo ON users(is_demo) WHERE is_demo = 1",
    ],
  },
  {
    name: "sessions",
    columns: ["token", "user_id", "email", "name", "picture", "role", "created_at", "expires_at", "kind"],
    ddl: [
      `CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        name TEXT,
        picture TEXT,
        role TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at BIGINT NOT NULL,
        kind TEXT NOT NULL DEFAULT ''
      )`,
      "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT ''",
      "CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)",
      "CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)",
    ],
  },
  {
    name: "settings",
    columns: ["id", "bubble_pct_full", "bubble_pct_half", "bubble_pct_quarter", "announcement", "maintenance_mode",
      "maintenance_message", "updated_at"],
    ddl: [
      `CREATE TABLE IF NOT EXISTS settings (
        id BIGINT PRIMARY KEY CHECK (id = 1),
        bubble_pct_full DOUBLE PRECISION DEFAULT 15,
        bubble_pct_half DOUBLE PRECISION DEFAULT 20,
        bubble_pct_quarter DOUBLE PRECISION DEFAULT 25,
        announcement TEXT DEFAULT '',
        maintenance_mode BIGINT DEFAULT 0,
        maintenance_message TEXT DEFAULT '',
        updated_at TEXT
      )`,
    ],
  },
  {
    name: "portfolios",
    columns: ["id", "user_id", "name", "is_default", "share_slug", "share_password", "share_enabled", "is_e2ee",
      "e2ee_salt", "e2ee_verifier", "e2ee_wrapped_key", "created_at", "updated_at"],
    ddl: [
      `CREATE TABLE IF NOT EXISTS portfolios (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        is_default BIGINT DEFAULT 0,
        share_slug TEXT UNIQUE,
        share_password TEXT,
        share_enabled BIGINT DEFAULT 0,
        is_e2ee BIGINT DEFAULT 0,
        e2ee_salt TEXT DEFAULT '',
        e2ee_verifier TEXT DEFAULT '',
        e2ee_wrapped_key TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_portfolios_user ON portfolios(user_id)",
    ],
  },
  {
    name: "portfolio_holdings",
    columns: ["id", "user_id", "portfolio_id", "asset_id", "amount", "buy_price", "current_price", "buy_date", "notes",
      "reference_asset_id", "reference_quantity", "created_at", "updated_at"],
    ddl: [
      `CREATE TABLE IF NOT EXISTS portfolio_holdings (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        portfolio_id TEXT,
        asset_id TEXT NOT NULL,
        amount DOUBLE PRECISION NOT NULL,
        buy_price DOUBLE PRECISION NOT NULL,
        current_price DOUBLE PRECISION DEFAULT 0,
        buy_date TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        reference_asset_id TEXT NOT NULL DEFAULT '',
        reference_quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_portfolio_holdings_user ON portfolio_holdings(user_id)",
      "CREATE INDEX IF NOT EXISTS idx_portfolio_holdings_portfolio ON portfolio_holdings(portfolio_id)",
      "CREATE INDEX IF NOT EXISTS idx_portfolio_holdings_created ON portfolio_holdings(created_at DESC)",
    ],
  },
  {
    name: "transactions",
    columns: ["id", "user_id", "portfolio_id", "encrypted_payload", "created_at", "updated_at"],
    ddl: [
      `CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        portfolio_id TEXT NOT NULL,
        encrypted_payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id)",
      "CREATE INDEX IF NOT EXISTS idx_transactions_portfolio ON transactions(portfolio_id)",
      "CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC)",
    ],
  },
  {
    name: "loans",
    columns: ["id", "user_id", "title", "lender_name", "principal_amount", "annual_interest_rate", "installment_count",
      "interval_months", "start_date", "annual_fee_amount", "schedule_mode", "bank_id", "notes", "created_at", "updated_at"],
    ddl: [
      `CREATE TABLE IF NOT EXISTS loans (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        lender_name TEXT DEFAULT '',
        principal_amount DOUBLE PRECISION NOT NULL,
        annual_interest_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
        installment_count BIGINT NOT NULL,
        interval_months BIGINT NOT NULL DEFAULT 1,
        start_date TEXT NOT NULL,
        annual_fee_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
        schedule_mode TEXT NOT NULL DEFAULT 'formula',
        bank_id TEXT NOT NULL DEFAULT '',
        notes TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_loans_user ON loans(user_id)",
    ],
  },
  {
    name: "custom_banks",
    columns: ["id", "user_id", "name", "created_at"],
    ddl: [
      `CREATE TABLE IF NOT EXISTS custom_banks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_custom_banks_user ON custom_banks(user_id)",
    ],
  },
  {
    name: "loan_installment_states",
    columns: ["id", "loan_id", "user_id", "installment_number", "due_date", "principal_portion", "interest_portion",
      "total_amount", "remaining_balance_after", "is_paid", "paid_date", "paid_amount", "is_manual_override",
      "created_at", "updated_at"],
    ddl: [
      `CREATE TABLE IF NOT EXISTS loan_installment_states (
        id TEXT PRIMARY KEY,
        loan_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        installment_number BIGINT NOT NULL,
        due_date TEXT NOT NULL,
        principal_portion DOUBLE PRECISION NOT NULL,
        interest_portion DOUBLE PRECISION NOT NULL,
        total_amount DOUBLE PRECISION NOT NULL,
        remaining_balance_after DOUBLE PRECISION NOT NULL,
        is_paid BIGINT DEFAULT 0,
        paid_date TEXT DEFAULT '',
        paid_amount DOUBLE PRECISION DEFAULT 0,
        is_manual_override BIGINT DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_loan_installment_states_loan ON loan_installment_states(loan_id)",
      "CREATE INDEX IF NOT EXISTS idx_loan_installment_states_user ON loan_installment_states(user_id)",
      "CREATE INDEX IF NOT EXISTS idx_loan_installment_states_due ON loan_installment_states(due_date)",
    ],
  },
  {
    name: "loan_extra_payments",
    columns: ["id", "loan_id", "user_id", "amount", "payment_date", "reduction_mode", "notes", "anchor_installment_number",
      "resulting_balance", "resulting_installment_count", "created_at"],
    ddl: [
      `CREATE TABLE IF NOT EXISTS loan_extra_payments (
        id TEXT PRIMARY KEY,
        loan_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        amount DOUBLE PRECISION NOT NULL,
        payment_date TEXT NOT NULL,
        reduction_mode TEXT NOT NULL DEFAULT 'reduce_amount',
        notes TEXT DEFAULT '',
        anchor_installment_number BIGINT NOT NULL DEFAULT 0,
        resulting_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
        resulting_installment_count BIGINT,
        created_at TEXT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_loan_extra_payments_loan ON loan_extra_payments(loan_id)",
      "CREATE INDEX IF NOT EXISTS idx_loan_extra_payments_user ON loan_extra_payments(user_id)",
    ],
  },
  {
    name: "incomes",
    columns: ["id", "user_id", "title", "category", "amount", "income_date", "notes", "recurring_id", "created_at", "updated_at"],
    ddl: [
      `CREATE TABLE IF NOT EXISTS incomes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'other',
        amount DOUBLE PRECISION NOT NULL,
        income_date TEXT NOT NULL,
        notes TEXT DEFAULT '',
        recurring_id TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_incomes_user_date ON incomes(user_id, income_date DESC)",
    ],
  },
  {
    name: "recurring_incomes",
    columns: ["id", "user_id", "title", "category", "amount", "day_of_month", "interval_months", "start_date", "end_date",
      "notes", "active", "generated_through", "created_at", "updated_at"],
    ddl: [
      `CREATE TABLE IF NOT EXISTS recurring_incomes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'other',
        amount DOUBLE PRECISION NOT NULL,
        day_of_month BIGINT NOT NULL,
        interval_months BIGINT NOT NULL DEFAULT 1,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        active BIGINT NOT NULL DEFAULT 1,
        generated_through TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_recurring_incomes_user ON recurring_incomes(user_id)",
    ],
  },
  {
    name: "cheques",
    columns: ["id", "user_id", "direction", "status", "amount", "due_date", "issue_date", "counterparty", "bank_id",
      "bank_name", "cheque_number", "sayad_id", "notes", "history", "created_at", "updated_at"],
    ddl: [
      `CREATE TABLE IF NOT EXISTS cheques (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        direction TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        amount DOUBLE PRECISION NOT NULL,
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
      )`,
      "CREATE INDEX IF NOT EXISTS idx_cheques_user_due ON cheques(user_id, due_date)",
    ],
  },
  {
    name: "auth_tokens",
    columns: ["token_hash", "user_id", "purpose", "expires_at", "created_at"],
    ddl: [
      `CREATE TABLE IF NOT EXISTS auth_tokens (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        purpose TEXT NOT NULL,
        expires_at BIGINT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id, purpose)",
    ],
  },
  {
    name: "user_vaults",
    columns: ["user_id", "salt", "wrapped_key", "version", "created_at", "updated_at"],
    ddl: [
      `CREATE TABLE IF NOT EXISTS user_vaults (
        user_id TEXT PRIMARY KEY,
        salt TEXT NOT NULL,
        wrapped_key TEXT NOT NULL,
        version BIGINT NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    ],
  },
  {
    name: "vault_records",
    columns: ["user_id", "kind", "id", "payload", "record_date", "parent_id", "created_at", "updated_at"],
    ddl: [
      `CREATE TABLE IF NOT EXISTS vault_records (
        user_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        id TEXT NOT NULL,
        payload TEXT NOT NULL,
        record_date TEXT NOT NULL DEFAULT '',
        parent_id TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, kind, id)
      )`,
      "CREATE INDEX IF NOT EXISTS idx_vault_records_date ON vault_records(user_id, kind, record_date)",
      "CREATE INDEX IF NOT EXISTS idx_vault_records_parent ON vault_records(user_id, kind, parent_id)",
      // Incremental sync (GET /api/vault/sync): a user's records in the order they changed
      "CREATE INDEX IF NOT EXISTS idx_vault_records_updated ON vault_records(user_id, updated_at, kind, id)",
    ],
  },
  {
    // Deleted vault records, so devices keeping a copy (the Android app's offline store) learn of
    // deletions made elsewhere; pruned after VAULT_TOMBSTONE_RETENTION_DAYS
    name: "vault_tombstones",
    columns: ["user_id", "kind", "id", "deleted_at"],
    ddl: [
      `CREATE TABLE IF NOT EXISTS vault_tombstones (
        user_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        id TEXT NOT NULL,
        deleted_at TEXT NOT NULL,
        PRIMARY KEY (user_id, kind, id)
      )`,
      "CREATE INDEX IF NOT EXISTS idx_vault_tombstones_time ON vault_tombstones(user_id, deleted_at, kind, id)",
    ],
  },
  {
    name: "user_activity",
    columns: ["user_id", "day"],
    ddl: [
      `CREATE TABLE IF NOT EXISTS user_activity (
        user_id TEXT NOT NULL,
        day TEXT NOT NULL,
        PRIMARY KEY (user_id, day)
      )`,
      "CREATE INDEX IF NOT EXISTS idx_user_activity_day ON user_activity(day)",
    ],
  },
  {
    // The clients each user opens the app with (domain/clientInfo.js): the site, the Android app
    // and its latest version, when first and last seen
    name: "user_clients",
    columns: ["user_id", "platform", "app_version", "first_seen", "last_seen"],
    ddl: [
      `CREATE TABLE IF NOT EXISTS user_clients (
        user_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        app_version TEXT NOT NULL DEFAULT '',
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        PRIMARY KEY (user_id, platform)
      )`,
      "CREATE INDEX IF NOT EXISTS idx_user_clients_platform ON user_clients(platform, last_seen)",
    ],
  },
  {
    // Active users per UTC day and client (user_activity is per day only)
    name: "client_activity",
    columns: ["user_id", "platform", "day"],
    ddl: [
      `CREATE TABLE IF NOT EXISTS client_activity (
        user_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        day TEXT NOT NULL,
        PRIMARY KEY (user_id, platform, day)
      )`,
      "CREATE INDEX IF NOT EXISTS idx_client_activity_day ON client_activity(day, platform)",
    ],
  },
  {
    // The version of the DDL above that was last applied (see ensurePgSchema)
    name: "app_schema",
    columns: ["id", "version"],
    ddl: [
      `CREATE TABLE IF NOT EXISTS app_schema (
        id BIGINT PRIMARY KEY CHECK (id = 1),
        version TEXT NOT NULL
      )`,
    ],
  },
];

/** A fingerprint of every DDL statement: any change to the schema above changes it */
export const SCHEMA_VERSION = (() => {
  let hash = 5381;
  for (const sql of APP_TABLES.flatMap((t) => t.ddl)) {
    for (let i = 0; i < sql.length; i++) hash = ((hash * 33) ^ sql.charCodeAt(i)) >>> 0;
  }
  return `v1-${hash.toString(36)}`;
})();

// Created once per isolate
let schemaReady = null;

/** For tests: forget that the schema was created */
export function resetPgSchemaCache() {
  schemaReady = null;
}

/**
 * Create the app's tables in Postgres if they aren't there (idempotent)
 * @param {{ prepare: Function }} db - a pgDatabase
 */
export function ensurePgSchema(db) {
  if (!schemaReady) {
    schemaReady = (async () => {
      // A new isolate asks one question instead of re-running every statement: the ALTERs take
      // table locks even when there is nothing to change, stalling queries behind them
      const applied = await db.prepare("SELECT version FROM app_schema WHERE id = 1").first().catch(() => null);
      if (applied?.version === SCHEMA_VERSION) return;
      for (const table of APP_TABLES) {
        for (const sql of table.ddl) await db.prepare(sql).run();
      }
      await db.prepare(
        "INSERT INTO app_schema (id, version) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET version = excluded.version"
      ).bind(SCHEMA_VERSION).run();
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

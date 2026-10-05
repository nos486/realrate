/**
 * d1Schema.js — The app's tables in Cloudflare D1 (SQLite)
 *
 * Created on first use (schema.repository.js ensureSchema), once per isolate: a new isolate asks
 * app_schema one question and runs the DDL only when it changed. Flags are 0/1 INTEGERs, times in
 * ms are INTEGERs, amounts REAL. `npm run db:schema` prints this schema as SQL.
 */

/**
 * @type {Array<{ name: string, columns: string[], ddl: string[],
 *   addColumns?: Array<{ column: string, sql: string }>, afterAddColumns?: string[] }>}
 */
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
        share_enabled INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        last_login TEXT NOT NULL,
        login_count INTEGER DEFAULT 1,
        password_hash TEXT NOT NULL DEFAULT '',
        email_verified INTEGER NOT NULL DEFAULT 1,
        password_updated_at TEXT NOT NULL DEFAULT '',
        disabled INTEGER NOT NULL DEFAULT 0,
        google_linked INTEGER NOT NULL DEFAULT 0,
        home_layout TEXT NOT NULL DEFAULT '',
        is_demo INTEGER NOT NULL DEFAULT 0
      )`,
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
        expires_at INTEGER NOT NULL,
        kind TEXT NOT NULL DEFAULT ''
      )`,
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
        id INTEGER PRIMARY KEY CHECK (id = 1),
        bubble_pct_full REAL DEFAULT 15,
        bubble_pct_half REAL DEFAULT 20,
        bubble_pct_quarter REAL DEFAULT 25,
        announcement TEXT DEFAULT '',
        maintenance_mode INTEGER DEFAULT 0,
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
        amount REAL NOT NULL,
        buy_price REAL NOT NULL,
        current_price REAL DEFAULT 0,
        buy_date TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        reference_asset_id TEXT NOT NULL DEFAULT '',
        reference_quantity REAL NOT NULL DEFAULT 0,
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
        principal_amount REAL NOT NULL,
        annual_interest_rate REAL NOT NULL DEFAULT 0,
        installment_count INTEGER NOT NULL,
        interval_months INTEGER NOT NULL DEFAULT 1,
        start_date TEXT NOT NULL,
        annual_fee_amount REAL NOT NULL DEFAULT 0,
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
        amount REAL NOT NULL,
        payment_date TEXT NOT NULL,
        reduction_mode TEXT NOT NULL DEFAULT 'reduce_amount',
        notes TEXT DEFAULT '',
        anchor_installment_number INTEGER NOT NULL DEFAULT 0,
        resulting_balance REAL NOT NULL DEFAULT 0,
        resulting_installment_count INTEGER,
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
        amount REAL NOT NULL,
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
        amount REAL NOT NULL,
        day_of_month INTEGER NOT NULL,
        interval_months INTEGER NOT NULL DEFAULT 1,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1,
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
        expires_at INTEGER NOT NULL,
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
        version INTEGER NOT NULL DEFAULT 1,
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
    // Minimal plaintext index for due loan installments, cheques and recurring incomes
    name: "vault_reminders",
    columns: ["user_id", "kind", "record_id", "due_date", "interval_months", "remaining", "direction", "muted", "updated_at"],
    ddl: [
      `CREATE TABLE IF NOT EXISTS vault_reminders (
        user_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        record_id TEXT NOT NULL,
        due_date TEXT NOT NULL,
        interval_months INTEGER NOT NULL DEFAULT 0,
        remaining INTEGER,
        direction TEXT NOT NULL DEFAULT '',
        muted INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, kind, record_id)
      )`,
      "CREATE INDEX IF NOT EXISTS idx_vault_reminders_due ON vault_reminders(due_date)",
      "CREATE INDEX IF NOT EXISTS idx_vault_reminders_cron ON vault_reminders(muted, due_date)",
    ],
  },
  {
    // Server-side email reminder preferences per account
    name: "alert_email_prefs",
    columns: ["user_id", "enabled", "sources", "lead_days", "send_overdue", "include_cheque_direction", "updated_at"],
    ddl: [
      `CREATE TABLE IF NOT EXISTS alert_email_prefs (
        user_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 0,
        sources TEXT NOT NULL DEFAULT '["loan","cheque"]',
        lead_days TEXT NOT NULL DEFAULT '[1,0]',
        send_overdue INTEGER NOT NULL DEFAULT 1,
        include_cheque_direction INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      )`,
    ],
  },
  {
    // History of sent reminder emails to prevent duplicate digests
    name: "alert_email_sent",
    columns: ["user_id", "kind", "record_id", "due_date", "reason", "sent_at"],
    ddl: [
      `CREATE TABLE IF NOT EXISTS alert_email_sent (
        user_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        record_id TEXT NOT NULL,
        due_date TEXT NOT NULL,
        reason TEXT NOT NULL,
        sent_at TEXT NOT NULL,
        PRIMARY KEY (user_id, kind, record_id, due_date, reason)
      )`,
      "CREATE INDEX IF NOT EXISTS idx_alert_email_sent_time ON alert_email_sent(sent_at)",
      "CREATE INDEX IF NOT EXISTS idx_alert_email_sent_user ON alert_email_sent(user_id)",
    ],
  },
  {
    // Web Push subscriptions registered by browser/PWA clients
    name: "push_subscriptions",
    // news_alerts: 1 when the browser wants a push for the news section's important news
    columns: ["device_id", "user_id", "subscription_json", "created_at", "updated_at", "news_alerts"],
    ddl: [
      `CREATE TABLE IF NOT EXISTS push_subscriptions (
        device_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        subscription_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        news_alerts INTEGER NOT NULL DEFAULT 0
      )`,
      "CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id)",
    ],
    addColumns: [
      { column: "news_alerts", sql: "ALTER TABLE push_subscriptions ADD COLUMN news_alerts INTEGER NOT NULL DEFAULT 0" },
    ],
  },
  {
    // Sealed push reminder payloads scheduled for Web Push delivery on fire_date
    name: "push_reminders",
    columns: ["device_id", "user_id", "kind", "record_id", "due_date", "reason", "fire_date", "sealed_payload", "updated_at"],
    ddl: [
      `CREATE TABLE IF NOT EXISTS push_reminders (
        device_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        record_id TEXT NOT NULL,
        due_date TEXT NOT NULL,
        reason TEXT NOT NULL,
        fire_date TEXT NOT NULL,
        sealed_payload TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (device_id, kind, record_id, due_date, reason)
      )`,
      "CREATE INDEX IF NOT EXISTS idx_push_reminders_fire ON push_reminders(fire_date)",
      "CREATE INDEX IF NOT EXISTS idx_push_reminders_user ON push_reminders(user_id)",
      "CREATE INDEX IF NOT EXISTS idx_push_reminders_dev ON push_reminders(device_id)",
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
    // Groups of users (e.g. "pro"), made by the admin; a feature can be open only to some groups
    // (config/features.js, userGroups.repository.js). A system group can't be deleted.
    name: "user_groups",
    columns: ["id", "key", "name", "description", "allow_requests", "is_system", "created_at", "updated_at"],
    ddl: [
      `CREATE TABLE IF NOT EXISTS user_groups (
        id TEXT PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        allow_requests INTEGER NOT NULL DEFAULT 0,
        is_system INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      // The group the market page belongs to; users may ask to join it
      `INSERT OR IGNORE INTO user_groups (id, key, name, description, allow_requests, is_system, created_at, updated_at)
       VALUES ('grp_pro', 'pro', 'Pro', 'دسترسی به صفحه‌ی نرخ و حباب: قیمت‌ها، نمودار و شخصی‌سازی', 1, 1,
               '2026-10-04T00:00:00.000Z', '2026-10-04T00:00:00.000Z')`,
    ],
  },
  {
    name: "user_group_members",
    columns: ["group_id", "user_id", "added_at", "added_by"],
    ddl: [
      `CREATE TABLE IF NOT EXISTS user_group_members (
        group_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        added_at TEXT NOT NULL,
        added_by TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (group_id, user_id)
      )`,
      "CREATE INDEX IF NOT EXISTS idx_user_group_members_user ON user_group_members(user_id)",
    ],
  },
  {
    // A user asking to join a group that accepts requests; the admin approves (adds the member)
    // or rejects it (the request goes away either way)
    name: "user_group_requests",
    columns: ["group_id", "user_id", "requested_at", "note"],
    ddl: [
      `CREATE TABLE IF NOT EXISTS user_group_requests (
        group_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        requested_at TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (group_id, user_id)
      )`,
      "CREATE INDEX IF NOT EXISTS idx_user_group_requests_time ON user_group_requests(requested_at)",
    ],
  },
  {
      // Small key/value state that must be consistent: counters, the admin's source overrides, the
    // sources' sync state, the latest app release (stateStore.repository.js)
    name: "app_state",
    columns: ["key", "value", "expires_at", "updated_at"],
    ddl: [
      `CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at INTEGER,
        updated_at INTEGER NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_app_state_expires ON app_state(expires_at) WHERE expires_at IS NOT NULL",
    ],
  },
  {
    // The price of every item, one row per item and (Tehran) day: the day's candle — `value` is
    // the last price (close), with the first (open), highest and lowest prices seen that day
    // (priceHistory.repository.js). Written only when the price changed.
    name: "price_daily",
    columns: ["item_key", "day", "value", "updated_at", "open", "high", "low"],
    ddl: [
      `CREATE TABLE IF NOT EXISTS price_daily (
        item_key TEXT NOT NULL,
        day TEXT NOT NULL,
        value REAL NOT NULL,
        updated_at INTEGER NOT NULL,
        open REAL,
        high REAL,
        low REAL,
        PRIMARY KEY (item_key, day)
      ) WITHOUT ROWID`,
    ],
    // Columns added after the table first shipped (run when missing; see ensureD1Schema)
    addColumns: [
      { column: "open", sql: "ALTER TABLE price_daily ADD COLUMN open REAL" },
      { column: "high", sql: "ALTER TABLE price_daily ADD COLUMN high REAL" },
      { column: "low", sql: "ALTER TABLE price_daily ADD COLUMN low REAL" },
    ],
    // Days recorded before the candle columns: a flat candle at the close
    afterAddColumns: ["UPDATE price_daily SET open = value, high = value, low = value WHERE open IS NULL"],
  },
  {
    // The news section: market news picked from Telegram channels (services/news/news.service.js).
    // `id` is "<channel>/<post id>"; `ai` 1 when the model approved and summarized it; `hidden`
    // 1 when an admin took it down. Deleted after NEWS_LIMITS.retentionDays.
    name: "news",
    columns: ["id", "channel", "channel_title", "post_id", "url", "title", "summary", "text", "category",
      "importance", "image", "published_at", "created_at", "ai", "hidden"],
    ddl: [
      `CREATE TABLE IF NOT EXISTS news (
        id TEXT PRIMARY KEY,
        channel TEXT NOT NULL,
        channel_title TEXT NOT NULL DEFAULT '',
        post_id INTEGER NOT NULL,
        url TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        text TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT 'economy',
        importance INTEGER NOT NULL DEFAULT 1,
        image TEXT NOT NULL DEFAULT '',
        published_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        ai INTEGER NOT NULL DEFAULT 0,
        hidden INTEGER NOT NULL DEFAULT 0
      )`,
      "CREATE INDEX IF NOT EXISTS idx_news_published ON news(hidden, published_at DESC)",
      "CREATE INDEX IF NOT EXISTS idx_news_category ON news(category, published_at DESC)",
    ],
  },
  {
    // The version of the DDL above that was last applied (see ensureD1Schema)
    name: "app_schema",
    columns: ["id", "version"],
    ddl: [
      `CREATE TABLE IF NOT EXISTS app_schema (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        version TEXT NOT NULL
      )`,
      // Left over from the one-time copy out of Postgres
      "DROP TABLE IF EXISTS pg_migration",
    ],
  },
];

/** A fingerprint of every DDL statement: any change to the schema above changes it */
export const SCHEMA_VERSION = (() => {
  let hash = 5381;
  for (const sql of APP_TABLES.flatMap((t) => [...t.ddl, ...(t.addColumns || []).map((a) => a.sql), ...(t.afterAddColumns || [])])) {
    for (let i = 0; i < sql.length; i++) hash = ((hash * 33) ^ sql.charCodeAt(i)) >>> 0;
  }
  return `v1-${hash.toString(36)}`;
})();

// Created once per isolate
let schemaReady = null;

/** For tests: forget that the schema was created */
export function resetD1SchemaCache() {
  schemaReady = null;
}

/** Columns added to an existing table (SQLite has no ADD COLUMN IF NOT EXISTS) */
async function addMissingColumns(db) {
  for (const table of APP_TABLES) {
    if (!table.addColumns?.length) continue;
    const { results } = await db.prepare(`SELECT name FROM pragma_table_info('${table.name}')`).all();
    const have = new Set((results || []).map((r) => r.name));
    const missing = table.addColumns.filter((a) => !have.has(a.column));
    if (!missing.length) continue;
    await db.batch([...missing.map((a) => a.sql), ...(table.afterAddColumns || [])].map((sql) => db.prepare(sql)));
  }
}

/**
 * Create the app's tables if they aren't there (idempotent)
 * @param {{ prepare: Function, batch: Function }} db - the D1 binding
 */
export function ensureD1Schema(db) {
  if (!schemaReady) {
    schemaReady = (async () => {
      const applied = await db.prepare("SELECT version FROM app_schema WHERE id = 1").first().catch(() => null);
      if (applied?.version === SCHEMA_VERSION) return;
      // All the DDL in one round trip (D1 runs a batch as one transaction)
      await db.batch(APP_TABLES.flatMap((table) => table.ddl).map((sql) => db.prepare(sql)));
      await addMissingColumns(db);
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

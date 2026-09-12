/**
 * db.js — Cloudflare D1 SQL + KV data access layer
 * All database interactions are isolated here for easy extension
 */
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
    `CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL,
      price_type TEXT NOT NULL,
      source_name TEXT NOT NULL,
      price REAL NOT NULL,
      timestamp TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_price_history_source ON price_history(source_id, timestamp DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_price_history_type ON price_history(price_type, timestamp DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_price_history_timestamp ON price_history(timestamp DESC)`,
    `CREATE TABLE IF NOT EXISTS source_types (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      category TEXT DEFAULT 'single',
      unit TEXT DEFAULT 'تومان',
      badge_color TEXT DEFAULT 'blue',
      output_config TEXT DEFAULT '',
      is_system INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 99,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_source_types_sort ON source_types(sort_order ASC)`,
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
        eur: 1.0929,
        try: 0.02985,
        aed: 0.2723,
        gbp: 1.2788,
        chf: 1.1561,
        cad: 0.7299,
        aud: 0.6579,
        cny: 0.1393,
      });

      const defaultForexFieldMapping = JSON.stringify({
        ratesPath: 'rates',
        currencies: [
          { key: 'eur', path: 'EUR', mode: 'invert', label: 'یورو اروپا' },
          { key: 'try', path: 'TRY', mode: 'invert', label: 'لیر ترکیه' },
          { key: 'aed', path: 'AED', mode: 'invert', label: 'درهم امارات' },
          { key: 'gbp', path: 'GBP', mode: 'invert', label: 'پوند انگلیس' },
          { key: 'chf', path: 'CHF', mode: 'invert', label: 'فرانک سوئیس' },
          { key: 'cad', path: 'CAD', mode: 'invert', label: 'دلار کانادا' },
          { key: 'aud', path: 'AUD', mode: 'invert', label: 'دلار استرالیا' },
          { key: 'cny', path: 'CNY', mode: 'invert', label: 'یوان چین' },
        ],
      });

      const defaultBourseFieldMapping = JSON.stringify({
        arrayPath: '',
        symbolField: 'l18',
        nameField: 'l30',
        priceField: 'pl',
        altPriceField: 'pc',
        changeField: 'plc',
        changePercentField: 'plp',
        volumeField: 'tno',
        priceUnit: 'rial',
      });

      // Ensure unified Forex source exists
      await env.DB.prepare(`
        INSERT OR IGNORE INTO price_sources (id, name, price_type, source_type, endpoint, regex, json_path, field_mapping, fetch_interval_sec, is_active, is_primary, last_price, last_multi_data, last_fetched, created_at, updated_at)
        VALUES ('src_def_forex', 'نرخ‌های جهانی فارکس (Open ER-API)', 'forex', 'api_url', 'https://open.er-api.com/v6/latest/USD', '', 'rates', ?, 300, 1, 1, 8, ?, '', ?, ?)
      `).bind(defaultForexFieldMapping, defaultForexJson, nowIso, nowIso).run().catch(() => {});

      await env.DB.prepare(`
        UPDATE price_sources
        SET field_mapping = ?
        WHERE id = 'src_def_forex' AND (field_mapping IS NULL OR field_mapping = '')
      `).bind(defaultForexFieldMapping).run().catch(() => {});

      // Ensure Tehran Stock Exchange (Bourse) source exists (Daily interval = 86400s)
      await env.DB.prepare(`
        INSERT OR IGNORE INTO price_sources (id, name, price_type, source_type, endpoint, regex, json_path, field_mapping, fetch_interval_sec, is_active, is_primary, last_price, last_multi_data, last_fetched, created_at, updated_at)
        VALUES ('src_def_bourse', 'بورس اوراق بهادار تهران (TSETMC / BRS API)', 'bourse', 'api_url', 'https://api.brsapi.ir/Tsetmc/AllSymbols.php?key=BDqzgcZZ5rGg4Z6uSEs9bMyx2E2vXrkd&type=1', '', '', ?, 86400, 1, 1, 1140, '', '', ?, ?)
      `).bind(defaultBourseFieldMapping, nowIso, nowIso).run().catch(() => {});

      await env.DB.prepare(`
        UPDATE price_sources
        SET field_mapping = ?
        WHERE id = 'src_def_bourse' AND (field_mapping IS NULL OR field_mapping = '')
      `).bind(defaultBourseFieldMapping).run().catch(() => {});

      // Ensure IME Investment & Gold Funds source exists
      const defaultFundsFieldMapping = JSON.stringify({
        arrayPath: "data",
        symbolField: "l18",
        nameField: "l30",
        priceField: "pl",
        altPriceField: "pc",
        changeField: "plc",
        changePercentField: "plp",
        volumeField: "tno",
        priceUnit: "rial",
      });

      await env.DB.prepare(`
        INSERT OR IGNORE INTO price_sources (id, name, price_type, source_type, endpoint, regex, json_path, field_mapping, fetch_interval_sec, is_active, is_primary, last_price, last_multi_data, last_fetched, created_at, updated_at)
        VALUES ('src_def_bourse_funds', 'بورس اوراق بهادار تهران (صندوق)', 'bourse_fund', 'api_url', 'https://Api.BrsApi.ir/IME/Fund.php?key=BDqzgcZZ5rGg4Z6uSEs9bMyx2E2vXrkd', '', '', ?, 86400, 1, 1, 60, '', '', ?, ?)
      `).bind(defaultFundsFieldMapping, nowIso, nowIso).run().catch(() => {});

      await env.DB.prepare(`
        UPDATE price_sources
        SET price_type = 'bourse_fund', name = 'بورس اوراق بهادار تهران (صندوق)', field_mapping = COALESCE(NULLIF(field_mapping, ''), ?)
        WHERE id = 'src_def_bourse_funds' OR endpoint LIKE '%Fund.php%'
      `).bind(defaultFundsFieldMapping).run().catch(() => {});

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
      console.error("Price sources seed error:", e);
    }

    // Seed default source_types (price type definitions — replaces hardcoded PRICE_TYPE_INFO)
    try {
      const nowIso = new Date().toISOString();
      const defaultSourceTypes = [
        { id: 'usd',         label: 'دلار (USD)',                          category: 'single',       unit: 'تومان',   badge_color: 'blue',    sort_order: 1,  is_system: 1 },
        { id: 'gold_18k',    label: 'طلا ۱۸ عیار',                        category: 'single',       unit: 'تومان',   badge_color: 'gold',    sort_order: 2,  is_system: 1 },
        { id: 'full_coin',   label: 'سکه تمام بهار',                      category: 'single',       unit: 'تومان',   badge_color: 'amber',   sort_order: 3,  is_system: 1 },
        { id: 'half_coin',   label: 'نیم سکه بهار',                       category: 'single',       unit: 'تومان',   badge_color: 'orange',  sort_order: 4,  is_system: 1 },
        { id: 'quarter_coin',label: 'ربع سکه بهار',                       category: 'single',       unit: 'تومان',   badge_color: 'rose',    sort_order: 5,  is_system: 1 },
        { id: 'mesghal',     label: 'مثقال طلا ۱۷ عیار',                  category: 'single',       unit: 'تومان',   badge_color: 'purple',  sort_order: 6,  is_system: 1 },
        { id: 'ons_gold',    label: 'انس طلا جهانی (XAU)',                category: 'single',       unit: '$',       badge_color: 'gold',    sort_order: 7,  is_system: 1 },
        { id: 'ons_silver',  label: 'انس نقره جهانی (XAG)',               category: 'single',       unit: '$',       badge_color: 'blue',    sort_order: 8,  is_system: 1 },
        { id: 'forex',       label: 'نرخ‌های جهانی فارکس (چند ارزی)',     category: 'multi_output', unit: 'ارز',     badge_color: 'indigo',  sort_order: 9,  is_system: 1 },
        { id: 'bourse',      label: 'بورس اوراق بهادار تهران (سهام)',      category: 'multi_output', unit: 'نماد',    badge_color: 'emerald', sort_order: 10, is_system: 1 },
        { id: 'bourse_fund', label: 'بورس اوراق بهادار تهران (صندوق)',     category: 'multi_output', unit: 'صندوق',   badge_color: 'purple',  sort_order: 11, is_system: 1 },
        { id: 'eur',         label: 'یورو (EUR/USD)',                      category: 'single',       unit: '$',       badge_color: 'blue',    sort_order: 20, is_system: 1 },
        { id: 'try',         label: 'لیر ترکیه (USD/TRY)',                category: 'single',       unit: '$',       badge_color: 'rose',    sort_order: 21, is_system: 1 },
        { id: 'aed',         label: 'درهم امارات (USD/AED)',               category: 'single',       unit: '$',       badge_color: 'emerald', sort_order: 22, is_system: 1 },
        { id: 'gbp',         label: 'پوند انگلیس (GBP/USD)',              category: 'single',       unit: '$',       badge_color: 'purple',  sort_order: 23, is_system: 1 },
        { id: 'chf',         label: 'فرانک سوئیس (USD/CHF)',              category: 'single',       unit: '$',       badge_color: 'slate',   sort_order: 24, is_system: 1 },
        { id: 'cad',         label: 'دلار کانادا (USD/CAD)',               category: 'single',       unit: '$',       badge_color: 'orange',  sort_order: 25, is_system: 1 },
        { id: 'aud',         label: 'دلار استرالیا (AUD/USD)',             category: 'single',       unit: '$',       badge_color: 'cyan',    sort_order: 26, is_system: 1 },
        { id: 'cny',         label: 'یوان چین (USD/CNY)',                  category: 'single',       unit: '$',       badge_color: 'amber',   sort_order: 27, is_system: 1 },
      ];
      for (const st of defaultSourceTypes) {
        await env.DB.prepare(`
          INSERT OR IGNORE INTO source_types (id, label, category, unit, badge_color, output_config, is_system, sort_order, created_at)
          VALUES (?, ?, ?, ?, ?, '', ?, ?, ?)
        `).bind(st.id, st.label, st.category, st.unit, st.badge_color, st.is_system, st.sort_order, nowIso).run().catch(() => {});
      }
    } catch (e) {
      console.error("Source types seed error:", e);
    }

    d1Initialized = true;
  } catch (e) {
    console.error("D1 schema bootstrap error:", e);
  }
}

/**
 * Upsert a user into D1 SQL and sync to KV
 * @param {object} env
 * @param {object} userData - { id, email, name, picture, role, createdAt, lastLogin }
 * @returns {object} updated userData
 */
export async function dbUpsertUser(env, userData) {
  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      await env.DB.prepare(`
        INSERT INTO users (id, email, name, picture, role, created_at, last_login, login_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(email) DO UPDATE SET
          name = excluded.name,
          picture = excluded.picture,
          role = excluded.role,
          last_login = excluded.last_login,
          login_count = users.login_count + 1
      `).bind(
        userData.id,
        userData.email,
        userData.name,
        userData.picture,
        userData.role,
        userData.createdAt,
        userData.lastLogin
      ).run();

      const updated = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(userData.email).first();
      if (updated) {
        userData.loginCount = updated.login_count;
        userData.createdAt = updated.created_at;

        // Auto-assign default random share_slug if none set
        if (!updated.share_slug) {
          const chars = '23456789abcdefghjkmnpqrstuvwxyz';
          let assignedSlug = '';
          for (let i = 0; i < 8; i++) {
            assignedSlug += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          let saved = false;
          for (let attempt = 0; attempt < 5; attempt++) {
            try {
              await env.DB.prepare("UPDATE users SET share_slug = ? WHERE id = ?").bind(assignedSlug, updated.id).run();
              userData.shareSlug = assignedSlug;
              saved = true;
              break;
            } catch (e) {
              assignedSlug = '';
              for (let i = 0; i < 8; i++) {
                assignedSlug += chars.charAt(Math.floor(Math.random() * chars.length));
              }
            }
          }
          if (!saved) {
            userData.shareSlug = assignedSlug;
          }
        } else {
          userData.shareSlug = updated.share_slug;
        }

        userData.shareEnabled = updated.share_enabled || 0;
        userData.customName = updated.custom_name || '';
      }
    } catch (e) {
      console.error("D1 dbUpsertUser error:", e);
    }
  }

  return userData;
}

/**
 * Fetch all registered users from D1 (or KV fallback)
 * @param {object} env
 * @returns {Array}
 */
export async function dbGetUsers(env) {
  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      const { results } = await env.DB.prepare(`
        SELECT id, email, name, custom_name AS customName, picture, role,
               share_slug AS shareSlug, share_enabled AS shareEnabled,
               created_at AS createdAt, last_login AS lastLogin, login_count AS loginCount
        FROM users
        ORDER BY last_login DESC
      `).all();
      if (Array.isArray(results) && results.length > 0) {
        return results;
      }
    } catch (e) {
      console.error("D1 dbGetUsers error:", e);
    }
  }

  return [];
}

/**
 * Get user by ID or email
 */
export async function dbGetUserById(env, userId) {
  if (!userId) return null;
  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      const row = await env.DB.prepare(`
        SELECT id, email, name, custom_name AS customName, picture, role,
               share_slug AS shareSlug, share_password AS sharePassword,
               share_enabled AS shareEnabled, created_at AS createdAt, last_login AS lastLogin
        FROM users
        WHERE id = ? OR email = ?
      `).bind(userId, userId).first();
      return row || null;
    } catch (e) {
      console.error("D1 dbGetUserById error:", e);
    }
  }
  return null;
}

/**
 * Get user by Share Slug (for shared portfolio view)
 */
export async function dbGetUserByShareSlug(env, slug) {
  if (!slug) return null;
  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      const row = await env.DB.prepare(`
        SELECT id, email, name, custom_name AS customName, picture, role,
               share_slug AS shareSlug, share_password AS sharePassword,
               share_enabled AS shareEnabled
        FROM users
        WHERE LOWER(share_slug) = LOWER(?)
      `).bind(slug.trim()).first();
      return row || null;
    } catch (e) {
      console.error("D1 dbGetUserByShareSlug error:", e);
    }
  }
  return null;
}

/**
 * Update user settings (custom name, share slug, share password, share enabled)
 */
export async function dbUpdateUserSettings(env, userId, { customName, shareSlug, sharePassword, shareEnabled }) {
  if (!userId) throw new Error("شناسه کاربر الزامی است.");
  if (env && env.DB) {
    await ensureD1Tables(env);

    // Validate and check if new shareSlug is already taken by another user
    if (shareSlug) {
      const cleanedSlug = shareSlug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      if (cleanedSlug.length < 2) {
        throw new Error("آدرس اختصاصی باید حداقل ۲ کاراکتر و شامل حروف یا ارقام انگلیسی باشد.");
      }
      const existing = await env.DB.prepare(`
        SELECT id FROM users WHERE LOWER(share_slug) = LOWER(?) AND id != ? AND email != ?
      `).bind(cleanedSlug, userId, userId).first();
      if (existing) {
        throw new Error("این آدرس اختصاصی (slug) قبلاً توسط کاربر دیگری انتخاب شده است. لطفاً شناسه دیگری انتخاب فرمایید.");
      }
      shareSlug = cleanedSlug;
    }

    const updates = [];
    const bindings = [];

    if (customName !== undefined) {
      updates.push("custom_name = ?");
      bindings.push(customName ? customName.trim() : null);
    }
    if (shareSlug !== undefined) {
      updates.push("share_slug = ?");
      bindings.push(shareSlug);
    }
    if (sharePassword !== undefined) {
      updates.push("share_password = ?");
      bindings.push(sharePassword ? sharePassword.trim() : null);
    }
    if (shareEnabled !== undefined) {
      updates.push("share_enabled = ?");
      bindings.push(shareEnabled ? 1 : 0);
    }

    if (updates.length > 0) {
      bindings.push(userId, userId);
      await env.DB.prepare(`
        UPDATE users SET ${updates.join(", ")} WHERE id = ? OR email = ?
      `).bind(...bindings).run();
    }

    return await dbGetUserById(env, userId);
  }
  return null;
}

/**
 * Save a session token to D1 SQL and KV
 * @param {object} env
 * @param {object} sessionData - { token, userId, email, name, picture, role, createdAt }
 * @param {number} [ttlSeconds=2592000] - 30 days default
 */
export async function dbSaveSession(env, sessionData, ttlSeconds = 30 * 24 * 3600) {
  const expiresAt = Date.now() + ttlSeconds * 1000;

  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      await env.DB.prepare(`
        INSERT OR REPLACE INTO sessions (token, user_id, email, name, picture, role, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        sessionData.token,
        sessionData.userId,
        sessionData.email,
        sessionData.name,
        sessionData.picture,
        sessionData.role,
        sessionData.createdAt,
        expiresAt
      ).run();
    } catch (e) {
      console.error("D1 dbSaveSession error:", e);
    }
  }

  if (env && env.REALRATE_KV) {
    try {
      await env.REALRATE_KV.put(`session:${sessionData.token}`, JSON.stringify(sessionData), {
        expirationTtl: ttlSeconds,
      });
    } catch (e) {}
  }
}

/**
 * Retrieve a valid (non-expired) session from D1 or KV
 * @param {object} env
 * @param {string} token
 * @returns {object|null}
 */
export async function dbGetSession(env, token) {
  if (!token) return null;

  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      const row = await env.DB.prepare(`
        SELECT token, user_id AS userId, email, name, picture, role, created_at AS createdAt, expires_at AS expiresAt
        FROM sessions
        WHERE token = ? AND expires_at > ?
      `).bind(token, Date.now()).first();

      if (row) return row;
    } catch (e) {
      console.error("D1 dbGetSession error:", e);
    }
  }

  if (env && env.REALRATE_KV) {
    try {
      const sessionStr = await env.REALRATE_KV.get(`session:${token}`);
      if (sessionStr) return JSON.parse(sessionStr);
    } catch (e) {}
  }

  return null;
}

/**
 * Delete a session from D1 and KV on logout
 * @param {object} env
 * @param {string} token
 */
export async function dbDeleteSession(env, token) {
  if (!token) return;

  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    } catch (e) {
      console.error("D1 dbDeleteSession error:", e);
    }
  }

  if (env && env.REALRATE_KV) {
    try {
      await env.REALRATE_KV.delete(`session:${token}`);
    } catch (e) {}
  }
}

/**
 * Generate a random alphanumeric slug for shared portfolio URLs
 * @param {number} len
 * @returns {string}
 */
export function generateRandomSlug(len = 8) {
  const chars = '23456789abcdefghjkmnpqrstuvwxyz';
  let slug = '';
  for (let i = 0; i < len; i++) {
    slug += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return slug;
}

/**
 * Fetch all portfolios for a user (with auto-bootstrap default portfolio if none exist)
 * @param {object} env
 * @param {string} userId
 * @returns {Promise<Array>}
 */
export async function dbGetUserPortfolios(env, userId) {
  if (!userId) return [];

  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      let { results } = await env.DB.prepare(`
        SELECT p.id, p.user_id AS userId, p.name, p.is_default AS isDefault,
               p.share_slug AS shareSlug, p.share_password AS sharePassword,
               p.share_enabled AS shareEnabled, p.is_e2ee AS isE2ee,
               p.e2ee_salt AS e2eeSalt, p.e2ee_verifier AS e2eeVerifier,
               p.created_at AS createdAt, p.updated_at AS updatedAt,
               COUNT(h.id) AS itemCount
        FROM portfolios p
        LEFT JOIN portfolio_holdings h ON p.id = h.portfolio_id
        WHERE p.user_id = ?
        GROUP BY p.id
        ORDER BY p.is_default DESC, p.created_at ASC
      `).bind(userId).all();

      // If user has no portfolio records yet, auto-bootstrap default portfolio
      if (!results || results.length === 0) {
        const userData = await dbGetUserById(env, userId);
        const defaultPortfolioId = `p_def_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
        const shareSlug = userData?.shareSlug || generateRandomSlug(8);
        const sharePassword = userData?.sharePassword || '';
        const shareEnabled = userData?.shareEnabled ? 1 : 0;
        const now = new Date().toISOString();

        await env.DB.prepare(`
          INSERT INTO portfolios (id, user_id, name, is_default, share_slug, share_password, share_enabled, is_e2ee, e2ee_salt, e2ee_verifier, created_at, updated_at)
          VALUES (?, ?, ?, 1, ?, ?, ?, 0, '', '', ?, ?)
        `).bind(
          defaultPortfolioId,
          userId,
          'پورتفوی اصلی',
          shareSlug,
          sharePassword,
          shareEnabled,
          now,
          now
        ).run();

        // Migrate any unassigned holdings for this user
        await env.DB.prepare(`
          UPDATE portfolio_holdings
          SET portfolio_id = ?
          WHERE user_id = ? AND (portfolio_id IS NULL OR portfolio_id = '')
        `).bind(defaultPortfolioId, userId).run();

        const reQuery = await env.DB.prepare(`
          SELECT p.id, p.user_id AS userId, p.name, p.is_default AS isDefault,
                 p.share_slug AS shareSlug, p.share_password AS sharePassword,
                 p.share_enabled AS shareEnabled, p.is_e2ee AS isE2ee,
                 p.e2ee_salt AS e2eeSalt, p.e2ee_verifier AS e2eeVerifier,
                 p.created_at AS createdAt, p.updated_at AS updatedAt,
                 COUNT(h.id) AS itemCount
          FROM portfolios p
          LEFT JOIN portfolio_holdings h ON p.id = h.portfolio_id
          WHERE p.user_id = ?
          GROUP BY p.id
          ORDER BY p.is_default DESC, p.created_at ASC
        `).bind(userId).all();
        results = reQuery.results;
      }

      return Array.isArray(results) ? results : [];
    } catch (e) {
      console.error("D1 dbGetUserPortfolios error:", e);
    }
  }

  return [];
}

/**
 * Get a single portfolio by ID and userId
 */
export async function dbGetPortfolioById(env, portfolioId, userId) {
  if (!portfolioId || !userId) return null;
  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      const row = await env.DB.prepare(`
        SELECT p.id, p.user_id AS userId, p.name, p.is_default AS isDefault,
               p.share_slug AS shareSlug, p.share_password AS sharePassword,
               p.share_enabled AS shareEnabled, p.is_e2ee AS isE2ee,
               p.e2ee_salt AS e2eeSalt, p.e2ee_verifier AS e2eeVerifier,
               p.created_at AS createdAt, p.updated_at AS updatedAt
        FROM portfolios p
        WHERE p.id = ? AND p.user_id = ?
      `).bind(portfolioId, userId).first();
      return row || null;
    } catch (e) {
      console.error("D1 dbGetPortfolioById error:", e);
    }
  }
  return null;
}

/**
 * Create a new portfolio for user
 */
export async function dbCreatePortfolio(env, userId, { name, isE2ee = false, e2eeSalt = "", e2eeVerifier = "" }) {
  if (!userId) throw new Error("شناسه کاربر الزامی است.");
  const portfolioName = String(name || "").trim() || "پورتفوی جدید";
  const now = new Date().toISOString();
  const id = `p_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const shareSlug = generateRandomSlug(8);
  const e2eeVal = isE2ee ? 1 : 0;

  if (env && env.DB) {
    await ensureD1Tables(env);
    await env.DB.prepare(`
      INSERT INTO portfolios (id, user_id, name, is_default, share_slug, share_password, share_enabled, is_e2ee, e2ee_salt, e2ee_verifier, created_at, updated_at)
      VALUES (?, ?, ?, 0, ?, '', 0, ?, ?, ?, ?, ?)
    `).bind(id, userId, portfolioName, shareSlug, e2eeVal, e2eeSalt || "", e2eeVerifier || "", now, now).run();
  }

  return {
    id,
    userId,
    name: portfolioName,
    isDefault: 0,
    shareSlug,
    sharePassword: '',
    shareEnabled: 0,
    isE2ee: !!e2eeVal,
    e2eeSalt: e2eeSalt || '',
    e2eeVerifier: e2eeVerifier || '',
    itemCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update portfolio name and share settings
 */
export async function dbUpdatePortfolio(env, portfolioId, userId, { name, shareSlug, sharePassword, shareEnabled, isDefault, isE2ee, e2eeSalt, e2eeVerifier }) {
  if (!portfolioId || !userId) throw new Error("شناسه پورتفو و کاربر الزامی است.");
  if (env && env.DB) {
    await ensureD1Tables(env);

    // Validate shareSlug uniqueness if provided
    if (shareSlug) {
      const cleanedSlug = shareSlug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      if (cleanedSlug.length < 2) {
        throw new Error("آدرس اختصاصی باید حداقل ۲ کاراکتر و از حروف یا اعداد انگلیسی باشد.");
      }
      const existing = await env.DB.prepare(`
        SELECT id FROM portfolios WHERE LOWER(share_slug) = LOWER(?) AND id != ?
      `).bind(cleanedSlug, portfolioId).first();
      if (existing) {
        throw new Error("این آدرس اختصاصی (slug) قبلاً برای پورتفوی دیگری ثبت شده است.");
      }
      shareSlug = cleanedSlug;
    }

    if (isDefault) {
      // Clear default flag on other portfolios of this user
      await env.DB.prepare(`
        UPDATE portfolios SET is_default = 0 WHERE user_id = ?
      `).bind(userId).run();
    }

    const updates = ["updated_at = ?"];
    const bindings = [new Date().toISOString()];

    if (name !== undefined && String(name).trim()) {
      updates.push("name = ?");
      bindings.push(String(name).trim());
    }
    if (shareSlug !== undefined) {
      updates.push("share_slug = ?");
      bindings.push(shareSlug);
    }
    if (sharePassword !== undefined) {
      updates.push("share_password = ?");
      bindings.push(String(sharePassword || '').trim());
    }
    if (shareEnabled !== undefined) {
      updates.push("share_enabled = ?");
      bindings.push(shareEnabled ? 1 : 0);
    }
    if (isDefault !== undefined) {
      updates.push("is_default = ?");
      bindings.push(isDefault ? 1 : 0);
    }
    if (isE2ee !== undefined) {
      updates.push("is_e2ee = ?");
      bindings.push(isE2ee ? 1 : 0);
    }
    if (e2eeSalt !== undefined) {
      updates.push("e2ee_salt = ?");
      bindings.push(String(e2eeSalt || '').trim());
    }
    if (e2eeVerifier !== undefined) {
      updates.push("e2ee_verifier = ?");
      bindings.push(String(e2eeVerifier || '').trim());
    }

    bindings.push(portfolioId, userId);
    await env.DB.prepare(`
      UPDATE portfolios
      SET ${updates.join(", ")}
      WHERE id = ? AND user_id = ?
    `).bind(...bindings).run();

    const updated = await env.DB.prepare(`
      SELECT p.id, p.user_id AS userId, p.name, p.is_default AS isDefault,
             p.share_slug AS shareSlug, p.share_password AS sharePassword,
             p.share_enabled AS shareEnabled, p.is_e2ee AS isE2ee,
             p.e2ee_salt AS e2eeSalt, p.e2ee_verifier AS e2eeVerifier,
             p.created_at AS createdAt, p.updated_at AS updatedAt,
             COUNT(h.id) AS itemCount
      FROM portfolios p
      LEFT JOIN portfolio_holdings h ON p.id = h.portfolio_id
      WHERE p.id = ? AND p.user_id = ?
      GROUP BY p.id
    `).bind(portfolioId, userId).first();

    return updated;
  }

  return null;
}

/**
 * Delete a portfolio and its holdings
 */
export async function dbDeletePortfolio(env, portfolioId, userId) {
  if (!portfolioId || !userId) throw new Error("شناسه پورتفو و کاربر الزامی است.");
  if (env && env.DB) {
    await ensureD1Tables(env);

    const countRow = await env.DB.prepare(`
      SELECT COUNT(*) AS total FROM portfolios WHERE user_id = ?
    `).bind(userId).first();

    if (countRow && countRow.total <= 1) {
      throw new Error("امکان حذف تنها پورتفوی فعال وجود ندارد. هر کاربر باید حداقل یک پورتفو داشته باشد.");
    }

    // Delete holdings
    await env.DB.prepare(`
      DELETE FROM portfolio_holdings WHERE portfolio_id = ? AND user_id = ?
    `).bind(portfolioId, userId).run();

    // Delete portfolio
    await env.DB.prepare(`
      DELETE FROM portfolios WHERE id = ? AND user_id = ?
    `).bind(portfolioId, userId).run();

    // If default was deleted, assign default to another
    const remaining = await env.DB.prepare(`
      SELECT id FROM portfolios WHERE user_id = ? ORDER BY is_default DESC, created_at ASC LIMIT 1
    `).bind(userId).first();

    if (remaining) {
      await env.DB.prepare(`
        UPDATE portfolios SET is_default = 1 WHERE id = ?
      `).bind(remaining.id).run();
    }

    return true;
  }
  return false;
}

/**
 * Fetch portfolio by share slug for public sharing
 */
export async function dbGetPortfolioByShareSlug(env, slug) {
  if (!slug) return null;
  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      // 1. Search in portfolios table
      const portfolio = await env.DB.prepare(`
        SELECT p.id, p.user_id AS userId, p.name, p.is_default AS isDefault,
               p.share_slug AS shareSlug, p.share_password AS sharePassword,
               p.share_enabled AS shareEnabled, p.is_e2ee AS isE2ee,
               p.e2ee_salt AS e2eeSalt, p.e2ee_verifier AS e2eeVerifier,
               u.name AS userName, u.custom_name AS userCustomName, u.email AS userEmail
        FROM portfolios p
        JOIN users u ON p.user_id = u.id
        WHERE LOWER(p.share_slug) = LOWER(?)
      `).bind(slug.trim()).first();

      if (portfolio) {
        return portfolio;
      }

      // 2. Fallback: Search in users table (old slug before migration)
      const user = await env.DB.prepare(`
        SELECT id, email, name, custom_name AS customName, picture, role,
               share_slug AS shareSlug, share_password AS sharePassword,
               share_enabled AS shareEnabled
        FROM users
        WHERE LOWER(share_slug) = LOWER(?)
      `).bind(slug.trim()).first();

      if (user) {
        const defP = await env.DB.prepare(`
          SELECT id, user_id AS userId, name, is_default AS isDefault,
                 share_slug AS shareSlug, share_password AS sharePassword,
                 share_enabled AS shareEnabled
          FROM portfolios
          WHERE user_id = ?
          ORDER BY is_default DESC, created_at ASC LIMIT 1
        `).bind(user.id).first();

        return {
          id: defP?.id || `p_${user.id}`,
          userId: user.id,
          name: defP?.name || 'پورتفوی اصلی',
          isDefault: 1,
          shareSlug: user.shareSlug,
          sharePassword: user.sharePassword,
          shareEnabled: user.shareEnabled,
          userName: user.name,
          userCustomName: user.customName,
          userEmail: user.email,
        };
      }
    } catch (e) {
      console.error("D1 dbGetPortfolioShareSlug error:", e);
    }
  }
  return null;
}

/**
 * Fetch all portfolio holdings for a user and optionally a specific portfolio
 * @param {object} env
 * @param {string} userId
 * @param {string} [portfolioId]
 * @returns {Promise<Array>}
 */
export async function dbGetPortfolioHoldings(env, userId, portfolioId = null) {
  if (!userId) return [];

  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      let query = `
        SELECT id, user_id AS userId, portfolio_id AS portfolioId, asset_id AS assetId,
               asset_name AS assetName, asset_type AS assetType, unit, amount,
               buy_price AS buyPrice, current_price AS currentPrice, buy_date AS buyDate,
               notes, created_at AS createdAt, updated_at AS updatedAt
        FROM portfolio_holdings
        WHERE user_id = ?
      `;
      const bindings = [userId];

      if (portfolioId) {
        query += ` AND (portfolio_id = ? OR (portfolio_id IS NULL AND ? = (SELECT id FROM portfolios WHERE user_id = ? AND is_default = 1 LIMIT 1)))`;
        bindings.push(portfolioId, portfolioId, userId);
      }

      query += ` ORDER BY created_at DESC`;

      const { results } = await env.DB.prepare(query).bind(...bindings).all();
      if (Array.isArray(results)) {
        return results;
      }
    } catch (e) {
      console.error("D1 dbGetPortfolioHoldings error:", e);
    }
  }

  return [];
}

/**
 * Add or update a portfolio holding for a user in a portfolio
 * @param {object} env
 * @param {object} item
 * @returns {Promise<object>}
 */
export async function dbAddPortfolioHolding(env, item) {
  const now = new Date().toISOString();
  let portfolioId = item.portfolioId;

  // If no portfolioId provided, resolve user's default portfolio
  if (!portfolioId && env && env.DB) {
    await ensureD1Tables(env);
    const defP = await env.DB.prepare(`
      SELECT id FROM portfolios WHERE user_id = ? ORDER BY is_default DESC, created_at ASC LIMIT 1
    `).bind(item.userId).first();
    if (defP) {
      portfolioId = defP.id;
    } else {
      const pList = await dbGetUserPortfolios(env, item.userId);
      if (pList && pList[0]) portfolioId = pList[0].id;
    }
  }

  const holding = {
    id: item.id || `h_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
    userId: item.userId,
    portfolioId: portfolioId || '',
    assetId: item.assetId,
    assetName: item.assetName || item.assetId,
    assetType: item.assetType || 'custom',
    unit: item.unit || 'واحد',
    amount: Number(item.amount) || 0,
    buyPrice: Number(item.buyPrice) || 0,
    currentPrice: Number(item.currentPrice) || 0,
    buyDate: item.buyDate || '',
    notes: item.notes || '',
    createdAt: item.createdAt || now,
    updatedAt: now,
  };

  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      await env.DB.prepare(`
        INSERT INTO portfolio_holdings (
          id, user_id, portfolio_id, asset_id, asset_name, asset_type, unit,
          amount, buy_price, current_price, buy_date, notes, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          portfolio_id = excluded.portfolio_id,
          asset_id = excluded.asset_id,
          asset_name = excluded.asset_name,
          asset_type = excluded.asset_type,
          unit = excluded.unit,
          amount = excluded.amount,
          buy_price = excluded.buy_price,
          current_price = excluded.current_price,
          buy_date = excluded.buy_date,
          notes = excluded.notes,
          updated_at = excluded.updated_at
      `).bind(
        holding.id,
        holding.userId,
        holding.portfolioId,
        holding.assetId,
        holding.assetName,
        holding.assetType,
        holding.unit,
        holding.amount,
        holding.buyPrice,
        holding.currentPrice,
        holding.buyDate,
        holding.notes,
        holding.createdAt,
        holding.updatedAt
      ).run();
    } catch (e) {
      console.error("D1 dbAddPortfolioHolding error:", e);
    }
  }

  return holding;
}

/**
 * Delete a portfolio holding
 * @param {object} env
 * @param {string} id
 * @param {string} userId
 */
export async function dbDeletePortfolioHolding(env, id, userId) {
  if (!id || !userId) return false;

  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      await env.DB.prepare(`
        DELETE FROM portfolio_holdings WHERE id = ? AND user_id = ?
      `).bind(id, userId).run();
    } catch (e) {
      console.error("D1 dbDeletePortfolioHolding error:", e);
    }
  }

  return true;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Source Types CRUD (Dynamic price-type definitions — replaces hardcoded PRICE_TYPE_INFO)
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Get all source types (price type definitions) from D1
 * @param {object} env
 * @returns {Promise<Array>}
 */
export async function dbGetSourceTypes(env) {
  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      const { results } = await env.DB.prepare(`
        SELECT id, label, category, unit, badge_color AS badgeColor,
               output_config AS outputConfig, is_system AS isSystem, sort_order AS sortOrder,
               created_at AS createdAt
        FROM source_types
        ORDER BY sort_order ASC, id ASC
      `).all();
      if (Array.isArray(results)) {
        return results.map(r => ({
          ...r,
          isSystem: !!r.isSystem,
          outputConfig: r.outputConfig ? (() => { try { return JSON.parse(r.outputConfig); } catch { return null; } })() : null,
        }));
      }
    } catch (e) {
      console.error("D1 dbGetSourceTypes error:", e);
    }
  }
  return [];
}

/**
 * Save (create or update) a source type definition
 * @param {object} env
 * @param {object} data - { id, label, category, unit, badgeColor, outputConfig, sortOrder }
 * @returns {Promise<object|null>}
 */
export async function dbSaveSourceType(env, data) {
  const id = String(data.id || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const label = String(data.label || '').trim();
  if (!id || !label) throw new Error("شناسه و عنوان نوع سورس الزامی هستند.");

  const category = ['multi_output'].includes(data.category) ? data.category : 'single';
  const unit = String(data.unit || 'تومان').trim();
  const badgeColor = String(data.badgeColor || data.badge_color || 'blue').trim();
  const outputConfig = data.outputConfig ? (typeof data.outputConfig === 'object' ? JSON.stringify(data.outputConfig) : String(data.outputConfig)) : '';
  const isSystem = data.isSystem ? 1 : 0;
  const sortOrder = parseInt(data.sortOrder || data.sort_order || 99, 10);
  const now = new Date().toISOString();

  if (env && env.DB) {
    await ensureD1Tables(env);
    await env.DB.prepare(`
      INSERT INTO source_types (id, label, category, unit, badge_color, output_config, is_system, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        label = excluded.label,
        category = excluded.category,
        unit = excluded.unit,
        badge_color = excluded.badge_color,
        output_config = excluded.output_config,
        sort_order = excluded.sort_order
    `).bind(id, label, category, unit, badgeColor, outputConfig, isSystem, sortOrder, now).run();

    const saved = await env.DB.prepare(`
      SELECT id, label, category, unit, badge_color AS badgeColor,
             output_config AS outputConfig, is_system AS isSystem, sort_order AS sortOrder,
             created_at AS createdAt
      FROM source_types WHERE id = ?
    `).bind(id).first();
    return saved ? { ...saved, isSystem: !!saved.isSystem } : null;
  }
  return null;
}

/**
 * Delete a source type by ID (only non-system types can be deleted)
 * @param {object} env
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function dbDeleteSourceType(env, id) {
  if (!id) return false;
  if (env && env.DB) {
    await ensureD1Tables(env);
    const row = await env.DB.prepare("SELECT is_system FROM source_types WHERE id = ?").bind(id).first();
    if (!row) return false;
    if (row.is_system) throw new Error("انواع سورس سیستمی قابل حذف نیستند.");
    await env.DB.prepare("DELETE FROM source_types WHERE id = ?").bind(id).run();
    return true;
  }
  return false;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Price Sources CRUD & Management (D1 + KV)
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Get all price sources from D1 (or KV fallback)
 * @param {object} env
 * @returns {Promise<Array>}
 */
export async function dbGetPriceSources(env) {
  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      const { results } = await env.DB.prepare(`
        SELECT id, name, price_type AS priceType, source_type AS sourceType,
               endpoint, regex, json_path AS jsonPath, field_mapping AS fieldMapping,
               excluded_outputs AS excludedOutputs, display_config AS displayConfig,
               fetch_interval_sec AS fetchIntervalSec,
               is_active AS isActive, is_primary AS isPrimary,
               last_price AS lastPrice, last_multi_data AS lastMultiData,
               last_fetched AS lastFetched,
               created_at AS createdAt, updated_at AS updatedAt
        FROM price_sources
        ORDER BY price_type ASC, is_primary DESC, created_at ASC
      `).all();

      if (Array.isArray(results) && results.length > 0) {
        const mapped = results.map(row => {
          let parsedFieldMapping = null;
          if (row.fieldMapping) {
            try { parsedFieldMapping = typeof row.fieldMapping === 'string' ? JSON.parse(row.fieldMapping) : row.fieldMapping; } catch {}
          }
          let parsedExcludedOutputs = [];
          if (row.excludedOutputs) {
            try { parsedExcludedOutputs = typeof row.excludedOutputs === 'string' ? JSON.parse(row.excludedOutputs) : row.excludedOutputs; } catch {}
          }
          let parsedDisplayConfig = null;
          if (row.displayConfig) {
            try { parsedDisplayConfig = typeof row.displayConfig === 'string' ? JSON.parse(row.displayConfig) : row.displayConfig; } catch {}
          }
          return {
            ...row,
            fieldMapping: parsedFieldMapping || row.fieldMapping || null,
            excludedOutputs: Array.isArray(parsedExcludedOutputs) ? parsedExcludedOutputs : [],
            displayConfig: parsedDisplayConfig || null,
            channelUsername: row.sourceType === "telegram" ? row.endpoint : "",
            apiUrl: row.sourceType === "api_url" ? row.endpoint : "",
            regexPattern: row.regex || "",
            fetchIntervalMinutes: Math.round((row.fetchIntervalSec || 300) / 60),
          };
        });
        return mapped;
      }
    } catch (e) {
      console.error("D1 dbGetPriceSources error:", e);
    }
  }

  return [];
}

/**
 * Get single price source by ID
 * @param {object} env
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function dbGetPriceSourceById(env, id) {
  if (!id) return null;
  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      const row = await env.DB.prepare(`
        SELECT id, name, price_type AS priceType, source_type AS sourceType,
               endpoint, regex, json_path AS jsonPath, field_mapping AS fieldMapping,
               excluded_outputs AS excludedOutputs, display_config AS displayConfig,
               fetch_interval_sec AS fetchIntervalSec,
               is_active AS isActive, is_primary AS isPrimary,
               last_price AS lastPrice, last_multi_data AS lastMultiData,
               last_fetched AS lastFetched,
               created_at AS createdAt, updated_at AS updatedAt
        FROM price_sources
        WHERE id = ?
      `).bind(id).first();
      if (!row) return null;
      let parsedFieldMapping = null;
      if (row.fieldMapping) {
        try { parsedFieldMapping = typeof row.fieldMapping === 'string' ? JSON.parse(row.fieldMapping) : row.fieldMapping; } catch {}
      }
      let parsedExcludedOutputs = [];
      if (row.excludedOutputs) {
        try { parsedExcludedOutputs = typeof row.excludedOutputs === 'string' ? JSON.parse(row.excludedOutputs) : row.excludedOutputs; } catch {}
      }
      let parsedDisplayConfig = null;
      if (row.displayConfig) {
        try { parsedDisplayConfig = typeof row.displayConfig === 'string' ? JSON.parse(row.displayConfig) : row.displayConfig; } catch {}
      }
      return {
        ...row,
        fieldMapping: parsedFieldMapping || row.fieldMapping || null,
        excludedOutputs: Array.isArray(parsedExcludedOutputs) ? parsedExcludedOutputs : [],
        displayConfig: parsedDisplayConfig || null,
        channelUsername: row.sourceType === "telegram" ? row.endpoint : "",
        apiUrl: row.sourceType === "api_url" ? row.endpoint : "",
        regexPattern: row.regex || "",
        fetchIntervalMinutes: Math.round((row.fetchIntervalSec || 300) / 60),
      };
    } catch (e) {
      console.error("D1 dbGetPriceSourceById error:", e);
    }
  }
  return null;
}

/**
 * Save (create or update) a price source
 * @param {object} env
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function dbSavePriceSource(env, data) {
  const name = String(data.name || "").trim();
  const priceType = String(data.priceType || data.price_type || "").trim();
  const endpoint = String(data.endpoint || data.channelUsername || data.apiUrl || "").trim();

  if (!name || !priceType || !endpoint) {
    throw new Error("نام، نوع قیمت و آدرس سورس (endpoint) الزامی هستند.");
  }

  const now = new Date().toISOString();
  const id = data.id || `src_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const sourceType = data.sourceType === "api_url" ? "api_url" : "telegram";
  const regex = String(data.regex || data.regexPattern || "").trim();
  const jsonPath = String(data.jsonPath || data.json_path || "").trim();
  const fieldMapping = data.fieldMapping !== undefined
    ? (typeof data.fieldMapping === 'object' ? JSON.stringify(data.fieldMapping) : String(data.fieldMapping))
    : (data.field_mapping !== undefined ? (typeof data.field_mapping === 'object' ? JSON.stringify(data.field_mapping) : String(data.field_mapping)) : '');
  const fetchIntervalSec = parseInt(data.fetchIntervalSec, 10) > 0
    ? parseInt(data.fetchIntervalSec, 10)
    : (parseInt(data.fetchIntervalMinutes, 10) > 0 ? parseInt(data.fetchIntervalMinutes, 10) * 60 : 300);
  const isActive = data.isActive !== undefined ? (data.isActive ? 1 : 0) : 1;
  let isPrimary = data.isPrimary !== undefined ? (data.isPrimary ? 1 : 0) : 0;
  const lastMultiData = data.lastMultiData !== undefined
    ? (typeof data.lastMultiData === 'string' ? data.lastMultiData : JSON.stringify(data.lastMultiData))
    : '';

  // excluded_outputs: JSON array of strings (currency codes or symbol names to exclude)
  const excludedOutputsRaw = data.excludedOutputs !== undefined ? data.excludedOutputs : (data.excluded_outputs !== undefined ? data.excluded_outputs : []);
  const excludedOutputs = Array.isArray(excludedOutputsRaw) ? JSON.stringify(excludedOutputsRaw) : (String(excludedOutputsRaw || ''));

  // display_config: optional UI metadata JSON
  const displayConfigRaw = data.displayConfig !== undefined ? data.displayConfig : (data.display_config !== undefined ? data.display_config : null);
  const displayConfig = displayConfigRaw
    ? (typeof displayConfigRaw === 'object' ? JSON.stringify(displayConfigRaw) : String(displayConfigRaw))
    : '';

  if (env && env.DB) {
    await ensureD1Tables(env);

    // If this source is marked as primary, demote other sources of same priceType
    if (isPrimary === 1) {
      await env.DB.prepare(`
        UPDATE price_sources
        SET is_primary = 0, updated_at = ?
        WHERE price_type = ? AND id != ?
      `).bind(now, priceType, id).run();
    } else {
      // If there is no existing primary source for this priceType, make this one primary
      const existingPrimary = await env.DB.prepare(`
        SELECT id FROM price_sources WHERE price_type = ? AND is_primary = 1 AND id != ?
      `).bind(priceType, id).first();
      if (!existingPrimary && isActive === 1) {
        isPrimary = 1;
      }
    }

    await env.DB.prepare(`
      INSERT INTO price_sources (
        id, name, price_type, source_type, endpoint, regex, json_path, field_mapping,
        excluded_outputs, display_config,
        fetch_interval_sec, is_active, is_primary, last_price, last_multi_data, last_fetched,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        price_type = excluded.price_type,
        source_type = excluded.source_type,
        endpoint = excluded.endpoint,
        regex = excluded.regex,
        json_path = excluded.json_path,
        field_mapping = excluded.field_mapping,
        excluded_outputs = excluded.excluded_outputs,
        display_config = excluded.display_config,
        fetch_interval_sec = excluded.fetch_interval_sec,
        is_active = excluded.is_active,
        is_primary = excluded.is_primary,
        last_multi_data = CASE WHEN excluded.last_multi_data != '' THEN excluded.last_multi_data ELSE price_sources.last_multi_data END,
        updated_at = excluded.updated_at
    `).bind(
      id,
      name,
      priceType,
      sourceType,
      endpoint,
      regex,
      jsonPath,
      fieldMapping,
      excludedOutputs,
      displayConfig,
      fetchIntervalSec,
      isActive,
      isPrimary,
      data.lastPrice !== undefined ? Number(data.lastPrice) : 0,
      lastMultiData,
      data.lastFetched || '',
      data.createdAt || now,
      now
    ).run();

    const saved = await dbGetPriceSourceById(env, id);

    if (data.lastPrice && Number(data.lastPrice) > 0) {
      await dbRecordPriceHistory(env, {
        sourceId: id,
        priceType,
        sourceName: name,
        price: Number(data.lastPrice),
        timestamp: data.lastFetched || now,
      });
    }

    return saved;
  }

  return null;
}

/**
 * Delete a price source by ID
 * @param {object} env
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function dbDeletePriceSource(env, id) {
  if (!id) return false;

  if (env && env.DB) {
    await ensureD1Tables(env);

    const target = await dbGetPriceSourceById(env, id);
    // Delete all historical price points for this source
    await env.DB.prepare("DELETE FROM price_history WHERE source_id = ?").bind(id).run();
    // Delete the source configuration
    await env.DB.prepare("DELETE FROM price_sources WHERE id = ?").bind(id).run();

    // If was primary, promote the next active source of this price_type
    if (target.isPrimary) {
      const nextCandidate = await env.DB.prepare(`
        SELECT id FROM price_sources
        WHERE price_type = ? AND is_active = 1
        ORDER BY created_at ASC
        LIMIT 1
      `).bind(target.priceType).first();

      if (nextCandidate) {
        await env.DB.prepare(`
          UPDATE price_sources
          SET is_primary = 1, updated_at = ?
          WHERE id = ?
        `).bind(new Date().toISOString(), nextCandidate.id).run();
      }
    }

    // Remove from KV
    if (env.REALRATE_KV) {
      try {
        await env.REALRATE_KV.delete(`source_price:${id}`);
      } catch (ignore) {}
    }

    return true;
  }

  return false;
}

/**
 * Set a specific price source as primary for its price type
 * @param {object} env
 * @param {string} id
 * @param {string} [priceType]
 * @returns {Promise<object|null>}
 */
export async function dbSetPrimaryPriceSource(env, id, priceType = null) {
  if (!id) throw new Error("شناسه سورس الزامی است.");

  if (env && env.DB) {
    await ensureD1Tables(env);
    const now = new Date().toISOString();

    let targetType = priceType;
    if (!targetType) {
      const source = await dbGetPriceSourceById(env, id);
      if (!source) throw new Error("سورس مورد نظر یافت نشد.");
      targetType = source.priceType;
    }

    // Demote others of this price type
    await env.DB.prepare(`
      UPDATE price_sources
      SET is_primary = 0, updated_at = ?
      WHERE price_type = ?
    `).bind(now, targetType).run();

    // Promote target
    await env.DB.prepare(`
      UPDATE price_sources
      SET is_primary = 1, is_active = 1, updated_at = ?
      WHERE id = ?
    `).bind(now, id).run();

    const updated = await dbGetPriceSourceById(env, id);

    return updated;
  }

  return null;
}

/**
 * Update last price and fetched timestamp of a source
 * @param {object} env
 * @param {string} id
 * @param {number} lastPrice
 * @param {string} [lastFetched]
 * @param {string|object|null} [lastMultiData]
 */
export async function dbUpdateSourceLastPrice(env, id, lastPrice, lastFetched = null, lastMultiData = null) {
  if (!id || !env) return;
  const isoTime = lastFetched || new Date().toISOString();
  const priceNum = Number(lastPrice) || 0;
  const multiStr = typeof lastMultiData === 'string'
    ? lastMultiData
    : (lastMultiData ? JSON.stringify(lastMultiData) : null);

  if (env.DB) {
    try {
      if (multiStr !== null) {
        await env.DB.prepare(`
          UPDATE price_sources
          SET last_price = ?, last_fetched = ?, last_multi_data = ?, updated_at = ?
          WHERE id = ?
        `).bind(priceNum, isoTime, multiStr, new Date().toISOString(), id).run();
      } else {
        await env.DB.prepare(`
          UPDATE price_sources
          SET last_price = ?, last_fetched = ?, updated_at = ?
          WHERE id = ?
        `).bind(priceNum, isoTime, new Date().toISOString(), id).run();
      }
    } catch (e) {
      console.error("D1 dbUpdateSourceLastPrice error:", e);
    }
  }

  // Save latest price to individual clean KV key for instant lookups
  if (env.REALRATE_KV) {
    try {
      await env.REALRATE_KV.put(`source_price:${id}`, JSON.stringify({
        price: priceNum,
        lastFetched: isoTime,
        lastMultiData: multiStr ? JSON.parse(multiStr) : undefined,
      }));
    } catch (ignore) {}
  }
}

/**
 * Record a price snapshot to price_history table
 * Deduplication: only insert if price changed from last recorded price for this source,
 * or if more than 30 minutes have elapsed since last entry.
 * @param {object} env
 * @param {object} entry - { sourceId, priceType, sourceName, price, timestamp }
 */
export async function dbRecordPriceHistory(env, { sourceId, priceType, sourceName, price, timestamp }) {
  if (!env || !env.DB || !sourceId || !price || Number(price) <= 0) return;
  await ensureD1Tables(env);

  const timeIso = timestamp || new Date().toISOString();
  const now = new Date().toISOString();
  const numPrice = Number(price);

  try {
    // Check the latest recorded price for this source
    const lastRecord = await env.DB.prepare(`
      SELECT price, timestamp FROM price_history
      WHERE source_id = ?
      ORDER BY timestamp DESC
      LIMIT 1
    `).bind(sourceId).first();

    let shouldInsert = false;
    if (!lastRecord) {
      shouldInsert = true;
    } else if (Math.round(lastRecord.price) !== Math.round(numPrice)) {
      shouldInsert = true;
    } else {
      // Check if more than 30 minutes passed
      const diffMs = new Date(timeIso).getTime() - new Date(lastRecord.timestamp).getTime();
      if (diffMs > 30 * 60 * 1000) {
        shouldInsert = true;
      }
    }

    if (shouldInsert) {
      await env.DB.prepare(`
        INSERT INTO price_history (source_id, price_type, source_name, price, timestamp, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(sourceId, priceType, sourceName || '', numPrice, timeIso, now).run();
    }
  } catch (e) {
    console.error("D1 dbRecordPriceHistory error:", e);
  }
}

/**
 * Get historical price records for graphing and analytics
 * @param {object} env
 * @param {object} options - { sourceId, priceType, range = '24h', limit = 200 }
 * @returns {Promise<Array>}
 */
export async function dbGetPriceHistory(env, { sourceId = null, priceType = null, range = '24h', limit = 200 } = {}) {
  if (!env || !env.DB) return [];
  await ensureD1Tables(env);

  try {
    let whereClauses = [];
    let bindings = [];

    if (sourceId) {
      whereClauses.push("source_id = ?");
      bindings.push(sourceId);
    }

    if (priceType) {
      whereClauses.push("price_type = ?");
      bindings.push(priceType);
    }

    // Time range filter
    if (range && range !== 'all') {
      const nowMs = Date.now();
      let sinceMs = nowMs - 24 * 3600 * 1000; // default 24h
      if (range === '7d') sinceMs = nowMs - 7 * 24 * 3600 * 1000;
      else if (range === '30d') sinceMs = nowMs - 30 * 24 * 3600 * 1000;
      else if (range === '1y') sinceMs = nowMs - 365 * 24 * 3600 * 1000;

      const sinceIso = new Date(sinceMs).toISOString();
      whereClauses.push("timestamp >= ?");
      bindings.push(sinceIso);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 10), 500);

    const query = `
      SELECT id, source_id AS sourceId, price_type AS priceType,
             source_name AS sourceName, price, timestamp, created_at AS createdAt
      FROM price_history
      ${whereStr}
      ORDER BY timestamp ASC
      LIMIT ?
    `;
    bindings.push(parsedLimit);

    const { results } = await env.DB.prepare(query).bind(...bindings).all();
    return Array.isArray(results) ? results : [];
  } catch (e) {
    console.error("D1 dbGetPriceHistory error:", e);
    return [];
  }
}

/**
 * Retrieve downsampled 24h price history sparklines for main gold, coin, or usd types
 * @param {object} env
 * @param {string|null} [targetAsset=null] - Optional specific asset id (e.g. 'usd', 'gold_18k')
 * @returns {Promise<Record<string, Array<{price: number, timestamp: string}>>>}
 */
export async function dbGet24hSparklines(env, targetAsset = null) {
  if (!env || !env.DB) return targetAsset ? { [targetAsset]: [] } : {};
  await ensureD1Tables(env);

  const allTargets = [
    'usd', 'gold_18k', 'mesghal', 'full_coin', 'quarter_coin',
    'eur', 'try', 'aed', 'gbp', 'chf', 'cad', 'aud', 'cny'
  ];
  const forexTargets = ['eur', 'try', 'aed', 'gbp', 'chf', 'cad', 'aud', 'cny'];

  // If requesting a specific forex asset, we also query 'usd' to multiply by USD price at each timestamp point
  let queryTargets = allTargets;
  if (targetAsset && allTargets.includes(targetAsset)) {
    queryTargets = forexTargets.includes(targetAsset) ? [targetAsset, 'usd'] : [targetAsset];
  }

  const result = {};
  if (targetAsset) {
    result[targetAsset] = [];
  } else {
    for (const t of allTargets) result[t] = [];
  }

  try {
    const sinceIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const placeholders = queryTargets.map(() => '?').join(',');

    // Select from price_history for past 24h, filtering to primary sources where defined to avoid multi-source jitter
    const query = `
      SELECT ph.price_type AS priceType, ph.price, ph.timestamp
      FROM price_history ph
      WHERE ph.timestamp >= ?
        AND ph.price_type IN (${placeholders})
        AND (
          ph.source_id IN (SELECT id FROM price_sources WHERE is_primary = 1)
          OR NOT EXISTS (SELECT 1 FROM price_sources ps WHERE ps.price_type = ph.price_type AND ps.is_primary = 1)
        )
      ORDER BY ph.timestamp ASC
    `;

    const binds = [sinceIso, ...queryTargets];
    const { results } = await env.DB.prepare(query).bind(...binds).all();
    const rows = Array.isArray(results) ? results : [];

    // Group raw rows
    const grouped = {};
    for (const t of queryTargets) grouped[t] = [];
    for (const row of rows) {
      if (grouped[row.priceType]) {
        grouped[row.priceType].push({
          price: Number(row.price),
          timestamp: row.timestamp,
        });
      }
    }

    // Get fallback latest USD price in case no 24h USD history records exist yet
    let latestUsd = 95000;
    try {
      const usdRow = await env.DB.prepare("SELECT last_price FROM price_sources WHERE price_type = 'usd' AND is_primary = 1").first();
      if (usdRow && Number(usdRow.last_price) > 0) latestUsd = Number(usdRow.last_price);
    } catch (ignore) {}

    const usdPoints = grouped['usd'] || [];

    // Helper: Find closest USD price at or near a given timestamp
    const getClosestUsdPrice = (targetIso) => {
      if (!usdPoints || usdPoints.length === 0) return latestUsd;
      const targetMs = new Date(targetIso).getTime();
      let closest = usdPoints[0];
      let minDiff = Math.abs(new Date(closest.timestamp).getTime() - targetMs);

      for (let i = 1; i < usdPoints.length; i++) {
        const diff = Math.abs(new Date(usdPoints[i].timestamp).getTime() - targetMs);
        if (diff < minDiff) {
          minDiff = diff;
          closest = usdPoints[i];
        } else if (diff > minDiff) {
          break;
        }
      }
      return Number(closest.price) || latestUsd;
    };

    // Default fallback cross rates for forex currencies
    const defaultForexCross = {
      eur: 1.0929,
      try: 0.02057,
      aed: 0.2723,
      gbp: 1.2788,
      chf: 1.1561,
      cad: 0.7299,
      aud: 0.6579,
      cny: 0.1393,
    };

    // For any forex targets in queryTargets, construct full 24h series from USD points multiplied by forex cross rate at each point
    for (const fx of forexTargets) {
      if (queryTargets.includes(fx) && usdPoints.length > 0) {
        const fxHistory = grouped[fx] || [];
        const defaultCross = defaultForexCross[fx] || 0.02;

        const getCrossRateAtTime = (targetIso) => {
          if (!fxHistory || fxHistory.length === 0) return defaultCross;
          const targetMs = new Date(targetIso).getTime();
          let closest = fxHistory[0];
          let minDiff = Math.abs(new Date(closest.timestamp).getTime() - targetMs);
          for (let i = 1; i < fxHistory.length; i++) {
            const diff = Math.abs(new Date(fxHistory[i].timestamp).getTime() - targetMs);
            if (diff < minDiff) {
              minDiff = diff;
              closest = fxHistory[i];
            }
          }
          const val = Number(closest.price);
          return val > 0 ? (val < 500 ? val : (latestUsd > 0 ? val / latestUsd : defaultCross)) : defaultCross;
        };

        grouped[fx] = usdPoints.map((u) => {
          const cross = getCrossRateAtTime(u.timestamp);
          return {
            price: Math.round(u.price * cross),
            timestamp: u.timestamp,
            usd_cross_rate: cross,
            usd_price: u.price,
          };
        });
      }
    }

    // Downsample each target to max 45 points evenly spaced
    const returnKeys = targetAsset ? [targetAsset] : allTargets;
    const maxPoints = 45;
    for (const key of returnKeys) {
      const arr = grouped[key] || [];
      if (arr.length <= maxPoints) {
        result[key] = arr;
      } else {
        const sampled = [];
        const step = (arr.length - 1) / (maxPoints - 1);
        for (let i = 0; i < maxPoints; i++) {
          const idx = Math.min(Math.round(i * step), arr.length - 1);
          sampled.push(arr[idx]);
        }
        result[key] = sampled;
      }
    }

    return result;
  } catch (e) {
    console.error("D1 dbGet24hSparklines error:", e);
    return result;
  }
}

/**
 * Retrieve historical price benchmarks at 24h, 7d, and 30d ago
 * Used for computing periodic portfolio performance (returns over 24h, 7d, 30d).
 * @param {object} env
 * @returns {Promise<{
 *   '24h': Record<string, { price: number, timestamp: string, isExact: boolean }>,
 *   '7d': Record<string, { price: number, timestamp: string, isExact: boolean }>,
 *   '30d': Record<string, { price: number, timestamp: string, isExact: boolean }>
 * }>}
 */
export async function dbGetHistoricalBenchmarks(env) {
  const result = {
    '24h': {},
    '7d': {},
    '30d': {},
  };
  if (!env || !env.DB) return result;
  await ensureD1Tables(env);

  const targets = [
    'usd', 'ons_gold', 'ons_silver', 'gold_18k', 'mesghal', 'full_coin', 'quarter_coin',
    'eur', 'try', 'aed', 'gbp', 'chf', 'cad', 'aud', 'cny'
  ];
  const nowMs = Date.now();
  const periods = [
    { key: '24h', targetIso: new Date(nowMs - 24 * 3600 * 1000).toISOString() },
    { key: '7d',  targetIso: new Date(nowMs - 7 * 24 * 3600 * 1000).toISOString() },
    { key: '30d', targetIso: new Date(nowMs - 30 * 24 * 3600 * 1000).toISOString() },
  ];

  const fxFallbacks = {
    eur: 1.0929,
    try: 0.02985,
    aed: 0.2723,
    gbp: 1.2788,
    chf: 1.1561,
    cad: 0.7299,
    aud: 0.6579,
    cny: 0.1393,
  };

  try {
    for (const period of periods) {
      for (const asset of targets) {
        // Query the latest recorded price before or at targetIso
        const row = await env.DB.prepare(`
          SELECT price, timestamp
          FROM price_history
          WHERE price_type = ? AND timestamp <= ?
          ORDER BY timestamp DESC
          LIMIT 1
        `).bind(asset, period.targetIso).first();

        if (row && row.price > 0) {
          result[period.key][asset] = {
            price: Number(row.price),
            timestamp: row.timestamp,
            isExact: true,
          };
        } else {
          // Fallback to earliest recorded price if period is older than database inception
          const earliest = await env.DB.prepare(`
            SELECT price, timestamp
            FROM price_history
            WHERE price_type = ?
            ORDER BY timestamp ASC
            LIMIT 1
          `).bind(asset).first();

          if (earliest && earliest.price > 0) {
            result[period.key][asset] = {
              price: Number(earliest.price),
              timestamp: earliest.timestamp,
              isExact: false,
            };
          } else if (fxFallbacks[asset]) {
            result[period.key][asset] = {
              price: fxFallbacks[asset],
              timestamp: period.targetIso,
              isExact: false,
            };
          }
        }
      }
    }

    return result;
  } catch (e) {
    console.error("D1 dbGetHistoricalBenchmarks error:", e);
    return result;
  }
}


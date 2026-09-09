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
      fetch_interval_sec INTEGER DEFAULT 60,
      is_active INTEGER DEFAULT 1,
      is_primary INTEGER DEFAULT 0,
      last_price REAL DEFAULT 0,
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

    // Seed default price sources if table is empty
    try {
      const existingSources = await env.DB.prepare("SELECT COUNT(*) AS total FROM price_sources").first();
      if (!existingSources || existingSources.total === 0) {
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

        const now = new Date().toISOString();
        const seedInserts = [
          { sql: `INSERT OR IGNORE INTO price_sources (id, name, price_type, source_type, endpoint, regex, json_path, fetch_interval_sec, is_active, is_primary, last_price, last_fetched, created_at, updated_at) VALUES ('src_def_usd', 'دلار تهران سبزه میدان', 'usd', ?, ?, '', ?, 60, 1, 1, 0, '', ?, ?)`, binds: [usdType, usdEndpoint, usdJsonPath, now, now] },
          { sql: `INSERT OR IGNORE INTO price_sources (id, name, price_type, source_type, endpoint, regex, json_path, fetch_interval_sec, is_active, is_primary, last_price, last_fetched, created_at, updated_at) VALUES ('src_def_gold_18k', 'طلا ۱۸ عیار (زرما)', 'gold_18k', 'telegram', 'zarmagoldd', '', '', 60, 1, 1, 0, '', ?, ?)`, binds: [now, now] },
          { sql: `INSERT OR IGNORE INTO price_sources (id, name, price_type, source_type, endpoint, regex, json_path, fetch_interval_sec, is_active, is_primary, last_price, last_fetched, created_at, updated_at) VALUES ('src_def_full_coin', 'سکه تمام بهار آزادی (زرما)', 'full_coin', 'telegram', 'zarmagoldd', '', '', 60, 1, 1, 0, '', ?, ?)`, binds: [now, now] },
          { sql: `INSERT OR IGNORE INTO price_sources (id, name, price_type, source_type, endpoint, regex, json_path, fetch_interval_sec, is_active, is_primary, last_price, last_fetched, created_at, updated_at) VALUES ('src_def_half_coin', 'نیم سکه بهار آزادی (زرما)', 'half_coin', 'telegram', 'zarmagoldd', '', '', 60, 1, 1, 0, '', ?, ?)`, binds: [now, now] },
          { sql: `INSERT OR IGNORE INTO price_sources (id, name, price_type, source_type, endpoint, regex, json_path, fetch_interval_sec, is_active, is_primary, last_price, last_fetched, created_at, updated_at) VALUES ('src_def_quarter_coin', 'ربع سکه بهار آزادی (زرما)', 'quarter_coin', 'telegram', 'zarmagoldd', '', '', 60, 1, 1, 0, '', ?, ?)`, binds: [now, now] },
          { sql: `INSERT OR IGNORE INTO price_sources (id, name, price_type, source_type, endpoint, regex, json_path, fetch_interval_sec, is_active, is_primary, last_price, last_fetched, created_at, updated_at) VALUES ('src_def_mesghal', 'مثقال طلا ۱۷ عیار (زرما)', 'mesghal', 'telegram', 'zarmagoldd', '', '', 60, 1, 1, 0, '', ?, ?)`, binds: [now, now] },
          { sql: `INSERT OR IGNORE INTO price_sources (id, name, price_type, source_type, endpoint, regex, json_path, fetch_interval_sec, is_active, is_primary, last_price, last_fetched, created_at, updated_at) VALUES ('src_def_ons_gold', 'انس طلا جهانی (XAU)', 'ons_gold', 'api_url', 'https://api.gold-api.com/price/XAU', '', 'price', 60, 1, 1, 0, '', ?, ?)`, binds: [now, now] },
          { sql: `INSERT OR IGNORE INTO price_sources (id, name, price_type, source_type, endpoint, regex, json_path, fetch_interval_sec, is_active, is_primary, last_price, last_fetched, created_at, updated_at) VALUES ('src_def_ons_silver', 'انس نقره جهانی (XAG)', 'ons_silver', 'api_url', 'https://api.gold-api.com/price/XAG', '', 'price', 60, 1, 1, 0, '', ?, ?)`, binds: [now, now] },
        ];

        for (const item of seedInserts) {
          await env.DB.prepare(item.sql).bind(...item.binds).run();
        }
      } else {
        // Ensure global gold & silver sources are seeded even if other sources exist
        const nowIso = new Date().toISOString();
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
               endpoint, regex, json_path AS jsonPath,
               fetch_interval_sec AS fetchIntervalSec,
               is_active AS isActive, is_primary AS isPrimary,
               last_price AS lastPrice, last_fetched AS lastFetched,
               created_at AS createdAt, updated_at AS updatedAt
        FROM price_sources
        ORDER BY price_type ASC, is_primary DESC, created_at ASC
      `).all();

      if (Array.isArray(results) && results.length > 0) {
        const mapped = results.map(row => ({
          ...row,
          channelUsername: row.sourceType === "telegram" ? row.endpoint : "",
          apiUrl: row.sourceType === "api_url" ? row.endpoint : "",
          regexPattern: row.regex || "",
          fetchIntervalMinutes: Math.round((row.fetchIntervalSec || 300) / 60),
        }));

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
               endpoint, regex, json_path AS jsonPath,
               fetch_interval_sec AS fetchIntervalSec,
               is_active AS isActive, is_primary AS isPrimary,
               last_price AS lastPrice, last_fetched AS lastFetched,
               created_at AS createdAt, updated_at AS updatedAt
        FROM price_sources
        WHERE id = ?
      `).bind(id).first();
      if (!row) return null;
      return {
        ...row,
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
  const fetchIntervalSec = parseInt(data.fetchIntervalSec, 10) > 0
    ? parseInt(data.fetchIntervalSec, 10)
    : (parseInt(data.fetchIntervalMinutes, 10) > 0 ? parseInt(data.fetchIntervalMinutes, 10) * 60 : 300);
  const isActive = data.isActive !== undefined ? (data.isActive ? 1 : 0) : 1;
  let isPrimary = data.isPrimary !== undefined ? (data.isPrimary ? 1 : 0) : 0;

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
        id, name, price_type, source_type, endpoint, regex, json_path,
        fetch_interval_sec, is_active, is_primary, last_price, last_fetched,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        price_type = excluded.price_type,
        source_type = excluded.source_type,
        endpoint = excluded.endpoint,
        regex = excluded.regex,
        json_path = excluded.json_path,
        fetch_interval_sec = excluded.fetch_interval_sec,
        is_active = excluded.is_active,
        is_primary = excluded.is_primary,
        updated_at = excluded.updated_at
    `).bind(
      id,
      name,
      priceType,
      sourceType,
      endpoint,
      regex,
      jsonPath,
      fetchIntervalSec,
      isActive,
      isPrimary,
      data.lastPrice !== undefined ? Number(data.lastPrice) : 0,
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
 */
export async function dbUpdateSourceLastPrice(env, id, lastPrice, lastFetched = null) {
  if (!id || !env) return;
  const isoTime = lastFetched || new Date().toISOString();
  const priceNum = Number(lastPrice) || 0;

  if (env.DB) {
    try {
      await env.DB.prepare(`
        UPDATE price_sources
        SET last_price = ?, last_fetched = ?, updated_at = ?
        WHERE id = ?
      `).bind(priceNum, isoTime, new Date().toISOString(), id).run();
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
 * Retrieve downsampled 24h price history sparklines for main gold & coin types
 * @param {object} env
 * @returns {Promise<Record<string, Array<{price: number, timestamp: string}>>>}
 */
export async function dbGet24hSparklines(env) {
  if (!env || !env.DB) return {};
  await ensureD1Tables(env);

  const targets = ['usd', 'gold_18k', 'mesghal', 'full_coin', 'half_coin', 'quarter_coin'];
  const result = {
    usd: [],
    gold_18k: [],
    mesghal: [],
    full_coin: [],
    half_coin: [],
    quarter_coin: [],
  };

  try {
    const sinceIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    // Select from price_history for past 24h, filtering to primary sources where defined to avoid multi-source jitter
    const query = `
      SELECT ph.price_type AS priceType, ph.price, ph.timestamp
      FROM price_history ph
      WHERE ph.timestamp >= ?
        AND ph.price_type IN ('usd', 'gold_18k', 'mesghal', 'full_coin', 'half_coin', 'quarter_coin')
        AND (
          ph.source_id IN (SELECT id FROM price_sources WHERE is_primary = 1)
          OR NOT EXISTS (SELECT 1 FROM price_sources ps WHERE ps.price_type = ph.price_type AND ps.is_primary = 1)
        )
      ORDER BY ph.timestamp ASC
    `;

    const { results } = await env.DB.prepare(query).bind(sinceIso).all();
    const rows = Array.isArray(results) ? results : [];

    // Group raw rows
    const grouped = {};
    for (const t of targets) grouped[t] = [];
    for (const row of rows) {
      if (grouped[row.priceType]) {
        grouped[row.priceType].push({
          price: Number(row.price),
          timestamp: row.timestamp,
        });
      }
    }

    // Downsample each target to max 45 points evenly spaced
    const maxPoints = 45;
    for (const key of targets) {
      const arr = grouped[key];
      if (arr.length <= maxPoints) {
        result[key] = arr;
      } else {
        const sampled = [];
        const step = (arr.length - 1) / (maxPoints - 1);
        for (let i = 0; i < maxPoints; i++) {
          const idx = Math.min(Math.round(i * step), arr.length - 1);
          sampled.push(arr[idx]);
        }
        sampled.push(arr[arr.length - 1]);
        result[key] = sampled;
      }
    }

    return result;
  } catch (e) {
    console.error("D1 dbGet24hSparklines error:", e);
    return result;
  }
}

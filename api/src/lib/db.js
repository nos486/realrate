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
      picture TEXT,
      role TEXT DEFAULT 'user',
      created_at TEXT NOT NULL,
      last_login TEXT NOT NULL,
      login_count INTEGER DEFAULT 1
    )`,
    `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
    `CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login DESC)`,
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
      updated_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS portfolio_holdings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
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
    `CREATE INDEX IF NOT EXISTS idx_portfolio_holdings_created ON portfolio_holdings(created_at DESC)`,
  ];

  try {
    for (const sql of statements) {
      await env.DB.prepare(sql).run();
    }
    // Backward-compat: ensure current_price column exists
    try {
      await env.DB.prepare("ALTER TABLE portfolio_holdings ADD COLUMN current_price REAL DEFAULT 0").run();
    } catch (ignore) {}
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
      }
    } catch (e) {
      console.error("D1 dbUpsertUser error:", e);
    }
  }

  // Also sync with KV
  if (env && env.REALRATE_KV) {
    try {
      const userKey = `user:${userData.email}`;
      await env.REALRATE_KV.put(userKey, JSON.stringify(userData));

      let usersList = [];
      const listStr = await env.REALRATE_KV.get("users_list");
      if (listStr) usersList = JSON.parse(listStr);
      if (!Array.isArray(usersList)) usersList = [];

      const idx = usersList.findIndex(u => u.email === userData.email);
      const summaryItem = {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        picture: userData.picture,
        role: userData.role,
        createdAt: userData.createdAt,
        lastLogin: userData.lastLogin,
        loginCount: userData.loginCount,
      };
      if (idx >= 0) usersList[idx] = summaryItem;
      else usersList.unshift(summaryItem);
      await env.REALRATE_KV.put("users_list", JSON.stringify(usersList));
    } catch (e) {
      console.error("KV sync error in dbUpsertUser:", e);
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
        SELECT id, email, name, picture, role, created_at AS createdAt, last_login AS lastLogin, login_count AS loginCount
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

  if (env && env.REALRATE_KV) {
    try {
      const listStr = await env.REALRATE_KV.get("users_list");
      if (listStr) {
        const parsed = JSON.parse(listStr);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
  }

  return [];
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
 * Fetch all portfolio holdings for a user
 * @param {object} env
 * @param {string} userId
 * @returns {Promise<Array>}
 */
export async function dbGetPortfolioHoldings(env, userId) {
  if (!userId) return [];

  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      const { results } = await env.DB.prepare(`
        SELECT id, user_id AS userId, asset_id AS assetId, asset_name AS assetName,
               asset_type AS assetType, unit, amount, buy_price AS buyPrice,
               current_price AS currentPrice, buy_date AS buyDate, notes,
               created_at AS createdAt, updated_at AS updatedAt
        FROM portfolio_holdings
        WHERE user_id = ?
        ORDER BY created_at DESC
      `).bind(userId).all();
      if (Array.isArray(results)) {
        return results;
      }
    } catch (e) {
      console.error("D1 dbGetPortfolioHoldings error:", e);
    }
  }

  // Fallback to KV
  if (env && env.REALRATE_KV) {
    try {
      const dataStr = await env.REALRATE_KV.get(`portfolio:${userId}`);
      if (dataStr) {
        const parsed = JSON.parse(dataStr);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
  }

  return [];
}

/**
 * Add or update a portfolio holding for a user
 * @param {object} env
 * @param {object} item
 * @returns {Promise<object>}
 */
export async function dbAddPortfolioHolding(env, item) {
  const now = new Date().toISOString();
  const holding = {
    id: item.id || `h_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
    userId: item.userId,
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
        INSERT INTO portfolio_holdings (id, user_id, asset_id, asset_name, asset_type, unit, amount, buy_price, current_price, buy_date, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
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

  // Sync to KV
  if (env && env.REALRATE_KV) {
    try {
      let list = [];
      const listStr = await env.REALRATE_KV.get(`portfolio:${holding.userId}`);
      if (listStr) list = JSON.parse(listStr);
      if (!Array.isArray(list)) list = [];

      const idx = list.findIndex(h => h.id === holding.id);
      if (idx >= 0) list[idx] = holding;
      else list.unshift(holding);

      await env.REALRATE_KV.put(`portfolio:${holding.userId}`, JSON.stringify(list));
    } catch (e) {}
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

  // Sync to KV
  if (env && env.REALRATE_KV) {
    try {
      const listStr = await env.REALRATE_KV.get(`portfolio:${userId}`);
      if (listStr) {
        let list = JSON.parse(listStr);
        if (Array.isArray(list)) {
          list = list.filter(h => h.id !== id);
          await env.REALRATE_KV.put(`portfolio:${userId}`, JSON.stringify(list));
        }
      }
    } catch (e) {}
  }

  return true;
}

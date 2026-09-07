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
  ];

  try {
    for (const sql of statements) {
      await env.DB.prepare(sql).run();
    }
    // Backward-compat: ensure current_price and portfolio_id columns exist
    try {
      await env.DB.prepare("ALTER TABLE portfolio_holdings ADD COLUMN current_price REAL DEFAULT 0").run();
    } catch (ignore) {}
    try {
      await env.DB.prepare("ALTER TABLE portfolio_holdings ADD COLUMN portfolio_id TEXT").run();
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
               p.share_enabled AS shareEnabled, p.created_at AS createdAt, p.updated_at AS updatedAt,
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
          INSERT INTO portfolios (id, user_id, name, is_default, share_slug, share_password, share_enabled, created_at, updated_at)
          VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)
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
                 p.share_enabled AS shareEnabled, p.created_at AS createdAt, p.updated_at AS updatedAt,
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

  // Fallback to KV
  if (env && env.REALRATE_KV) {
    try {
      const pStr = await env.REALRATE_KV.get(`portfolios:${userId}`);
      if (pStr) {
        const parsed = JSON.parse(pStr);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      const def = [{
        id: `p_default_${userId}`,
        userId,
        name: 'پورتفوی اصلی',
        isDefault: 1,
        shareSlug: generateRandomSlug(8),
        shareEnabled: 0,
        sharePassword: '',
        itemCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }];
      await env.REALRATE_KV.put(`portfolios:${userId}`, JSON.stringify(def));
      return def;
    } catch (e) {}
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
               p.share_enabled AS shareEnabled, p.created_at AS createdAt, p.updated_at AS updatedAt
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
export async function dbCreatePortfolio(env, userId, { name }) {
  if (!userId) throw new Error("شناسه کاربر الزامی است.");
  const portfolioName = String(name || "").trim() || "پورتفوی جدید";
  const now = new Date().toISOString();
  const id = `p_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const shareSlug = generateRandomSlug(8);

  if (env && env.DB) {
    await ensureD1Tables(env);
    await env.DB.prepare(`
      INSERT INTO portfolios (id, user_id, name, is_default, share_slug, share_password, share_enabled, created_at, updated_at)
      VALUES (?, ?, ?, 0, ?, '', 0, ?, ?)
    `).bind(id, userId, portfolioName, shareSlug, now, now).run();
  }

  // Update KV
  if (env && env.REALRATE_KV) {
    try {
      const list = await dbGetUserPortfolios(env, userId);
      await env.REALRATE_KV.put(`portfolios:${userId}`, JSON.stringify(list));
    } catch (e) {}
  }

  return {
    id,
    userId,
    name: portfolioName,
    isDefault: 0,
    shareSlug,
    sharePassword: '',
    shareEnabled: 0,
    itemCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update portfolio name and share settings
 */
export async function dbUpdatePortfolio(env, portfolioId, userId, { name, shareSlug, sharePassword, shareEnabled }) {
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

    bindings.push(portfolioId, userId);
    await env.DB.prepare(`
      UPDATE portfolios
      SET ${updates.join(", ")}
      WHERE id = ? AND user_id = ?
    `).bind(...bindings).run();

    const updated = await env.DB.prepare(`
      SELECT p.id, p.user_id AS userId, p.name, p.is_default AS isDefault,
             p.share_slug AS shareSlug, p.share_password AS sharePassword,
             p.share_enabled AS shareEnabled, p.created_at AS createdAt, p.updated_at AS updatedAt,
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
               p.share_enabled AS shareEnabled,
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
      console.error("D1 dbGetPortfolioByShareSlug error:", e);
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

  // Fallback to KV
  if (env && env.REALRATE_KV) {
    try {
      const dataStr = await env.REALRATE_KV.get(`portfolio:${userId}`);
      if (dataStr) {
        const parsed = JSON.parse(dataStr);
        if (Array.isArray(parsed)) {
          if (portfolioId) {
            return parsed.filter(item => !item.portfolioId || item.portfolioId === portfolioId);
          }
          return parsed;
        }
      }
    } catch (e) {}
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
        INSERT INTO portfolio_holdings (id, user_id, portfolio_id, asset_id, asset_name, asset_type, unit, amount, buy_price, current_price, buy_date, notes, created_at, updated_at)
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


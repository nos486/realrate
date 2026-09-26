import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dbGetUsersPage, dbGetDailyGrowth, dbGetUserDetail } from '../../src/repositories/admin.repository.js';

/** D1 stub recording every query; `all` answers with the given rows per SQL pattern */
function recordingEnv(answers = []) {
  const queries = [];
  const DB = {
    prepare(sql) {
      const entry = { sql, args: [] };
      const stmt = {
        bind(...a) { entry.args = a; return stmt; },
        async run() { return { meta: { changes: 1 } }; },
        async first() { queries.push(entry); return /COUNT\(\*\) AS total/.test(sql) ? { total: 3 } : null; },
        async all() {
          queries.push(entry);
          const hit = answers.find(([re]) => re.test(sql));
          return { results: hit ? hit[1] : [] };
        },
      };
      return stmt;
    },
  };
  return { env: { DB }, queries };
}

describe('admin users list', () => {
  const NOW = Date.parse('2026-09-26T12:00:00Z');

  it('combines a quick filter, the search and the sort in one parameterized query', async () => {
    const { env, queries } = recordingEnv([[/SELECT\s+id, email/, [{ id: 'u1', emailVerified: 0, disabled: 1, googleLinked: 1, hasPassword: 0, shareEnabled: 0 }]]]);
    const { users, total } = await dbGetUsersPage(env, { q: '50%_off', filter: 'new', sort: 'createdAt', dir: 'asc', limit: 10, offset: 20, now: NOW });

    expect(total).toBe(3);
    expect(users[0]).toMatchObject({ emailVerified: false, disabled: true, googleLinked: true, hasPassword: false });
    const list = queries.find((q) => /LIMIT \? OFFSET \?/.test(q.sql));
    expect(list.sql).toMatch(/created_at >= \?/);
    expect(list.sql).toMatch(/ORDER BY created_at IS NULL, created_at ASC, id/);
    // cutoff 7 days back, then the escaped pattern for each searched column, then paging
    expect(list.args[0]).toBe('2026-09-19T12:00:00.000Z');
    expect(list.args.slice(1, 6)).toEqual(Array(5).fill('%50\\%\\_off%'));
    expect(list.args.slice(6)).toEqual([10, 20]);
  });

  it('filters users with and without end-to-end encryption', async () => {
    for (const [filter, clause] of [['noE2ee', 'id NOT IN (SELECT user_id FROM user_vaults)'], ['e2ee', 'id IN (SELECT user_id FROM user_vaults)']]) {
      const { env, queries } = recordingEnv([[/SELECT\s+id, email/, [{ id: 'u1', e2eeEnabled: 1 }]]]);
      const { users } = await dbGetUsersPage(env, { filter, now: NOW });
      const list = queries.find((q) => /LIMIT \? OFFSET \?/.test(q.sql));
      expect(list.sql).toContain(`WHERE ${clause}`);
      expect(users[0].e2eeEnabled).toBe(true);
    }
  });

  it('ignores unknown filters and sorts (nothing user-supplied reaches the SQL text)', async () => {
    const { env, queries } = recordingEnv();
    await dbGetUsersPage(env, { filter: 'x; DROP TABLE users', sort: 'id; --', dir: 'sideways', now: NOW });
    const list = queries.find((q) => /LIMIT \? OFFSET \?/.test(q.sql));
    // no filter clause (the only WHERE left is the encryption-flag column's own subquery)
    expect(list.sql).not.toMatch(/WHERE (?!v\.user_id)/);
    expect(list.sql).toMatch(/ORDER BY last_login IS NULL, last_login DESC, id/);
  });
});

describe('admin user detail', () => {
  function detailEnv({ vault, plain, vaultRows, e2eePortfolios }) {
    const DB = {
      prepare(sql) {
        const stmt = {
          bind() { return stmt; },
          async run() { return {}; },
          async first() {
            if (/FROM users WHERE id = \?/.test(sql)) return { id: 'u1', email: 'u1@example.com', emailVerified: 1, disabled: 0, googleLinked: 1, hasPassword: 0, shareEnabled: 0 };
            if (/is_e2ee = 1/.test(sql)) return { count: e2eePortfolios };
            if (/AS activeSessions/.test(sql)) return { ...plain, activeSessions: 1, vaultEnabled: vault ? 1 : 0, activeDays30: 3 };
            return null;
          },
          async all() { return { results: /FROM vault_records/.test(sql) ? vaultRows : [] }; },
        };
        return stmt;
      },
    };
    return { DB };
  }

  it('counts encrypted records apart from plaintext ones and flags plaintext left behind', async () => {
    const env = detailEnv({
      vault: true,
      plain: { portfolios: 2, holdings: 5, transactions: 0, loans: 0, cheques: 0, incomes: 1, recurringIncomes: 0 },
      vaultRows: [{ kind: 'income', count: 36 }, { kind: 'loan', count: 2 }],
      e2eePortfolios: 2,
    });
    const detail = await dbGetUserDetail(env, 'u1');
    expect(detail.usage.incomes).toBe(1);
    expect(detail.encrypted).toMatchObject({ incomes: 36, loans: 2, cheques: 0, portfolios: 2 });
    expect(detail.plaintextPending).toBe(1);
  });

  it('never flags plaintext data of an account without the vault', async () => {
    const env = detailEnv({
      vault: false,
      plain: { portfolios: 1, holdings: 0, transactions: 0, loans: 3, cheques: 1, incomes: 10, recurringIncomes: 1 },
      vaultRows: [],
      e2eePortfolios: 0,
    });
    const detail = await dbGetUserDetail(env, 'u1');
    expect(detail.vaultEnabled).toBe(false);
    expect(detail.plaintextPending).toBe(0);
    expect(detail.usage.loans).toBe(3);
  });
});

describe('admin growth series', () => {
  it('has every day of the window, oldest first, with zeros for quiet days', async () => {
    const { env } = recordingEnv([
      [/FROM users/, [{ day: '2026-09-25', count: 2 }]],
      [/FROM user_activity/, [{ day: '2026-09-26', count: 5 }, { day: '2026-09-20', count: 1 }]],
    ]);
    const series = await dbGetDailyGrowth(env, 7, { now: Date.parse('2026-09-26T08:00:00Z') });
    expect(series.map((d) => d.day)).toEqual([
      '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26',
    ]);
    expect(series.find((d) => d.day === '2026-09-25')).toEqual({ day: '2026-09-25', signups: 2, active: 0 });
    expect(series.at(-1)).toEqual({ day: '2026-09-26', signups: 0, active: 5 });
    expect(series[0].active).toBe(1);
  });
});

// ── Handlers ────────────────────────────────────────────────────────────────

vi.mock('../../src/lib/auth.js', () => ({
  getAuthenticatedUser: vi.fn(),
  isUserAdmin: (email) => email === 'admin@example.com',
}));

vi.mock('../../src/lib/email.js', () => ({
  isEmailConfigured: vi.fn(() => true),
  sendEmail: vi.fn(),
  verificationEmail: (url) => ({ subject: 'verify', html: url, text: url }),
  passwordResetEmail: (url) => ({ subject: 'reset', html: url, text: url }),
  accountExistsEmail: () => ({ subject: 'exists', html: '', text: '' }),
}));

vi.mock('../../src/repositories/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  dbGetUserAuthById: vi.fn(),
  dbGetUserDetail: vi.fn(async (env, id) => ({ id, email: `${id}@example.com` })),
  dbSetUserDisabled: vi.fn(),
  dbDeleteUserSessions: vi.fn(async () => 3),
  dbCreateAuthToken: vi.fn(async () => 'tok'),
}));

const { getAuthenticatedUser } = await import('../../src/lib/auth.js');
const { sendEmail } = await import('../../src/lib/email.js');
const repo = await import('../../src/repositories/index.js');
const { handleAdminBlockUser, handleAdminResendVerification, handleAdminSignOutUser } = await import('../../src/handlers/adminUserRoutes.js');

const post = (path, body) => new Request(`https://api.realrate.ir${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: 'https://realrate.ir' },
  body: JSON.stringify(body),
});

describe('admin user actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ userId: 'adm', email: 'admin@example.com', role: 'admin', token: 'admintok' });
  });

  it('refuses non-admins', async () => {
    getAuthenticatedUser.mockResolvedValue({ userId: 'u1', email: 'a@example.com', role: 'user' });
    await expect(handleAdminBlockUser(post('/api/admin/users/block', { userId: 'u2' }), {})).rejects.toMatchObject({ statusCode: 403 });
    expect(repo.dbSetUserDisabled).not.toHaveBeenCalled();
  });

  it('blocks a user and ends all their sessions', async () => {
    repo.dbGetUserAuthById.mockResolvedValue({ id: 'u2', email: 'u2@example.com' });
    const res = await handleAdminBlockUser(post('/api/admin/users/block', { userId: 'u2', blocked: true }), {});
    expect(res.status).toBe(200);
    expect(repo.dbSetUserDisabled).toHaveBeenCalledWith({}, 'u2', true);
    expect(repo.dbDeleteUserSessions).toHaveBeenCalledWith({}, 'u2');
    expect((await res.json()).endedSessions).toBe(3);
  });

  it('never blocks an admin account', async () => {
    repo.dbGetUserAuthById.mockResolvedValue({ id: 'adm2', email: 'admin@example.com' });
    await expect(handleAdminBlockUser(post('/api/admin/users/block', { userId: 'adm2', blocked: true }), {}))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(repo.dbSetUserDisabled).not.toHaveBeenCalled();
  });

  it('unblocking keeps sessions alone', async () => {
    repo.dbGetUserAuthById.mockResolvedValue({ id: 'u2', email: 'u2@example.com' });
    await handleAdminBlockUser(post('/api/admin/users/block', { userId: 'u2', blocked: false }), {});
    expect(repo.dbSetUserDisabled).toHaveBeenCalledWith({}, 'u2', false);
    expect(repo.dbDeleteUserSessions).not.toHaveBeenCalled();
  });

  it('signs a user out everywhere but keeps the admin’s own session', async () => {
    repo.dbGetUserAuthById.mockResolvedValue({ id: 'adm', email: 'admin@example.com' });
    await handleAdminSignOutUser(post('/api/admin/users/signout', { userId: 'adm' }), {});
    expect(repo.dbDeleteUserSessions).toHaveBeenCalledWith({}, 'adm', { exceptToken: 'admintok' });
  });

  it('resends verification only to unverified password accounts', async () => {
    repo.dbGetUserAuthById.mockResolvedValue({ id: 'u3', email: 'u3@example.com', emailVerified: true, passwordHash: 'h' });
    await expect(handleAdminResendVerification(post('/api/admin/users/resend-verification', { userId: 'u3' }), {}))
      .rejects.toMatchObject({ statusCode: 400 });

    repo.dbGetUserAuthById.mockResolvedValue({ id: 'u3', email: 'u3@example.com', emailVerified: false, passwordHash: 'h' });
    const res = await handleAdminResendVerification(post('/api/admin/users/resend-verification', { userId: 'u3' }), {});
    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledWith({}, expect.objectContaining({ to: 'u3@example.com' }));
  });
});

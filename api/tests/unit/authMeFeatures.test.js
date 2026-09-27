import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/auth.js', () => ({
  getAuthenticatedUser: vi.fn(),
  isUserAdmin: (email) => email === 'admin@example.com',
}));

vi.mock('../../src/repositories/index.js', () => ({
  dbUpsertUser: vi.fn(),
  dbSaveSession: vi.fn(),
  dbDeleteSession: vi.fn(),
  dbGetUserById: vi.fn(),
  dbGetUserAuthById: vi.fn(),
  dbGetUserAuthByEmail: vi.fn(),
  dbRecordUserActivity: vi.fn(),
}));

vi.mock('../../src/repositories/demo.repository.js', () => ({
  getDemoVaultPassphrase: vi.fn(() => 'demo-passphrase'),
  DEMO_EMAIL: 'demo@example.com',
}));

vi.mock('../../src/lib/maintenance.js', () => ({
  getMaintenance: vi.fn(async () => ({ enabled: false, message: '' })),
}));

import { getAuthenticatedUser } from '../../src/lib/auth.js';
import * as repo from '../../src/repositories/index.js';
import { handleGetMe } from '../../src/handlers/authRoutes.js';

describe('handleGetMe with feature flags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const request = new Request('https://api.realrate.ir/api/auth/me');
  const env = { ADMIN_EMAIL: 'admin@example.com' };

  it('returns authenticated: false when no user is logged in', async () => {
    getAuthenticatedUser.mockResolvedValue(null);

    const res = await handleGetMe(request, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authenticated).toBe(false);
    expect(body.user).toBeNull();
  });

  it('returns features: ["cheque_scan"] for admin user', async () => {
    const adminUser = {
      userId: 'admin_1',
      id: 'admin_1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
    };
    getAuthenticatedUser.mockResolvedValue(adminUser);
    repo.dbGetUserAuthById.mockResolvedValue({
      id: 'admin_1',
      emailVerified: true,
      passwordHash: 'hash',
    });

    const res = await handleGetMe(request, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authenticated).toBe(true);
    expect(body.user.role).toBe('admin');
    expect(body.user.isAdmin).toBe(true);
    expect(body.user.features).toContain('cheque_scan');
  });

  it('returns only the released features for a regular user', async () => {
    const regularUser = {
      userId: 'user_1',
      id: 'user_1',
      email: 'user@example.com',
      name: 'Normal User',
      role: 'user',
    };
    getAuthenticatedUser.mockResolvedValue(regularUser);
    repo.dbGetUserAuthById.mockResolvedValue({
      id: 'user_1',
      emailVerified: true,
      passwordHash: 'hash',
    });

    const res = await handleGetMe(request, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authenticated).toBe(true);
    expect(body.user.role).toBe('user');
    expect(body.user.isAdmin).toBe(false);
    expect(body.user.features).toEqual(['cheque_scan']);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FEATURES, isFeatureEnabled, enabledFeatures } from '../../src/config/features.js';
import { requireFeature } from '../../src/lib/features.js';
import { AppError } from '../../src/lib/AppError.js';

vi.mock('../../src/lib/auth.js', () => ({
  getAuthenticatedUser: vi.fn(),
  isUserAdmin: vi.fn(),
}));

const { getAuthenticatedUser } = await import('../../src/lib/auth.js');

describe('Feature Flags Configuration and Logic', () => {
  it('correctly defines cheque_scan in FEATURES', () => {
    expect(FEATURES.cheque_scan).toBeDefined();
    expect(FEATURES.cheque_scan.stage).toBe('beta');
    expect(FEATURES.cheque_scan.label).toBe('اسکن چک با هوش مصنوعی');
  });

  it('evaluates stage: beta only for admin users', () => {
    const adminUser = { role: 'admin', email: 'admin@example.com' };
    const regularUser = { role: 'user', email: 'user@example.com' };

    expect(isFeatureEnabled('cheque_scan', adminUser)).toBe(true);
    expect(isFeatureEnabled('cheque_scan', regularUser)).toBe(false);
    expect(isFeatureEnabled('cheque_scan', null)).toBe(false);
    expect(isFeatureEnabled('cheque_scan', undefined)).toBe(false);
  });

  it('evaluates stage: off, beta, and ga correctly', () => {
    // Temporarily test artificial stage definitions
    const originalChequeScan = { ...FEATURES.cheque_scan };

    // stage: off
    FEATURES.cheque_scan.stage = 'off';
    expect(isFeatureEnabled('cheque_scan', { role: 'admin' })).toBe(false);
    expect(isFeatureEnabled('cheque_scan', { role: 'user' })).toBe(false);

    // stage: ga
    FEATURES.cheque_scan.stage = 'ga';
    expect(isFeatureEnabled('cheque_scan', { role: 'admin' })).toBe(true);
    expect(isFeatureEnabled('cheque_scan', { role: 'user' })).toBe(true);
    expect(isFeatureEnabled('cheque_scan', null)).toBe(false);

    // Restore
    FEATURES.cheque_scan.stage = originalChequeScan.stage;
  });

  it('returns false for unknown keys', () => {
    expect(isFeatureEnabled('non_existent_feature', { role: 'admin' })).toBe(false);
    expect(isFeatureEnabled('unknown', { role: 'user' })).toBe(false);
    expect(isFeatureEnabled('', { role: 'admin' })).toBe(false);
  });

  it('returns list of enabled features for a user', () => {
    const admin = { role: 'admin' };
    const user = { role: 'user' };

    expect(enabledFeatures(admin)).toContain('cheque_scan');
    expect(enabledFeatures(user)).not.toContain('cheque_scan');
    expect(enabledFeatures(null)).toEqual([]);
  });
});

describe('requireFeature Server Guard', () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
  });

  const request = new Request('https://api.realrate.ir/api/cheques/scan', { method: 'POST' });
  const env = {};

  it('throws 404 AppError when user is unauthenticated', async () => {
    getAuthenticatedUser.mockResolvedValue(null);

    await expect(requireFeature(request, env, 'cheque_scan')).rejects.toThrowError(AppError);
    await expect(requireFeature(request, env, 'cheque_scan')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('throws 404 AppError when user is regular user (not admin)', async () => {
    getAuthenticatedUser.mockResolvedValue({ id: 'u1', role: 'user', email: 'user@example.com' });

    await expect(requireFeature(request, env, 'cheque_scan')).rejects.toThrowError(AppError);
    await expect(requireFeature(request, env, 'cheque_scan')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('passes and returns user when user is admin', async () => {
    const adminUser = { id: 'a1', role: 'admin', email: 'admin@example.com' };
    getAuthenticatedUser.mockResolvedValue(adminUser);

    const result = await requireFeature(request, env, 'cheque_scan');
    expect(result).toEqual(adminUser);
  });
});

/**
 * encryptionGate.test.js — Which writes need the account vault, and what a user without it gets
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/auth.js', () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock('../../src/repositories/vault.repository.js', () => ({
  dbHasUserVault: vi.fn(),
}));

const { getAuthenticatedUser } = await import('../../src/lib/auth.js');
const { dbHasUserVault } = await import('../../src/repositories/vault.repository.js');
const { encryptionRuleFor, enforceEncryptionRule } = await import('../../src/lib/encryptionGate.js');

describe('encryption rule of a request', () => {
  it.each([
    ['POST', '/api/portfolios', 'vault'],
    ['PUT', '/api/portfolios', 'vault'],
    ['POST', '/api/banks/custom', 'vault'],
    ['DELETE', '/api/vault', 'refused'],
    ['POST', '/api/vault/records/loan/l_1/restore', 'refused'],
  ])('%s %s → %s', (method, path, rule) => {
    expect(encryptionRuleFor(path, method)).toBe(rule);
  });

  it.each([
    ['DELETE', '/api/portfolios'],
    ['PUT', '/api/vault'],
    ['PUT', '/api/vault/records/income/inc_1'],
    ['PUT', '/api/user/home-layout'],
    ['POST', '/api/user/settings'],
    ['POST', '/api/cheques/scan'],
  ])('%s %s is not gated (deleting, the vault itself, what stores nothing financial)', (method, path) => {
    expect(encryptionRuleFor(path, method)).toBeNull();
  });
});

describe('enforcing the rule', () => {
  const request = new Request('https://api.realrate.ir/api/portfolios', { method: 'POST' });
  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ userId: 'u1' });
  });

  it('refuses a save of a user without encryption', async () => {
    vi.mocked(dbHasUserVault).mockResolvedValue(false);
    await expect(enforceEncryptionRule(request, {}, 'vault')).rejects.toMatchObject({ statusCode: 403, code: 'ENCRYPTION_REQUIRED' });
  });

  it('lets a save through with encryption on', async () => {
    vi.mocked(dbHasUserVault).mockResolvedValue(true);
    await expect(enforceEncryptionRule(request, {}, 'vault')).resolves.toBeUndefined();
  });

  it('never lets encryption be turned off', async () => {
    await expect(enforceEncryptionRule(request, {}, 'refused')).rejects.toMatchObject({ statusCode: 403, code: 'ENCRYPTION_MANDATORY' });
  });

  it('leaves signed-out requests to the handler (401)', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    await expect(enforceEncryptionRule(request, {}, 'vault')).resolves.toBeUndefined();
  });
});

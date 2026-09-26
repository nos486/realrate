import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/auth.js', () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock('../../src/repositories/vault.repository.js', () => ({
  dbHasUserVault: vi.fn(),
  rejectWhenVaultEnabled: vi.fn(),
}));

const { getAuthenticatedUser } = await import('../../src/lib/auth.js');
const { dbHasUserVault, rejectWhenVaultEnabled } = await import('../../src/repositories/vault.repository.js');
const { encryptionRuleFor, enforceEncryptionRule } = await import('../../src/lib/encryptionGate.js');

describe('encryption rule of a request', () => {
  it.each([
    ['POST', '/api/loans', 'plaintext'],
    ['PUT', '/api/loans/loan_1/installments/i_1', 'plaintext'],
    ['POST', '/api/loans/loan_1/extra-payments', 'plaintext'],
    ['POST', '/api/incomes', 'plaintext'],
    ['PUT', '/api/incomes/recurring/r_1', 'plaintext'],
    ['PUT', '/api/cheques/chq_1', 'plaintext'],
    ['POST', '/api/portfolios', 'vault'],
    ['PUT', '/api/portfolios', 'vault'],
    ['POST', '/api/portfolio', 'vault'],
    ['POST', '/api/portfolios/p_1/transactions', 'vault'],
    ['PUT', '/api/portfolio/p_1/transactions/tx_1', 'vault'],
    ['POST', '/api/banks/custom', 'vault'],
    ['DELETE', '/api/vault', 'refused'],
    ['POST', '/api/vault/records/loan/l_1/restore', 'refused'],
  ])('%s %s → %s', (method, path, rule) => {
    expect(encryptionRuleFor(path, method)).toBe(rule);
  });

  it.each([
    ['GET', '/api/loans'],
    ['DELETE', '/api/loans/loan_1'],
    ['DELETE', '/api/portfolios'],
    ['DELETE', '/api/cheques/chq_1'],
    ['PUT', '/api/vault'],
    ['PUT', '/api/vault/records/income/inc_1'],
    ['PUT', '/api/user/home-layout'],
    ['POST', '/api/user/settings'],
  ])('%s %s is not gated (reading, deleting, the vault itself)', (method, path) => {
    expect(encryptionRuleFor(path, method)).toBeNull();
  });
});

describe('enforcing the rule', () => {
  const request = new Request('https://api.realrate.ir/api/incomes', { method: 'POST' });
  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ userId: 'u1' });
    vi.mocked(rejectWhenVaultEnabled).mockResolvedValue(undefined);
  });

  it('refuses every save of a user without encryption', async () => {
    vi.mocked(dbHasUserVault).mockResolvedValue(false);
    for (const rule of ['plaintext', 'vault']) {
      await expect(enforceEncryptionRule(request, {}, rule)).rejects.toMatchObject({ statusCode: 403, code: 'ENCRYPTION_REQUIRED' });
    }
  });

  it('lets portfolio writes through with encryption on, never a plaintext record', async () => {
    vi.mocked(dbHasUserVault).mockResolvedValue(true);
    await expect(enforceEncryptionRule(request, {}, 'vault')).resolves.toBeUndefined();
    const stale = Object.assign(new Error('reload'), { statusCode: 409, code: 'VAULT_ENABLED' });
    vi.mocked(rejectWhenVaultEnabled).mockRejectedValue(stale);
    await expect(enforceEncryptionRule(request, {}, 'plaintext')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('leaves signed-out requests to the handler (401)', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    await expect(enforceEncryptionRule(request, {}, 'vault')).resolves.toBeUndefined();
  });
});

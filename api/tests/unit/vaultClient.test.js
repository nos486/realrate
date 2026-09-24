// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory stand-in for the vault endpoints
const server = { vault: null };
vi.mock('../../../web/src/shared/vault/vaultApi.js', () => ({
  getVault: vi.fn(async () => ({ success: true, vault: server.vault })),
  saveVault: vi.fn(async ({ salt, wrappedKey, previousWrappedKey }) => {
    if (server.vault && previousWrappedKey !== server.vault.wrappedKey) {
      throw Object.assign(new Error('conflict'), { status: 409 });
    }
    server.vault = { salt, wrappedKey, version: 1 };
    return { success: true, vault: server.vault };
  }),
}));

const e2ee = await import('../../../web/src/lib/e2ee.js');
const store = await import('../../../web/src/shared/vault/vaultStore.js');

describe('key wrapping helpers', () => {
  it('wraps and unwraps a raw key, and rejects the wrong wrapping key', async () => {
    const kek = await e2ee.importRawKey(e2ee.generateRawKey());
    const other = await e2ee.importRawKey(e2ee.generateRawKey());
    const raw = e2ee.generateRawKey();
    const wrapped = await e2ee.wrapRawKey(kek, raw);
    expect(wrapped.startsWith('enc:e2ee:v1:')).toBe(true);
    expect([...(await e2ee.unwrapRawKey(kek, wrapped))]).toEqual([...raw]);
    expect(await e2ee.unwrapRawKey(other, wrapped)).toBeNull();
  });

  it('round-trips a key through a URL-safe share-link token', () => {
    const raw = e2ee.generateRawKey();
    const token = e2ee.rawKeyToLinkToken(raw);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect([...e2ee.linkTokenToRawKey(token)]).toEqual([...raw]);
    expect(e2ee.linkTokenToRawKey('short')).toBeNull();
    expect(e2ee.linkTokenToRawKey('')).toBeNull();
  });

  it('a legacy passphrase key can be exported, wrapped and still decrypts old data', async () => {
    const salt = e2ee.generateE2eeSalt();
    const legacyKey = await e2ee.deriveE2eeKey('oldpass1', salt);
    const cipher = await e2ee.e2eeEncrypt(legacyKey, { amount: 700 });

    const extractable = await e2ee.deriveE2eeKey('oldpass1', salt, { extractable: true });
    const accountKey = await e2ee.importRawKey(e2ee.generateRawKey());
    const wrapped = await e2ee.wrapRawKey(accountKey, await e2ee.exportRawKey(extractable));
    const restored = await e2ee.importRawKey(await e2ee.unwrapRawKey(accountKey, wrapped));
    expect(await e2ee.e2eeDecrypt(restored, cipher)).toEqual({ amount: 700 });
  });
});

describe('account vault store', () => {
  beforeEach(() => {
    server.vault = null;
    store.resetVault();
    sessionStorage.clear();
  });

  it('creates, locks, unlocks and survives a reload of the same tab', async () => {
    await store.loadVault('u1');
    expect(store.getVaultState().status).toBe('off');

    await expect(store.createVault('short')).rejects.toThrow();
    await store.createVault('correct horse');
    expect(store.getVaultState().status).toBe('unlocked');
    const cipher = await store.encryptVaultRecord({ title: 'حقوق', amount: 1 });
    expect(JSON.stringify(server.vault)).not.toContain('correct horse');

    store.lockVault();
    expect(store.getVaultState().status).toBe('locked');
    await expect(store.encryptVaultRecord({})).rejects.toMatchObject({ code: 'VAULT_LOCKED' });
    expect(await store.unlockVault('wrong pass')).toBe(false);
    expect(await store.unlockVault('correct horse')).toBe(true);
    expect(await store.decryptVaultRecord(cipher)).toEqual({ title: 'حقوق', amount: 1 });

    // A reload (fresh module state) restores the unlocked session from sessionStorage
    const session = sessionStorage.getItem('rr_vault_session');
    store.resetVault();
    sessionStorage.setItem('rr_vault_session', session);
    await store.loadVault('u1');
    expect(store.getVaultState().status).toBe('unlocked');
    expect(await store.decryptVaultRecord(cipher)).toEqual({ title: 'حقوق', amount: 1 });

    // …but never for another user
    store.resetVault();
    sessionStorage.setItem('rr_vault_session', session);
    await store.loadVault('u2');
    expect(store.getVaultState().status).toBe('locked');
  });

  it('an API without vault support counts as vault off, other failures as unknown', async () => {
    const api = await import('../../../web/src/shared/vault/vaultApi.js');
    api.getVault.mockRejectedValueOnce(Object.assign(new Error('not found'), { status: 404 }));
    await store.loadVault('u1');
    expect(store.getVaultState().status).toBe('off');

    store.resetVault();
    api.getVault.mockRejectedValueOnce(Object.assign(new Error('offline'), { status: 0 }));
    await store.loadVault('u1');
    expect(store.getVaultState().status).toBe('error');
  });

  it('changing the passphrase keeps every record readable', async () => {
    await store.loadVault('u1');
    await store.createVault('first passphrase');
    const cipher = await store.encryptVaultRecord({ n: 42 });
    const portfolioKey = await store.createPortfolioKey();

    await expect(store.changeVaultPassphrase('nope nope', 'second passphrase')).rejects.toThrow();
    await store.changeVaultPassphrase('first passphrase', 'second passphrase');
    store.lockVault();
    expect(await store.unlockVault('first passphrase')).toBe(false);
    expect(await store.unlockVault('second passphrase')).toBe(true);
    expect(await store.decryptVaultRecord(cipher)).toEqual({ n: 42 });
    const key = await store.getPortfolioKey({ e2eeWrappedKey: portfolioKey.wrapped });
    expect(await e2ee.e2eeDecrypt(key, await e2ee.e2eeEncrypt(portfolioKey.key, { ok: true }))).toEqual({ ok: true });
  });
});

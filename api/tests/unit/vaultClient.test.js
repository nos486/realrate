// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory stand-in for the vault endpoints
const server = { vault: null };
vi.mock('../../../web/src/shared/vault/vaultApi.js', () => ({
  configureVaultApi: () => {},
  resetVaultData: vi.fn(async () => {
    server.vault = null;
    return { success: true };
  }),
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
const autoLock = await import('../../../web/src/shared/vault/autoLock.js');

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

  it('lockAll locks the vault, forgets the session key and tells every screen', async () => {
    await store.loadVault('u1');
    await store.createVault('correct horse');
    let fired = 0;
    window.addEventListener(store.LOCK_ALL_EVENT, () => { fired += 1; });

    store.lockAll();
    expect(store.getVaultState()).toMatchObject({ status: 'locked' });
    expect(sessionStorage.getItem('rr_vault_session')).toBeNull();
    expect(fired).toBe(1);
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

  it('a forgotten passphrase: reset forgets the key and asks for a new vault', async () => {
    await store.loadVault('u1');
    await store.createVault('longpassphrase');
    store.lockVault();
    expect(store.getVaultState().status).toBe('locked');
    await store.resetAccountVault({ password: 'account-pass' });
    const api = await import('../../../web/src/shared/vault/vaultApi.js');
    expect(api.resetVaultData).toHaveBeenCalledWith({ password: 'account-pass' });
    expect(store.getVaultState()).toMatchObject({ status: 'off', vault: null });
    expect(store.getVaultUnlockSecret()).toBeNull();
    // A new vault with a new passphrase, unlocked right away
    await store.createVault('another-passphrase');
    expect(store.isVaultUnlocked()).toBe(true);
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

describe('KDF cost (salts name their PBKDF2 rounds)', () => {
  beforeEach(() => {
    server.vault = null;
    store.resetVault();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('new salts carry 600k rounds; a bare (old) salt means 100k; a tampered cost is refused', async () => {
    const salt = e2ee.generateE2eeSalt();
    expect(salt).toMatch(/^pbkdf2\$600000\$/);
    expect(e2ee.parseE2eeSalt(salt).iterations).toBe(600000);
    expect(e2ee.isLegacyE2eeSalt(salt)).toBe(false);
    expect(e2ee.parseE2eeSalt('c2FsdHNhbHRzYWx0c2FsdA==')).toEqual({ iterations: 100000, saltBase64: 'c2FsdHNhbHRzYWx0c2FsdA==' });
    expect(() => e2ee.parseE2eeSalt('pbkdf2$99999$abc')).toThrow();
    expect(() => e2ee.parseE2eeSalt('pbkdf2$9999999$abc')).toThrow();
  });

  it('an old vault opens with its passphrase and is re-wrapped at the new cost, data key unchanged', async () => {
    // A vault as written before: bare salt (100k rounds)
    const oldSalt = 'c2FsdHNhbHRzYWx0c2FsdA==';
    const raw = e2ee.generateRawKey();
    const wrappedKey = await e2ee.wrapRawKey(await e2ee.deriveE2eeKey('correct horse', oldSalt), raw);
    server.vault = { salt: oldSalt, wrappedKey, version: 1 };
    const cipher = await e2ee.e2eeEncrypt(await e2ee.importRawKey(raw), { amount: 5 });

    await store.loadVault('u1');
    expect(await store.unlockVault('correct horse')).toBe(true);
    expect(server.vault.salt).toMatch(/^pbkdf2\$600000\$/);
    expect(server.vault.wrappedKey).not.toBe(wrappedKey);
    expect(await store.decryptVaultRecord(cipher)).toEqual({ amount: 5 });

    // The fingerprint secret saved before the re-wrap still opens it on this device
    const before = { userId: 'u1', wrappedKey, key: e2ee.bytesToBase64(raw) };
    store.lockVault();
    expect(await store.unlockVaultWithSecret(before)).toBe(true);

    // And the passphrase works at the new cost
    store.lockVault();
    expect(await store.unlockVault('correct horse')).toBe(true);
  });
});

describe('auto-lock', () => {

  beforeEach(() => {
    server.vault = null;
    store.resetVault();
    sessionStorage.clear();
    localStorage.clear();
    vi.useRealTimers();
  });

  it('locks after the chosen idle time, and a stale kept session is not restored on reload', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    autoLock.setAutoLockMinutes(1);
    await store.loadVault('u1');
    await store.createVault('correct horse');
    expect(store.getVaultState().status).toBe('unlocked');
    const session = sessionStorage.getItem('rr_vault_session');

    vi.advanceTimersByTime(30_000);
    expect(store.getVaultState().status).toBe('unlocked');
    vi.advanceTimersByTime(31_000);
    expect(store.getVaultState().status).toBe('locked');
    expect(sessionStorage.getItem('rr_vault_session')).toBeNull();

    // A reload after the limit does not bring the key back
    store.resetVault();
    sessionStorage.setItem('rr_vault_session', session);
    await store.loadVault('u1');
    expect(store.getVaultState().status).toBe('locked');
    vi.useRealTimers();
  });

  it('"never" keeps it open; the device choice is remembered', () => {
    autoLock.setAutoLockMinutes(0);
    expect(autoLock.getAutoLockMinutes()).toBe(0);
    expect(autoLock.isPastAutoLock(1)).toBe(false);
    autoLock.setAutoLockMinutes(7);
    expect(autoLock.getAutoLockMinutes()).toBe(0);
    autoLock.setAutoLockMinutes(15);
    expect(autoLock.isPastAutoLock(Date.now() - 16 * 60_000)).toBe(true);
    expect(autoLock.isPastAutoLock(Date.now())).toBe(false);
    expect(autoLock.isPastAutoLock(undefined)).toBe(true);
  });
});

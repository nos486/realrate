// @vitest-environment happy-dom
/**
 * passkeyVault.test.js — On the website the vault opens with a passkey: the data key is kept
 * encrypted with the WebAuthn PRF output (never on the server), a dismissed prompt is a cancel,
 * a passkey without PRF is refused, and one that no longer gives the same output is turned off
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const vault = vi.hoisted(() => ({ secret: null, unlocked: null }));
vi.mock('../../../web/src/shared/native/nativeApp.js', () => ({ isNativeApp: () => false }));
vi.mock('../../../web/src/shared/native/nativePlugins.js', () => ({
  BiometricVault: new Proxy({}, { get: () => () => Promise.reject(new Error('native plugin used on the web')) }),
}));
vi.mock('../../../web/src/shared/vault/vaultStore.js', () => ({
  getVaultState: () => ({ userId: 'u1' }),
  getVaultUnlockSecret: () => vault.secret,
  unlockVaultWithSecret: async (secret) => {
    vault.unlocked = secret;
    return secret?.wrappedKey === 'wrapped-1';
  },
}));

import { PasskeyVault } from '../../../web/src/shared/vault/passkeyVault.js';
import {
  isBiometricAvailable,
  isBiometricEnabled,
  enableBiometric,
  disableBiometric,
  unlockWithBiometric,
  biometricLabel,
} from '../../../web/src/shared/native/biometricUnlock.js';

/** A fake authenticator: PRF(salt) = HMAC-SHA256(its secret, salt) */
function installAuthenticator({ prf = true, prfOnCreate = false } = {}) {
  const hmacSecret = crypto.getRandomValues(new Uint8Array(32));
  const auth = { create: [], get: [], fail: null, hmacSecret };
  const evalPrf = async (salt) => {
    const key = await crypto.subtle.importKey('raw', auth.hmacSecret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return crypto.subtle.sign('HMAC', key, salt);
  };
  const credentials = {
    async create({ publicKey }) {
      auth.create.push(publicKey);
      if (auth.fail) throw auth.fail;
      const first = prf && prfOnCreate ? await evalPrf(publicKey.extensions.prf.eval.first) : null;
      return {
        rawId: new Uint8Array([1, 2, 3, 4]).buffer,
        getClientExtensionResults: () => (prf ? { prf: { enabled: true, ...(first && { results: { first } }) } } : {}),
      };
    },
    async get({ publicKey }) {
      auth.get.push(publicKey);
      if (auth.fail) throw auth.fail;
      const first = prf ? await evalPrf(publicKey.extensions.prf.eval.first) : null;
      return { getClientExtensionResults: () => (first ? { prf: { results: { first } } } : {}) };
    },
  };
  Object.defineProperty(navigator, 'credentials', { value: credentials, configurable: true });
  window.PublicKeyCredential = function PublicKeyCredential() {};
  return auth;
}

const domError = (name) => Object.assign(new Error(name), { name });

beforeEach(() => {
  localStorage.clear();
  vault.secret = { userId: 'u1', wrappedKey: 'wrapped-1', key: 'a2V5LWJ5dGVz' };
  vault.unlocked = null;
});

describe('PasskeyVault', () => {
  it('keeps only ciphertext and gives the secret back after the passkey check', async () => {
    const auth = installAuthenticator();
    await PasskeyVault.store({ data: 'the-secret', userId: 'u1', title: 'RealRate' });
    const saved = localStorage.getItem('realrate_passkey_vault');
    expect(saved).not.toContain('the-secret');
    expect(auth.create[0].authenticatorSelection.userVerification).toBe('required');
    expect((await PasskeyVault.has()).stored).toBe(true);

    const { data } = await PasskeyVault.retrieve();
    expect(data).toBe('the-secret');
    // Only the passkey made for it is asked
    expect(auth.get.at(-1).allowCredentials).toHaveLength(1);
  });

  it('uses the PRF output given when the passkey is made', async () => {
    const auth = installAuthenticator({ prfOnCreate: true });
    await PasskeyVault.store({ data: 'x', userId: 'u1' });
    expect(auth.get).toHaveLength(0);
    expect((await PasskeyVault.retrieve()).data).toBe('x');
  });

  it('refuses a passkey without PRF and stores nothing', async () => {
    installAuthenticator({ prf: false });
    await expect(PasskeyVault.store({ data: 'x', userId: 'u1' })).rejects.toMatchObject({ code: 'UNSUPPORTED' });
    expect((await PasskeyVault.has()).stored).toBe(false);
  });

  it('turns a dismissed prompt into CANCELED and keeps the secret', async () => {
    const auth = installAuthenticator();
    await PasskeyVault.store({ data: 'x', userId: 'u1' });
    auth.fail = domError('NotAllowedError');
    await expect(PasskeyVault.retrieve()).rejects.toMatchObject({ code: 'CANCELED' });
    expect((await PasskeyVault.has()).stored).toBe(true);
  });

  it('forgets the secret when the passkey no longer opens it', async () => {
    const auth = installAuthenticator();
    await PasskeyVault.store({ data: 'x', userId: 'u1' });
    auth.hmacSecret = crypto.getRandomValues(new Uint8Array(32));
    await expect(PasskeyVault.retrieve()).rejects.toMatchObject({ code: 'INVALIDATED' });
    expect((await PasskeyVault.has()).stored).toBe(false);
  });

  it('is unavailable without WebAuthn', async () => {
    delete window.PublicKeyCredential;
    expect((await PasskeyVault.isAvailable()).available).toBe(false);
  });
});

describe('biometricUnlock on the website', () => {
  it('opens the vault with the passkey, for the account that set it up', async () => {
    installAuthenticator();
    expect(biometricLabel()).toBe('کلید عبور');
    expect(await isBiometricAvailable()).toBe(true);
    await enableBiometric();
    expect(await isBiometricEnabled('u1')).toBe(true);
    expect(await isBiometricEnabled('u2')).toBe(false);

    expect(await unlockWithBiometric()).toBe(true);
    expect(vault.unlocked).toEqual(vault.secret);
  });

  it('returns false when the prompt is closed', async () => {
    const auth = installAuthenticator();
    await enableBiometric();
    auth.fail = domError('NotAllowedError');
    expect(await unlockWithBiometric()).toBe(false);
    expect(await isBiometricEnabled('u1')).toBe(true);
  });

  it('turns itself off after the passphrase changed', async () => {
    installAuthenticator();
    vault.secret = { ...vault.secret, wrappedKey: 'wrapped-old' };
    await enableBiometric();
    await expect(unlockWithBiometric()).rejects.toThrow();
    expect(await isBiometricEnabled('u1')).toBe(false);
  });

  it('is forgotten on sign-out', async () => {
    installAuthenticator();
    await enableBiometric();
    await disableBiometric();
    expect(await isBiometricEnabled('u1')).toBe(false);
    expect(localStorage.getItem('realrate_passkey_vault')).toBeNull();
  });
});

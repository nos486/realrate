/**
 * vaultRouting.js — Decide where a feature's data lives for the signed-in account
 */

import { whenVaultReady, VaultLockedError } from './vaultStore.js';

/**
 * @returns {Promise<boolean>} true when the account vault is on and unlocked (use the encrypted
 *   store), false when it is off (use the plaintext REST API). Throws when the vault is locked or
 *   its state is unknown — data must never fall back to the plaintext API in that case.
 */
export async function shouldUseVault() {
  const state = await whenVaultReady();
  switch (state.status) {
    case 'unlocked':
      return true;
    case 'locked':
      throw new VaultLockedError();
    case 'error':
      throw new Error(state.error || 'وضعیت رمزنگاری حساب مشخص نیست؛ اتصال اینترنت را بررسی کنید.');
    default:
      return false;
  }
}

/**
 * Wrap a set of REST functions so each call goes to the vault implementation with the same name
 * whenever the account vault is on.
 * @template {Record<string, Function>} T
 * @param {T} rest
 * @param {Partial<T>} vault
 * @returns {T}
 */
export function routeThroughVault(rest, vault) {
  const routed = {};
  for (const [name, restFn] of Object.entries(rest)) {
    const vaultFn = vault[name];
    routed[name] = async (...args) => ((await shouldUseVault()) && vaultFn ? vaultFn(...args) : restFn(...args));
  }
  return routed;
}

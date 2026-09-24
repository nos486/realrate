// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  generateE2eeSalt,
  deriveE2eeKey,
  e2eeEncrypt,
  e2eeDecrypt,
  createE2eeVerifier,
  verifyE2eeKey,
  encryptHoldingForApi,
  decryptHoldingFromApi,
  isHoldingE2eeEncrypted,
  saveVaultPassphraseToSession,
  getVaultPassphraseFromSession,
  clearVaultPassphraseFromSession,
} from '../../../web/src/lib/e2ee.js';

const PREFIX = 'enc:e2ee:v1:';

function decodePayload(cipher) {
  return Uint8Array.from(atob(cipher.slice(PREFIX.length)), (c) => c.charCodeAt(0));
}

function encodePayload(bytes) {
  return PREFIX + btoa(String.fromCharCode(...bytes));
}

describe('E2EE client crypto (web/src/lib/e2ee.js)', () => {
  let salt;
  let key;
  let otherKey;

  beforeAll(async () => {
    salt = generateE2eeSalt();
    key = await deriveE2eeKey('correct horse battery staple', salt);
    otherKey = await deriveE2eeKey('wrong passphrase', salt);
  });

  describe('salt & key derivation', () => {
    it('generates a random 16-byte base64 salt', () => {
      const a = generateE2eeSalt();
      const b = generateE2eeSalt();
      expect(atob(a)).toHaveLength(16);
      expect(a).not.toBe(b);
    });

    it('rejects an empty passphrase', async () => {
      await expect(deriveE2eeKey('', salt)).rejects.toThrow();
    });

    it('derives a non-extractable AES-GCM key', () => {
      expect(key.algorithm.name).toBe('AES-GCM');
      expect(key.algorithm.length).toBe(256);
      expect(key.extractable).toBe(false);
    });

    it('derives the same key from the same passphrase and salt', async () => {
      const again = await deriveE2eeKey('correct horse battery staple', salt);
      const cipher = await e2eeEncrypt(key, { amount: 5 });
      expect(await e2eeDecrypt(again, cipher)).toEqual({ amount: 5 });
    });

    it('derives a different key for a different salt', async () => {
      const differentSalt = await deriveE2eeKey('correct horse battery staple', generateE2eeSalt());
      const cipher = await e2eeEncrypt(key, 'secret');
      expect(await e2eeDecrypt(differentSalt, cipher)).toBeNull();
    });
  });

  describe('encrypt / decrypt', () => {
    it('round-trips objects and strings, including Persian text', async () => {
      const obj = { amount: 12.5, notes: 'طلای ۱۸ عیار — خرید اول', tags: ['a', 'b'] };
      expect(await e2eeDecrypt(key, await e2eeEncrypt(key, obj))).toEqual(obj);
      expect(await e2eeDecrypt(key, await e2eeEncrypt(key, 'سلام دنیا'))).toBe('سلام دنیا');
    });

    it('produces the versioned prefix and never leaks plaintext', async () => {
      const cipher = await e2eeEncrypt(key, { notes: 'very-secret-note' });
      expect(cipher.startsWith(PREFIX)).toBe(true);
      expect(cipher).not.toContain('very-secret-note');
      expect(atob(cipher.slice(PREFIX.length))).not.toContain('very-secret-note');
    });

    it('uses a fresh random IV for every encryption', async () => {
      const a = await e2eeEncrypt(key, 'same input');
      const b = await e2eeEncrypt(key, 'same input');
      expect(a).not.toBe(b);
      expect(decodePayload(a).slice(0, 12)).not.toEqual(decodePayload(b).slice(0, 12));
    });

    it('returns null for the wrong key instead of throwing', async () => {
      const cipher = await e2eeEncrypt(key, { amount: 1 });
      expect(await e2eeDecrypt(otherKey, cipher)).toBeNull();
    });

    it('detects tampering (AES-GCM authentication)', async () => {
      const bytes = decodePayload(await e2eeEncrypt(key, { amount: 1 }));
      bytes[bytes.length - 1] ^= 0x01; // flip one bit of the auth tag
      expect(await e2eeDecrypt(key, encodePayload(bytes))).toBeNull();

      const body = decodePayload(await e2eeEncrypt(key, { amount: 1 }));
      body[14] ^= 0x80; // flip a ciphertext bit
      expect(await e2eeDecrypt(key, encodePayload(body))).toBeNull();
    });

    it('returns null for truncated or malformed payloads', async () => {
      expect(await e2eeDecrypt(key, encodePayload(new Uint8Array(12)))).toBeNull();
      expect(await e2eeDecrypt(key, `${PREFIX}%%%not-base64%%%`)).toBeNull();
    });

    it('passes through values that are not E2EE ciphertext', async () => {
      expect(await e2eeDecrypt(key, 'plain note')).toBe('plain note');
      expect(await e2eeDecrypt(key, '')).toBe('');
      expect(await e2eeDecrypt(key, null)).toBeNull();
    });
  });

  describe('vault verifier', () => {
    it('accepts the right key and rejects a wrong or missing verifier', async () => {
      const verifier = await createE2eeVerifier(key);
      expect(await verifyE2eeKey(key, verifier)).toBe(true);
      expect(await verifyE2eeKey(otherKey, verifier)).toBe(false);
      expect(await verifyE2eeKey(key, '')).toBe(false);
    });

    it('rejects a verifier that decrypts to something else', async () => {
      const forged = await e2eeEncrypt(key, 'NOT_THE_SIGNATURE');
      expect(await verifyE2eeKey(key, forged)).toBe(false);
    });
  });

  describe('holding encryption for the API', () => {
    const holding = {
      id: 'h1',
      portfolioId: 'p1',
      assetId: 'gold_18k',
      assetName: 'طلای ۱۸ عیار',
      amount: 12.5,
      buyPrice: 4200000,
      currentPrice: 4300000,
      buyDate: '1403/05/10',
      notes: 'یادداشت محرمانه',
      referenceAssetId: 'usd',
      referenceQuantity: 950,
    };

    it('moves every sensitive field into the ciphertext', async () => {
      const sent = await encryptHoldingForApi(key, holding);
      expect(sent).toMatchObject({
        id: 'h1',
        portfolioId: 'p1',
        assetId: 'gold_18k',
        amount: 0,
        buyPrice: 0,
        currentPrice: 0,
        buyDate: '',
        referenceAssetId: '',
        referenceQuantity: 0,
      });
      expect(isHoldingE2eeEncrypted(sent)).toBe(true);
      const serialized = JSON.stringify(sent);
      for (const secret of ['یادداشت محرمانه', '4200000', '1403/05/10', '950']) {
        expect(serialized).not.toContain(secret);
      }
    });

    it('accepts (key, holding) and (holding, key) argument orders', async () => {
      const a = await encryptHoldingForApi(key, holding);
      const b = await encryptHoldingForApi(holding, key);
      expect(await decryptHoldingFromApi(key, a)).toMatchObject({ amount: 12.5 });
      expect(await decryptHoldingFromApi(b, key)).toMatchObject({ amount: 12.5 });
    });

    it('refuses to encrypt without a key, whichever argument is missing', async () => {
      await expect(encryptHoldingForApi(null, holding)).rejects.toThrow();
      await expect(encryptHoldingForApi(undefined, holding)).rejects.toThrow();
      await expect(encryptHoldingForApi(holding, null)).rejects.toThrow();
      await expect(encryptHoldingForApi(holding, { not: 'a key' })).rejects.toThrow();
    });

    it('returns the holding unchanged when decrypting without a key', async () => {
      const sent = await encryptHoldingForApi(key, holding);
      expect(await decryptHoldingFromApi(null, sent)).toBe(sent);
      expect(await decryptHoldingFromApi(sent, null)).toBe(sent);
    });

    it('restores the original values on decrypt', async () => {
      const restored = await decryptHoldingFromApi(key, await encryptHoldingForApi(key, holding));
      expect(restored).toMatchObject({
        amount: 12.5,
        buyPrice: 4200000,
        currentPrice: 4300000,
        buyDate: '1403/05/10',
        notes: 'یادداشت محرمانه',
        assetName: 'طلای ۱۸ عیار',
        referenceAssetId: 'usd',
        referenceQuantity: 950,
        isE2eeEncrypted: true,
      });
    });

    it('leaves the holding encrypted when the key is wrong', async () => {
      const sent = await encryptHoldingForApi(key, holding);
      const result = await decryptHoldingFromApi(otherKey, sent);
      expect(result.amount).toBe(0);
      expect(isHoldingE2eeEncrypted(result)).toBe(true);
      expect(result.isE2eeEncrypted).toBeUndefined();
    });

    it('passes plaintext holdings through untouched', async () => {
      expect(await decryptHoldingFromApi(key, holding)).toBe(holding);
      expect(isHoldingE2eeEncrypted(holding)).toBe(false);
      expect(isHoldingE2eeEncrypted(null)).toBe(false);
    });
  });

  describe('session passphrase cache', () => {
    beforeEach(() => sessionStorage.clear());

    it('stores, reads and clears the passphrase per portfolio', () => {
      saveVaultPassphraseToSession('p1', 'pass-1');
      saveVaultPassphraseToSession('p2', 'pass-2');
      expect(getVaultPassphraseFromSession('p1')).toBe('pass-1');
      expect(getVaultPassphraseFromSession('p2')).toBe('pass-2');

      clearVaultPassphraseFromSession('p1');
      expect(getVaultPassphraseFromSession('p1')).toBeNull();
      expect(getVaultPassphraseFromSession('p2')).toBe('pass-2');
    });
  });
});

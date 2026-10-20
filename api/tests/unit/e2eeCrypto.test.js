// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import {
  generateE2eeSalt,
  deriveE2eeKey,
  e2eeEncrypt,
  e2eeDecrypt,
  e2eeDecryptMany,
  bytesToBase64,
  base64ToBytes,
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
    it('generates a random 16-byte base64 salt, naming its PBKDF2 cost', () => {
      const a = generateE2eeSalt();
      const b = generateE2eeSalt();
      expect(a).toMatch(/^pbkdf2\$600000\$/);
      expect(atob(a.split('$')[2])).toHaveLength(16);
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
});

describe('E2EE decrypt cache and batches', () => {
  it('opens a ciphertext once per key; each caller gets its own object', async () => {
    const salt = generateE2eeSalt();
    const key = await deriveE2eeKey('pw', salt);
    const cipher = await e2eeEncrypt(key, { a: 1 });
    const spy = vi.spyOn(globalThis.crypto.subtle, 'decrypt');
    const first = await e2eeDecrypt(key, cipher);
    const second = await e2eeDecrypt(key, cipher);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(second).toEqual({ a: 1 });
    first.a = 2;
    expect(second.a).toBe(1);
    expect(await e2eeDecrypt(key, cipher)).toEqual({ a: 1 });
    spy.mockRestore();
  });

  it('a wrong key never gets a cached answer, and failures are not kept', async () => {
    const key = await deriveE2eeKey('pw', generateE2eeSalt());
    const other = await deriveE2eeKey('other', generateE2eeSalt());
    const cipher = await e2eeEncrypt(key, { a: 1 });
    expect(await e2eeDecrypt(key, cipher)).toEqual({ a: 1 });
    expect(await e2eeDecrypt(other, cipher)).toBeNull();
  });

  it('decrypts many in order, in batches, across the batch size', async () => {
    const key = await deriveE2eeKey('pw', generateE2eeSalt());
    const values = Array.from({ length: 150 }, (_, i) => ({ i }));
    const payloads = await Promise.all(values.map((v) => e2eeEncrypt(key, v)));
    payloads.splice(70, 0, 'plain text');
    const out = await e2eeDecryptMany(key, payloads);
    expect(out).toHaveLength(151);
    expect(out[70]).toBe('plain text');
    expect(out.filter((v) => v && typeof v === 'object').map((v) => v.i)).toEqual(values.map((v) => v.i));
  });

  it('round-trips bytes through the base64 helpers, large inputs included', () => {
    const bytes = Uint8Array.from({ length: 100000 }, (_, i) => i % 251);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    expect(bytesToBase64(Uint8Array.from([1, 2, 3, 4]))).toBe(btoa('\x01\x02\x03\x04'));
  });
});

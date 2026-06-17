import { describe, it, expect } from 'vitest';
import { randomBytes } from 'crypto';
import { encrypt, decrypt, timingSafeEqualStr } from './crypto.js';

const key = randomBytes(32);

describe('AES-256-GCM token crypto', () => {
  it('round-trips a token value', () => {
    const plaintext = 'hydra.access.jwt.value.with.dots';
    expect(decrypt(encrypt(plaintext, key), key)).toBe(plaintext);
  });

  it('uses a fresh IV per call → different ciphertext for the same input', () => {
    const a = encrypt('same', key);
    const b = encrypt('same', key);
    expect(a.equals(b)).toBe(false);
  });

  it('is authenticated — tampered ciphertext fails to decrypt', () => {
    const blob = encrypt('secret', key);
    blob[blob.length - 1] ^= 0xff;
    expect(() => decrypt(blob, key)).toThrow();
  });

  it('fails with the wrong key', () => {
    const blob = encrypt('secret', key);
    expect(() => decrypt(blob, randomBytes(32))).toThrow();
  });

  it('rejects keys that are not 32 bytes', () => {
    expect(() => encrypt('x', randomBytes(16))).toThrow();
    expect(() => decrypt(encrypt('x', key), randomBytes(31))).toThrow();
  });
});

describe('timingSafeEqualStr', () => {
  it('returns true for equal strings', () => {
    expect(timingSafeEqualStr('abc123', 'abc123')).toBe(true);
  });
  it('returns false for different values of equal length', () => {
    expect(timingSafeEqualStr('abc123', 'abc124')).toBe(false);
  });
  it('returns false for different lengths', () => {
    expect(timingSafeEqualStr('abc', 'abcd')).toBe(false);
  });
});

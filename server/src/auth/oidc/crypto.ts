import { randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from 'crypto';

/**
 * Authenticated encryption for OIDC tokens at rest (FR-018a).
 *
 * AES-256-GCM with a random 96-bit IV per record. The stored blob layout is
 * `iv (12 bytes) ‖ authTag (16 bytes) ‖ ciphertext`. GCM is authenticated, so
 * tampering with any byte fails decryption (`final()` throws).
 *
 * Keys are passed in by the caller (sourced from config) so these functions
 * stay pure and unit-testable without loading the whole server config.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit nonce — the GCM-recommended size
const TAG_LENGTH = 16; // 128-bit auth tag
const KEY_LENGTH = 32; // AES-256

function assertKey(key: Buffer): void {
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Encryption key must be ${KEY_LENGTH} bytes (got ${key.length}).`);
  }
}

/** Encrypt a UTF-8 string, returning `iv‖tag‖ciphertext` as a Buffer (store as BLOB). */
export function encrypt(plaintext: string, key: Buffer): Buffer {
  assertKey(key);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

/** Decrypt a Buffer produced by {@link encrypt}. Throws if the key is wrong or the data is tampered. */
export function decrypt(blob: Buffer, key: Buffer): string {
  assertKey(key);
  if (blob.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error('Ciphertext too short to contain IV + auth tag.');
  }
  const iv = blob.subarray(0, IV_LENGTH);
  const authTag = blob.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = blob.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * Constant-time string comparison (FR-013 anti-forgery `state` check).
 * Length differences are revealed but the value is not leaked via timing.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

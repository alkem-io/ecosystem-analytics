import { describe, it, expect } from 'vitest';
import * as oidc from 'openid-client';
import { validateReturnTo, DEFAULT_RETURN_TO } from './login.js';
import { timingSafeEqualStr } from './crypto.js';

describe('validateReturnTo (open-redirect allow-list, FR-013)', () => {
  it('accepts clean EA-internal paths', () => {
    expect(validateReturnTo('/spaces')).toBe('/spaces');
    expect(validateReturnTo('/explorer?spaceId=abc')).toBe('/explorer?spaceId=abc');
    expect(validateReturnTo('/foo-bar/baz')).toBe('/foo-bar/baz');
  });

  it('falls back to the default for external / protocol-relative / malformed inputs', () => {
    const bad: unknown[] = [
      'https://evil.example',
      '//evil.example',
      'http://localhost',
      'evil',
      '/\\evil.example',
      '/api/auth/login',
      '',
      undefined,
      null,
      42,
    ];
    for (const value of bad) {
      expect(validateReturnTo(value)).toBe(DEFAULT_RETURN_TO);
    }
  });

  it('rejects paths containing control characters (header-injection guard)', () => {
    expect(validateReturnTo('/spaces\nHost: evil')).toBe(DEFAULT_RETURN_TO);
    expect(validateReturnTo('/spaces\r\nSet-Cookie: x')).toBe(DEFAULT_RETURN_TO);
  });

  it('rejects encoded-slash smuggling and Unicode slash look-alikes', () => {
    expect(validateReturnTo('/%2f%2fevil.example')).toBe(DEFAULT_RETURN_TO);
    expect(validateReturnTo('/%2F%2Fevil.example')).toBe(DEFAULT_RETURN_TO);
    expect(validateReturnTo('/%5cevil.example')).toBe(DEFAULT_RETURN_TO);
    expect(validateReturnTo('/／／evil.example')).toBe(DEFAULT_RETURN_TO); // U+FF0F fullwidth solidus
    expect(validateReturnTo('/⁄evil.example')).toBe(DEFAULT_RETURN_TO); // U+2044 fraction slash
  });

  it('rejects values that resolve to a different origin', () => {
    expect(validateReturnTo('https://evil.example/path')).toBe(DEFAULT_RETURN_TO);
    expect(validateReturnTo('/\t//evil.example')).toBe(DEFAULT_RETURN_TO);
  });
});

describe('anti-forgery material generation + timing-safe state compare', () => {
  it('generates distinct state values and a sufficiently long PKCE verifier', () => {
    const s1 = oidc.randomState();
    const s2 = oidc.randomState();
    const verifier = oidc.randomPKCECodeVerifier();
    expect(s1).not.toBe(s2);
    // 32 random bytes base64url-encoded → 43 chars
    expect(verifier.length).toBeGreaterThanOrEqual(43);
  });

  it('derives an S256 challenge that differs from the verifier', async () => {
    const verifier = oidc.randomPKCECodeVerifier();
    const challenge = await oidc.calculatePKCECodeChallenge(verifier);
    expect(challenge).not.toBe(verifier);
    expect(challenge.length).toBeGreaterThan(0);
  });

  it('compares state in constant time', () => {
    const state = oidc.randomState();
    expect(timingSafeEqualStr(state, state)).toBe(true);
    expect(timingSafeEqualStr(state, oidc.randomState())).toBe(false);
  });
});

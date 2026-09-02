import { describe, it, expect } from 'vitest';
import { isAllowedImageUrl } from './image-proxy.js';

describe('isAllowedImageUrl (SSRF host allow-list)', () => {
  it('allows the apex and subdomains over https', () => {
    expect(isAllowedImageUrl('https://alkem.io/x.png', 'alkem.io')).toBe(true);
    expect(isAllowedImageUrl('https://storage.alkem.io/a/b.png', 'alkem.io')).toBe(true);
  });

  it('rejects attacker-registrable look-alike suffixes', () => {
    expect(isAllowedImageUrl('https://notalkem.io/x', 'alkem.io')).toBe(false);
    expect(isAllowedImageUrl('https://myalkem.io/x', 'alkem.io')).toBe(false);
    expect(isAllowedImageUrl('https://alkem.io.evil.com/x', 'alkem.io')).toBe(false);
  });

  it('rejects non-https schemes even for a valid host', () => {
    expect(isAllowedImageUrl('http://alkem.io/x', 'alkem.io')).toBe(false);
    expect(isAllowedImageUrl('file:///etc/passwd', 'alkem.io')).toBe(false);
  });

  it('rejects malformed urls', () => {
    expect(isAllowedImageUrl('not a url', 'alkem.io')).toBe(false);
    expect(isAllowedImageUrl('', 'alkem.io')).toBe(false);
  });

  // A sibling deployment is NOT a subdomain: 'acc-alkem.io' does not end with
  // '.alkem.io'. Hard-coding the production host 403s every avatar when the BFF is
  // pointed at acceptance, which is exactly what happened in local dev.
  it('allows the CONFIGURED host, so acceptance works when the BFF points at it', () => {
    expect(isAllowedImageUrl('https://acc-alkem.io/api/private/rest/storage/document/x', 'acc-alkem.io')).toBe(true);
    expect(isAllowedImageUrl('https://storage.acc-alkem.io/a.png', 'acc-alkem.io')).toBe(true);
  });

  it('still rejects the production host when configured for acceptance, and vice versa', () => {
    expect(isAllowedImageUrl('https://alkem.io/x.png', 'acc-alkem.io')).toBe(false);
    expect(isAllowedImageUrl('https://acc-alkem.io/x.png', 'alkem.io')).toBe(false);
  });

  it('keeps the look-alike guard against the configured host', () => {
    expect(isAllowedImageUrl('https://notacc-alkem.io/x', 'acc-alkem.io')).toBe(false);
    expect(isAllowedImageUrl('https://acc-alkem.io.evil.com/x', 'acc-alkem.io')).toBe(false);
  });
});

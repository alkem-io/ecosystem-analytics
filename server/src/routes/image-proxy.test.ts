import { describe, it, expect } from 'vitest';
import { isAllowedImageUrl } from './image-proxy.js';

describe('isAllowedImageUrl (SSRF host allow-list)', () => {
  it('allows the apex and subdomains over https', () => {
    expect(isAllowedImageUrl('https://alkem.io/x.png')).toBe(true);
    expect(isAllowedImageUrl('https://storage.alkem.io/a/b.png')).toBe(true);
  });

  it('rejects attacker-registrable look-alike suffixes', () => {
    expect(isAllowedImageUrl('https://notalkem.io/x')).toBe(false);
    expect(isAllowedImageUrl('https://myalkem.io/x')).toBe(false);
    expect(isAllowedImageUrl('https://alkem.io.evil.com/x')).toBe(false);
  });

  it('rejects non-https schemes even for a valid host', () => {
    expect(isAllowedImageUrl('http://alkem.io/x')).toBe(false);
    expect(isAllowedImageUrl('file:///etc/passwd')).toBe(false);
  });

  it('rejects malformed urls', () => {
    expect(isAllowedImageUrl('not a url')).toBe(false);
    expect(isAllowedImageUrl('')).toBe(false);
  });
});

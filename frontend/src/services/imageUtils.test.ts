import { describe, it, expect } from 'vitest';
import { proxyImageUrl, nodeImageUrl, getNodeDisplayImage } from './imageUtils.js';

describe('proxyImageUrl — cookie-auth image proxying (no token in URL, FR-018)', () => {
  it('proxies private Alkemio storage URLs without a token query param', () => {
    const url = 'https://alkem.io/api/private/storage/document/x.png';
    const out = proxyImageUrl(url);
    expect(out).toBe(`/api/image-proxy?url=${encodeURIComponent(url)}`);
    expect(out).not.toContain('token=');
  });

  it('passes through non-private URLs unchanged', () => {
    expect(proxyImageUrl('https://cdn.example/a.png')).toBe('https://cdn.example/a.png');
  });

  it('returns null for empty input', () => {
    expect(proxyImageUrl(null)).toBeNull();
    expect(proxyImageUrl(undefined)).toBeNull();
  });
});

describe('nodeImageUrl preference + getNodeDisplayImage', () => {
  it('spaces prefer banner, then avatar', () => {
    expect(nodeImageUrl({ type: 'SPACE_L0', avatarUrl: 'a', bannerUrl: 'b' })).toBe('b');
    expect(nodeImageUrl({ type: 'SPACE_L0', avatarUrl: 'a', bannerUrl: null })).toBe('a');
  });

  it('users/orgs use the avatar', () => {
    expect(nodeImageUrl({ type: 'USER', avatarUrl: 'a', bannerUrl: 'b' })).toBe('a');
  });

  it('getNodeDisplayImage proxies a private space banner without a token', () => {
    const out = getNodeDisplayImage({
      type: 'SPACE_L0',
      avatarUrl: null,
      bannerUrl: 'https://alkem.io/api/private/storage/banner.png',
    });
    expect(out).toContain('/api/image-proxy?url=');
    expect(out).not.toContain('token=');
  });
});

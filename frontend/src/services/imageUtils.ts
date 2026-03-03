/**
 * Shared image utility functions — extracted from ForceGraph for reuse
 * across TreemapView, SunburstView, ChordView, etc.
 */

import { getToken } from './auth.js';

/** Proxy private Alkemio storage URLs through our auth endpoint */
export function proxyImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.includes('/api/private/')) {
    const token = getToken();
    return `/api/image-proxy?url=${encodeURIComponent(url)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
  }
  return url;
}

/** Pick the best image URL for a node: spaces prefer bannerUrl, users/orgs prefer avatarUrl */
export function nodeImageUrl(node: { type: string; avatarUrl: string | null; bannerUrl: string | null }): string | null {
  if (node.type.startsWith('SPACE_')) {
    return node.bannerUrl || node.avatarUrl || null;
  }
  return node.avatarUrl || null;
}

/** Get a proxied display image for a typed node */
export function getNodeDisplayImage(node: { type: string; avatarUrl: string | null; bannerUrl: string | null }): string | null {
  return proxyImageUrl(nodeImageUrl(node));
}

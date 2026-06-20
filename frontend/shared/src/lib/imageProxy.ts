/**
 * Build an image URL for a node avatar/banner.
 *
 * Private Alkemio storage URLs (`/api/private/...`) are routed through the BFF
 * image-proxy, which authenticates via the httpOnly `ea_session` cookie — there
 * is no client-side token. Public URLs are returned untouched.
 */
export function proxyImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.includes('/api/private/')) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

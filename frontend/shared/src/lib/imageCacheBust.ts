/**
 * Per-user, persistent cache-bust token for image URLs.
 *
 * The BFF image-proxy serves avatars/banners with `Cache-Control: public, max-age=3600`,
 * and public visuals are cached per their origin's headers. A data refresh re-renders the
 * same URLs, so the browser answers every <img>/fetch from cache and a visual updated at
 * the source keeps showing the stale bytes for up to an hour.
 *
 * Bumping the token varies the URL, which is a different browser cache key, so the next
 * render re-requests the bytes.
 *
 * The token is *stable* between refreshes: it only moves when the user explicitly hits
 * refresh, and then keeps its new value from then on. That is what keeps normal renders,
 * zoom/pan and navigation on the browser cache — the force graph re-attaches node images
 * on every zoom (see `badImageCache.ts`), and a token that varied per render would make
 * every one of those a fresh network request.
 *
 * It is persisted per user (`MeResponse.userId`) in localStorage, so it survives page
 * reloads. Without persistence an in-memory token would reset to 0 on reload, rebuilding
 * the pre-refresh URLs and serving the stale cached bytes all over again.
 *
 * The param is ignored by the image-proxy (it only reads `url`) and by Alkemio storage.
 */

const STORAGE_PREFIX = 'ea:imageCacheBust:';

/** The user this token belongs to; null until `scopeImageCacheBustToUser` runs. */
let userId: string | null = null;
let token = 0;

function storageKey(id: string): string {
  return `${STORAGE_PREFIX}${id}`;
}

function readPersisted(id: string): number {
  try {
    const raw = localStorage.getItem(storageKey(id));
    const parsed = raw === null ? NaN : Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    // localStorage unavailable (private mode / disabled) — stay in memory.
    return 0;
  }
}

function persist(): void {
  if (userId === null) return;
  try {
    localStorage.setItem(storageKey(userId), String(token));
  } catch {
    // Non-fatal: the token still applies for this session, just not across reloads.
  }
}

/**
 * Bind the token to a user and restore their persisted value. Idempotent — re-binding
 * the same user is a no-op, so it is safe to call on every identity fetch. Switching
 * users loads that user's own token rather than inheriting the previous user's.
 */
export function scopeImageCacheBustToUser(id: string): void {
  if (userId === id) return;
  userId = id;
  token = readPersisted(id);
}

/**
 * Invalidate browser-cached images for the current user: every image URL built from now
 * on is unique, and stays at this new value until the next refresh.
 */
export function bumpImageCacheBust(): void {
  token += 1;
  persist();
}

/** The current token. 0 means "never refreshed" — URLs are left untouched. */
export function getImageCacheBust(): number {
  return token;
}

/**
 * Append the current cache-bust token to `url`, if one has been issued for this user.
 * Returns the URL unchanged while the token is 0, so a user who has never refreshed
 * gets plain, cacheable URLs.
 */
export function withImageCacheBust(url: string | null): string | null {
  if (!url || token === 0) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}_cb=${token}`;
}

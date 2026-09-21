/**
 * Up-to-two-letter initials for an avatar fallback.
 *
 * Extracted from `UserMenu` so the ecosystem map's organisation circles fall back the
 * same way the header avatar does — an organisation without a logo must still read as
 * itself (Constitution V).
 */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

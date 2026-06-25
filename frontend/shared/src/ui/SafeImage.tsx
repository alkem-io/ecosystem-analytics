import * as React from 'react';
import { isImageFailed, markImageFailed } from '../lib/badImageCache.js';

type SafeImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | null | undefined;
  /** Rendered when `src` is empty or has already failed to load this session. */
  fallback?: React.ReactNode;
  /** Full Alkemio URL of the entity this visual belongs to (for broken-visual reports). */
  entityUrl?: string | null;
  /** Display name of the entity this visual belongs to. */
  entityName?: string | null;
  /** Type of the entity this visual belongs to (e.g. NodeType value). */
  entityType?: string | null;
};

/**
 * `<img>` that degrades gracefully: if the source is empty, or previously failed to
 * load (tracked in the session-scoped {@link isImageFailed} cache), it renders the
 * `fallback` instead — and on first load error it records the failure (with the
 * owning Alkemio entity, when provided) so the same dead URL is never re-requested
 * elsewhere and the entity can be traced from the broken-visual report. Prevents the
 * console/network flood from stale external Alkemio visuals. See [[bad-image-cache]].
 */
export function SafeImage({
  src,
  fallback = null,
  entityUrl,
  entityName,
  entityType,
  onError,
  ...rest
}: SafeImageProps) {
  const [failed, setFailed] = React.useState(() => isImageFailed(src));

  // A changed src may be good again — re-evaluate against the cache.
  React.useEffect(() => {
    setFailed(isImageFailed(src));
  }, [src]);

  if (!src || failed) return <>{fallback}</>;

  return (
    <img
      src={src}
      onError={(e) => {
        markImageFailed(src, {
          entityUrl: entityUrl ?? null,
          displayName: entityName ?? null,
          entityType: entityType ?? null,
        });
        setFailed(true);
        onError?.(e);
      }}
      {...rest}
    />
  );
}

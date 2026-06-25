/**
 * Session-scoped cache of image URLs that have already failed to load, together with
 * the Alkemio entity each dead visual belongs to.
 *
 * Many Alkemio Space/avatar visuals point at external third-party URLs that are now
 * dead (404, DNS failure, bad TLS cert, connection refused). Without a memory of the
 * failures, components — especially the D3 force graph, which re-attaches node images
 * on every zoom/pan — re-request the same dead URL hundreds of times, flooding the
 * console and the network tab. Marking a URL failed once lets every render skip
 * straight to the placeholder fallback.
 *
 * Each failure also records the entity's full Alkemio URL (its profile page) so the
 * broken visual can be traced back to the Space/User/Organization that needs its image
 * fixed — surfaced both in the console (a `console.warn` per failure plus a
 * `window.__brokenVisuals()` table) and in the in-app report panel.
 *
 * The cache is intentionally in-memory only: a URL that was down may come back, so we
 * never persist failures across sessions/reloads.
 */

/** A recorded broken visual and the Alkemio entity it belongs to. */
export interface BrokenVisual {
  /** The image URL (proxied or raw) that failed to load. */
  imageUrl: string;
  /** Full Alkemio entity URL (profile page), if known. */
  entityUrl: string | null;
  /** Entity display name, if known. */
  displayName: string | null;
  /** Entity type (e.g. NodeType value), if known. */
  entityType: string | null;
}

/** Optional entity context attached to a failure. */
export type FailureContext = Omit<BrokenVisual, 'imageUrl'>;

const failedImages = new Map<string, BrokenVisual>();
const listeners = new Set<() => void>();

/** Stable snapshot for `getBrokenVisuals` — only re-created when the map changes, so
 *  `useSyncExternalStore` (and equivalent) see a referentially-stable value. */
let snapshot: BrokenVisual[] = [];

function emit(): void {
  snapshot = [...failedImages.values()];
  listeners.forEach((l) => l());
}

/**
 * Record that an image URL failed to load, optionally with the Alkemio entity context.
 * No-op for empty URLs. Logs a `console.warn` the first time a URL is seen. If a later
 * call supplies entity context that an earlier (contextless) call lacked, the record is
 * upgraded in place.
 */
export function markImageFailed(url: string | null | undefined, context?: FailureContext): void {
  if (!url) return;

  const existing = failedImages.get(url);
  if (existing) {
    // Upgrade a contextless record once real entity context arrives.
    if (!existing.entityUrl && context?.entityUrl) {
      failedImages.set(url, {
        imageUrl: url,
        entityUrl: context.entityUrl ?? null,
        displayName: context.displayName ?? existing.displayName,
        entityType: context.entityType ?? existing.entityType,
      });
      emit();
    }
    return;
  }

  const visual: BrokenVisual = {
    imageUrl: url,
    entityUrl: context?.entityUrl ?? null,
    displayName: context?.displayName ?? null,
    entityType: context?.entityType ?? null,
  };
  failedImages.set(url, visual);

  if (typeof console !== 'undefined') {
    console.warn(
      `Broken visual: ${visual.displayName ?? '(unknown entity)'}` +
        ` (${visual.entityType ?? '?'})\n` +
        `  entity: ${visual.entityUrl ?? '(unknown)'}\n` +
        `  image:  ${url}`,
    );
  }

  emit();
}

/** True when `url` previously failed to load this session — skip re-requesting it. */
export function isImageFailed(url: string | null | undefined): boolean {
  return !!url && failedImages.has(url);
}

/** All broken visuals recorded this session (referentially stable between changes). */
export function getBrokenVisuals(): BrokenVisual[] {
  return snapshot;
}

/**
 * Forget all recorded broken visuals so every URL gets a fresh chance to load.
 * Call this whenever the user clears/refreshes the data cache — a dead URL may have
 * been fixed at the source since it last failed.
 */
export function clearBrokenVisuals(): void {
  if (failedImages.size === 0) return;
  failedImages.clear();
  emit();
}

/** Subscribe to broken-visual changes. Returns an unsubscribe function. */
export function subscribeBrokenVisuals(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Dev convenience: `window.__brokenVisuals()` prints a table and returns the records.
if (typeof globalThis !== 'undefined') {
  (globalThis as unknown as { __brokenVisuals?: () => BrokenVisual[] }).__brokenVisuals = () => {
    const rows = getBrokenVisuals();
    if (typeof console !== 'undefined') {
      console.table(
        rows.map((r) => ({
          name: r.displayName ?? '',
          type: r.entityType ?? '',
          entityUrl: r.entityUrl ?? '',
          imageUrl: r.imageUrl,
        })),
      );
    }
    return rows;
  };
}

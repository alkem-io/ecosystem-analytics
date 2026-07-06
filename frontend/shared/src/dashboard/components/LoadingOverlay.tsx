import { Loader2 } from 'lucide-react';
import type { GraphProgress } from '@server/types/api.js';

/** Localised strings for {@link LoadingOverlay} (the tab owns i18n; the overlay is dumb). */
export interface LoadingOverlayLabels {
  /** Heading while fetching data, e.g. "Loading data…". */
  loading: string;
  /** Heading while building the network, e.g. "Building network…". */
  transforming: string;
  /** Progress-bar left label while fetching, e.g. "Fetching initiatives". */
  acquiring: string;
  /** Progress-bar left label while transforming, e.g. "Network". */
  building: string;
  /** Indeterminate hint shown before determinate progress is available. */
  hint: string;
}

interface LoadingOverlayProps {
  /** Live server-side generation progress, or null before the first poll returns. */
  progress: GraphProgress | null;
  labels: LoadingOverlayLabels;
  /**
   * Optional, already-localised line naming the space currently being fetched
   * (e.g. "Signalen"). Shown under the heading while acquiring.
   */
  currentSpace?: string | null;
  /**
   * When true, the overlay dims the content behind it (used over a tab that may
   * already show stale charts during a refresh). Defaults to a solid card only.
   */
  dim?: boolean;
}

/**
 * Centred loading card with a spinner, a step-aware heading, an optional
 * "currently loading <space>" line, and a determinate progress bar driven by
 * {@link GraphProgress}. Shared by the Dashboard and Graph tabs so both give the
 * user the same clear "data is loading" feedback after a cold-cache wait.
 */
export function LoadingOverlay({ progress, labels, currentSpace, dim }: LoadingOverlayProps) {
  const transforming = progress?.step === 'transforming';
  // A stale 'ready' snapshot from a previous run must not render as a full bar.
  const hasBar = !!progress && progress.step !== 'ready' && progress.spacesTotal > 0;
  const pct = hasBar
    ? Math.round((progress.spacesCompleted / Math.max(progress.spacesTotal, 1)) * 100)
    : 0;

  return (
    <div
      className={
        'pointer-events-none absolute inset-0 z-20 flex items-center justify-center' +
        (dim ? ' bg-background/70 backdrop-blur-[1px]' : '')
      }
    >
      <div className="flex w-72 max-w-[85%] flex-col items-center gap-3 rounded-xl border border-border bg-background/95 px-8 py-6 shadow-md">
        <Loader2 className="h-7 w-7 animate-spin text-primary" aria-hidden />
        <span className="text-sm font-medium text-foreground" role="status" aria-live="polite">
          {transforming ? labels.transforming : labels.loading}
        </span>

        {currentSpace && !transforming && (
          <span className="max-w-full truncate text-sm font-semibold text-primary" title={currentSpace}>
            {currentSpace}
          </span>
        )}

        {hasBar ? (
          <div className="w-full">
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>{transforming ? labels.building : labels.acquiring}</span>
              <span>
                {progress.spacesCompleted}/{progress.spacesTotal}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">{labels.hint}</span>
        )}
      </div>
    </div>
  );
}

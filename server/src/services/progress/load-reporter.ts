/**
 * Feature 025 — request-scoped progress for a graph load.
 *
 * `buildGraph` reports what it is doing through one of these; the streamed
 * `POST /api/graph/generate` writes every event to the browser as it happens
 * (contracts/api-graph-generate-stream.md), and the legacy per-user `GraphProgress`
 * poller (the Explorer) is fed by the same object through {@link toGraphProgress}.
 *
 * Being per REQUEST — not per user — is the point: two guests share the `__guest__`
 * principal, and the old per-user map made their indicators overwrite each other.
 */
import type { GraphProgress, LoadError, LoadEvent, LoadItemKey } from '../../types/api.js';

/** Progress-only events (never `result`/`error`, which the route emits itself). */
export type ProgressEvent = Extract<LoadEvent, { type: 'stage' | 'item' }>;

export class LoadReporter {
  private total = 0;
  private done = 0;
  private current: string | undefined;
  private phase: GraphProgress['step'] = 'acquiring';

  constructor(private readonly sink: (event: ProgressEvent) => void = () => {}) {}

  /** Core Spaces: `done` of `total` acquired; cached ones count as done at once. */
  loading(done: number, total: number, current?: string): void {
    this.total = total;
    this.done = done;
    this.current = current;
    this.phase = 'acquiring';
    this.sink({ type: 'stage', item: 'spaces', stage: 'loading', done, total, current });
  }

  /** Assembling/augmenting the dataset (transform, enrichment, metrics). */
  processing(item: LoadItemKey = 'spaces'): void {
    if (item === 'spaces') {
      this.current = undefined;
      this.done = this.total;
      this.phase = 'transforming';
    }
    this.sink({ type: 'stage', item, stage: 'processing' });
  }

  /** An optional item started (e.g. the GD layer). */
  itemLoading(item: LoadItemKey): void {
    this.sink({ type: 'stage', item, stage: 'loading' });
  }

  itemDone(item: LoadItemKey): void {
    if (item === 'spaces') this.phase = 'ready';
    this.sink({ type: 'item', item, stage: 'done' });
  }

  itemFailed(item: LoadItemKey, error: LoadError): void {
    this.sink({ type: 'item', item, stage: 'failed', error });
  }

  /** The legacy poller shape, for `GET /api/graph/progress`. */
  toGraphProgress(): GraphProgress {
    return {
      step: this.phase,
      spacesTotal: this.total,
      spacesCompleted: this.done,
      currentSpace: this.phase === 'acquiring' ? this.current : undefined,
    };
  }
}

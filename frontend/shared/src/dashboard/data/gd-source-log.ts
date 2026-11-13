/**
 * The GemeenteDelers load summary in the browser console: how many initiatives were
 * loaded via subspaces and via posts, and which (by nameID).
 *
 * The GD corpus is mid-migration from Knowledge-Base posts to one subspace per
 * initiative; the server reports each initiative once (from its subspace when it has
 * one) and tags every INITIATIVE node with its source. This makes that split visible to
 * whoever has DevTools open. LEGACY-GD-POSTS: once only subspaces remain, reduce this to
 * the subspace count (or delete it) along with the server's posts path.
 */
import { NodeType, type GraphDataset, type GdLayerSources } from '@server/types/graph.js';

export interface GdSourceSummary {
  total: number;
  viaSubspaces: string[];
  viaPosts: string[];
  /** Initiatives without a recorded source (a GD row cached before the field existed). */
  unknown: number;
  /** Absent when the server sent none (GD row cached before it existed). */
  reconciliation?: GdLayerSources;
}

/** The summary for a dataset, or null when it carries no GD initiatives. Pure. */
export function summariseGdSources(dataset: GraphDataset): GdSourceSummary | null {
  if (!dataset.gdLayer?.available) return null;
  const viaSubspaces: string[] = [];
  const viaPosts: string[] = [];
  let unknown = 0;
  for (const node of dataset.nodes) {
    if (node.type !== NodeType.INITIATIVE) continue;
    const name = node.nameId ?? node.id;
    if (node.initiativeSource === 'subspace') viaSubspaces.push(name);
    else if (node.initiativeSource === 'post') viaPosts.push(name);
    else unknown += 1;
  }
  const total = viaSubspaces.length + viaPosts.length + unknown;
  if (total === 0) return null;
  return {
    total,
    viaSubspaces,
    viaPosts,
    unknown,
    ...(dataset.gdLayer.sources ? { reconciliation: dataset.gdLayer.sources } : {}),
  };
}

type ConsoleLike = Pick<Console, 'group' | 'groupEnd' | 'info'>;

/** Write the summary to the console as one group. No-op without GD initiatives. */
export function logGdSources(dataset: GraphDataset, out: ConsoleLike = console): void {
  const summary = summariseGdSources(dataset);
  if (!summary) return;
  const { total, viaSubspaces, viaPosts, unknown, reconciliation } = summary;

  out.group(
    `[GemeenteDelers] ${total} initiatives loaded — ` +
      `${viaSubspaces.length} via subspaces, ${viaPosts.length} via posts`,
  );
  out.info(`via subspaces (${viaSubspaces.length}):`, viaSubspaces);
  out.info(`via posts (${viaPosts.length}):`, viaPosts);
  if (reconciliation) {
    out.info(
      `posts superseded by a subspace (${reconciliation.superseded.length}):`,
      reconciliation.superseded.map((s) => `${s.postNameId} → ${s.subspaceNameId} [${s.rule}]`),
    );
    out.info(
      `subspaces skipped as not an initiative (${reconciliation.skippedSubspaceNameIds.length}):`,
      reconciliation.skippedSubspaceNameIds,
    );
  }
  if (unknown > 0) {
    out.info(
      `${unknown} initiatives carry no source — they were cached before sources were recorded; ` +
        'a Refresh rebuilds them.',
    );
  }
  out.groupEnd();
}

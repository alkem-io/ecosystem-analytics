/**
 * Feature 025 — the ACTIVITY item, kept apart from the core relational data (FR-012a).
 *
 * Per L0 Space the raw activity-feed entries are cached in their own row
 * (`__activity__:<nameId>`, `cache.ttl_hours`), so:
 *  - the dashboards fetch activity only when the Initiatives tab first needs it
 *    (`POST /api/graph/activity`), once per viewer per day, and
 *  - the Explorer's JSON path folds the same rows into its graph (`includeActivity`).
 * Missing rows trigger the two chunked feed sweeps for THOSE Spaces only. A Space whose
 * feed cannot be read is reported as unavailable, never as an error for the whole item.
 */
import type { AuthContext } from '../auth/middleware.js';
import { createAlkemioSdk } from '../graphql/client.js';
import { getLogger } from '../logging/logger.js';
import { activityCacheId, getCacheEntry, setCacheEntry } from '../cache/cache-service.js';
import { fetchActivityEntries, type RawActivityEntry } from './acquire-service.js';
import {
  aggregateActivityCounts,
  aggregateActivityCountsByPeriod,
  aggregateSpaceActivityCounts,
  aggregateSpacePeriodCounts,
  computeActivityTiers,
} from '../transform/transformer.js';
import { ActivityTier } from '../types/graph.js';
import type { ActivityItem } from '../types/api.js';

/** An L0 Space as the activity service needs it: its cache key and its Alkemio id. */
export interface ActivitySpace {
  nameId: string;
  id: string;
}

interface ActivityRow {
  entries: RawActivityEntry[];
}

export interface ActivityEntries {
  entries: RawActivityEntry[];
  /** nameIds whose feed could not be fetched. */
  unavailable: string[];
}

/**
 * The activity entries for the given L0 Spaces — from the per-viewer rows where present,
 * fetched (and cached) for the rest. Entries are attributed to the L0 Space whose
 * subtree they belong to via `spaceIdToL0`, so subspace activity is cached under its
 * root and counted there.
 */
export async function loadActivityEntries(
  userId: string,
  auth: AuthContext,
  spaces: ActivitySpace[],
  spaceIdToL0: Map<string, string>,
  forceRefresh = false,
): Promise<ActivityEntries> {
  const entries: RawActivityEntry[] = [];
  const missing: ActivitySpace[] = [];
  for (const space of spaces) {
    const row = forceRefresh ? null : getCacheEntry(userId, activityCacheId(space.nameId));
    if (row) entries.push(...(JSON.parse(row.datasetJson) as ActivityRow).entries);
    else missing.push(space);
  }
  const unavailable: string[] = [];
  if (missing.length > 0) {
    const sdk = await createAlkemioSdk(auth);
    let fetched: RawActivityEntry[] = [];
    try {
      fetched = await fetchActivityEntries(
        sdk,
        missing.map((s) => s.id),
      );
    } catch (err) {
      getLogger().warn(`Activity feed unavailable: ${(err as Error).message}`, { context: 'Activity' });
      unavailable.push(...missing.map((s) => s.nameId));
      return { entries, unavailable };
    }
    const byL0 = new Map<string, RawActivityEntry[]>(missing.map((s) => [s.id, []]));
    for (const e of fetched) {
      const l0 = e.space?.id ? spaceIdToL0.get(e.space.id) : undefined;
      if (l0 && byL0.has(l0)) byL0.get(l0)!.push(e);
    }
    for (const space of missing) {
      const own = byL0.get(space.id) ?? [];
      setCacheEntry(userId, activityCacheId(space.nameId), JSON.stringify({ entries: own } satisfies ActivityRow));
      entries.push(...own);
    }
  }
  return { entries, unavailable };
}

/** The on-demand item: per Space (L0/L1/L2) the counts and tier the Initiatives table shows. */
export function toActivityItem(entries: RawActivityEntry[], unavailable: string[]): ActivityItem {
  const spaceCounts = aggregateSpaceActivityCounts(aggregateActivityCounts(entries));
  const spacePeriods = aggregateSpacePeriodCounts(aggregateActivityCountsByPeriod(entries));
  const tiers = computeActivityTiers(spaceCounts);
  const bySpace: ActivityItem['bySpace'] = {};
  for (const [spaceId, total] of spaceCounts) {
    const p = spacePeriods.get(spaceId);
    bySpace[spaceId] = {
      day: p?.day ?? 0,
      week: p?.week ?? 0,
      month: p?.month ?? 0,
      total,
      tier: tiers.get(spaceId) ?? ActivityTier.INACTIVE,
    };
  }
  return { bySpace, fetchedAt: new Date().toISOString(), unavailable };
}

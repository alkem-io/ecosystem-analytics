# Data Model: Unified Data Loading

**Feature**: 025-unified-data-loading | **Date**: 2026-09-21

Shapes are described in TypeScript for precision; types live in `server/src/types/api.ts` (shared with the frontends through `@server/types`) unless marked frontend-only.

## 1. Selection (frontend)

The identity of a load. Two selections are equal when their normalised form is equal.

```ts
interface Selection {
  app: 'vng' | 'govtech';
  /** Effective Spaces chosen in the panel (sorted, de-duplicated). */
  spaceIds: string[];
  /** Extra Spaces the load must cover but tabs may hide — VNG orchestrator candidates (R7). */
  widenedSpaceIds: string[];
  /** GemeenteDelers layer requested. */
  includeInitiatives: boolean;
}
// loadKey = `${app}|${[...spaceIds, ...widenedSpaceIds].sort().join(',')}|${includeInitiatives ? 1 : 0}`
```

Rules: a change of `loadKey` supersedes any in-flight load (edge case "selection changes mid-load"); `refreshNonce` is **not** part of the key — a refresh re-runs the same key with `forceRefresh: true`.

## 2. Load Plan and Progress

The shared model rendered by the header strip (FR-007/008) and produced by the loader from the stream and the extra-item requests.

```ts
type LoadItemKey =
  | 'spaces'              // core relational load (always)
  | 'gd-initiatives'      // when includeInitiatives (part of the generate stream)
  | 'activity'            // declared by Initiatives tab
  | 'organizations'       // declared by a details view (extended org profiles)
  | 'gemeente-locations'; // declared by Usage Explorer

type LoadStage = 'queued' | 'loading' | 'processing' | 'done' | 'failed';

interface LoadItem {
  key: LoadItemKey;
  /** Who asked: 'core', or the tab/option key that declared it (FR-008). */
  requester: 'core' | 'option:gd' | 'tab:initiatives' | 'tab:usage' | 'tab:details' | 'tab:explorer';
  stage: LoadStage;
  /** Count-based progress when a total is known (Spaces done of total). */
  done?: number;
  total?: number;
  /** nameId / displayName of the Space currently being fetched (loading stage only). */
  current?: string;
  /** Present when stage === 'failed'. User-safe message key + optional detail. */
  error?: { key: string; detail?: string };
  startedAt: number;
  finishedAt?: number;
}

interface LoadPlan {
  loadKey: string;
  items: LoadItem[];
  /** Derived: any item not done/failed. */
  active: boolean;
  /** Derived: the core item is done (tabs needing only core data may render). */
  coreReady: boolean;
}
```

State transitions per item: `queued → loading → processing → done` or `→ failed` from any active stage. A cache-only core load skips `loading` (goes `queued → processing → done`) — this is what makes SC-002a visible in the strip. A superseded plan is discarded whole; items never move backwards.

## 3. Progress events (server → browser, SSE)

Emitted by the request-scoped `LoadReporter` inside `buildGraph` (see contract `api-graph-generate-stream.md`).

```ts
type LoadEvent =
  | { type: 'stage'; item: LoadItemKey; stage: 'loading' | 'processing'; done?: number; total?: number; current?: string }
  | { type: 'item';  item: LoadItemKey; stage: 'done' | 'failed'; error?: { key: string; detail?: string } }
  | { type: 'result'; dataset: GraphDataset; dashboard?: DashboardCountsBundle }
  | { type: 'error'; error: { key: string; detail?: string } };
```

The existing `GraphProgress` (`step`, `spacesTotal`, `spacesCompleted`, `currentSpace`) stays for the Explorer's poller and is fed by the same reporter (adapter), so one code path produces both.

## 4. Loaded Data (frontend)

```ts
interface LoadedData {
  loadKey: string;
  /** The processed dataset the BFF returned — relational only, plus GD layer when requested. */
  dataset: GraphDataset;
  /** Both GD variants of the counts; tabs pick per toggle (R4). Dashboard apps only. */
  dashboard?: DashboardCountsBundle;
  /** Extra items keyed by LoadItemKey; absent until declared and loaded. */
  extras: {
    activity?: ActivityItem;
    organizations?: Record<string, ExtendedOrganizationProfile>;
    'gemeente-locations'?: GemeenteLocationsResponse; // existing type
  };
}
```

Held in browser memory only (FR-001a). Replaced wholesale when `loadKey` changes; `extras` are re-requested for the new key (their server caches make that cheap).

## 5. Server response shapes (new/changed)

```ts
/** GraphGenerationRequest — two new optional flags. */
interface GraphGenerationRequest {
  spaceIds: string[];
  forceRefresh?: boolean;
  app?: string;
  includeInitiatives?: boolean;
  /** Fold activity-derived fields in (edges' activityTier, node counts). Default TRUE on the
   *  JSON path (Explorer unchanged); the dashboards' stream sends false. */
  includeActivity?: boolean;
  /** Include extended organisation profiles (description, website, references…). Default TRUE
   *  on the JSON path (Explorer unchanged); the dashboards' stream sends false. */
  includeExtendedProfiles?: boolean;
}

interface DashboardCountsBundle {
  categories:   { base: VngDashboardResponse; withGd?: VngDashboardResponse };
  distribution: { base: Pick<VngDashboardResponse, 'gemeenteDistribution' | 'cityPopulation'>;
                  withGd?: Pick<VngDashboardResponse, 'gemeenteDistribution' | 'cityPopulation'> };
}

/** POST /api/graph/activity */
interface ActivityRequest  { spaceIds: string[]; forceRefresh?: boolean }
interface ActivityItem {
  /** Per Space (L0/L1/L2 id) the counts the Initiatives table shows. */
  bySpace: Record<string, { day: number; week: number; month: number; total: number }>;
  fetchedAt: string;
  /** Spaces whose activity could not be read (rendered as "unavailable"). */
  unavailable: string[];
}

/** POST /api/graph/organizations */
interface OrganizationsRequest { ids: string[] }
interface ExtendedOrganizationProfile {
  id: string;
  description: string | null;
  tagline: string | null;
  website: string | null;
  contactEmail: string | null;
  references?: { name: string; uri: string }[];
  associateCount?: number;
}
```

`GraphNode` and `GraphEdge` shapes are unchanged; the activity-derived and extended-profile fields simply stay `undefined` when not requested (all already optional — Constitution V).

## 6. Cache rows (server, `cache_entries (user_id, space_id)`)

| Row kind | `space_id` | Content | TTL | Invalidated by |
|----------|-----------|---------|-----|----------------|
| Relational per Space (existing rows, new content) | `<nameId>` | `{ nodes, edges, nameId }` **without** activity-derived fields; nodes carry core profile + `classificationEntries` | `cache.ttl_hours` (24 h) | force refresh of that Space; maintenance v4 |
| Activity per Space (**new**) | `__activity__:<nameId>` | `{ bySpace: {...}, fetchedAt }` | 24 h | force refresh; `/activity` `forceRefresh` |
| Extended org profile (**new**) | `__org__:<orgId>` | `ExtendedOrganizationProfile` | 24 h | force refresh (all rows of the user) |
| GD layer (existing) | `__gd_initiatives__` | unchanged | 168 h | unchanged |
| Gemeente locations (existing) | `__gemeente_geo__` | unchanged | 168 h | unchanged (kept by maintenance) |

`CACHE_MAINTENANCE_VERSION` 3 → 4: delete every row whose `space_id` is a plain nameId (pre-split relational rows embedding activity); keep `__gemeente_geo__`; `__gd_initiatives__` is deleted as in v2/v3 (it is cheap to rebuild relative to correctness). All rows remain per `user_id` (FR-016).

## 7. Derivations (frontend, `dashboard/data/derive/`)

| Derivation | Inputs | Existing pure module wrapped |
|-----------|--------|------------------------------|
| `graphView` | dataset, filters, `effectiveSpaceIds` | GraphTab's current `useMemo` chain |
| `initiativeRows` | dataset, `effectiveSpaceIds`, `extras.activity?` | `utils/initiatives.ts` |
| `cityRows` | dataset, `effectiveSpaceIds` | `buildCityRows` |
| `funnelModel` | dataset, `dashboard.categories[variant]` | `utils/funnel.ts` |
| `ecosystemModel` | dataset (widened), orchestrator choice | `utils/ecosystem.ts` + `ecosystem-layout.ts` |
| `usageView` | dataset, `extras['gemeente-locations']?` | UsageExplorerTab's current memo |
| `counts` | `dashboard`, toggles | pick `base`/`withGd` |

Memo key: `WeakMap<GraphDataset, Map<string, unknown>>` where the inner key is a stable serialisation of the non-dataset inputs. Identity of `dataset` changes only when `loadKey` changes or a refresh completes, so a tab switch never recomputes (FR-006).

# Research: Space Analytics Dashboard

**Feature**: 013-space-analytics-dashboard
**Date**: 2026-03-17
**Status**: Complete

## R1: Alkemio GraphQL API — Callout/Contribution Data Availability

### Decision
Use the Alkemio GraphQL API's `Space → collaboration → calloutsSet → callouts → contributions` traversal to fetch all content analytics data. The existing schema provides complete access to callouts, contributions (post/memo/link/whiteboard), comments (Room messages), and member roles.

### Rationale
The Alkemio schema (as reflected in the codegen types) exposes:
- **Space.collaboration.calloutsSet** — contains typed CalloutsSet (COLLABORATION or KNOWLEDGE_BASE), which maps to phases/tabs
- **CalloutsSet.callouts** — returns Callout objects with `activity`, `contributions`, `contributionsCount` (broken down by type: link/memo/post/whiteboard), `createdBy`, `createdDate`, and `comments` (Room)
- **CalloutContribution** — has `createdBy`, `createdDate`, `link`, `memo`, `post`, `whiteboard` fields
- **Post.comments** — a Room with `messages` array and `messagesCount`
- **Room.messages** — individual Message objects with `sender`, `timestamp`, `threadID`
- **Community.roleSet** — provides `memberUsers`, `leadUsers`, `adminUsers`, `memberOrganizations`, `leadOrganizations`

The `CalloutsSetType` enum distinguishes `COLLABORATION` vs `KNOWLEDGE_BASE`, enabling phase filtering (FR-016).

### Alternatives Considered
1. **Use activityFeedGrouped only**: The existing activity feed provides timestamped events but lacks the structural detail needed for callout-level analytics (unanswered callouts, contributions per callout, comment threads). It's useful for time-series but insufficient for the full dashboard.
2. **Platform metrics API (Space.about.metrics)**: The `Nvp` metrics are high-level name/value pairs. They may provide some pre-computed counts but lack the granularity needed for per-callout, per-contributor, and per-phase breakdowns.

### Conclusion
A new GraphQL query (`spaceAnalytics`) will traverse the full Space → Collaboration hierarchy. The existing `activityFeedGrouped` query will supplement time-series data. Both are available via the codegen SDK.

---

## R2: GraphQL Query Strategy — Depth & Pagination

### Decision
Fetch analytics data in two stages: (1) a deep hierarchical query for the selected space and its subspaces that retrieves collaboration/callout/contribution structure, and (2) the existing `activityFeedGrouped` query for timestamped event data.

### Rationale
The Alkemio GraphQL API supports nested queries. A single `spaceAnalytics` query can fetch:
- L0 space: collaboration → calloutsSet → callouts (with contributionsCount + contributions with createdBy/createdDate) → posts → comments room (messagesCount)
- L1 subspaces: same traversal per subspace
- L2 sub-subspaces: same traversal per sub-subspace (via the existing subspaceDetails pattern)

The `Callout.contributions` field accepts `limit` and `filter` args. For analytics, we need all contributions (no limit) but only metadata (id, createdBy, createdDate, type — not full content).

For subspaces, we reuse the existing pattern from `acquire-service.ts` which already iterates L1/L2 subspaces. The analytics query will be dispatched per-subspace to avoid overly large single queries.

### Alternatives Considered
1. **Single monolithic query**: Fetching all L0+L1+L2 data in one query risks timeouts for large spaces. Per-subspace fetching with parallel execution is safer and matches the existing pattern.
2. **REST-based pre-aggregated endpoint on Alkemio**: Does not exist; the platform exposes GraphQL only.

### Key Considerations
- **Callout.contributions** does not have native pagination (no cursor), but supports `limit`. For analytics, we fetch all contributions (metadata only) to compute accurate counts.
- **Room.messages** similarly returns all messages. For very active posts, this could be large. We use `messagesCount` for the aggregate and only fetch full messages if comment-thread-depth analysis is needed (P3 scope).
- **Rate/size limits**: Alkemio API may have query complexity limits. We mitigate by fetching per-subspace and parallelizing.

---

## R3: Data Aggregation Architecture

### Decision
All aggregation happens server-side in a new `dashboard-transform.ts` module. The BFF returns a pre-computed `DashboardDataset` to the frontend — the frontend does no data crunching.

### Rationale
This follows the existing pattern: `acquire-service.ts` fetches raw data, `transformer.ts` computes derived metrics, and the BFF returns a complete `GraphDataset`. The dashboard follows the same pattern with a `dashboard-service.ts` (acquisition) and `dashboard-transform.ts` (aggregation).

Server-side aggregation:
- Keeps the frontend simple (display only)
- Allows caching of computed results (same per-user per-space SQLite cache)
- Avoids sending raw contribution lists to the client (data minimization per Principle IV)

### Alternatives Considered
1. **Client-side aggregation**: Send raw callout/contribution arrays to frontend, compute metrics in React. Rejected because: larger payload, duplicated logic if caching is needed, violates data minimization principle.
2. **Pre-computed analytics in Alkemio**: The platform's `Space.about.metrics` provides some Nvp values but not the full breakdown needed. Not sufficient alone.

---

## R4: D3.js Visualization Patterns

### Decision
Use D3.js v7 directly (not a wrapper library) for all dashboard visualizations, consistent with the existing ForceGraph in the Explorer.

### Rationale
The project already uses D3.js v7 for the force-directed graph. Using D3 directly for dashboard charts maintains consistency, avoids adding a new charting dependency, and gives full control over visual design matching the existing token system.

### Visualization type mapping:
| Panel | D3 Visualization | Rationale |
|-------|------------------|-----------|
| Headline Metrics | CSS grid of metric cards | Not a D3 chart — pure React/CSS |
| Activity Timeline | `d3.line` + `d3.area` time-series | Standard pattern for temporal data |
| Contributor Ranking | `d3.scaleBand` horizontal bar chart | Clear ranking visualization |
| Subspace Distribution | `d3.treemap` | Hierarchical proportional areas |
| Content Type Mix | `d3.pie` → `d3.arc` donut chart | Standard proportional breakdown |
| Engagement Quality | Metric cards + sparklines | Cards with small inline charts |
| New Contributors | `d3.line` time-series | Monthly first-contribution counts |
| Role Activity Split | `d3.scaleBand` stacked bar | Compare admin/lead/member activity |

### Alternatives Considered
1. **Chart.js or Recharts**: Would add a dependency and introduce a different visual language than the existing D3 force graph.
2. **Observable Plot**: Lighter D3 abstraction, but adds a dependency for marginal benefit given the team already uses D3 directly.

---

## R5: Caching Strategy for Dashboard Data

### Decision
Reuse the existing SQLite per-user per-space cache with a separate cache key namespace (`dashboard:{spaceId}`) to distinguish dashboard data from graph data.

### Rationale
The existing `cache-service.ts` stores cached datasets keyed by `(user_id, space_id)`. Dashboard data can use the same table with a prefixed space_id (e.g., `dashboard:{actual_space_id}`) to avoid collision with graph dataset cache entries. Same TTL (24 hours), same per-user scoping, same invalidation pattern.

### Alternatives Considered
1. **Separate SQLite table for dashboard cache**: Cleaner separation but requires schema migration and new cache functions. The prefix approach is simpler and reuses existing infrastructure.
2. **No caching**: Dashboard data involves multiple GraphQL queries traversing potentially large spaces. Without caching, every dashboard load triggers a full re-fetch. Unacceptable for performance.

---

## R6: Frontend Routing & Navigation

### Decision
Add a new `/dashboard` route in `App.tsx` with a top-level navigation bar visible on both Explorer and Dashboard pages. The Dashboard page includes an inline space picker that pre-selects from existing space context.

### Rationale
The existing app has three routes: `/` (login), `/spaces` (space selector), `/explorer` (graph view). The Dashboard is a peer to Explorer — both are authenticated views that operate on spaces. Adding `/dashboard` as a sibling route follows the existing pattern.

Navigation between Explorer and Dashboard should preserve space selection context. The Space Selector page already stores selected spaces in React state passed via `useNavigate`. The Dashboard can accept a `spaceId` query parameter or read from shared context.

### Implementation approach:
- Add a shared `TopNavigation` component rendered on both Explorer and Dashboard pages
- Pass currently-selected space ID via URL query parameter (`/dashboard?space=nameId`) or React context
- Dashboard page includes a `DashboardSpacePicker` dropdown for switching spaces without navigating away

### Alternatives Considered
1. **Toggle within Explorer page**: Would couple two very different views and complicate the Explorer component.
2. **Tab-based switching**: Similar to toggle — mixes navigation paradigms. A dedicated route is cleaner.

---

## R7: Time-Range and Phase Filtering

### Decision
Implement filtering client-side on the pre-fetched `DashboardDataset`. The BFF returns all-time data; the frontend applies time-range and phase filters by filtering the contribution/callout arrays included in the dataset.

### Rationale
For time-range filtering to work, the BFF must return timestamped data (contribution dates, callout dates). Rather than making separate API calls per time range, the BFF returns all-time data and the frontend filters locally. This avoids cache fragmentation (one cached dataset per space rather than per-space-per-timerange) and keeps the API simple.

Phase filtering uses the `calloutsSetType` field (COLLABORATION or KNOWLEDGE_BASE) or InnovationFlow state IDs already present in the data model. The frontend groups callouts by their parent CalloutsSet and allows selecting specific phases.

### Alternatives Considered
1. **Server-side filtering**: Would require the BFF to accept time-range and phase parameters, increasing API complexity and cache key cardinality. Rejected for simplicity.
2. **Hybrid**: Server returns time-bucketed aggregates + client filters. More complex without clear benefit for the expected data volumes.

### Trade-off
Client-side filtering means the full dataset is sent to the client. For a single space with ~5000 contributions, the JSON payload (metadata only, not content) is estimated at ~200KB–500KB — acceptable. If spaces grow significantly larger, server-side filtering can be added later.

---

## R8: CSV/PDF Export (P3)

### Decision
Implement CSV export first as a client-side download (JSON → CSV conversion in the browser). PDF export deferred to a later iteration or implemented via server-side rendering.

### Rationale
CSV is the simplest export format — the frontend already has the computed data and can generate a CSV blob. PDF requires a rendering library (e.g., jsPDF, puppeteer for server-side). Given P3 priority, CSV-first is pragmatic.

### Alternatives Considered
1. **Server-side CSV generation**: Would work but adds unnecessary complexity when the client already has the data.
2. **PDF via jsPDF/html2canvas**: Possible but lower priority. Can be added incrementally.

# Quickstart: Space Analytics Dashboard

**Feature**: 013-space-analytics-dashboard
**Date**: 2026-03-17

## Prerequisites

- Node.js 20+
- pnpm >= 9
- Valid Alkemio account (email/password)
- Server `.env` configured with `ALKEMIO_SERVER_URL`, `ALKEMIO_GRAPHQL_ENDPOINT`, `ALKEMIO_KRATOS_PUBLIC_URL`

## Setup

```bash
# From repo root — install dependencies
cd server && pnpm install
cd ../frontend && pnpm install
```

## Development

### 1. Start the BFF server

```bash
cd server
pnpm run dev
# Runs on port 4000 with tsx watch
```

### 2. Start the frontend

```bash
cd frontend
pnpm run dev
# Runs on port 5173, proxies /api → :4000
```

### 3. Access the Dashboard

1. Open `http://localhost:5173`
2. Log in with Alkemio credentials
3. Click **Dashboard** in the top navigation bar
4. Select a space from the inline picker (or navigate from Explorer with a space already selected)
5. View headline metrics, activity timeline, contributor rankings, and more

## Key Files

### Server (BFF)

| File | Purpose |
|------|---------|
| `server/src/routes/dashboard.ts` | Express router for `/api/dashboard/*` endpoints |
| `server/src/services/dashboard-service.ts` | Fetches space analytics data from Alkemio GraphQL |
| `server/src/transform/dashboard-transform.ts` | Transforms raw GraphQL data → `DashboardDataset` |
| `server/src/types/dashboard.ts` | TypeScript interfaces for all dashboard data types |
| `server/src/graphql/queries/spaceAnalytics.graphql` | GraphQL query for space collaboration/callout hierarchy (reused per-subspace via iteration) |

### Frontend

| File | Purpose |
|------|---------|
| `frontend/src/pages/Dashboard.tsx` | Main dashboard page component |
| `frontend/src/hooks/useDashboard.ts` | Data fetching + state management hook |
| `frontend/src/components/dashboard/HeadlineMetrics.tsx` | P1 metric cards grid |
| `frontend/src/components/dashboard/ActivityTimeline.tsx` | D3 time-series chart |
| `frontend/src/components/dashboard/ContributorRanking.tsx` | Contributor leaderboard |
| `frontend/src/components/dashboard/SubspaceDistribution.tsx` | Treemap visualization |
| `frontend/src/components/dashboard/ContentTypeMix.tsx` | Donut chart |
| `frontend/src/components/dashboard/DashboardFilters.tsx` | Time range + phase filter |
| `frontend/src/components/dashboard/DashboardSpacePicker.tsx` | Inline space selector |
| `frontend/src/components/dashboard/DashboardPanel.tsx` | Shared panel wrapper (loading/empty) |

## After Changing GraphQL Files

```bash
cd server
pnpm run codegen
# Regenerates server/src/graphql/generated/alkemio-schema.ts
```

## Running Tests

```bash
# Server tests
cd server && pnpm run test

# Frontend tests
cd frontend && pnpm run test

# Visual regression (from repo root)
pnpm run test:visual
```

## Architecture Notes

- The frontend **never** calls Alkemio directly — all data flows through the BFF (Constitution Principle III)
- Dashboard data is cached per-user per-space in SQLite with 24-hour TTL, keyed as `dashboard:{spaceNameId}`
- Time-range and phase filtering happens **client-side** on the pre-fetched `DashboardDataset`
- All D3 visualizations use the project's existing CSS custom property design tokens
- The dashboard page shares the same auth flow as the Explorer (bearer token in memory)

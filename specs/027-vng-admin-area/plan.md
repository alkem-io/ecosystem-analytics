# Implementation Plan: VNG Dashboard Administration Area

**Branch**: `027-vng-admin-area` | **Date**: 2026-11-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/027-vng-admin-area/spec.md`

## Summary

The VNG monitor gains an administration area at `/admin`. Only **Monitor Managers** (ADMIN on any
admin Space) can reach it. It holds four sections: the access sets, the Included Spaces (view and
edit), one initiative's classifications (written to Alkemio), and the GemeenteDelers source.

Three structural changes come with it:

1. **Feature 026's single gate becomes two sets.** MEMBER of any viewer Space gives read. ADMIN
   of any admin Space gives manage. Viewer Spaces are listed on the sign-in and no-access screens
   via a new public endpoint fed by the existing anonymous probe.
2. **The monitor gets its own durable store.** It is its own tables in the app's single SQLite file (revised 2026-11-14; first planned as a separate file), with a
   revision, append-only change history, a build-shipped starting set and an in-process daily
   backup.
3. **VNG stops using the Innovation Hub.** The dashboard's scope comes from `GET /api/vng/scope`.
   The hub dropdown and "add Space" controls disappear for VNG only (an app flag), and GovTech is
   unchanged.

## Technical Context

**Language/Version**: TypeScript 5.x (strict, ESM); Node 24 (server), React 19 (frontends)

**Primary Dependencies**: Server: Express 5, `better-sqlite3` (existing, including its online
`backup()`), `graphql-request` and the codegen SDK. There are two new documents: the query
`adminSpaceClassifications` and the mutation `updateClassificationSelection`, which is the
repo's first mutation document. Frontend: React 19, Vite 7, `react-i18next`, Radix UI and
Tailwind v4. **No new dependencies.**

**Storage**: **new tables in the existing single SQLite file** (revised 2026-11-14; first planned as a separate `settings.<env>.sqlite`): `settings_meta`,
`settings_state`, `included_spaces`, `settings_changes`, `classification_changes`. Daily
settings-only backups go to `SETTINGS_BACKUP_DIR`. The cache tables are unchanged apart from the existing
`access_decisions.gate_key` now holding a set key. There is no `CACHE_MAINTENANCE_VERSION` bump.
The GD cache row gains optional fields, and old rows read them as null.

**Testing**: Vitest (server units and real-HTTP route tests via `createApp` on port 0, as in
026; frontend units), Playwright (`tests/vng-admin-area.spec.mjs`, extended
`vng-access-gate.spec.mjs` and `mobile-navigation.spec.mjs`)

**Target Platform**: Linux container (one BFF serving three SPAs), modern browsers, 390 px and up

**Project Type**: web application (BFF + SPAs in a pnpm workspace)

**Performance Goals**:

- `GET /api/vng/scope` < 50 ms; it reads SQLite only.
- Admin sections render < 3 s for 200 Included Spaces. Lookups are batched per section and the
  classification status reuses the manager's cached Space rows where present.
- The access decision with N distinct Spaces costs one round trip, run in parallel under
  `check_timeout_ms`.

**Constraints**:

- Fail closed on access.
- Re-check manage on every write.
- No tokens or session ids in the settings DB or logs.
- Nothing in the cache maintenance path may reach the settings DB.
- At most a day of settings loss.
- GovTech and Explorer behaviour unchanged.

**Scale/Scope**: about 1–5 managers, about 25 Included Spaces today (200 supported), and changes
on the order of a few per month. 6 user stories, 36 FRs.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How |
|---|---|---|
| I. Alkemio OIDC (Code + PKCE via BFF) | ✅ | Every per-person call (role checks, Space lookups, search, classification read and write) uses the session's own token server-side. The sign-in Space list reuses 026's **anonymous** probe output (public names only). No service account. |
| II. Typed GraphQL contract | ✅ | New `adminSpaceClassifications.graphql` and `updateClassificationSelection.graphql` (mutation), then `pnpm run codegen`. Search and lookup reuse or add typed documents. No raw strings. |
| III. BFF boundary | ✅ | The SPA calls only `/api/auth/access/spaces`, `/api/vng/scope` and `/api/vng/admin/*`. Alkemio is never called from the browser. |
| IV. Data sensitivity | ✅ (justified) | The settings store is **global**, not per-user. It is not a cache of Alkemio data. It holds only Space nameIDs or UUIDs, the ecosystem key and change records (actor id and name). Every name, link or classification shown is fetched **per request with the manager's token**, so an unreadable Space is shown by nameID only. Admin reads of GD data use the manager's own per-user cache row. All SQL is parameterised. No tokens are stored or logged. |
| V. Graceful degradation | ✅ | Each section loads and fails independently. Old GD rows without the new fields show "unknown". `/api/vng/scope` works with Alkemio down. A backup failure only logs. |
| VI. Design fidelity | ✅ | The area uses the dashboard tokens, Tailwind and Radix, the single `lg` breakpoint and card lists below it. Copy is in nl/en bundles. |
| VII. NL-only maps | ✅ n/a | No map is touched. |
| Security reqs (session per request, 401 re-login, parameterised SQL, `max_spaces_per_query`) | ✅ | Admin routes sit behind `authMiddleware` + gate + `requireAccess('manage')`. Writes use `fresh`. The Included Spaces count is capped at `max_spaces_per_query`, because the dashboard posts the set in one request. |

No violations, so Complexity Tracking is empty. The global store is recorded under IV as a
justified first, not a violation, because the principle's per-user rule governs **cache entries
of Alkemio-derived data**, which this is not.

**Post-design re-check (after Phase 1)**: ✅ The design holds. One point to watch is the
constitution's "Multi-dashboard serving" text, which says each new dashboard declares its access
gate. That text needs a one-line amendment to mention `access.<app>_admin` (a patch-level
constitution bump at implementation, as in 026).

## Project Structure

### Documentation (this feature)

```text
specs/027-vng-admin-area/
├── plan.md              # This file
├── research.md          # R1–R15
├── data-model.md        # access sets, settings tables, starting set, admin read models
├── quickstart.md        # release preconditions P3–P4 (P1–P2 operational, separate) + scenario run
├── contracts/
│   ├── api-access-sets.md   # public Space list, /me change, config, screens
│   ├── api-admin.md         # /api/vng/scope + /api/vng/admin/*
│   └── settings-store.md    # files, start-up, backup, restore
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
server/
├── analytics.yml                          # access.vng_admin, *_display_names
├── src/
│   ├── types/access.ts                    # GateLink; AccessReport.viewerSpaces
│   ├── types/admin.ts                     # NEW: admin read models, MonitorScope
│   ├── config.ts                          # parseAccessConfig → sets; settings paths
│   ├── access/                            # 026 module, extended
│   │   ├── policy.ts                      # parseGateList, levelFromSets, setKey
│   │   ├── determine.ts                   # per-Space parallel checks, combination rule
│   │   ├── probe.ts                       # registry keyed by Space
│   │   ├── access-service.ts              # report → viewerSpaces
│   │   ├── middleware.ts                  # requireAccess({fresh})
│   │   └── public-spaces-handler.ts       # NEW: GET /api/auth/access/spaces
│   ├── settings/                          # NEW module (README.md)
│   │   ├── db.ts                          # tables in the app DB, migrations (settings_meta)
│   │   ├── seed.ts                        # load + validate starting set, seed once
│   │   ├── store.ts                       # getScope, saveIncludedSpaces(baseRevision…), history, recordClassificationChange
│   │   ├── backup.ts                      # daily settings-only backup + retention, restore
│   │   └── restore-cli.ts                 # operator restore (node dist/settings/restore-cli.js)
│   ├── data/vng/monitor-settings.seed.json  # NEW starting set
│   ├── admin/                             # NEW
│   │   ├── router.ts                      # /api/vng/admin/* (requireAccess manage)
│   │   ├── included-spaces-service.ts     # resolve views, validate additions
│   │   ├── space-search-service.ts        # search + resolve (top-level, readable)
│   │   ├── classifications-service.ts     # read designated, apply per entry
│   │   └── gd-source-service.ts           # GdSourceSummaryView
│   ├── routes/scope.ts                    # NEW: GET /api/vng/scope
│   ├── services/graph-service.ts          # GD row: readAt/expiresAt, superseded names, ambiguous
│   ├── graphql/queries/adminSpaceClassifications.graphql   # NEW
│   ├── graphql/queries/adminSpaceSearch.graphql            # NEW
│   ├── graphql/mutations/updateClassificationSelection.graphql  # NEW (codegen documents glob updated)
│   └── index.ts                           # settings init/seed/backup before listen; probe union
├── scripts/compare-seed-with-hub.ts       # NEW (quickstart P3)

frontend/
├── shared/src/
│   ├── access/AccessScreens.tsx           # NoAccessScreen: spaces[]
│   ├── dashboard/components/LoginScreen.tsx      # viewer Space list
│   ├── dashboard/components/BrandingHeader.tsx   # settings entry
│   ├── dashboard/components/SelectedSpacesPanel.tsx  # hide hub/picker when managedScope
│   ├── dashboard/hooks/useSelectedSpaces.ts      # scope source when managedScope
│   ├── dashboard/hooks/useMonitorScope.ts        # NEW: GET /api/vng/scope
│   ├── dashboard/App.tsx                  # /admin branch (lazy AdminApp)
│   └── admin/                             # NEW: AdminApp + AccessSection, IncludedSpacesSection,
│                                          #      ClassificationsSection, GdSourceSection, api.ts
├── vng/src/appConfig.ts                   # flags.managedScope = true
└── vng/src/i18n/{nl,en}.json              # admin.*, login.access*, reworded ecosystem.hint.addSpace

tests/vng-admin-area.spec.mjs              # NEW Playwright
```

**Structure Decision**: the existing BFF + `frontend/*` workspace is used as is.

- **Access**: the rule stays in `server/src/access/`, per 026's reuse rule.
- **Durable state**: monitor-owned state gets its own `server/src/settings/` module, the place
  future monitor settings will live.
- **Admin endpoints**: under `server/src/admin/`.
- **Admin UI**: in `frontend/shared/src/admin/`, so a future GovTech area can reuse it, while
  only VNG turns it on.

## Delivery order (for /speckit-tasks)

| # | Story | Delivers |
|---|---|---|
| 1 | Foundation | access sets (R1–R4) + settings store, seed and backup (R5–R8) + `/api/vng/scope` + VNG scope switch (R10). This is the riskiest part, and it is shippable alone: nothing visible changes except the hub dropdown disappearing |
| 2 | US1 | sign-in and no-access Space lists |
| 3 | US2 + US3 | `/admin` shell, Access section, Included Spaces read view |
| 4 | US4 | edit Included Spaces |
| 5 | US5 | classifications |
| 6 | US6 | GemeenteDelers section |

## Complexity Tracking

No constitution violations to justify.

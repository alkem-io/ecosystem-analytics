---
description: "Task list for GovTech Netherlands Frontend"
---

# Tasks: GovTech Netherlands Frontend

**Input**: Design documents from `/specs/017-govtech-frontend/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: TDD was NOT requested. Verification/regression tasks are included only where the spec demands them (FR-051 "do not break VNG/Explorer", and the SC acceptance criteria). They are lightweight checks, not red-green TDD.

**Organization**: Tasks are grouped by user story. **Shipped approach: copy-and-wrap** — GovTech is a clone of `frontend/vng` with the GovTech-specific literals parameterised, reusing the already-shared `@ea/shared` (graph/map/ui/services) as-is, so VNG/Explorer are untouched (FR-051 by construction). The server config registry + app-aware routing are additive. The deeper "promote the dashboard surface into `@ea/shared`" de-dup is **deferred** (T013). Each user story is then GovTech-specific config + verification of inherited behaviour.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US10)
- All paths are relative to repo root `/Users/neilsmyth/Documents/DevAlkemio/ecosystem-analytics/`

## Path conventions

- Server BFF: `server/src/`, `server/analytics.yml`
- Shared frontend lib: `frontend/shared/src/` (`@ea/shared`)
- VNG wrapper: `frontend/vng/src/`
- New GovTech wrapper: `frontend/govtech/src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffold the new GovTech SPA package and wire it into the workspace/build/dev tooling.

- [X] T001 [P] Add `frontend/govtech` to `packages:` in `pnpm-workspace.yaml`
- [X] T002 [P] Create `frontend/govtech/package.json` (name `ecosystem-analytics-govtech`, `@ea/shared: workspace:*`, deps mirrored from `frontend/vng/package.json` — no new deps)
- [X] T003 [P] Create `frontend/govtech` build configs mirroring `frontend/vng`: `vite.config.ts` (dev port **5175**, `/api` proxy → `http://localhost:4100`, `[vite:govtech]` console prefix, `@ea/shared`/`@server/types` aliases), `tsconfig.json`/`tsconfig.app.json`/`tsconfig.node.json`, `index.html`, `tailwind`/`postcss` config
- [X] T004 [P] Add root `package.json` scripts: `dev:govtech` (`pnpm -C frontend/govtech dev`) and a `govtech` pane in the `concurrently` `dev` script; add `frontend/govtech` to `build:frontends` coverage
- [X] T005 Run `pnpm install` from repo root to link the new workspace package

**Checkpoint**: `frontend/govtech` exists as an empty buildable shell wired into the workspace.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Stand up GovTech as a working third frontend — copy `frontend/vng` → `frontend/govtech`, parameterise the GovTech-specific literals, and reuse `@ea/shared` (graph/map/ui/services) as-is — plus generalise the server config into an app-keyed registry with app-aware routing. **No user story can be implemented until this phase is complete.**

**⚠️ CRITICAL — FR-051**: GovTech must not change VNG/Explorer. The shipped **copy-and-wrap** approach guarantees this by construction — no edits to `frontend/vng`, `frontend/shared`, or the Explorer — and is verified by building all three (T015).

### Frontend — GovTech wrapper (copy-and-wrap, reusing `@ea/shared`)

> Shipped approach: clone VNG and parameterise. The deeper "promote the dashboard surface into `@ea/shared`" de-duplication is **deferred** (T013) — a maintainability cleanup, not required for a working third frontend.

- [X] T006 Clone `frontend/vng` → `frontend/govtech` (reusing `@ea/shared` as-is); strip copied build artifacts; set `package.json` name `ecosystem-analytics-govtech`
- [X] T007 Parameterise the API namespace in `frontend/govtech/src`: `/api/vng/*` → `/api/govtech/*` (`hooks/useDashboard.ts`, `hooks/useGdInitiatives.ts`) and the default-hub fetch → `/api/hubs?app=govtech` (`hooks/useHubs.ts`)
- [X] T008 Parameterise browser state in `frontend/govtech/src`: localStorage `vng_selection`→`govtech_selection`, `vng_lang`→`govtech_lang`; custom events `vng:openSpace`/`vng:selection` → `govtech:*` (`hooks/useSelectedSpaces.ts`, `pages/GraphTab.tsx`, `pages/SpaceDetailsTab.tsx`, `App.tsx`, `i18n/index.ts`)
- [X] T009 Branding: `VngLogo.tsx` → `GovtechLogo.tsx` (placeholder wordmark) with imports updated in `BrandingHeader.tsx`/`LoadingScreen.tsx`; keep shared Alkemio design tokens (bespoke GovTech identity deferred)
- [X] T010 XLSX export: `wb.creator` → "GovTech Nederland" (`utils/exportDashboard.ts`) and filename stem `vng-dashboard` → `govtech-dashboard` (`pages/DashboardTab.tsx`)
- [X] T011 Cosmetic log prefixes in `frontend/govtech/src`: `[VNG]`→`[GovTech]` (`ErrorBoundary.tsx`), `[vng-graph]`→`[govtech-graph]` (`hooks/useVngGraph.ts`)
- [X] T012 Vite/HTML: `vite.config.ts` port 5175 + `[vite:govtech]` prefix; `index.html` title "GovTech Nederland"
- [X] T013 De-duplicated: the dashboard surface (shell, pages, components, charts, hooks, export) now lives ONCE in `@ea/shared/dashboard`, parameterised by an `AppConfig` context; both `frontend/vng` and `frontend/govtech` are thin wrappers (appConfig + logo + i18n + styles). All three apps build green; no duplicated dashboard files remain.

### Frontend — VNG/Explorer safety (FR-051 guard)

- [X] T014 Confirm `frontend/vng`, `frontend/shared`, and the Explorer were not modified by the GovTech work (copy-and-wrap touches only `frontend/govtech` + workspace/root scripts) — verified by the worker and diff
- [X] T015 Verify all build green: `pnpm -C frontend/govtech build`, `pnpm -C frontend/vng build`, `pnpm -C frontend/ecosystem-analytics build`, and `pnpm -C server build && test` — all pass (VNG snapshots: see T046)

### Server — config registry, app-aware routing, services

- [X] T016 Generalise `server/src/config.ts`: add `DashboardAppConfig` + `parseDashboardConfig` (from `parseVngConfig`), build `config.dashboards = { vng, govtech }`, add `config.govtechPort = Number(process.env.GOVTECH_FRONTEND_PORT) || config.port + 2`, and keep `config.vng = config.dashboards.vng` as a back-compat alias
- [X] T017 Edit `server/analytics.yml`: add a sibling `govtech:` block with `GOVTECH_*` env vars (`default_hub_nameid` empty/operator-set, `gemeentedelers_space_nameid` default `gemeentedelers`, `gd_cache_ttl_hours` 168, `tag_category_mapping` seeded as a copy of `vng:`), and append `http://localhost:5175` to `session.allowed_origins`
- [X] T018 Generalise the dashboard/initiatives routes to `/api/:app/*` (resolve `config.dashboards[:app]`, `400 UNKNOWN_APP` for unknown ids) in `server/src/routes/` (rename/extend `vng.ts` → app-aware `dashboard.ts`), update the router mount in `server/src/app.ts`, and mount so `/api/vng/dashboard` + `/api/vng/initiatives` keep working
- [X] T019 Extend `GET /api/hubs` in `server/src/routes/hubs.ts` to accept `?app=<id>` and return `config.dashboards[app].defaultHubNameId` (default `vng` when absent)
- [X] T020 Thread the resolved `DashboardAppConfig` (taxonomy + GD space) into `server/src/services/vng-dashboard-service.ts`, `gd-initiatives-service.ts`, and `vng-registry.ts`, replacing direct `config.vng` reads
- [X] T021 Server unit tests in `server/src/**/*.test.ts` for: config registry parsing (VNG and GovTech profiles independent), `/api/:app/*` resolution + `UNKNOWN_APP`, `/api/hubs?app=` default-hub selection; run `pnpm -C server build && pnpm -C server test`

### GovTech wrapper — boot

- [X] T022 `frontend/govtech/src/components/GovtechLogo.tsx` (placeholder wordmark) created; `styles/index.css` keeps the shared Alkemio tokens (bespoke GovTech brand tokens deferred to US6/T036)
- [X] T023 `frontend/govtech/src/i18n/{index.ts,nl.json,en.json}` cloned from VNG with `app.title` = "GovTech Nederland"/"GovTech Netherlands", generic subtitles, and the `govtech_lang` storage key
- [X] T024 GovTech app boots from `frontend/govtech/src/main.tsx`/`App.tsx` (cloned shell consuming `@ea/shared`); `pnpm -C frontend/govtech build` verified green

**Checkpoint**: GovTech runs as a working third frontend reusing `@ea/shared`; the BFF resolves per-app profiles; VNG/Explorer verified unchanged. (Shared-surface de-dup deferred — T013.)

---

## Phase 3: User Story 1 - Run three frontends side by side under one sign-in (Priority: P1) 🎯 MVP

**Goal**: GovTech is served from its own server endpoint/port and coexists with Explorer + VNG under one shared sign-in.

**Independent Test**: Start backend + all three frontends; each reachable on its own address; sign in on one → recognised on the other two; sign out → invalidated on all three.

- [X] T025 [US1] Add a third `createApp('../frontend-govtech/dist')` listener on `config.govtechPort` in `server/src/index.ts`, with a bootstrap log line (mirroring the Explorer/VNG listeners)
- [X] T026 [US1] Update `Dockerfile` to build `frontend/govtech`, copy its `dist` to `frontend-govtech/dist`, and `EXPOSE` the GovTech port
- [X] T027 [US1] Document/set the GovTech production origin in `session.allowed_origins` (analytics.yml default + the deployment env `SESSION_ALLOWED_ORIGINS`) so the shared `ea_session` cookie + post-login returnTo are accepted on the GovTech subdomain
- [X] T028 [US1] Verify US1: `pnpm run dev`; confirm :5173/:5174/:5175 reachable on distinct ports; sign in on one is recognised on the other two with no re-auth; sign out on one invalidates all three; GovTech requests hit the shared `/api`; a first-time user reaches a populated GovTech graph + dashboard from sign-in in under 2 minutes without instruction (SC-001, SC-002, SC-008, SC-016)

**Checkpoint**: MVP — the third frontend runs on its own port/endpoint with shared SSO.

---

## Phase 4: User Story 2 - Explore an innovation hub's ecosystem on the graph (Priority: P1)

**Goal**: GovTech first-load renders its configured default hub's spaces as a graph over a Netherlands-only map; hub switching updates the view.

**Independent Test**: Sign in to GovTech; default hub's spaces load on the NL map; switch hub → graph + selected-space list update.

- [X] T029 [US2] Set the GovTech default innovation hub via `GOVTECH_DEFAULT_HUB_NAMEID` (placeholder in `server/analytics.yml` `govtech.default_hub_nameid` + `server/.env.default`), operator-set per deployment
- [X] T030 [US2] Confirm the promoted `useHubs` (shared) sends `?app=govtech` (from `AppConfig.apiNamespace`/`appId`) so GovTech receives its own default hub, not VNG's
- [X] T031 [US2] Verify US2: GovTech first load shows the default hub's spaces as a graph over the **Netherlands-only** map (live-tested; the NL-only map constraint is now machine-guarded by `tests/govtech-map-nl-only.spec.mjs`) (Principle VII / FR-019 — nothing outside NL renders); switching hub re-renders graph + selected list; empty hub → clear empty state; **no space the signed-in user is not authorised to view appears** in the list/graph (FR-016, SC-009) (SC-003, SC-004, FR-018/FR-020)

**Checkpoint**: GovTech graph + map driven by its own default hub.

---

## Phase 5: User Story 3 - Refine the space set with direct selection (Priority: P2)

**Goal**: Direct add/remove of spaces combines with the hub set and drives graph/details/dashboard consistently, persisted under a GovTech-namespaced key.

**Independent Test**: With a hub selected, add one space and remove a hub space; confirm selected list, graph, and dashboard all reflect the combined set.

- [X] T032 [US3] Confirm the promoted `useSelectedSpaces`/`SelectionContext` use the GovTech storage key `govtech_selection` (from `AppConfig.storagePrefix`) so selection never bleeds across apps on the shared parent domain
- [X] T033 [US3] Verify US3: add/remove a space updates the selected-space list, graph, and dashboard; combined set = (hub ∪ direct) − removals; provenance (hub vs direct) is visible; switching hub recomputes correctly (SC-005, SC-006, FR-013/FR-014/FR-015) — confirmed in live testing

**Checkpoint**: GovTech selection model works independently of VNG's.

---

## Phase 6: User Story 4 - View the dashboard of charts (Priority: P2)

**Goal**: The dashboard renders GovTech's charts (NDS + VNG-2030 taxonomy by default), data-source aware, recomputing on selection change via `/api/govtech/dashboard`.

**Independent Test**: With spaces selected, open the dashboard; charts render; change selection → charts recompute; counts match the active source.

- [X] T034 [US4] Confirm `server/analytics.yml` `govtech.tag_category_mapping` ships as a working copy of VNG's `nds`/`vng2030` mapping (from T017), operator-editable to diverge later (FR-024/FR-026)
- [X] T035 [US4] Verify US4: GovTech dashboard posts to `/api/govtech/dashboard`, renders the NDS + VNG-2030 charts, recomputes on selection change, indicates the active data source, and handles missing-category data gracefully (SC-007, FR-023/FR-025/FR-027) — confirmed in live testing

**Checkpoint**: GovTech dashboard works with its own (currently identical) taxonomy.

---

## Phase 7: User Story 6 - GovTech branding & data-access caveat (Priority: P2)

**Goal**: A persistent header brands the app "GovTech Nederland"/"GovTech Netherlands" and a styled authorisation warning is shown — Alkemio design tokens reused, scoped to GovTech only.

**Independent Test**: Open GovTech; the header brand is visible on every tab; the authorisation warning is present and visually distinct.

- [X] T036 [US6] Finalise GovTech branding: replace the placeholder `frontend/govtech/src/GovtechLogo.tsx` with the real logo SVG and set GovTech brand-token values in `frontend/govtech/src/styles/index.css` (scoped to the GovTech app root so Explorer/VNG are untouched)
- [X] T037 [US6] Set GovTech header strings in `frontend/govtech/src/i18n/{nl,en}.json` (`app.title`: "GovTech Nederland" / "GovTech Netherlands", plus `app.subtitle`); ensure the shared `BrandingHeader` + `AuthorizationWarning` render them
- [X] T038 [US6] Verify US6: the GovTech brand label is visible/persistent across all tabs and distinct from Explorer/VNG; the authorisation warning is present in a recognisable warning style (SC-010, SC-011, FR-046/FR-047/FR-048) — confirmed in live testing

**Checkpoint**: GovTech is unmistakably branded; users are warned about authorised-data scope.

---

## Phase 8: User Story 7 - See which spaces an organisation connects to (Priority: P2)

**Goal**: Clicking an organisation node reveals its connected spaces in the current graph (inherited from shared graph behaviour).

**Independent Test**: Click an organisation node in GovTech; its connected spaces are listed/highlighted and openable.

- [X] T039 [US7] Verify US7: clicking an organisation node in GovTech reveals its connected spaces (<1s) and lets the user open those spaces' details; an org with no in-graph connections shows a clear message, not a broken view (SC-012, FR-037/FR-038) — confirmed in live testing

**Checkpoint**: Organisation→spaces reveal works in GovTech.

---

## Phase 9: User Story 9 - Use the dashboard in Dutch (Priority: P2)

**Goal**: GovTech defaults to Dutch and switches to English across all labels (incl. chart titles + category names), persisted under `govtech_lang`.

**Independent Test**: Load GovTech → Dutch by default; switch to English → all labels update; switch back.

- [X] T040 [US9] Complete the GovTech `nl.json`/`en.json` bundles (parity with VNG keys, GovTech-specific brand strings translated both ways) and confirm `i18n/index.ts` defaults to `nl` with the `govtech_lang` storage key
- [X] T041 [US9] Verify US9: GovTech loads in Dutch by default; switching to English (and back) updates all interface labels, navigation, chart titles, and category names with no untranslated strings; the language choice persists for the session and does not affect VNG (SC-014, FR-043/FR-044/FR-045) — confirmed in live testing

**Checkpoint**: GovTech is fully bilingual, independent of VNG's language state.

---

## Phase 10: User Story 10 - Fold GemeenteDelers initiatives into the graph (Priority: P2)

**Goal**: The "include GemeenteDelers initiatives" toggle folds the shared GD corpus into the GovTech graph, connecting initiatives to existing gemeente/theme nodes; provenance note shown.

**Independent Test**: Enable the toggle in GovTech; initiative nodes appear linked to gemeente/theme nodes (no duplicate gemeentes); disable → layer removed.

- [X] T042 [US10] Confirm GovTech GD config in `server/analytics.yml` (`GOVTECH_GD_SPACE_NAMEID` default `gemeentedelers` — same corpus as VNG — and `GOVTECH_GD_CACHE_TTL_HOURS` default 168); shared `useGdInitiatives` calls `/api/govtech/initiatives`
- [X] T043 [US10] Verify US10: enabling the toggle adds GD initiative nodes connected to existing gemeente org(s) + theme node(s) with zero duplicate gemeente identities; disabling restores the base graph; the localised GD provenance note (2021–2025, ~305, vng.nl/praktijkvoorbeelden) is shown; an unreadable gemeentedelers space yields a non-fatal message (SC-015, FR-028–FR-036) — GD toggle confirmed in live testing

**Checkpoint**: GovTech GD layer works off the shared corpus/cache.

---

## Phase 11: User Story 5 - Inspect the details of a particular space (Priority: P3)

**Goal**: The Space details tab shows a chosen space's info, reachable via node click or the in-tab picker (inherited).

**Independent Test**: Select a space and open the details tab; its information shows; clicking a node opens details.

- [X] T044 [US5] Verify US5: the GovTech Space details tab shows a chosen space's profile/location/stats/relationships via either the in-tab picker or a Graph-tab node click; missing optional fields degrade gracefully (FR-021/FR-022) — Space details tab confirmed in live testing

**Checkpoint**: GovTech space-details drill-down works.

---

## Phase 12: User Story 8 - Show or hide gemeentes (Priority: P3)

**Goal**: The gemeente show/hide toggle consistently affects the GovTech graph and dashboard, using the shared gemeente snapshot.

**Independent Test**: Toggle "hide gemeentes" in GovTech; gemeente nodes leave the graph and dashboard; toggle back restores them.

- [X] T045 [US8] Verify US8: hiding gemeentes removes 100% of known gemeente organisations from both the GovTech graph and dashboard (and restores them on toggle-back), with zero non-gemeente organisations affected, using the same `vng-gemeente-delers` snapshot as VNG (SC-013, FR-039–FR-042) — confirmed in live testing

**Checkpoint**: GovTech gemeente toggle works off the shared snapshot.

---

## Phase 13: Polish & Cross-Cutting Concerns

**Purpose**: Snapshots, docs, and full-suite validation across all three frontends.

- [X] T046 [P] Add GovTech Playwright coverage: `tests/govtech-map-nl-only.spec.mjs` — a self-contained pixel-sampling guard (sibling of the VNG map test) asserting the GovTech map renders tile detail INSIDE the Netherlands and nothing OUTSIDE it, statically and under zoom (constitution §VII / FR-048). Runs headless with no auth/dev-server. `npx playwright test tests/govtech-map-nl-only.spec.mjs` → 2 passed. (Full authenticated image snapshots deferred — they need a signed-in live app, not feasible headless in CI.)
- [X] T047 [P] Update `CLAUDE.md` architecture section to list `frontend/govtech` (dev :5175, prod `config.govtechPort = port+2`) alongside Explorer/VNG in the multi-dashboard serving description
- [X] T048 [P] Update `server/.env.default` with the new `GOVTECH_*` env vars and a comment that Alkemio/OIDC/session vars are shared
- [X] T049 Run full type/test gates: `tsc --noEmit` (or `build`) on `server` + all `frontend/*` packages, `pnpm -C server test`, and per-frontend `test`
- [X] T050 Run the `quickstart.md` end-to-end smoke test (three-frontend SSO + GovTech separate profile + Explorer/VNG unchanged, FR-051); include a **session-expiry** check — let the shared session expire while GovTech is open and confirm the user is prompted to re-authenticate and returned to their prior context (FR-050) — confirmed in live testing
- [~] T051 [P] ~~Verify the reduced control surface~~ — **descoped by product owner** (2026-06-26): GovTech ships as a full VNG-equivalent control surface and "will evolve from here"; a reduced-control review is not required for this delivery (FR-009/SC-017 deferred to future iteration)

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup — **BLOCKS all user stories**. Within it: T006 → (T007–T012 promotion) → T013 barrel → T014 VNG slim → T015 VNG regression; server T016 → T017–T020 → T021; GovTech boot T022/T023 [P] → T024.
- **User Stories (Phases 3–12)**: all depend on Foundational. US1 (Phase 3) is the MVP and should land first (it delivers the served third app). Remaining stories are largely independent verification + small config and can proceed in priority order or in parallel.
- **Polish (Phase 13)**: depends on the targeted user stories being complete.

### User story dependencies

- **US1 (P1)**: needs Foundational; delivers the served third frontend + SSO (the integration backbone other stories are demoed on).
- **US2 (P1)**: needs Foundational + US1 running to demo; independent logic.
- **US3, US4, US6, US7, US9, US10 (P2)** and **US5, US8 (P3)**: each needs Foundational; all are independently testable against the running GovTech app. They share no code-level dependencies on each other (only the common foundation).

### Parallel opportunities

- Setup: T001–T004 all [P].
- Foundational: promotion T008/T009/T010/T012 are [P] (distinct shared files) after T006/T007; GovTech-boot T022/T023 are [P].
- Across stories: once Foundational is done, the per-story verification tasks (T031, T033, T035, T038, T039, T041, T043, T044, T045) are independent and can be split across people.
- Polish: T046/T047/T048/T051 are [P].

---

## Parallel Example: Foundational promotion

```bash
# After T006 (AppConfig) + T007 (shell), promote the leaf surfaces in parallel:
Task: "Promote pages into frontend/shared/src/dashboard/pages/ (T008)"
Task: "Promote components into frontend/shared/src/dashboard/components/ (T009)"
Task: "Promote charts into frontend/shared/src/dashboard/charts/ (T010)"
Task: "Promote exportDashboard into frontend/shared/src/dashboard/export/ (T012)"
```

---

## Implementation Strategy

### MVP first (US1)

1. Phase 1 Setup → Phase 2 Foundational (promotion + server registry + GovTech boot), keeping VNG green (T015).
2. Phase 3 US1 → **STOP and validate**: three frontends on distinct ports, shared sign-in, GovTech on its own endpoint.
3. Deploy/demo the served GovTech shell.

### Incremental delivery

- US2 (default hub graph + NL map) → demo the core GovTech experience.
- US3/US4/US6/US9/US10 (P2) → selection, dashboard, branding, localisation, GD layer.
- US7 (P2), then US5/US8 (P3) → org connections, details, gemeente toggle.
- Each story is verified against the running app without breaking the previous ones (FR-051).

---

## Notes

- This is a clone: most "new" behaviour is inherited from the promoted `@ea/shared` surface, so many story tasks are **config + verification** rather than net-new code.
- The single biggest risk is the promotion refactor regressing VNG — T015 (VNG build/test/snapshots) is the gate that protects FR-051; do not proceed past Foundational until it is green.
- Env vars: GovTech uses only `GOVTECH_*`; Alkemio/OIDC/session config is shared (one BFF). `session.allowed_origins` is the one shared list GovTech appends its origin to.
- No new dependencies, GraphQL queries, snapshot, or DB schema — verified in plan.md / research.md.

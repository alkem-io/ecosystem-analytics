---
description: "Task list for 027-vng-admin-area"
---

# Tasks: VNG Dashboard Administration Area

**Input**: Design documents from `specs/027-vng-admin-area/`

**Prerequisites**: plan.md, spec.md, research.md (R1–R15), data-model.md, contracts/ (api-access-sets, api-admin, settings-store), quickstart.md

**Tests**: Included. The spec's Independent Tests and SC-004 ("including attempts that bypass the screen") need server-side tests. The project's practice (feature 026) is real-HTTP route tests via `createApp(appId, …)` on port 0, plus Vitest units and Playwright.

**Organization**: by user story (spec US1–US6), after a Foundational phase that changes the access model, adds the settings store and switches VNG to the managed scope.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US6 from spec.md

---

## Phase 1: Setup

**Purpose**: module skeletons, codegen scope, configuration surface, starting set.

- [X] T001 Create module skeletons:
  - `server/src/settings/README.md`: purpose; "never touched by cache maintenance"; files from contracts/settings-store.md §1.
  - `server/src/admin/` (empty `router.ts` exporting `adminRouter`).
  - `frontend/shared/src/admin/index.ts`.
- [X] T002 [P] Add `'src/graphql/mutations/**/*.graphql'` to `documents` in `server/codegen.ts`, and create `server/src/graphql/mutations/`.
- [X] T003 [P] Declare configuration.
  - In `server/analytics.yml`, under `access:`, add `vng_admin: ${VNG_ADMIN_GATE}:programmagroei` and `vng_display_names: "${VNG_ACCESS_GATE_NAMES}:"`.
  - In `server/analytics.yml`, add a `settings:` block: `backup_dir: "${SETTINGS_BACKUP_DIR}:"` and `backup_keep: ${SETTINGS_BACKUP_KEEP}:14`.
  - Add commented examples to `server/.env.default`: `VNG_ADMIN_GATE`, `VNG_ACCESS_GATE_NAMES`, `SETTINGS_DB_PATH`, `SETTINGS_BACKUP_DIR`, `SETTINGS_BACKUP_KEEP`.
- [X] T004 Write `server/scripts/compare-seed-with-hub.ts`.
  - It reads hub `<nameId>` (argument; default `vih-test`) with the anonymous SDK. If the hub is not anonymously readable, it uses the token in `ALKEMIO_ACCESS_TOKEN`.
  - It prints `OK: <n> Spaces, same order` or the differences against the seed file.
  - It also has a `--write` mode that creates `server/src/data/vng/monitor-settings.seed.json` as `{ "version": 1, "ecosystemKey": "vih-test", "includedSpaces": [<nameIDs in hub order>] }`.
  - Run it once against production and commit the file (quickstart P3).

---

## Phase 2: Foundational (blocking)

**Purpose**: two access sets (R1–R4), the settings store (R5–R8) and the VNG managed scope (R10). Once this phase ships, nothing changes for users except that the VNG hub dropdown and "add Space" control disappear.

**⚠️ No user story starts before this phase is complete.**

> **Changed during implementation (2026-11-14, user decision):** one SQLite file for the whole
> app. The settings are their own tables in the application DB (`data/cache.<env>.sqlite`), not a
> separate `settings.*.sqlite`; there is no `SETTINGS_DB_PATH`. The daily backup copies **only the
> settings tables** into `settings.<env>.<date>.sqlite`, and restore imports them back with
> `node dist/settings/restore-cli.js <file>` (cache and sessions untouched). T015, T020–T023
> were implemented in that form; the isolation test asserts cache operations never touch the
> settings tables (deleting the file is covered by backup + restore).

### Access sets (extends `server/src/access/`)

- [X] T005 [P] Change the types in `server/src/types/access.ts`.
  - Add `GateLink { key; displayName; url; exists: 'yes'|'no'|'unknown' }`.
  - Replace `AccessReport.gate` with `viewerSpaces: GateLink[]`, empty when ungated.
  - Keep the file self-contained: no `..` imports (`server/src/types-boundary.test.ts`).
- [X] T006 [P] Write tests in `server/src/access/policy.test.ts`.
  - `parseGateList("a, b/c")` gives two refs. It rejects an empty item and a duplicate.
  - `levelFromSets`:
    - ADMIN on an admin Space gives `manage`, even without MEMBER.
    - MEMBER on a viewer Space gives `read`.
    - ADMIN on a viewer-only Space gives `none`.
    - LEAD alone gives `none`.
  - `setKey` is `v:<sorted viewer keys>|a:<sorted admin keys>` and is order-independent.
- [X] T007 Implement `parseGateList`, `levelFromSets(viewerRoles: Map, adminRoles: Map)` and `setKey` in `server/src/access/policy.ts`, and remove `levelFromRoles`.
- [X] T008 Change `parseAccessConfig` in `server/src/config.ts` to produce `AccessSets { viewers: GateRef[] | null; admins: GateRef[]; setKey; displayNames: string[] }` per app.
  - Start-up stops when:
    - the viewer value is missing or empty;
    - an item does not parse;
    - an item is duplicated within a set;
    - `<app>_admin` is set while `<app>: none`.
  - Names: `<app>_display_name` names the first viewer Space and `<app>_display_names` names the others by position.
  - Update `server/src/config.access.test.ts`. The production defaults are `vng` viewers `[programmagroei]` and admins `[programmagroei]`; explorer and govtech are `none` with empty admins.
- [X] T009 Re-key the probe registry by Space key in `server/src/access/probe.ts`.
  - `getGateInfo(key)`.
  - `startGateProbes(entries: {gate, displayNameFallback}[])` probes the deduped union of every app's viewer and admin Spaces, with the 60 s retry while `unknown`.
  - Update `server/src/access/probe.test.ts`.
- [X] T010 Change `determineLevel` in `server/src/access/determine.ts` to take `AccessSets`.
  - Run one role query per **distinct** Space, in parallel, under `check_timeout_ms`.
  - Combine the results as in research R1:
    - any proven MEMBER on a viewer Space or ADMIN on an admin Space admits, at the highest level proven;
    - every Space definitively refused or roleless gives `none`;
    - anything else gives `unverified`.
  - Keep the 026 classification: refusal before the auth-error check, and auth errors rethrown.
  - Update `server/src/access/determine.test.ts`: dedupe, a mixed unverified/admit case, all refused, and a read admit while the admin Space is unverified giving `read`.
- [X] T011 Use the sets in `server/src/access/access-service.ts`.
  - `decide()` holds decisions under `gate_key = setKey`.
  - `reportFor()` builds `viewerSpaces` from the registry, the configured names and the last path segment.
  - Update `server/src/access/access-service.test.ts`.
- [X] T012 Add the `fresh` option in `server/src/access/middleware.ts`: `requireAccess({ app, required, fresh })`, where `fresh: true` calls `decide(auth, app, { force: true })` before comparing.
  - Extend `server/src/access/middleware.test.ts` (real HTTP):
    - an ADMIN-only person passes `manage`;
    - a MEMBER-only person gets 403 `ACCESS_DENIED` `reason:"none"`;
    - a role removed mid-session is refused on a `fresh` route but still admitted on a non-fresh route until recheck.
- [X] T013 Wire the sets in `server/src/index.ts` and `server/src/auth/me.ts`.
  - `index.ts` logs `[Access] vng: viewers …; admins …` and calls `startGateProbes` with the union.
  - `me.ts` returns `access.viewerSpaces`.
  - Update `server/src/auth/me.test.ts`.
- [X] T014 Make `frontend/shared/src/dashboard/App.tsx` (the `AccessGate` component) compile against the new `AccessReport`. Pass `access.viewerSpaces[0]` to the existing `NoAccessScreen` for now; US1 replaces this with the full list.

### Monitor settings store (`server/src/settings/`, research R5–R8)

- [X] T015 Export `envSlug` from `server/src/cache/db.ts`, without changing its behaviour. Then create `server/src/settings/db.ts`.
  - It opens its own connection: `SETTINGS_DB_PATH`, which wins verbatim and allows `:memory:`, else `data/settings.<env-slug>.sqlite`. Set WAL and `busy_timeout = 5000`.
  - It records whether the file was newly created.
  - It migrates through `settings_meta(schema_version)`, **never** `PRAGMA user_version`. Version 1 creates these tables exactly as in data-model.md:
    - `settings_state`: a single row with `id = 1`; `revision INTEGER NOT NULL`, `ecosystem_key TEXT NOT NULL`, `updated_at TEXT`, `updated_by_user_id TEXT NULL`, `updated_by_name TEXT NULL`.
    - `included_spaces`: `position INTEGER` PK, `name_id TEXT NOT NULL UNIQUE`, `space_id TEXT NULL UNIQUE`.
    - `settings_changes`: `id` AUTOINCREMENT, `revision INTEGER NOT NULL`, `kind TEXT CHECK IN ('seed','update','rename')`, `at TEXT NOT NULL`, `actor_user_id TEXT NULL`, `actor_name TEXT NULL`, `added_json TEXT NOT NULL`, `removed_json TEXT NOT NULL`, `note TEXT NULL`.
    - `classification_changes`: `id` AUTOINCREMENT, `at TEXT NOT NULL`, `actor_user_id TEXT NOT NULL`, `actor_name TEXT NOT NULL`, `space_name_id TEXT NOT NULL`, `entry_id TEXT NOT NULL`, `entry_label TEXT NOT NULL`, `from_json TEXT NOT NULL`, `to_json TEXT NOT NULL`.
- [X] T016 [P] Write `server/src/settings/seed.test.ts`.
  - The committed seed file is valid.
  - Each of these stops loading: version ≠ 1, an empty `ecosystemKey`, an empty or duplicate nameID, more than `max_spaces_per_query` entries.
  - An empty `includedSpaces` is valid, with a warning.
  - Seeding writes revision 1 and one `kind='seed'` change with note `"from starting set v1"`.
  - A store that has `settings_state` is **never** re-seeded, even with a different seed file.
- [X] T017 Implement `loadStartingSet(path)` and `seedIfEmpty(db, set)` in `server/src/settings/seed.ts`. An invalid set throws `settings: starting set …`. A seed into a newly created file logs the restore-may-be-needed warning (contracts/settings-store.md §2).
- [X] T018 [P] Write `server/src/settings/store.test.ts`.
  - `saveIncludedSpaces` with a stale `baseRevision` returns a conflict carrying the current state.
  - A successful save bumps the revision by 1, replaces the rows in order, and appends one `update` change with the correct `added`/`removed`.
  - `history(limit, before)` pages newest first.
  - `recordRename` and `setSpaceId` behave as specified.
  - `recordClassificationChange` appends a row.
  - No column ever holds a token: assert on the column names.
- [X] T019 Implement `getScope()`, `getIncludedSpaces()`, `saveIncludedSpaces({baseRevision, nameIds, actor})`, `history()`, `setSpaceId()`, `recordRename()` and `recordClassificationChange()` in `server/src/settings/store.ts`. Every write runs in `BEGIN IMMEDIATE`.
- [X] T020 [P] Write `server/src/settings/backup.test.ts`, using a temp dir:
  - a backup is created when today's file is missing and skipped when it exists;
  - only the newest `backup_keep` files are kept;
  - the file name is `settings.<slug>.<YYYY-MM-DD>.sqlite`;
  - a failure is logged and never thrown;
  - a restored backup opens with the same revision.
- [X] T021 Implement `runBackupIfDue()` and `scheduleDailyBackup()` in `server/src/settings/backup.ts`, using better-sqlite3 `db.backup()` to a temp name and then renaming. The directory is `settings.backup_dir`, else `data/backups/`.
- [X] T022 [P] Write `server/src/settings/isolation.test.ts`. Run `runDeploymentCacheMaintenance`, `clearUserCache`, force-refresh invalidation and `purgeExpired`, then delete and re-create the cache DB. The settings revision and rows are unchanged afterwards (SC-005).
- [X] T023 Wire the settings into `server/src/index.ts` **before** any listener starts: open the settings DB, load and validate the starting set (exit on error), `seedIfEmpty`, `runBackupIfDue`, `scheduleDailyBackup`. Then log `[Settings] monitor scope revision <n>, <k> Spaces; last backup <file>`.

### Managed scope for VNG (research R10)

- [X] T024 [P] Add the admin read models to a new `server/src/types/admin.ts`, exactly as data-model.md lists them: `MonitorScope`, `IncludedSpaceView`, `SettingsChangeView`, `InitiativeRef`, `DesignatedClassificationView`, `InitiativeClassificationsView`, `GdSourceSummaryView`. The file must be self-contained.
- [X] T025 Add `server/src/routes/scope.ts` with `GET /api/vng/scope` → `{ revision, ecosystemKey, spaceNameIds }`.
  - It reads the settings store only and never calls Alkemio. It sits behind `authMiddleware`; the gate applies because the path names `vng`.
  - Mount it in `server/src/app.ts`.
  - Write `server/src/routes/scope.test.ts` (real HTTP):
    - no session gives 401;
    - a refused person gets 403, including through the Explorer listener;
    - a viewer gets 200 with the seeded list.
- [X] T026 [P] Add `flags.managedScope?: boolean` to the dashboard app config type in `frontend/shared/src` (wherever `DashboardAppConfig` is declared). Set it to `true` in `frontend/vng/src/appConfig.ts` and leave GovTech unset.
- [X] T027 Fetch the scope when `managedScope` is on.
  - Create `frontend/shared/src/dashboard/hooks/useMonitorScope.ts`: `GET /api/vng/scope`, with a `refetch()`.
  - In `frontend/shared/src/dashboard/hooks/useSelectedSpaces.ts`, when `managedScope` is on:
    - take `hubSpaceIds` from the scope instead of `/api/hubs/:nameId/spaces`;
    - set `activeHubNameId = ecosystemKey`;
    - make `addSpace` a no-op;
    - discard any persisted `directAdded` on load;
    - keep `directRemoved` (narrowing).
- [X] T028 Hide the hub controls when `managedScope` is on.
  - In `frontend/shared/src/dashboard/components/SelectedSpacesPanel.tsx`, don't render `HubSelector`, the "load all hub initiatives" button or `SpacePicker`. Keep the checkboxes, select-all, remove and the GD section.
  - In `frontend/shared/src/dashboard/pages/EcosystemTab.tsx`, take the hub display name from the app title when there is no hub entry.
  - Reword `ecosystem.hint.addSpace` in `frontend/vng/src/i18n/{nl,en}.json`, because viewers can no longer add Spaces.
- [X] T029 [P] Write `frontend/vng/src/dashboard/managed-scope.test.ts`.
  - With `managedScope`, the effective set equals the scope minus `directRemoved`.
  - A legacy `vng_selection` that contains `directAdded` loads without those Spaces.
  - `addSpace` changes nothing.
  - Without the flag (GovTech), behaviour is unchanged.

**Checkpoint**: the server suite passes and VNG loads its Spaces from `/api/vng/scope`. GovTech is unchanged.

---

## Phase 3: User Story 1 — See, before signing in, who can use the monitor (P1) 🎯 MVP

**Goal**: the viewer Spaces, with links, on the sign-in screen and the no-access screen (FR-001–FR-003).

**Independent Test**: configure two viewer Spaces. Signed out, the sign-in screen lists both with links. A non-member's no-access screen lists the same two.

- [X] T030 [P] [US1] Write `server/src/access/public-spaces-handler.test.ts` (real HTTP):
  - works with no session;
  - the VNG listener lists only the viewer Spaces, never admin Spaces;
  - the Explorer listener gives `gated:false, spaces:[]`;
  - falls back to the configured name when the probe has no name;
  - is never gated, even for a session whose holder is refused.
- [X] T031 [US1] Implement `server/src/access/public-spaces-handler.ts` and route `GET /access/spaces` in `server/src/routes/auth.ts`, per contracts/api-access-sets.md §1.
- [X] T032 [P] [US1] Change `NoAccessScreen` in `frontend/shared/src/access/AccessScreens.tsx`.
  - The `gate` prop becomes `spaces: GateLink[]`: one link per Space, each with `data-testid="access-gate-link"`, under a heading.
  - Change `AccessStrings.noAccessBody` to not need `{{space}}`, and add `spacesHeading`.
  - Update `ACCESS_STRINGS_EN`, the caller in `frontend/shared/src/dashboard/App.tsx` (pass `access.viewerSpaces`), the `access.*` keys in `frontend/{vng,govtech}/src/i18n/{nl,en}.json`, and `frontend/vng/src/dashboard/access.test.ts`.
- [X] T033 [US1] Add the Space list to `frontend/shared/src/dashboard/components/LoginScreen.tsx`.
  - Fetch `/api/auth/access/spaces` like `/api/features`.
  - When `gated`, render the list under `login.accessHeading` ("Members of these Spaces can use the monitor").
  - On error, render `login.accessGeneric`.
  - Never block the sign-in button.
  - Add the keys to `frontend/vng/src/i18n/{nl,en}.json` (GovTech is ungated, so it renders nothing new).
- [X] T034 [US1] Extend `tests/vng-access-gate.spec.mjs`: the sign-in screen lists the viewer Spaces signed out; the no-access screen lists every viewer Space link.

**Checkpoint**: US1 is shippable on its own.

---

## Phase 4: User Story 2 — Enter the area and see who may view and who may manage (P1)

**Goal**: a settings entry for managers only, the `/admin` shell, and the Access section (FR-004, FR-005, FR-010, FR-011).

**Independent Test**: a person who is ADMIN of the admin Space sees the entry and both lists. A viewer sees no entry, and `/admin` shows "no access" with no admin data loaded.

- [X] T035 [US2] Implement `adminRouter` in `server/src/admin/router.ts`.
  - Middleware: `authMiddleware`, `resolveUser`, then `requireAccess({ app: 'vng', required: 'manage' })`.
  - Export a `freshManage` middleware for PUT routes (`fresh: true`).
  - Unexpected errors become 502 `{error, message}` per route.
  - Mount it at `/api/vng/admin` in `server/src/app.ts`.
- [X] T036 [US2] Add `GET /access` to `server/src/admin/router.ts` → `{ viewers: GateLink[], admins: GateLink[], me: { displayName, viewer, manager } }` (contracts/api-admin.md §2).
- [X] T037 [P] [US2] Write `server/src/admin/router.test.ts` (real HTTP):
  - no session gives 401;
  - a viewer gets 403 `ACCESS_DENIED` on `/api/vng/admin/access`, on the VNG **and** Explorer listeners (SC-004);
  - a manager gets 200 with both lists;
  - a Space with `exists: 'no'` is reported.
- [X] T038 [P] [US2] Create `frontend/shared/src/admin/api.ts`: typed fetchers for every route in contracts/api-admin.md. They use the shared `apiFetch`, so a 403 `ACCESS_DENIED` triggers `signalAccessDenied()`.
- [X] T039 [US2] Create the admin shell.
  - `frontend/shared/src/admin/AdminApp.tsx`:
    - header with a "back to the monitor" link (`history.pushState('/')`);
    - one column of sections at `lg` and up, stacked below;
    - a `Section` wrapper with its own loading, error and retry state (FR-033).
  - In `frontend/shared/src/dashboard/App.tsx`, when `location.pathname === '/admin'` and `managedScope`, render `React.lazy(AdminApp)` inside `AccessGate`.
  - For anyone whose `me.access.level !== 'manage'`, render a "no access" panel and fetch nothing from `/api/vng/admin/*`.
  - Listen for `popstate`.
- [X] T040 [US2] Add a settings button (`data-testid="admin-entry"`, gear icon from lucide-react) before `UserMenu` in `frontend/shared/src/dashboard/components/BrandingHeader.tsx`. Show it only when `managedScope && me.access.level === 'manage'`, and navigate to `/admin` with `history.pushState`.
- [X] T041 [P] [US2] Create `frontend/shared/src/admin/sections/AccessSection.tsx`.
  - Two lists with the explanations "Members of these Spaces can view the monitor" and "Admins of these Spaces can manage the monitor". Each entry has a link, or "not found" with its key.
  - The manager's own standing.
- [X] T042 [P] [US2] Add the `admin.*` base keys to `frontend/vng/src/i18n/{nl,en}.json`: title, back, sections, access texts, section load errors and retry, no access.

**Checkpoint**: managers can enter `/admin` and see the Access section; viewers can't.

---

## Phase 5: User Story 3 — See the Spaces the monitor reports on (P1)

**Goal**: the Included Spaces read view with the last change and history (FR-012–FR-015, FR-020).

**Independent Test**: the list matches the stored set in order, with names, links and classification status. A Space the manager can't read shows its nameID only. A fresh store shows that it came from the starting set.

- [X] T043 [US3] Implement `resolveIncludedSpaceViews(auth, rows)` in `server/src/admin/included-spaces-service.ts`.
  - Look each Space up by nameID with the manager's token (existing `SpaceAboutOnlyByName`), at most 5 concurrent.
  - If a lookup is not found and `space_id` is known, retry by UUID (existing `lookup.space` query). On success, `recordRename`.
  - Fill a missing `space_id` with `setSpaceId`.
  - Compute `classificationStatus {set, designated}` with `resolveDesignated` from `server/src/transform/classifications.ts` and `config.dashboards.vng.classifications`.
  - An unreadable Space gets `readable:false, displayName:null, url:null`; a missing one gets `found:false`.
- [X] T044 [US3] Add `GET /included-spaces` → `{revision, spaces, lastChange}` and `GET /included-spaces/history?limit&before` to `server/src/admin/router.ts` (contracts/api-admin.md §3).
- [X] T045 [P] [US3] Write `server/src/admin/included-spaces.test.ts`, with the SDK stubbed:
  - order is preserved;
  - an unreadable Space reveals nothing but its nameID;
  - a rename is detected and recorded;
  - history pages;
  - a seed change shows `kind:'seed'`.
- [X] T046 [US3] Create `frontend/shared/src/admin/sections/IncludedSpacesSection.tsx` (read mode).
  - A table at `lg` and up, cards below.
  - Filter box: usable up to 200 Spaces.
  - Classification status per Space.
  - An "unreadable" badge, and "not found".
  - Last change: "by X on date", or "from the starting set".
  - A history disclosure that pages through `/history`.
  - Add its `admin.included.*` keys to nl/en.

---

## Phase 6: User Story 4 — Change which Spaces the monitor reports on (P2)

**Goal**: add and remove Included Spaces with a pending diff, conflict handling and readable-only additions (FR-016–FR-019, FR-009).

**Independent Test**: a manager adds one Space and removes one, then saves. Another viewer's dashboard shows the new set after reload. A forged PUT from a viewer, and a PUT adding an unreadable Space, are both refused.

- [X] T047 [P] [US4] Add `server/src/graphql/queries/adminSpaceSearch.graphql`: `search(searchData: { terms, filters: [{ category: SPACES, types: [SPACE], size: 20 }] })`, selecting each Space result's `space { id nameID about { profile { displayName url } } }`. Then run `pnpm run codegen` in `server/` (it needs `ALKEMIO_GRAPHQL_ENDPOINT=https://alkem.io/api/private/graphql` when there is no `.env`).
- [X] T048 [US4] Implement `searchSpaces(auth, q)` and `resolveSpaceRef(auth, ref)` in `server/src/admin/space-search-service.ts`.
  - `searchSpaces`: requires `q` of at least 2 characters and returns top-level results only.
  - `resolveSpaceRef`: parses with 026 `parseGateRef`.
    - A path deeper than 1 is `NOT_TOP_LEVEL`.
    - Not found or not readable are both `NOT_READABLE`.
    - Garbage is `UNPARSEABLE`.
  - Results are marked `included`.
- [X] T049 [US4] Add these routes to `server/src/admin/router.ts`:
  - `GET /space-search` and `GET /space-resolve` (contracts/api-admin.md §4).
  - `PUT /included-spaces` behind `freshManage`:
    - Validate:
      - every **added** nameID must re-resolve with the manager's token (`NOT_READABLE`, `NOT_TOP_LEVEL`);
      - no duplicates (`DUPLICATE`);
      - at most `max_spaces_per_query` (`TOO_MANY`);
      - an empty list without `confirmEmpty` is 422 `EMPTY_NOT_CONFIRMED`.
    - A stale `baseRevision` is 409 `REVISION_CONFLICT` with `current`.
    - On success, call `saveIncludedSpaces` with actor `{userId, displayName}` from the session, log at info (no tokens), and return 200.
- [X] T050 [P] [US4] Write `server/src/admin/included-spaces-write.test.ts` (real HTTP, SDK stubbed):
  - save → the new revision is visible on `GET /api/vng/scope`;
  - a stale base gives 409;
  - adding an unreadable Space gives 422 `NOT_READABLE`, and the store is unchanged;
  - adding a subspace gives 422 `NOT_TOP_LEVEL`;
  - an empty list without confirmation gives 422;
  - a viewer's forged PUT gives 403 (SC-004);
  - a manager whose ADMIN role was removed after `/me` gets 403 thanks to `fresh` (FR-009);
  - a Space already in the set that the manager can no longer read can still be kept and removed.
- [X] T051 [US4] Add edit mode to `frontend/shared/src/admin/sections/IncludedSpacesSection.tsx`.
  - A search box (debounced `space-search`) and a paste-a-link field (`space-resolve`), with their errors: "You can only add Spaces you can see on Alkemio", "Only top-level Spaces can be added".
  - Pending additions and removals are listed before saving, and can be discarded.
  - An empty-set confirmation dialog.
  - A 409 dialog showing the current set, which reloads into the editor on confirm.
  - After a save, mark the monitor scope stale, so `useMonitorScope().refetch()` runs when the dashboard is shown again.
  - Add `admin.included.edit.*` keys to nl/en.

---

## Phase 7: User Story 5 — Edit one initiative's classifications (P2)

**Goal**: pick an initiative and edit its designated classifications on Alkemio when the manager may update that Space (FR-021–FR-027).

**Independent Test**: as a manager with update rights, change an initiative's phase. Alkemio shows the new value, and your dashboard moves the initiative after you return. An initiative without update rights is read-only with the reason. A GD post shows "no classifications".

- [X] T052 [P] [US5] Add the classification documents, then run `pnpm run codegen`.
  - `server/src/graphql/queries/adminSpaceClassifications.graphql`: `lookupByName { space(NAMEID: $nameId) { id nameID level about { authorization { myPrivileges } profile { displayName url } classifications { id displayLabel cardinality sortOrder values { id label } selectedValueIDs } } } }`.
  - `server/src/graphql/mutations/updateClassificationSelection.graphql`: `updateClassificationEntrySelection(classificationData: { classificationEntryID, selectedValueIDs }) { id selectedValueIDs }`. Confirm the argument name against the generated schema.
- [X] T053 [US5] Implement `readInitiativeClassifications(auth, nameId)` in `server/src/admin/classifications-service.ts` → `InitiativeClassificationsView`.
  - Designated entries for NDS, VNG 2030, phase and TRL come from `resolveDesignated` with the VNG labels. An absent one gets `present:false` and is read-only.
  - `canEdit` is true when `UPDATE` is in `about.authorization.myPrivileges`. Otherwise `reason: 'NO_UPDATE_RIGHT'`.
  - GD post initiatives, identified from the manager's GD row, get `reason: 'GD_POST'` and empty `classifications`.
  - An unreadable Space is a `NOT_READABLE` error.
- [X] T054 [US5] Implement `applyClassificationChanges(auth, actor, nameId, changes)` in `server/src/admin/classifications-service.ts`.
  - First validate everything: SINGLE_SELECT takes ≤ 1 id, and every id must be in the vocabulary. A failure is 422 `INVALID_SELECTION`, and nothing is written.
  - Then, per entry, in order:
    - re-read the entry: a mismatch with `expectedSelectedValueIds` is `CHANGED_ON_ALKEMIO`, and a removed id is `VALUE_REMOVED`;
    - call the mutation: FORBIDDEN is `NOT_PERMITTED`, and a network error or 5xx is `FAILED`;
    - on `SAVED`, call `recordClassificationChange` with labels.
  - After any `SAVED` entry, invalidate the editor's cached rows for that Space with `invalidateCache` / `invalidateItemRows` (or the editor's `__gd_initiatives__` row for a GD subspace).
- [X] T055 [P] [US5] Write `server/src/admin/classifications.test.ts`, with the SDK stubbed:
  - designated resolution by label;
  - no UPDATE gives read-only;
  - a GD post is not editable;
  - a SINGLE_SELECT with 2 ids gives 422 and no write;
  - an expected mismatch gives `CHANGED_ON_ALKEMIO` and no write;
  - FORBIDDEN gives `NOT_PERMITTED` and nothing recorded;
  - success records one change and invalidates only the editor's rows.
- [X] T056 [US5] Add these routes to `server/src/admin/router.ts`:
  - `GET /initiatives?q`: the Included Spaces plus GD initiatives from the manager's cached data; with no `q`, the first 50 by display name.
  - `GET /initiatives/:nameId/classifications`.
  - `PUT /initiatives/:nameId/classifications` behind `freshManage` (contracts/api-admin.md §5–6).
  - Extend `server/src/admin/router.test.ts` with 403 for viewers on all three.
- [X] T057 [US5] Create `frontend/shared/src/admin/sections/ClassificationsSection.tsx`.
  - An initiative search (`/initiatives`), also opened from a row in `IncludedSpacesSection`.
  - The editor: SINGLE_SELECT as a radio group, MULTI_SELECT as a checkbox group. "Not set" is shown read-only.
  - When read-only, show the reason and a link to the Space.
  - Saving sends `expected` values. Per-entry results are shown, and any entry that is not `SAVED` keeps the person's edits.
  - Add `admin.classifications.*` keys to nl/en.
- [ ] T058 [US5] Check against acceptance with one account that has update rights on a Space and one that lacks them: does `UPDATE` in `SpaceAbout.authorization.myPrivileges` predict whether the mutation succeeds (research R12)? Record the result in `specs/027-vng-admin-area/research.md` R12. If it doesn't, switch `canEdit` in `server/src/admin/classifications-service.ts` to the privilege that does.

---

## Phase 8: User Story 6 — See the GemeenteDelers source in detail (P3)

**Goal**: the source Space, counts by source, per-initiative sources, superseded posts with their replacing subspace, and last-read / next-refresh times (FR-028–FR-031).

**Independent Test**: the counts and per-initiative sources match the dashboard's `[GemeenteDelers]` console group on the same data.

- [X] T059 [US6] Extend the GD row in `server/src/services/graph-service.ts` (`loadGdSubgraph`) and `server/src/types/graph.ts`.
  - Carry `readAt` / `expiresAt` from the cache entry onto the GD subgraph and `gdLayer`.
  - Add optional `subspaceDisplayName` and `subspaceUrl` to each `GdLayerSources.superseded[]` entry, from the merge input.
  - Add optional `ambiguous`.
  - Rows cached before this change read the new fields as `null`. No `CACHE_MAINTENANCE_VERSION` bump.
  - Keep `server/src/types/` self-contained.
- [X] T060 [US6] Implement `buildGdSourceSummary(auth)` in `server/src/admin/gd-source-service.ts` → `GdSourceSummaryView`.
  - It uses the manager's own GD row (`loadGdSubgraph`).
  - `migrationComplete = available && viaPosts === 0`.
  - An unreadable source or a failed load gives `available:false` and an `error`, and never zero counts.
- [X] T061 [P] [US6] Write `server/src/admin/gd-source.test.ts`.
  - Counts and per-initiative sources equal the frontend `summariseGdSources` (`frontend/shared/src/dashboard/data/gd-source-log.ts`) on the same fixture dataset (SC-006).
  - The unavailable case reports no counts.
  - Old rows give `readAt: null`.
- [X] T062 [US6] Add `GET /gd-source` to `server/src/admin/router.ts`, and a 403-for-viewer case to `server/src/admin/router.test.ts`.
- [X] T063 [US6] Create `frontend/shared/src/admin/sections/GdSourceSection.tsx`.
  - The source Space link, total, subspaces and posts.
  - A disclosure listing each initiative with its source, and each superseded post with its replacing subspace.
  - Last read and next refresh, or "unknown" for old rows.
  - "Migration to subspaces complete" when there are no posts.
  - An unavailable message when the source can't be read.
  - Add `admin.gd.*` keys to nl/en.

---

## Phase 9: Polish & Cross-Cutting

- [X] T064 [P] Write `tests/vng-admin-area.spec.mjs` (Playwright, `VNG_URL`), covering quickstart §3 rows 3–10 against stubbed `/api/*` routes:
  - the viewer sees no entry, and `/admin` shows "no access";
  - the manager reaches every section;
  - add/remove with the pending diff;
  - the 409 dialog;
  - the read-only classification reason;
  - the GD counts.
- [X] T065 [P] Extend `tests/mobile-navigation.spec.mjs`: `/admin` at 390, 820 and 1440 px has no horizontal page scroll, and Included Spaces renders as cards below `lg` (FR-034).
- [X] T066 [P] Update `server/src/access/README.md`: viewer and admin sets, `levelFromSets`, `setKey`, `fresh`, the public Space list. Complete `server/src/settings/README.md`: files, start-up, backup, restore, "never re-seeded".
- [X] T067 [P] Update `CLAUDE.md`:
  - architecture bullet: access sets, monitor settings store, managed scope, admin area;
  - configuration variables: `VNG_ADMIN_GATE`, `VNG_ACCESS_GATE_NAMES`, `SETTINGS_*`;
  - an Active Technologies line for 027;
  - Recent Changes.
- [X] T068 [P] Bump `.specify/memory/constitution.md` to 4.3.2: the Development Workflow "add a dashboard" step mentions the optional `access.<app>_admin`, and Data Sensitivity notes that the monitor settings store is global configuration, not a user cache.
- [X] T069 Run quickstart §4 and fix any failures:
  - `pnpm run build` and `pnpm run test` in `server/`;
  - `pnpm run build` in `frontend/vng`, `frontend/govtech` and `frontend/ecosystem-analytics`, including the types-boundary test, so the Docker frontend stage still compiles.
- [ ] T070 Run quickstart §3 manually against acceptance, rows 1–14. Hand release preconditions P1–P4 (persistent volume, backup location, seed equality, admin gate) to infra and the user, and record the outcomes in `specs/027-vng-admin-area/quickstart.md`.

---

## Dependencies & Execution Order

- **Setup (T001–T004)** → **Foundational (T005–T029)** → the user stories.
- Within Foundational:
  - access sets T005–T014 in order (T005, T006 parallel first);
  - the settings store T015–T023 (the T016, T018, T020, T022 tests can be written in parallel with their implementations' predecessors);
  - the managed scope T024–T029 needs T019 (store) and T025 before T027.
- **US1** (T030–T034) needs only the access sets.
- **US2** (T035–T042) needs Foundational.
- **US3** (T043–T046) needs US2's router and shell.
- **US4** (T047–T051) needs US3.
- **US5** (T052–T058) needs US2. It is independent of US3 and US4, though its "open from list" link uses US3's section when present.
- **US6** (T059–T063) needs US2 only.
- **Polish** comes after the stories it covers.

```
Setup ─▶ Foundational ─┬─▶ US1
                       └─▶ US2 ─┬─▶ US3 ─▶ US4
                                ├─▶ US5
                                └─▶ US6
```

## Parallel examples

- **Foundational**: T005 (types), T006 (policy tests), T016 (seed tests), T018 (store tests), T020 (backup tests) and T024 (admin types) touch different files.
- **US2**: T037 (router tests), T038 (frontend api), T041 (AccessSection) and T042 (i18n) run together once T035 exists.
- **After US2**: US5 (T052…) and US6 (T059…) can proceed in parallel with US3 → US4.

## Implementation Strategy

1. **MVP = Foundational + US1.** Access sets are live, the settings store is seeded and backed up, VNG reads its scope from the store, and the sign-in screen tells people where to get access. Ship this first. It carries the riskiest change (the access rule and the hub removal) on its own.
2. **US2 + US3**: managers can see the area, the access lists and the included Spaces.
3. **US4**: managers curate the scope. This is the point where the monitor becomes "its own application".
4. **US5**, then **US6**.

Validate each increment with its Independent Test before moving on. Quickstart §0 preconditions P1–P2 (persistent volume, backup location) must be confirmed before the MVP reaches production, because the store starts accumulating real changes once US4 ships.

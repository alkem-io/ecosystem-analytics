# Research: VNG Dashboard Administration Area

**Feature**: 027-vng-admin-area · **Spec**: [spec.md](./spec.md) · **Date**: 2026-11-14

Each decision lists what was chosen, why, and what was rejected. File references are to the
code as it stands on this branch (built on 026-space-access-gate).

---

## R1. Access from two sets of Spaces

**Decision**: Each application declares **viewer Spaces** and, optionally, **admin Spaces**:

- `access.<app>` keeps its meaning (the viewer set) but accepts a comma-separated list.
- A new optional key `access.<app>_admin` holds the admin set.

The level is computed per Space and combined:

| Combination | Level |
|---|---|
| `MEMBER` on any viewer Space | `read` |
| `ADMIN` on any admin Space | `manage` (includes read) |
| neither | `none` |

The new `levelFromSets()` in `access/policy.ts` replaces `levelFromRoles()`. Today's rule
(MEMBER+ADMIN on the one gate → manage; ADMIN alone → none, `policy.ts:110-114`) would contradict
FR-007, so it goes.

**Determination**: one role query per **distinct** Space (deduped, so a Space in both sets is
queried once and yields both roles). The queries run in parallel under the existing
`check_timeout_ms`. They use the existing `accessGateL0/L1/L2` queries; there is no new query.

| Per-Space outcomes | Result |
|---|---|
| any viewer Space gives MEMBER, or any admin Space gives ADMIN | admitted at the highest level proven |
| every Space definitively refused or roleless | `none` |
| otherwise (some unverified, none admitted) | `unverified` (never held, as in 026) |

Admitted at `read` while an admin Space was unverified: the decision is held as `read`. A
manager whose admin check failed sees no settings entry until "check again". Writes re-check
anyway (R4), so this never grants anything.

**Held decision key**: `gate_key` becomes a canonical string of both sets, e.g.
`v:programmagroei|a:programmagroei`. Any change to either set invalidates every held decision, as a
reconfigured gate does today. The `access_decisions` schema is unchanged.

**Production default**: `vng: programmagroei`, `vng_admin: programmagroei`. Programmagroei MEMBERs
view as before (SC-008). Its ADMINs now manage **even without MEMBER**, which is the deliberate
change FR-007 asks for.

**Rejected**:
- A structured YAML list (`vng: { viewers: [...], admins: [...] }`): it breaks the
  `${ENV}:default` substitution pattern every other key uses, and a list cannot be set from one env var.
- Keeping MEMBER+ADMIN on the same Space: it contradicts FR-007 and the spec's Assumptions.

## R2. The gate registry is keyed by Space, not by application

**Decision**: `probe.ts` keeps one `GateInfo {displayName, url, exists}` per **Space key** (path),
not per app. `startGateProbes()` takes the union of all apps' viewer and admin Spaces. Each app's
display-name fallback becomes per Space:

- `access.<app>_display_name` keeps applying to the **first** viewer Space.
- Additional names come from the optional comma-separated `access.<app>_display_names`, aligned
  by position.
- Otherwise the last path segment is used.

**Why**: the same Space can serve several apps or both sets. Probing it once avoids duplicate
anonymous traffic, and existence is a property of the Space.

## R3. Viewer Spaces before sign-in

**Decision**: a new **public** endpoint `GET /api/auth/access/spaces` (contracts/api-access-sets.md §1):

- It returns the listener app's viewer Spaces as `{displayName, url}` from the probe registry,
  with the configured fallback name.
- It sits under `/api/auth/*`, which the gate already exempts, and needs no session.
- `LoginScreen` fetches it as it already fetches `/api/features`.

**Why**: the probe already reads these names **anonymously** at start-up (026, Constitution I/IV
compatible). Serving them again discloses nothing that Alkemio does not show anonymous
visitors. A private Space whose name the probe cannot read shows the operator-configured name
(FR-002).

**The no-access screen**: `AccessReport.gate` (single) becomes `AccessReport.viewerSpaces: GateLink[]`.
`NoAccessScreen` renders the list (FR-003). Admin Spaces are **not** in `/api/auth/me`; only the
admin API returns them.

**Rejected**: extending `/api/features`. It is an app-agnostic feature-flag endpoint, and gate
info is per listener.

## R4. Admin API protection and the fresh check on writes

**Decision**: every admin route is under `/api/vng/admin/*`, a path that already names the `vng` app
(026 `request-apps.ts`), so the app-level `accessGate` applies. The router adds
`requireAccess({ app: 'vng', required: 'manage' })` for **reads**.

**Writes** use `requireAccess({ …, fresh: true })`, a new option: it calls `decide(auth, app, {force: true})`
before the handler. The decision is re-determined from Alkemio and stored, so a removed admin is
refused at once and loses the entry on the next `/me` (FR-009).

A refused write returns the 026 403 `ACCESS_DENIED` shape. The SPA's `useAccessControl` then
re-reads `/me` and shows the right screen.

**Why**: this reuses the 026 module exactly as its README anticipated ("A stricter area").
`fresh` is the one addition, and it goes in the module, not in the routes (FR-018a of 026:
consumers never re-implement the rule).

## R5. Where the monitor settings live

> **Revised during implementation (2026-11-14, user decision): one SQLite file for the whole
> application.** The first decision below (a separate `settings.<env>.sqlite`) was replaced.

**Decision**: the settings are **their own tables in the application's single SQLite file**
(`data/cache.<env-slug>.sqlite`, or `DB_PATH`), beside the cache and sessions:

- **Tables**: `settings_meta`, `settings_state`, `included_spaces`, `settings_changes`,
  `classification_changes` (data-model.md).
- **Module**: `server/src/settings/`, using the application connection (`getDatabase()`).
- **Schema**: versioned through `settings_meta(schema_version)`, never `PRAGMA user_version`,
  which the cache uses as its maintenance marker (`cache-service.ts`).

**Why**: one file is simpler to operate (one volume, one path, one thing to back up and move).
Only configuration is at stake (the user: "most of the real data is pulled from spaces on
Alkemio"), so a second file was not worth its operational cost.

**What protects the settings**: every cache operation (`runDeploymentCacheMaintenance`,
`clearUserCache`, `invalidateCache`, `invalidateItemRows`, `purgeExpired`) deletes from
`cache_entries` (or the session tables) only. `settings/isolation.test.ts` runs all of them,
including every maintenance step, and asserts the settings are unchanged. Losing the whole file
loses the settings too; that is what the daily backup (R6) covers.

**Multiple replicas**: unchanged — the file is the shared store the constitution already
requires. Writes are rare, revision guarded, and run in `BEGIN IMMEDIATE` transactions (R9).

**Release precondition** (quickstart §0): confirm that `server/data/` is on a persistent volume.

**Rejected**:
- A separate settings file (the first decision): safer by construction, but a second file to
  place, mount and reason about; the user chose one file.
- A managed database (Postgres): only configuration is at stake; "up to a day of loss" is fine.
- Files written as JSON: no transactions, and racy across replicas.

## R6. Daily backup and restore

**Decision**: the BFF backs up **the settings tables only**:

- **Method**: a new small SQLite file is created with the settings schema, and the settings
  tables are copied into it through `ATTACH` in one transaction (consistent), written to a temp
  name and renamed. The cache and the sessions (encrypted tokens) are **never** in a backup.
- **When**: at start-up if today's file is missing, then checked hourly (once per UTC day).
- **Where**: `SETTINGS_BACKUP_DIR`, default `data/backups/`.
- **File name**: `settings.<env-slug>.<YYYY-MM-DD>.sqlite`.
- **Retention**: the newest **14** files are kept (`SETTINGS_BACKUP_KEEP`).
- **Replicas**: skipped when today's file exists.

**Restore** is an operator action (contracts/settings-store.md §4): stop the app, run
`node dist/settings/restore-cli.js <backup>`, which replaces only the settings tables, and start.

**Why**: no new infrastructure; meets "at most one day of changes lost" (FR-012); and copying
only the settings keeps tokens and cached Alkemio data out of backups (Constitution IV).

**Caveat recorded as a release precondition**: a backup on the **same** volume does not survive
loss of the volume. `SETTINGS_BACKUP_DIR` should point at a different mount, or the volume needs
its own snapshot policy. Infra's decision; quickstart §0 lists it.

**Rejected**: an export/import endpoint, which is not needed for the spec's recovery target and
which the spec scopes out ("restore in one action").

## R7. The starting set shipped with the build

**Decision**: `server/src/data/vng/monitor-settings.seed.json`. `pnpm run build` already copies
`src/data/` to `dist/data/` (`server/package.json:13`), and the Dockerfile ships `dist`. Shape:
see data-model.md §StartingSet.

- **Validation**: at start-up, before listening. An invalid file stops start-up (FR-013): wrong
  version, an empty or malformed nameID, a duplicate, or a list over `max_spaces_per_query`.
- **Seeding**: only when the store has no revision row (FR-013). It is recorded in the history as
  `kind: 'seed'`. If the store file did not exist, the start-up log warns: "monitor settings
  seeded from starting set; if this deployment had settings before, restore a backup"
  (spec edge case).
- **First-release content**: the Spaces of production hub `vih-test`, in hub order. Implementation
  fetches them once with an authenticated query, commits the file, and quickstart §2 verifies
  equality (SC-008).

**Rejected**: seeding from the hub at runtime. The user chose a build-shipped starting set, and
the hub is no longer read at all.

## R8. Identity of an Included Space

**Decision**: each Included Space stores its **nameID** (what the whole pipeline uses:
`POST /api/graph/generate` `spaceIds` are nameIDs) and, once known, its Alkemio **UUID**.

- The seed carries nameIDs only. The UUID is filled in the first time a manager's token resolves
  the Space.
- If a nameID lookup fails and the UUID is known, the Space is looked up by UUID. When that
  succeeds, the stored nameID is updated (a rename), with a `kind: 'rename'` history row.

**Why**: Alkemio Spaces can be renamed. The UUID survives a rename, while the nameID is what the
loader needs.

## R9. Concurrent edits

**Decision**: the settings carry a monotonically increasing **revision** (one row).

- `PUT /included-spaces` sends `baseRevision`. A mismatch gives 409 `REVISION_CONFLICT` with the
  current set, and the UI shows it and asks for confirmation (FR-018).
- Saving an empty set requires `confirmEmpty: true` (FR-017).

**Classification saves** are optimistic per entry: the request carries each entry's
`expectedSelectedValueIds`. Before writing, the BFF re-reads the entry with the manager's token,
and a mismatch is a per-entry `CHANGED_ON_ALKEMIO` (contracts/api-admin.md §6).

## R10. Removing the hub picker for VNG only

**Decision**: a new app flag `managedScope` (VNG: on; GovTech: off), checked in the shared shell.
When it is on:

- `useSelectedSpaces` takes its base set from `GET /api/vng/scope` (the Included Spaces nameIDs)
  instead of `/api/hubs/:nameId/spaces`. `activeHubNameId` becomes the scope's `ecosystemKey`.
- `SelectedSpacesPanel` hides `HubSelector`, the "load all hub initiatives" button and
  `SpacePicker`. It keeps the per-row checkboxes, select-all and remove (narrowing = `directRemoved`).
- `addSpace` is a no-op, and a persisted `directAdded` from before this feature is discarded on
  load (FR-014).
- The Ecosystem tab's orchestrator keying uses `ecosystemKey`. The first release seeds it as
  `vih-test`, so the built-in orchestrator table and every stored `orchestrator_choices` row keep
  working unchanged.
- VNG's `ecosystem.hint.addSpace` copy is reworded, since viewers can no longer add Spaces.

**Server enforcement**: the BFF does **not** reject VNG graph requests for Spaces outside the set.
The Ecosystem tab legitimately widens the request with orchestrator candidates outside the set
(`DashboardDataProvider.tsx:90-100`), and the loader sends a single union, so the server cannot
tell the two apart. No data exposure follows: every Space is still read with the viewer's own
token. FR-014 is a UI requirement ("offer viewers no way"). Revisit when the later front-end
simplification removes the widening.

**GovTech** keeps the hub picker (FR-036). `/api/hubs*` stays for GovTech.

## R11. The admin view in a router-less SPA

**Decision**: the VNG SPA has no router (`react-router-dom` is a dependency but unused).

- **Routing**: the shared `App` checks `location.pathname === '/admin'` (the BFF already serves
  `index.html` for every non-API path, `app.ts:97-103`).
- **Entry**: a header button next to `UserMenu` in `BrandingHeader`. It is shown when
  `me.access.level === 'manage'` and `managedScope` is on, and it navigates with
  `history.pushState`. Back returns to the dashboard.
- **Selection**: it is kept in localStorage already, so the dashboard's selection survives the
  round trip (FR-004).
- **Bundling**: `AdminApp` is lazy-loaded (`React.lazy`), so viewers never download it.

**Rejected**: adopting react-router for one extra screen. That is too wide a change for the shell.

## R12. Classification editing on Alkemio

**Decision**:

- **New query `adminSpaceClassifications(nameID)`**:
  - Reads `about { authorization { myPrivileges } classifications { id displayLabel cardinality sortOrder values {id label} selectedValueIDs } }`
    plus `profile { displayName url }` and `level`.
  - The designated entries come from the existing pure `resolveDesignated()`
    (`transform/classifications.ts`) with `config.dashboards.vng.classifications`.
- **New mutation document `updateClassificationSelection`**: wraps
  `updateClassificationEntrySelection({classificationEntryID, selectedValueIDs})`, a full replace.
  This is the **first mutation `.graphql` in the repo**, so Constitution II's codegen applies.
- **`canEdit`**: `about.authorization.myPrivileges` includes `UPDATE`.
  - Alkemio remains the final judge: a FORBIDDEN on the mutation is reported as `NOT_PERMITTED`
    and nothing is shown as saved (FR-024).
  - **Implementation check** (task): on acceptance, confirm with one account that has and one that
    lacks update rights that `UPDATE` on `SpaceAbout.authorization` predicts the mutation's
    outcome. If not, switch `canEdit` to the privilege that does.
- **Missing designated entry**: shown "not set" and read-only. Adding a classification to a Space
  is the classification programme's template action on Alkemio, not a selection change, so
  Alkemio does not permit it through this mutation (spec edge case: "only when Alkemio permits it").
- **GD post initiatives**: not editable (FR-026), and the response says `source: 'post'`.
- **After a save**:
  - The BFF invalidates the **editor's** cached rows for that Space (or the editor's GD row, for a
    GD subspace) with the existing `invalidateCache`/`invalidateItemRows`, so the editor sees the
    change on return (FR-025).
  - Other viewers see it within their TTL.
  - Each successful entry change appends a `classification_changes` row (FR-027).

## R13. The GemeenteDelers summary for the admin area

**Decision**: `GET /api/vng/admin/gd-source` builds from the **manager's own** GD row (`loadGdSubgraph`), so
it is scoped by that manager's rights like everything else. Small additions to the GD row:

- `readAt` / `expiresAt` from the cache entry (`getCacheEntry` already returns `createdAt`/`expiresAt`;
  `loadGdSubgraph` currently drops them).
- The replacing subspace's `displayName`/`url` on each `superseded` entry.
- `ambiguous` (already computed by `mergeGdSources`, not yet carried).

The per-initiative source list comes from the row's `callouts[].source`.
The server computes the summary itself. It must agree with the frontend's `summariseGdSources`
(SC-006), and a test asserts that both give equal counts on the same dataset.

No `CACHE_MAINTENANCE_VERSION` bump: rows cached before the change lack the new fields, and the
section shows "unknown" for them until the row's TTL expires (graceful, Constitution V).

## R14. Space search for adding an Included Space

**Decision**:

- **By name**: Alkemio `search` with `filters: [{category: SPACES, types: [SPACE], size: 20}]`,
  `SPACE` being top-level only, run with the manager's token, so only readable Spaces come back
  (FR-016).
- **By pasted link or nameID**: parsed with 026's `parseGateRef`. Anything deeper than L0 is
  refused as `NOT_TOP_LEVEL`. It is resolved by `lookupByName.space` with the manager's token,
  and an unresolvable Space is refused as `NOT_READABLE`.
- **On save**: the BFF re-resolves every **added** Space with the manager's token, so a forged
  request cannot add an unreadable Space.

## R15. Change records

**Decision**: two append-only tables in the settings DB:

- `settings_changes` (seed / update / rename)
- `classification_changes`

Each row holds the actor's Alkemio user id and display name (from the session), a timestamp, and a
JSON payload of Space nameIDs or value ids and labels. There are **no tokens or session ids**
(FR-035). Each change is also logged at `info` with the same fields minus the display name.

There is no general audit facility in the codebase today (only winston). This is the first.

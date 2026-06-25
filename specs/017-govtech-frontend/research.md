# Phase 0 Research: GovTech Netherlands Frontend

All Technical-Context unknowns are resolved below. GovTech is a near-clone of VNG, so most "research" is **deciding the reuse boundary** rather than evaluating new technology. No new dependencies are introduced.

---

## D1. Reuse strategy — promote-and-wrap vs copy-and-fork

**Decision**: **Promote** VNG's generic surface into `@ea/shared` and make `frontend/vng` + `frontend/govtech` thin wrappers parameterised by a per-app `AppConfig`. Do **not** copy `frontend/vng` into `frontend/govtech`.

**Rationale**: The shareability audit found ~70% of the VNG app is already generic (pages, generic hooks, generic components, charts, selection context, dashboard export, all API hooks). Forking would duplicate that 70% and force every future fix into two places, drifting the two Dutch dashboards apart. Spec FR-007 mandates reuse over duplication, and the user explicitly asked to "share what can be shared". Promotion preserves VNG's rendered output (a refactor, not a rewrite), so FR-051 (no change to VNG) holds and is guarded by VNG's existing visual snapshots.

**Alternatives considered**:
- *Copy `frontend/vng` → `frontend/govtech`*: fastest initial cut, but violates FR-007, doubles maintenance, and guarantees divergence. Rejected.
- *Single app with a runtime "mode" switch*: cannot satisfy the core requirement of a separate port + endpoint + subdomain, and entangles the two deployments. Rejected.

---

## D2. Promotion boundary — what moves to `@ea/shared`

**Decision**: Promote into `@ea/shared` (new `app/` + `dashboard/` folders):
- **Shell/chrome**: the 3-tab `DashboardApp` shell, `BrandingHeader`, `LoadingScreen`, `LoginScreen`, `UserMenu`, `LanguageSwitcher`, `AboutDialog`, `AuthorizationWarning`, `ErrorBoundary` — branding (logo, title) injected via `AppConfig`/i18n.
- **Pages**: `GraphTab`, `SpaceDetailsTab`, `DashboardTab`.
- **Components**: `HubSelector`, `SpacePicker`, `SelectedSpacesPanel`, `GemeenteToggle`, `InitiativesToggle`, `GdProvenanceNote`, `InitiativeMap`, `InitiativeGemeentesPanel`, `MapToggle`, `GraphMetricsBar`.
- **Charts**: `CategoryBarChart`, `NdsChart`, `Vng2030Chart`, `GemeenteDistributionChart`.
- **Hooks/context**: `useHubs`, `useSelectedSpaces`, `useVngGraph`, `useDashboard`, `useGdInitiatives`, `useGraphProgress`, `SelectionContext`.
- **Export**: `exportDashboard` (XLSX) — workbook creator/filename from `AppConfig`.

**Stays per-app (thin wrapper)**: the app-id constant + `AppConfig`, the Logo SVG (`VngLogo`/`GovtechLogo`), `styles/index.css` brand-token overrides, the i18n bundle (`nl.json`/`en.json` + storage key), `main.tsx`/`App.tsx` mount point, `vite.config.ts`, `package.json`, html/tsconfig.

**Rationale**: This line follows the audit's generic/parameterisable/app-specific classification. The only genuinely app-specific assets are branding and the i18n bundle; everything behavioural is shared.

---

## D3. Per-app parameterisation — the `AppConfig` object

**Decision**: A small `AppConfig` (provided via React context to the shared `DashboardApp`) carries every per-app value that the audit flagged as hardcoded-`vng`:

| Concern | VNG value | GovTech value | Source |
|---|---|---|---|
| `appId` | `'vng'` | `'govtech'` | wrapper |
| API namespace | `/api/vng/*` | `/api/govtech/*` | `appId` |
| localStorage selection key | `vng_selection` | `govtech_selection` | `${appId}_selection` |
| localStorage language key | `vng_lang` | `govtech_lang` | `${appId}_lang` |
| custom events | `vng:openSpace`, `vng:selection` | `govtech:openSpace`, `govtech:selection` | `${appId}:…` |
| Logo component | `VngLogo` | `GovtechLogo` | wrapper |
| brand tokens (CSS) | vng `index.css` | govtech `index.css` | wrapper (scoped) |
| i18n bundle | vng `nl/en.json` | govtech `nl/en.json` | wrapper |
| XLSX creator/filename | `VNG…` / `vng-dashboard-*.xlsx` | `GovTech…` / `govtech-dashboard-*.xlsx` | i18n + `appId` |

**Rationale**: Replacing the ~20 hardcoded `vng` literals the audit listed with `AppConfig`-derived values is what makes a single shared codebase serve both apps without collisions (notably localStorage and custom-event names, which would otherwise bleed across apps on the same parent domain).

**Alternatives considered**: build-time string replacement / env defines — brittle and invisible at runtime. Rejected in favour of an explicit typed config object.

---

## D4. Config & environment split — shared vs separate (per user directive)

**Decision**: The single BFF keeps **one shared** configuration for everything auth- and platform-related; only the per-dashboard profile is split per app with **independent env vars**.

- **Shared (one value for all frontends)** — required for cross-frontend SSO and because there is one backend:
  - `alkemio:` (which Alkemio environment — server URL, GraphQL endpoint)
  - `oidc:` (issuer, client id/secret, redirect, scopes, audience)
  - `session:` (`enc_key`, `cookie_domain`, idle timeout) — the auth/session context
  - `cache:`, `limits:`, `logging:`, `openai:`, `features:`
- **Separate per app** (`govtech:` block, own `GOVTECH_*` env vars — nothing reused from `VNG_*`):
  - default innovation hub (`GOVTECH_DEFAULT_HUB_NAMEID`)
  - dashboard tag→category taxonomy (`govtech.tag_category_mapping`)
  - GemeenteDelers space nameID (`GOVTECH_GD_SPACE_NAMEID`, **defaults to the same `gemeentedelers`** — same corpus as VNG, but its own env var per the "separate" directive)
  - GD cache TTL (`GOVTECH_GD_CACHE_TTL_HOURS`)
  - frontend port (`GOVTECH_FRONTEND_PORT`, default `port+2`)
- **Shared list GovTech appends to**: `session.allowed_origins` — GovTech's dev origin (`http://localhost:5175`) and its production subdomain are **added** to the one allow-list (they must be, for the shared `ea_session` cookie + post-login returnTo to be accepted on the GovTech origin).

**Rationale**: The user directed that GovTech's env vars be separate, but that "Alkemio environment" and "auth information" be shared. That maps exactly onto the architecture: one BFF means one Alkemio client and one session/auth context (shared); the dashboard profile is the only thing that legitimately differs per app (separate). `allowed_origins` is the one shared list GovTech must extend, since the whole point is one session across all three origins.

**Implementation**: Generalise `parseVngConfig` into a registry `dashboards: Record<'vng'|'govtech', DashboardAppConfig>`, parsing the `vng:` and `govtech:` YAML blocks (each with its own env-var-substituted keys). Add `config.govtechPort = Number(process.env.GOVTECH_FRONTEND_PORT) || config.port + 2`. Keep `config.vng`/`config.vngPort` working (back-compat).

**Alternatives considered**: a separate per-app OIDC client / Alkemio config — rejected: the user said auth/Alkemio is shared, and a single BFF cannot host divergent session crypto without breaking SSO.

---

## D5. App-aware routing on the BFF

**Decision**: Generalise the VNG-namespaced routes to **`/api/:app/*`** (`:app ∈ {vng, govtech}`), resolving `config.dashboards[:app]` (taxonomy + GD space). Mount the same router so **`/api/vng/dashboard`, `/api/vng/initiatives` keep working** (FR-051) and `/api/govtech/*` is served by identical logic with the GovTech profile. For the default hub, extend `GET /api/hubs` with an optional **`?app=<id>`** query that selects which profile's `defaultHubNameId` is returned (defaults to `vng` if absent, for back-compat). Unknown `:app`/`?app` values → 400.

**Rationale**: The dashboard/initiatives services are already generic; only the resolved taxonomy + GD-space config differs. Parameterising by `:app` reuses one route + service layer instead of copying it. The frontend already issues `/api/vng/*`; the shared `useDashboard`/`useGdInitiatives` hooks switch to `/api/${appConfig.apiNamespace}/*`, so VNG emits `/api/vng/*` and GovTech `/api/govtech/*` from the same code.

**Alternatives considered**: a hand-written parallel `/api/govtech/*` router — rejected (duplicates the route layer). Inferring the app from the request Host — rejected (in dev all three SPAs proxy `/api` to the same backend port, so Host can't distinguish them; an explicit app id is reliable).

---

## D6. Dashboard taxonomy & data sources for GovTech

**Decision**: GovTech ships VNG's **same two dimensions** (`nds`, `vng2030`) as its default, with its **own** `govtech.tag_category_mapping` seeded as a copy of VNG's (operator-editable, can diverge later). GovTech reads the **same gemeente snapshot and the same `gemeentedelers` space/provenance** as VNG.

**Rationale**: Clarifications fixed taxonomy = "same as VNG, configurable" and data sources = "same as VNG". Reusing the `nds`/`vng2030` dimension keys means the shared `DashboardTab` + charts + i18n `categories.*` work for GovTech unchanged; only `app.title`/`app.subtitle` branding strings differ. The shared snapshot + GD space mean **no new GraphQL queries, no new snapshot, and shared GD cache rows**. Divergence later is purely a `govtech:` config edit.

**Consequence**: The GD provenance note (GemeenteDelers, 2021–2025, vng.nl/praktijkvoorbeelden) stays accurate and identical for GovTech, since it describes the same source corpus — so `GdProvenanceNote`/`provenance.gd` i18n is shared, not forked.

**Alternatives considered**: a bespoke GovTech taxonomy now — rejected by the clarification (start from VNG, diverge later via config).

---

## D7. Serving, ports, and Docker

**Decision**: Add a third `createApp('../frontend-govtech/dist')` listener on `config.govtechPort` in `server/src/index.ts` (mirrors the Explorer/VNG pattern). Dev: GovTech Vite on **:5175** proxying `/api` → :4100; add a `dev:govtech` script and a `govtech` pane to the root `concurrently` dev script; add `frontend/govtech` to `pnpm-workspace.yaml`. Prod: build to `frontend/govtech/dist`, copy into the image as `frontend-govtech/dist`, `EXPOSE` the new port, and add the GovTech subdomain route + allowed-origin in infra.

**Rationale**: This is the constitution's documented "add a new dashboard" pattern (Development Workflow), already used for VNG. Default port `port+2` keeps Explorer (`port`), VNG (`port+1`), GovTech (`port+2`) contiguous and overridable via `GOVTECH_FRONTEND_PORT`.

**Alternatives considered**: a separate container for GovTech — rejected; the established pattern is one BFF container serving all SPAs on distinct ports, sharing the session/cache store.

---

## D8. Localisation for GovTech

**Decision**: GovTech gets its **own** i18n bundle (`nl.json`/`en.json`) with its own storage key (`govtech_lang`), Dutch default + English. Most keys are copied from VNG verbatim; only `app.title` (`"GovTech Nederland"` / `"GovTech Netherlands"`), `app.subtitle`, and any GovTech-branded copy differ. Category labels (`categories.nds`, `categories.vng2030`), provenance, warnings, and structural strings are reused as-is.

**Rationale**: The shared `DashboardApp` consumes `t()` keys; giving GovTech its own bundle (rather than overriding individual keys) keeps each app's translations self-contained and lets GovTech copy diverge freely, while the storage-key split prevents the language preference bleeding across apps on the same domain.

---

## Resolved unknowns summary

| Unknown | Resolution |
|---|---|
| Fork vs share | Promote generic surface to `@ea/shared`; thin per-app wrappers (D1, D2) |
| How per-app values are injected | Typed `AppConfig` via context (D3) |
| Which config/env is shared vs separate | Alkemio/OIDC/session shared; default-hub/taxonomy/GD-space/port separate with `GOVTECH_*` env vars (D4) |
| How the BFF serves two profiles | `/api/:app/*` + `/api/hubs?app=`; `/api/vng/*` preserved (D5) |
| GovTech taxonomy & data | VNG's `nds`/`vng2030` dims + same gemeente/GD corpus; own editable mapping (D6) |
| New deps / queries / snapshot | **None** — all reused (D6, Technical Context) |
| Ports / serving / Docker | Third listener on `port+2`, dev :5175, established pattern (D7) |
| Localisation | Own bundle, `govtech_lang`, NL default (D8) |

# Quickstart: VNG Kenniscentrum Innovatie Frontend

**Feature**: 016-vng-frontend | How to run, configure, and validate the VNG app alongside the existing Explorer.

---

## Prerequisites

- pnpm ≥ 9, Node 24.
- A local checkout of `vng-gemeente-delers` at `../vng-gemeente-delers` (for snapshot generation only — not needed at runtime).
- Existing `server/.env` (OIDC + `OIDC_SESSION_ENC_KEY`, etc.) as per the main README.

## One-time setup

```bash
# From repo root — workspace install (server, frontend/shared, frontend/ecosystem-analytics, frontend/vng)
pnpm install

# Generate the committed gemeente/theme snapshot from the sibling repo
pnpm -C server run gen:vng-snapshot            # → server/src/data/vng/{municipalities,themes,meta}.json

# Regenerate the typed GraphQL SDK after the new .graphql files are added
pnpm -C server run codegen
```

## Configuration (`server/analytics.yml`)

```yaml
vng:
  defaultHubNameId: ${VNG_DEFAULT_HUB_NAMEID}:               # default innovation hub
  gemeentedelersSpaceNameId: ${VNG_GD_SPACE_NAMEID}:gemeentedelers
  gdCacheTtlHours: ${VNG_GD_CACHE_TTL_HOURS}:168             # ~1 week
  tagCategoryMapping:
    nds:     { "1.cloud": "cloud", "2.data": "data", "3.ai": "ai", "4.digitalisering": "digitalisering", "6.vakmanschap": "vakmanschap" }
    vng2030: { "bedrijfsvoering": "bedrijfsvoering", "wonen en ruimte": "wonen-ruimte", "klimaat en energie": "klimaat-energie" }
```

For **shared auth across both frontends** (production), set on the server:
```bash
SESSION_COOKIE_DOMAIN=.example.org          # parent domain shared by app.* and vng.*
SESSION_ALLOWED_ORIGINS=https://app.example.org,https://vng.example.org
```

## Run (development)

Run the backend and both frontends together from the repo root (requires the
`concurrently` devDependency — run `pnpm install` once after pulling this change):

```bash
pnpm run dev          # server (:4000/:4100) + Explorer (:5173) + VNG (:5174)
```

…or run each individually:

```bash
pnpm run dev:server     # BFF on :4000 (or :4100 per config)
pnpm run dev:explorer   # Explorer on :5173 (proxies /api)
pnpm run dev:vng        # VNG app on :5174 (proxies /api to the same server)
```

Open the VNG app at `http://localhost:5174` and the Explorer at `http://localhost:5173`.
Sign in once (either app) — the `ea_session` cookie is recognised by both in dev when
both proxy the same backend. List both dev origins in `SESSION_ALLOWED_ORIGINS`
(`http://localhost:5173,http://localhost:5174`).

## Smoke validation (maps to spec acceptance / SC)

1. **Hub-driven graph (US1, SC-002)**: open VNG app → default hub's spaces render as a graph over the **Netherlands** map within ~5s; selected-space panel lists them.
2. **Switch hub (US1, SC-003)**: pick another hub → graph + panel + dashboard update, no reload.
3. **Direct selection (US2, SC-004)**: add/remove a space → panel shows provenance (hub vs direct); graph/dashboard reflect the union.
4. **Dashboard (US3, SC-006)**: Dashboard tab shows NDS + VNG-2030 bar charts; counts match the selected spaces; change selection → charts update.
5. **Space details (US4)**: click a space node → Space details tab opens it; or pick from the tab's own space picker.
6. **Org → spaces (US7, SC-012)**: click an organisation → its connected spaces in the current graph are listed/highlighted (<1s).
7. **Gemeentes (US8, SC-013)**: toggle "hide gemeentes" → gemeente nodes leave the graph and dashboard; toggle back restores them; no non-gemeente affected.
8. **GD initiatives (US10, SC-015)**: enable "include GemeenteDelers initiatives" → ~305 initiative nodes fold in, each linked to existing gemeente node(s) + theme node(s), no duplicate gemeentes; provenance note shows "2021–2025, ~305, vng.nl/praktijkvoorbeelden"; disable → base graph restored.
9. **Language (US9, SC-014)**: app loads in **Dutch**; switch to English → all labels incl. chart titles/category names update; switch back.
10. **Shared session (US5, SC-001)**: with both apps running, sign in on one → the other treats you as signed in; sign out on one → invalid on both.
11. **Branding & warning (US6, SC-010/011)**: VNG branding visible on every tab; a warning-styled notice explains authorised-data-only.

## Tests

```bash
pnpm -C server run test        # incl. hub resolution, GD tag→node resolution, category counting
pnpm -C frontend/vng run test  # tab shell, selection logic, charts, i18n
pnpm run test:visual           # Playwright snapshots (add VNG app snapshots)
```

## Refreshing GD/gemeente data

Re-run `pnpm -C server run gen:vng-snapshot` when municipalities/themes change, commit the updated `server/src/data/vng/*.json`. Initiative data itself is fetched live from Alkemio and cached ~1 week (`gdCacheTtlHours`); force a refresh with the standard cache controls.

# Research: VNG Kenniscentrum Innovatie Frontend

**Feature**: 016-vng-frontend | **Date**: 2026-06-19
**Inputs**: spec.md (+ Clarifications), exploration of `ecosystem-analytics`, `client-web@story/9885-remove-mui-library-and-code`, and `vng-gemeente-delers`.

All spec Clarifications are resolved; the items below capture the technical decisions that flow from them and from codebase exploration. No open `NEEDS CLARIFICATION` remain.

---

## D1. Two-frontend topology & shared authentication

- **Decision**: pnpm **workspace** with three app packages (`server`, `frontend`, `frontend-vng`) + a `packages/shared` library. In production both SPAs are served as **sibling subdomains** under one parent domain (e.g. `app.<domain>`, `vng.<domain>`); the `ea_session` cookie is scoped to the parent domain via `SESSION_COOKIE_DOMAIN`, and the VNG origin is added to `SESSION_ALLOWED_ORIGINS`. Dev: `frontend` on 5173, `frontend-vng` on 5174, both proxy `/api` to the server (4000/4100).
- **Rationale**: Subdomain cookie scoping is the standard way to share an httpOnly session across two origins without CORS-cookie (`SameSite=None`) complications; the existing config knobs already exist (constitution §Security). A workspace dedupes React/D3 and lets both apps import the same graph engine.
- **Alternatives considered**: (a) Same-origin path split (`/vng`) — simplest cookie story but forces one build/deploy unit and muddies "much simpler, separate" intent. (b) Separate origins + `SameSite=None` cookies — more fragile, broader CORS surface. (c) Cross-import `../frontend/src` without a workspace — risks duplicate React instances.

## D2. Shared-code extraction boundary

- **Decision**: Extract into `packages/shared`: the D3 **ForceGraph** + clustering + HoverCard, **MapOverlay** (with the existing `netherlands` region), **DetailsDrawer**, the **api** fetch wrapper and **auth** service (`login`/`logout`/`fetchMe`), the shadcn **ui** primitives, and design **tokens**. The Explorer (`frontend`) is refactored to import these from `packages/shared` with **no behavioural change**.
- **Rationale**: These are exactly the "share a lot of its architecture" pieces; both apps need them. Keeping them in one place prevents the graph engine forking.
- **Alternatives considered**: Leave everything in `frontend` and alias into it from `frontend-vng` — rejected (couples builds, duplicate-React risk). Duplicate components — rejected (maintenance fork).

## D3. Innovation hub listing & resolution

- **Decision**: Add typed queries `innovationHubs.graphql` (hubs visible to the signed-in user) and `innovationHubByNameId.graphql` (hub + `spaceListFilter` → space nameIDs). New `hub-service.ts` exposes `listHubs()` and `resolveHubSpaceIds(nameId)`. New routes `GET /api/hubs` and `GET /api/hubs/:nameId/spaces`. Default hub nameID from `vng.defaultHubNameId` config.
- **Rationale**: BFF boundary + typed SDK (Principles II/III). `InnovationHub.spaceListFilter` already exists in the generated schema; `type: list` hubs expose their space list directly.
- **Alternatives considered**: Resolve hubs client-side — violates BFF boundary. Use `spaceVisibilityFilter` hubs — out of scope; VNG uses curated `list` hubs.
- **Open at task time**: confirm exact field for "hubs visible to user" (platform `innovationHubs` collection vs account-scoped); fall back to listing by configured allow-list if the platform query is broad.

## D4. GemeenteDelers initiative fold-in — the crux

- **Finding**: Each of the ~305 initiatives is **one Alkemio Callout** in the **gemeentedelers** space's Knowledge Base, keyed by `alkemio_nameid`. Themes (92) and municipalities (342) do **not** survive as structured references — they exist on the Callout **only as tag strings** in `framing.profile.tags` (e.g. `Energietransitie`, `Groningen`, `gd-2025`, `sdg-08`, classification enums). Structured links live only in the `vng-gemeente-delers` vault frontmatter (wikilinks).
- **Decision**: The server fetches the gemeentedelers KB callouts (`spaceKnowledgeCallouts.graphql`), and `transform/initiatives.ts` resolves each Callout's tags against the **snapshot registry** (D6):
  - Tag matches a municipality `title` → resolve to its `alkemioNameId` (`gemeente-<name>`) → find/create the **organisation** node → add `INITIATIVE → ORGANIZATION` edge (reusing the existing gemeente node when present; otherwise resolve the org by nameID via `organizationByNameId.graphql` and add it once).
  - Tag matches a theme `title`/prior label → find/create a canonical `THEME` node (`id = "theme:<slug>"`) → add `INITIATIVE → THEME` edge.
  - Unmatched tags (year `gd-*`, `sdg-*`, classifications) → kept as initiative node metadata, not edges (this release).
- **Rationale**: Tag-matching against an authoritative registry is the only way to recover the graph from Alkemio without a live vault dependency; canonical synthetic IDs guarantee one node per gemeente/theme (no duplicates — FR-040/043).
- **Alternatives considered**: (a) Read the vault directly at runtime — couples deployments, needs filesystem access to a sibling repo in production. (b) Fuzzy-match tags without a registry — brittle, false positives (violates FR-035). (c) Publish structured references upstream — out of scope (changes `vng-gemeente-delers`).

## D5. New node & edge model for the initiative layer

- **Decision**: Add `NodeType.INITIATIVE` and `NodeType.THEME`; add `EdgeType.INITIATIVE_GEMEENTE` and `EdgeType.INITIATIVE_THEME` (distinct so the frontend can style/filter them). Initiative node `id` = Callout UUID, `nameId` = callout nameID; Theme node `id` = `theme:<slug>`. These are produced only when `includeInitiatives` is set and merged into the dataset after the base transform, deduping org nodes by `nameId`.
- **Rationale**: Mirrors the existing additive `GraphNode`/`GraphEdge` shape (both already carry `nameId`); a reverse `Map<nameId, node>` over `ORGANIZATION` nodes makes gemeente reuse O(1).
- **Alternatives considered**: Overload `ORGANIZATION`/`SPACE` types for initiatives/themes — rejected (breaks metrics, filtering, legends). Generic `REFERENCES` edge — rejected (loses the gemeente-vs-theme distinction needed for the toggle interaction).

## D6. Snapshot registry (gemeentes + themes)

- **Decision**: A build-time generated, committed registry under `server/src/data/vng/`: `municipalities.json` (`{slug, title, alkemioNameId, cbsCode}[]`, ~342) and `themes.json` (`{slug, title, priorLabels}[]`, ~92), produced by `scripts/generate-vng-snapshot.mts` reading the `vng-gemeente-delers` vault frontmatter (`vault/municipalities/*.md`, `vault/gemeentedelers/themes/*.md`). Refreshed by re-running the script (a data update, no logic change). Used for: gemeente identification (show/hide toggle, FR-032/033), GD edge resolution (FR-040/041), and the gemeente set across the app.
- **Rationale**: Honours the clarified "source from the repo" decision while keeping the runtime self-contained; one registry serves all three needs.
- **Alternatives considered**: Identify gemeentes solely by the Alkemio `gemeente` keyword tag — simpler for identification but cannot supply the title→nameID and theme mappings GD resolution needs; kept as a corroborating signal only.
- **Note**: The NDS / VNG-2030 **category** mapping is **separate** from this registry — it lives in `analytics.yml` (D8), since it maps space tags to dashboard categories rather than identifying gemeentes/themes.

## D7. Dashboard counting & charts

- **Decision**: The server computes dashboard data: `POST /api/vng/dashboard { spaceIds, includeGemeentes }` → `{ dimensions: [{ key, categories: [{ key, count }] }] }`, applying the `analytics.yml` tag→category mapping over the selected spaces' tags (each selected space = one initiative, FR-022). The frontend renders with **recharts** (lifting client-web's shadcn `ui/chart.tsx`), localising category **labels** from i18n by category `key`.
- **Rationale**: Keeps the classification mapping server-side and operator-maintainable (FR-022); labels stay localisable in the frontend. recharts matches the client-web stack and the reference image's bar charts.
- **Alternatives considered**: Compute counts client-side from node tags — would push the mapping into the frontend (contradicts FR-022). D3 custom bars — more effort, no reuse from client-web. Return localised labels from server — duplicates i18n responsibility.

## D8. Configuration additions (`analytics.yml` → `VngConfig`)

- **Decision**: New `vng:` config block parsed in `config.ts`:
  - `defaultHubNameId` — default innovation hub (FR-010)
  - `gemeentedelersSpaceNameId` — GD space nameID (FR-045)
  - `gdCacheTtlHours` — long GD cache TTL, default `168` (FR-046)
  - `tagCategoryMapping` — `{ nds: { <tag>: <categoryKey> }, vng2030: { <tag>: <categoryKey> } }` (FR-022)
- **Rationale**: All operator-tunable, no code changes; matches existing `${ENV}:default` substitution pattern.

## D9. GD-layer caching

- **Decision**: Cache the GD initiative subgraph **per-user** as a dedicated entry (`space_id = "__gd_initiatives__"`) with `expires_at = now + gdCacheTtlHours` (default 168h). Served only after verifying the user has READ on the gemeentedelers space. `includeInitiatives` toggles inclusion in the response; base-space cache entries are unchanged.
- **Rationale**: Satisfies per-user scoping (Principle IV) while avoiding refetching 305 callouts every request; reuses the existing `cache_entries` table (TTL via `expires_at`), so no schema migration.
- **Alternatives considered**: Global shared GD cache — violates per-user scoping. New table — unnecessary; the existing key space accommodates a reserved `space_id`.

## D10. Localisation (Dutch default + English)

- **Decision**: `i18next` + `react-i18next` in `frontend-vng` only, resources `nl.json` (default/fallback) + `en.json`, with a language switcher; missing-key fallback to the other language/readable key. Dutch is the initial and fallback language. The Explorer (`frontend`) is unaffected. Dutch/English strings can be seeded from `client-web`'s `i18n/*.nl.json`/`*.en.json`.
- **Rationale**: Smallest mature i18n stack for React; scoping it to the VNG app avoids touching the Explorer. Default Dutch per FR-036.
- **Alternatives considered**: Hand-rolled context-based i18n — reinvents pluralisation/fallback. Localise both apps now — out of scope.

## D11. Organisation → connected spaces (FR-030)

- **Decision**: Pure frontend: on organisation-node click, derive connected spaces from the already-present `GraphEdge[]` (org→space MEMBER/LEAD edges within the current graph) and surface them in the details panel with navigation; reuse `DetailsDrawer`'s existing "direct connections" logic.
- **Rationale**: The data is already in the dataset; no new endpoint needed (<1s, SC-012).
- **Alternatives considered**: New server endpoint — unnecessary round-trip.

## D12. Branding, warning & GD provenance

- **Decision**: Persistent VNG-branded header (reuse `vng-innovation-hub.png`-style asset from client-web) across tabs (FR-025); a shadcn **`alert`** in `warning` variant for the authorisation caveat (FR-026/027); a short localised provenance note near the initiative toggle/dashboard (FR-047) linking to `vng.nl/praktijkvoorbeelden` and stating "GemeenteDelers 2021–2025, ~305 initiatives".
- **Rationale**: Matches the reference styling stack; cheap, high-clarity UX.

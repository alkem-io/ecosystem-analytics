# Phase 1 Data Model: GovTech Netherlands Frontend

GovTech introduces **no new domain entities, no new GraphQL queries, and no DB-schema change**. The only new structures are **configuration shapes**: a frontend `AppConfig` and a server-side app-keyed `DashboardAppConfig` registry. Runtime data entities (Space, Hub, GraphDataset, GD Initiative, Gemeente, Theme, dashboard dimensions) are exactly those defined for VNG (016 `data-model.md`) and are reused unchanged.

---

## 1. Frontend — `AppConfig` (per-app, injected into the shared shell)

The shared `DashboardApp` reads an `AppConfig` from React context. Each wrapper app (`frontend/vng`, `frontend/govtech`) supplies its own.

```ts
// @ea/shared/app/AppConfig.ts
export interface AppConfig {
  /** Stable app id; drives API namespace, storage-key & event prefixes. */
  appId: 'vng' | 'govtech';            // extensible union for future dashboards
  /** BFF namespace for app-specific routes: `/api/${apiNamespace}/dashboard|initiatives`. */
  apiNamespace: string;                // = appId
  /** Prefix for localStorage keys (`${storagePrefix}_selection`, `${storagePrefix}_lang`). */
  storagePrefix: string;               // = appId
  /** Prefix for cross-component custom events (`${eventPrefix}:openSpace`, `:selection`). */
  eventPrefix: string;                 // = appId
  /** Brand logo component rendered in header / loading / login screens. */
  Logo: React.ComponentType<{ className?: string }>;
  /** XLSX workbook creator string + filename stem for dashboard export. */
  exportCreator: string;               // e.g. "GovTech Nederland"
  exportFilenameStem: string;          // e.g. "govtech-dashboard"
}
```

**Validation / rules**
- `appId` MUST be unique across wrapper apps and MUST match a server `dashboards[appId]` profile.
- `apiNamespace`, `storagePrefix`, `eventPrefix` default to `appId`; kept explicit so they can never silently collide across apps sharing the parent domain.
- Brand tokens (colours, radius) are NOT in `AppConfig` — they are CSS custom-property overrides scoped in each app's `styles/index.css` (so promotion does not couple JS to theme values).
- The i18n bundle is registered by each wrapper's `i18n/index.ts` (own `${appId}_lang` storage key); the shared shell only calls `t(...)`.

**GovTech instance**
```ts
// frontend/govtech/src/appConfig.ts
export const govtechConfig: AppConfig = {
  appId: 'govtech', apiNamespace: 'govtech', storagePrefix: 'govtech', eventPrefix: 'govtech',
  Logo: GovtechLogo, exportCreator: 'GovTech Nederland', exportFilenameStem: 'govtech-dashboard',
};
```

---

## 2. Server — `DashboardAppConfig` registry (per-app, independent env vars)

The existing single `VngConfig` generalises into an app-keyed registry. **Shared** server config (`alkemio`, `oidc`, `session`, `cache`, `limits`, `logging`, `openai`, `features`) is **unchanged** and not duplicated per app.

```ts
// server/src/config.ts
export interface DashboardAppConfig {
  /** Default innovation hub nameID applied on first load (empty => none). FR-012. */
  defaultHubNameId: string;
  /** nameID of the GemeenteDelers space whose KB holds the GD initiatives. FR-034. */
  gemeentedelersSpaceNameId: string;
  /** Long cache TTL for the archival GD initiative layer. FR-035. */
  gdCacheTtlHours: number;
  /** Raw tag (lower-cased) → dashboard category key, per dimension. FR-025. */
  tagCategoryMapping: { nds: Record<string, string>; vng2030: Record<string, string> };
}

export interface ServerConfig {
  // …unchanged shared fields…
  port: number;            // Explorer
  vngPort: number;         // = port + 1 (unchanged)
  govtechPort: number;     // NEW = GOVTECH_FRONTEND_PORT || port + 2
  /** App-keyed dashboard profiles. `vng` preserved; `govtech` added. */
  dashboards: Record<'vng' | 'govtech', DashboardAppConfig>;
  /** @deprecated alias of dashboards.vng — kept so existing code/readers don't break. */
  vng: DashboardAppConfig;
}
```

**Parsing rules**
- `parseDashboardConfig(raw)` (generalised `parseVngConfig`) applies defaults so a fresh checkout boots: `gemeentedelersSpaceNameId` defaults to `'gemeentedelers'`, `gdCacheTtlHours` to `168`, mappings to `{}` lower-cased.
- `dashboards.vng` parses the existing `vng:` YAML block (existing `VNG_*` env vars — unchanged).
- `dashboards.govtech` parses a new `govtech:` YAML block (new `GOVTECH_*` env vars). Its `tag_category_mapping` is seeded (in `analytics.yml`) as a copy of VNG's so GovTech ships identical charts until an operator diverges it.
- `config.vng` is set to `dashboards.vng` for back-compat with current readers (`index.ts` bootstrap log, services).
- Unknown app keys are not parsed; routes validate `:app` against `Object.keys(dashboards)`.

---

## 3. Environment variable map (shared vs separate)

| Concern | Env var(s) | Scope |
|---|---|---|
| Alkemio environment | `ALKEMIO_SERVER_URL`, `ALKEMIO_GRAPHQL_ENDPOINT` | **Shared** |
| OIDC client | `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_TOKEN_AUTH_METHOD`, `OIDC_REDIRECT_URI`, `OIDC_SCOPES`, `OIDC_AUDIENCE` | **Shared** |
| Session / auth | `OIDC_SESSION_ENC_KEY`, `SESSION_COOKIE_DOMAIN`, `SESSION_IDLE_TIMEOUT_HOURS` | **Shared** |
| Allowed origins | `SESSION_ALLOWED_ORIGINS` | **Shared list** — GovTech origin **appended** |
| Cache / limits / logging / openai / features | existing vars | **Shared** |
| Explorer port | `ECOSYSTEM_ANALYTICS_BACKEND_PORT` | Shared (backend) |
| VNG profile | `VNG_DEFAULT_HUB_NAMEID`, `VNG_GD_SPACE_NAMEID`, `VNG_GD_CACHE_TTL_HOURS`, `VNG_FRONTEND_PORT` | VNG-only |
| **GovTech profile** | `GOVTECH_DEFAULT_HUB_NAMEID`, `GOVTECH_GD_SPACE_NAMEID`, `GOVTECH_GD_CACHE_TTL_HOURS`, `GOVTECH_FRONTEND_PORT` | **GovTech-only (separate)** |

---

## 4. Reused runtime entities (unchanged from VNG / 016)

These are referenced for completeness; GovTech adds nothing to them:

- **Space**, **Innovation Hub**, **Selected-Space Set**, **GraphDataset (nodes/edges)** — from the shared graph pipeline.
- **GemeenteDelers Initiative**, **Gemeente**, **Theme** — resolved server-side from the **same** snapshot registry + `gemeentedelers` space as VNG.
- **Dashboard Dimension** (`nds`, `vng2030`) with categorised counts + active source — returned by `/api/:app/dashboard`, taxonomy resolved from `dashboards[app].tagCategoryMapping`.
- **Authentication Session** — the shared `ea_session`, recognised across all three frontends.

---

## 5. State & cache notes

- **localStorage** (browser): `${appId}_selection`, `${appId}_lang` — namespaced so VNG and GovTech state never collide even under one parent domain.
- **SQLite cache**: unchanged. GovTech's graph/space requests use the shared `cache_entries (user_id, space_id)`; GovTech's GD layer reuses the shared per-user `__gd_initiatives__` entry (same `gemeentedelers` space → same rows), with TTL from `dashboards.govtech.gdCacheTtlHours`.

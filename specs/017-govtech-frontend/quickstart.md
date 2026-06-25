# Quickstart: GovTech Netherlands Frontend

How to run the three frontends together, what GovTech adds, and how to configure its independent profile.

## Run all three locally

```bash
# from repo root — runs BFF + Explorer + VNG + GovTech concurrently
pnpm run dev
```

| App | Dev URL | Serves | Backend |
|---|---|---|---|
| Explorer | http://localhost:5173 | `frontend/ecosystem-analytics` | proxy → :4100 |
| VNG | http://localhost:5174 | `frontend/vng` | proxy → :4100 |
| **GovTech** | **http://localhost:5175** | **`frontend/govtech`** | proxy → :4100 |

The single BFF listens on `:4100` and serves all three SPAs' `/api`. Signing in on any one is recognised by the other two (shared `ea_session`); signing out invalidates all three.

Individual panes:
```bash
pnpm run dev:server
pnpm run dev:explorer
pnpm run dev:vng
pnpm run dev:govtech     # NEW
```

## What was added (wiring checklist)

- `pnpm-workspace.yaml` — `frontend/govtech` added to `packages`.
- Root `package.json` — `dev:govtech` script + a `govtech` pane in the `concurrently` `dev` script.
- `frontend/govtech/` — new wrapper SPA (Vite :5175): `appConfig.ts`, `GovtechLogo.tsx`, `styles/index.css`, `i18n/{index,nl,en}`, `main.tsx`/`App.tsx` mounting `@ea/shared`'s `DashboardApp`.
- `frontend/shared/` — promoted generic shell/pages/hooks/components/charts/export + `AppConfig` context (consumed by both VNG and GovTech).
- `server/src/config.ts` — `dashboards` registry (`vng` + `govtech`) + `govtechPort`; shared auth/Alkemio config unchanged.
- `server/src/index.ts` — third `createApp('../frontend-govtech/dist')` listener on `config.govtechPort`.
- `server/src/routes/` — `/api/:app/*` (dashboard, initiatives) + `?app=` on `/api/hubs`; `/api/vng/*` preserved.
- `server/analytics.yml` — new `govtech:` block; GovTech origin appended to `session.allowed_origins`.
- `Dockerfile` — build `frontend/govtech/dist`, copy as `frontend-govtech/dist`, `EXPOSE` the GovTech port.

## Configure the GovTech profile (separate env vars)

GovTech reads only `GOVTECH_*`; it never reuses `VNG_*`. Shared Alkemio/OIDC/session env vars are inherited as-is.

```bash
# GovTech-only profile (server/.env)
GOVTECH_DEFAULT_HUB_NAMEID=<the GovTech default innovation hub nameID>   # operator-set
GOVTECH_GD_SPACE_NAMEID=gemeentedelers        # same corpus as VNG (default)
GOVTECH_GD_CACHE_TTL_HOURS=168
GOVTECH_FRONTEND_PORT=4102                     # prod backend port; defaults to backend port + 2

# Shared (unchanged) — one Alkemio env + one OIDC client + one session key
ALKEMIO_GRAPHQL_ENDPOINT=…
OIDC_ISSUER=… OIDC_CLIENT_ID=… OIDC_SESSION_ENC_KEY=…
SESSION_COOKIE_DOMAIN=.alkem.io
# Append the GovTech origin so the shared cookie + returnTo are accepted there:
SESSION_ALLOWED_ORIGINS=https://analytics.alkem.io,https://vih-analytics.alkem.io,https://govtech.alkem.io
```

The GovTech dashboard taxonomy (`govtech.tag_category_mapping` in `analytics.yml`) is seeded as a copy of VNG's `nds`/`vng2030` mapping and is operator-editable to diverge later — no code change.

## Verify

```bash
pnpm -C server build && pnpm -C server test
pnpm -C frontend/vng build && pnpm -C frontend/govtech build
pnpm -C frontend/vng test         # VNG snapshots = promotion regression guard
pnpm run test:visual              # add GovTech snapshots
```

Smoke test (3-frontend SSO + separate profile):
1. `pnpm run dev`; open :5173, :5174, :5175.
2. Sign in on :5173 → :5174 and :5175 are already signed in.
3. On :5175 confirm: "GovTech Nederland" header (Dutch default), the GovTech default hub's spaces load on the Netherlands-only map, the dashboard charts render, gemeente + GD toggles work.
4. Switch :5175 to English → header reads "GovTech Netherlands".
5. Sign out on :5175 → :5173 and :5174 are signed out too.
6. Confirm Explorer (:5173) and VNG (:5174) look and behave exactly as before (FR-051).

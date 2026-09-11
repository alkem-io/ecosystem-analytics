# Quickstart: VNG Guest Access

**Feature**: 023-vng-guest-access

## Run it

```bash
pnpm install
pnpm run dev            # BFF :4000 + Explorer :5173 + VNG :5174 + GovTech :5175
```

`server/.env` needs nothing new. Defaults in `server/analytics.yml` enable guest access for `vng`
only. To turn it off without a rebuild: `VNG_GUEST_ACCESS=false`.

## Try the guest path (manual)

1. Open http://localhost:5174 in a **private window** (no `ea_session`).
2. Login screen shows **Sign in**, then **Explore as guest** with the data warning under it.
3. Click **Explore as guest** → dashboard opens; a **Browsing as a guest** notice sits where the
   authorisation warning normally is; user menu shows *Guest · Sign in · Leave*.
4. Select the VNG hub. Expect the 3 public spaces (`signalen`, `gdc`, `gem`) with full data and the
   other ~20 shown as **restricted** (lock) on Graph/Funnel with their classifications, plus a
   "not visible to you — sign in to see more" line; GD initiatives and the Usage Explorer map load
   fully (the GD corpus and gemeente locations are public).
5. Click **Sign in** in the notice from the Funnel tab → after Alkemio sign-in you land on the
   Funnel tab with the same selection and no guest notice.
6. Close and reopen the browser → login screen again (guest cookie is session-scoped).

## Verify anonymous upstream behaviour yourself

```bash
EP=https://alkem.io/api/private/graphql
# public space with community — works
curl -s $EP -H 'Content-Type: application/json' -d '{"query":"{ lookupByName { space(NAMEID:\"gem\") { nameID authorization { myPrivileges } community { roleSet { memberUsers: usersInRole(role: MEMBER) { id } } } } } }"}'
# READ_ABOUT-only space with community — space comes back null (FORBIDDEN_POLICY on community)
curl -s $EP -H 'Content-Type: application/json' -d '{"query":"{ lookupByName { space(NAMEID:\"atlas\") { nameID community { id } } } }"}'
# same space, about only — works
curl -s $EP -H 'Content-Type: application/json' -d '{"query":"{ lookupByName { space(NAMEID:\"atlas\") { nameID about { profile { displayName } classifications { displayLabel } } authorization { myPrivileges } } } }"}'
```

## Failure-handling drills (dev tools → Network → block/override)

| Do | Expect |
|---|---|
| Block `POST /api/vng/dashboard` | Dashboard tab shows one failure card with **Retry**; Graph/Funnel/Cities tabs still work |
| Return 503 `{"error":"ALKEMIO_UNREACHABLE"}` for every `/api/*` | One **service unavailable** banner with *Retry all*; areas show a one-liner; no redirect |
| As guest, return 403 `{"error":"GUEST_FORBIDDEN"}` for `/api/vng/initiatives` | Initiatives area: "requires signing in" + Sign in; URL unchanged |
| As guest, return 401 for any route | Login screen (no redirect to Alkemio) |
| As member, return 401 for any route | Redirect to `/api/auth/login?returnTo=…` (unchanged) |
| Throttle to make graph generate take > 30 s | "taking longer than usual…" + Cancel appears under the progress text |

## Tests

```bash
cd server && pnpm test                      # guest middleware, rate limiter, L0 privilege probe,
                                            # spaceFailures, memo skip, cache principal, error classify
cd frontend/vng && pnpm test                # api.ts error taxonomy, AuthContext transitions
pnpm run test:visual -- tests/vng-guest-access.spec.mjs tests/mobile-navigation.spec.mjs
```

Type checks (`tsc --noEmit`) must pass in `server/` and every `frontend/*`: the `AuthContext` union
turns every `req.auth!.session` into a compile error until it is guest-safe — that is the intended
checklist.

## Codegen

One new query, `server/src/graphql/queries/spaceAboutByName.graphql`, then:

```bash
cd server && pnpm run codegen
```

Commit `server/src/graphql/generated/`.

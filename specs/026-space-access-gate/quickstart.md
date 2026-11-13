# Quickstart: validating the Space-Based Access Gate

**Feature**: 026-space-access-gate. Contracts: `contracts/api-access.md`, `contracts/config-access.md`.

## Role check against production

The gate reads the person's **roles** on the gate Space, not their privileges (research R4), so the
production subspace may stay public. An anonymous caller holds no role on it:

```bash
# Expect: "myRoles":[] and "myMembershipStatus":"NOT_MEMBER"
curl -s https://alkem.io/api/private/non-interactive/graphql -H 'content-type: application/json' \
  -d '{"query":"{ lookupByName { space(NAMEID:\"programmagroei\") { subspaceByNameID(NAMEID:\"landelijkinnovatiemonitor\") { community { roleSet { myRoles myMembershipStatus } } } } } }"}'
```

## Prerequisites

- `server/.env` configured as for any local run (OIDC client, `OIDC_SESSION_ENC_KEY`).
- Two Alkemio accounts on the target environment: **member** (has the Member role on the gate Space) and
  **outsider** (does not).
- A gate Space whose membership you control for both accounts (public or private). For local work
  against production, set `VNG_ACCESS_GATE` to such a subspace.

## 1. Automated checks

```bash
pnpm -C server test          # pure policy, decision store, outcome classification, HTTP gating
pnpm -C frontend/vng test    # shared access logic: screen choice, 403 → signal (shared is tested from vng)
VNG_URL=http://127.0.0.1:5174 pnpm exec playwright test tests/vng-access-gate.spec.mjs  # needs a VNG dev server
```

Expected: all green. The HTTP suite must include the **Explorer-listener bypass** rows from
`contracts/api-access.md` §3.

## 2. Start-up behaviour

```bash
VNG_ACCESS_GATE= pnpm -C server dev        # empty → process exits naming access.vng
VNG_ACCESS_GATE=nope/// pnpm -C server dev # unparseable → process exits
pnpm -C server dev                          # logs: explorer UNGATED, vng gated by …, govtech UNGATED
```

## 3. End to end (`pnpm run dev`; VNG on :5174 now proxies to :4101)

| # | Step | Expected |
|---|---|---|
| 1 | Sign in to the VNG dashboard as **member** | Lands on the requested page; no extra step (SC-002) |
| 2 | Sign in to the VNG dashboard as **outsider** | "No access" page with the account name, the gate Space name, a link opening it on Alkemio, "check again", and sign out |
| 3 | As outsider, open `http://localhost:5174/?tab=graph` directly | Still the "no access" page |
| 4 | As outsider, `curl -b ea_session=… localhost:4101/api/vng/dashboard -X POST` | 403 `ACCESS_DENIED`, `reason: none` |
| 5 | As outsider, the same request against **:4100** (Explorer listener) | 403 (bypass closed) |
| 6 | As outsider, open the Explorer (:5173) | Works normally; can load any Space their Alkemio permissions allow (FR-012a) |
| 7 | Add outsider to the gate Space on Alkemio, then press "check again" | Enters the dashboard without signing in again (SC-005) |
| 8 | As member, get removed from the gate Space; keep using the dashboard | Keeps access for the session (FR-015) |
| 9 | Sign out and sign in again | "No access" page (SC-004) |
| 10 | Stop network access to Alkemio, then sign in | "Could not verify your access" with retry, **not** "no access"; restore and retry → admitted |
| 11 | Inspect server logs for steps 2, 4 and 10 | A refusal line with the user id and reason; no token, cookie or session id (FR-019) |

## 4. Manage level (no UI)

Sign in as an account with the Member and Admin roles on the gate Space and call `GET /api/auth/me` on :4101.
Expected: `access.level === "manage"`. A Member-only account gets `"read"`; a Lead-only or Admin-only account gets `"none"`.

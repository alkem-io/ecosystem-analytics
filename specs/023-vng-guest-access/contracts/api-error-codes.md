# Contract: Error envelope and stable codes

**Feature**: 023-vng-guest-access

Every non-2xx JSON response from the BFF keeps the existing envelope:

```json
{ "error": "<STABLE_CODE>", "message": "<operator-readable, never rendered verbatim>" }
```

The frontend keys its behaviour on `status` + `error`, **never** on `message` (FR-016). The codes
below are the contract; adding a code is non-breaking, renaming one is breaking.

## Codes and frontend classification

| Status | `error` | Raised when | Frontend class | Member UI | Guest UI |
|---|---|---|---|---|---|
| 401 | `UNAUTHORIZED` | no/expired session and no admitted guest cookie | — | redirect to sign-in (unchanged) | switch shell to `anonymous` (login screen); **no redirect** |
| 403 | `GUEST_FORBIDDEN` | guest request refused upstream (`FORBIDDEN_POLICY` / auth error) or route not guest-eligible | `RequiresSignInError` | n/a | area shows "requires signing in" + Sign in |
| 403 | `GUEST_ACCESS_DISABLED` | `POST /api/auth/guest` for an app with guest access off | `RequestFailedError` | — | login screen hides guest option |
| 429 | `RATE_LIMITED` | guest per-IP bucket exhausted; `Retry-After` header set | `RequestFailedError` | n/a | area shows "too many requests, try again shortly" with Retry |
| 503 | `ALKEMIO_UNREACHABLE` | **new**: upstream transport error / 5xx on any Alkemio call | `UpstreamUnavailableError` | consolidated banner + Retry all | same |
| 503 | `GEMEENTE_LOCATIONS_UNAVAILABLE` | existing (no stale set to fall back on) | `RequestFailedError` | area failure + Retry | same |
| 502 | `DASHBOARD_FAILED`, `GENERATION_FAILED`, `GD_LIST_FAILED`, `HUB_LIST_FAILED`, `HUB_SPACES_FAILED` | existing compute failures | `RequestFailedError` | area failure + Retry | same |
| 400 | `INVALID_REQUEST`, `TOO_MANY_SPACES`, `UNKNOWN_APP` | existing | `RequestFailedError` | area failure (no Retry for 400) | same |
| 404 | `HUB_NOT_FOUND` | existing | `RequestFailedError` | area empty-state | same |

**Distinguishing 503 `ALKEMIO_UNREACHABLE` from 502 `*_FAILED`**: the route catch blocks call a
shared `classifyUpstreamError(err)` — `fetch`/socket errors and HTTP ≥ 500 from the GraphQL endpoint
→ `ALKEMIO_UNREACHABLE`; everything else keeps today's route-specific 502.

## Request headers

| Header | Sent by | Used for |
|---|---|---|
| `X-EA-Client-Id` | `api.ts`, every request, both modes | guest progress key (`__guest__:<id>`); ignored for members |
| `Cookie: ea_session` | browser | member session (unchanged) |
| `Cookie: ea_guest` | browser | guest admission (host-only) |

## `GraphDataset` partial-failure fields

```json
{
  "nodes": [...], "edges": [...],
  "errors": ["Failed to fetch space \"x\": …"],
  "spaceFailures": [
    { "nameId": "atlas", "reason": "restricted" },
    { "nameId": "kiss",  "reason": "failed" },
    { "nameId": "gem",   "reason": "activity_unavailable" }
  ]
}
```

- `restricted` / `not_found` — deterministic; UI: "N spaces are not visible to you" (guest copy adds
  "sign in to see more"); no Retry.
- `failed` — transient; UI: "N of M spaces could not be loaded" + **Retry** (re-POSTs the same
  selection; server does not memoise datasets containing `failed`, and cached successful spaces are
  not refetched).
- `activity_unavailable` — informational; UI: nothing per-space, optional footnote on activity panels.

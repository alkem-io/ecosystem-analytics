# Contract: Access Gate HTTP surface

**Feature**: 026-space-access-gate. Types are in `../data-model.md`.

The **application** of a request is its listener (Explorer :4000, VNG :4001, GovTech :4002 in
production; 4100/4101/4102 in dev) plus any application the request names (research R1).

---

## 1. `GET /api/auth/me` (extended)

Unchanged: requires a session (401 without one) and is exempt from the gate.

**200** adds `access`:

```json
{
  "userId": "…",
  "displayName": "Jane Doe",
  "avatarUrl": null,
  "alkemioServerUrl": "https://alkem.io",
  "access": {
    "app": "vng",
    "status": "none",
    "level": "none",
    "gated": true,
    "gate": {
      "displayName": "Landelijk Innovatie Monitor",
      "url": "https://alkem.io/programmagroei/challenges/landelijkinnovatiemonitor"
    }
  }
}
```

| Case | `status` | `level` | `gated` | `gate` |
|---|---|---|---|---|
| Ungated application | `admitted` | `read` | `false` | `null` |
| Gated, person has the Member role | `admitted` | `read` | `true` | object |
| Gated, person has the Member + Admin roles | `admitted` | `manage` | `true` | object |
| Gated, no Member role | `none` | `none` | `true` | object |
| Gated, check failed | `unverified` | `null` | `true` | object |

Uses the held decision if there is one; otherwise it decides now (this is normally the first call
after sign-in). It never fails because of the gate: an `unverified` outcome is reported in `access`,
not as an HTTP error.

---

## 2. `POST /api/auth/access/recheck` (new): "check again"

Requires a session (401 without one) and is exempt from the gate. No body.

Discards the held decision for the listener's application, determines it again from Alkemio, and
stores the new result (unless it is `unverified`).

**200** `{ "access": AccessReport }`, the same shape as above.

Rate-limited to one re-determination per session per application every 5 seconds. A faster repeat
returns the held report unchanged with **200**.

---

## 3. Refusal on any gated data route

Applies to every route under `/api` **except** `/api/auth/*`, `/api/health`, `/api/features` and
`/api/meta`, when a session is present and any of the request's applications refuses it.

**403**

```json
{ "error": "ACCESS_DENIED", "reason": "none", "app": "vng", "message": "No access to this application" }
```

`reason` is `none` or `unverified`. `app` is the application that refused. The refusal happens
before any route handler runs, so:

- no cache is read (FR-011);
- `POST /api/graph/generate` with `Accept: text/event-stream` returns this JSON 403 **instead of**
  opening the stream.

No session → **401** `UNAUTHORIZED`, exactly as today (the 401 and 403 cases stay distinct, FR-009).

### Examples (refused person, VNG gated, Explorer ungated)

| Request | Listener | Named apps | Result |
|---|---|---|---|
| `POST /api/vng/dashboard` | vng | vng | 403 |
| `POST /api/vng/dashboard` | explorer | vng | **403** (path bypass closed) |
| `GET /api/hubs?app=vng` | explorer | vng | 403 |
| `POST /api/graph/generate` `{ "app": "vng", … }` | explorer | vng | 403 |
| `POST /api/graph/generate` `{ spaceIds }` (no app) | explorer | — | 200 (FR-012a) |
| `GET /api/spaces` | vng | — | 403 |
| `GET /api/spaces` | explorer | — | 200 |
| `GET /api/ecosystem/orchestrator/:hub` | explorer | — | 200 (research R1) |
| `GET /api/auth/me` | vng | — | 200 with `access.status = "none"` |

---

## 4. Route-level policy (internal, for the future management area)

```ts
router.use(requireAccess({ app: 'vng', required: 'manage' }));
```

This uses the same decision, store and refusal shape. It returns 403 `ACCESS_DENIED` with `reason:
"none"` when the held level is below `manage`. No route uses it in this feature (FR-018).

---

## 5. Frontend handling

| Signal | Behaviour |
|---|---|
| `me.access.status === 'none'` | render `NoAccessScreen` (account, gate name + link, "check again", sign out) |
| `me.access.status === 'unverified'` | render `AccessCheckFailedScreen` (retry → recheck) |
| any 403 `ACCESS_DENIED` from `apiFetch` / `graph-loader` | once-guarded `signalAccessDenied()` → shell re-reads `/api/auth/me` and switches screen. No toast, no sign-in redirect |
| 401 | unchanged: once-guarded redirect to sign-in |

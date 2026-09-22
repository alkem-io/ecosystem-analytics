# Contract: `POST /api/graph/generate` — streamed progress

**Owner**: `server/src/routes/graph.ts` → `services/graph-service.ts` (+ `services/progress/LoadReporter`)

## Negotiation

| Request `Accept` | Response |
|------------------|----------|
| `text/event-stream` | `200 text/event-stream` — SSE events below; the connection closes after `result` or `error`. Used by the dashboards. |
| anything else, with `X-EA-Bundle: 1` | `200 application/json` body = `{ dataset, dashboard? }` — the dashboards' JSON fallback (when the stream is refused). |
| anything else | Today's behaviour: `200 application/json` body = `GraphDataset`. Used by the Explorer. **Unchanged.** |

Validation (`spaceIds` required, `max_spaces_per_query`) happens **before** the stream opens and returns the same `400` JSON bodies as today on both paths. `401` (no session) is also pre-stream.

## Request body (`GraphGenerationRequest`)

```json
{ "spaceIds": ["…"], "app": "vng", "includeInitiatives": false, "forceRefresh": false,
  "includeActivity": false, "includeExtendedProfiles": false }
```

Defaults when omitted: `includeActivity: true`, `includeExtendedProfiles: true` (JSON path parity for the Explorer). The dashboards always send both `false`.

## Events (one JSON object per `data:` line; `event:` names the type)

```
event: stage
data: {"item":"spaces","stage":"loading","done":3,"total":22,"current":"signalen"}

event: stage
data: {"item":"spaces","stage":"processing"}

event: stage
data: {"item":"gd-initiatives","stage":"loading"}

event: item
data: {"item":"gd-initiatives","stage":"done"}

event: item
data: {"item":"gd-initiatives","stage":"failed","error":{"key":"gd.unreadable"}}

event: result
data: {"dataset":{…GraphDataset…},"dashboard":{…DashboardCountsBundle…}}

event: error
data: {"error":{"key":"generation.failed","detail":"…user-safe…"}}
```

Implementation: `server/src/services/progress/load-reporter.ts` (`LoadReporter`, request-scoped; also feeds the legacy per-user `GET /api/graph/progress` poller through `toGraphProgress()`), `server/src/routes/graph.ts` (`streamGenerate`). A memo hit (`generateGraphBundle` coalescing an identical in-flight/recent build) reports no stages — the result simply arrives.

Rules:
- `stage` events are emitted at least once per item and on every change of `done`/`current`; a heartbeat comment line (`: keep-alive`) is sent every 10 s while no event is due.
- `done`/`total` count Spaces **including** cached ones (cached ones jump straight to done), so `done === total` ⇒ processing begins. A fully cached load emits `processing` without any `loading` event (SC-002a evidence).
- `result` is terminal and always carries `dataset`; `dashboard` is present iff `app` names a dashboard profile.
- `error` is terminal; no `result` follows. Alkemio auth failures invalidate the session exactly as today (`invalidateAndReject`), sent as `error` with key `session.expired` — the client then routes to sign-in via the shared `redirectToLogin()` once.
- Payload must never contain tokens or session identifiers (Constitution IV). `current` is a Space nameId only.

## Client (`@ea/shared/services/graph-loader.ts`)

`loadGraph(request, onEvent, signal): Promise<{ dataset, dashboard? }>` — opens the stream with `credentials: 'include'`, parses events, forwards each to `onEvent`, resolves on `result`, rejects on `error`/premature close. Aborted via `AbortSignal` when the selection changes (R5).

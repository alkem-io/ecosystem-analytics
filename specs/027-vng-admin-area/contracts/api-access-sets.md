# Contract: Access sets, sign-in Space list, no-access screen

**Feature**: 027-vng-admin-area · extends `specs/026-space-access-gate/contracts/{api-access,config-access}.md`

## 1. `GET /api/auth/access/spaces` (new, public)

No session is needed. It is exempt from the gate (it sits under `/api/auth/*`). It answers for the
**listener's** application.

**200**

```json
{
  "app": "vng",
  "gated": true,
  "spaces": [
    { "key": "programmagroei", "displayName": "Kenniscentrum Innovatie", "url": "https://alkem.io/programmagroei" }
  ]
}
```

- Ungated app: `{ "gated": false, "spaces": [] }`.
- Only **viewer** Spaces are listed. Admin Spaces never appear here.
- Names come from the anonymous probe, else the configured fallback, else the last path segment.
  The `url` is always present. No per-person data.
- Never fails because Alkemio is down: the probe registry is in memory. The SPA treats a network
  error as "show the generic line" (FR-002).

## 2. `GET /api/auth/me` and `POST /api/auth/access/recheck` (changed)

`access.gate` is replaced by `access.viewerSpaces`:

```json
"access": {
  "app": "vng", "status": "none", "level": "none", "gated": true,
  "viewerSpaces": [ { "key": "programmagroei", "displayName": "Kenniscentrum Innovatie", "url": "https://alkem.io/programmagroei", "exists": "yes" } ]
}
```

`level: "manage"` ⇔ ADMIN on some admin Space. The SPA shows the settings entry only then.

## 3. Configuration (`server/analytics.yml` → `access:`)

```yaml
access:
  vng: ${VNG_ACCESS_GATE}:programmagroei              # viewer Spaces, comma-separated
  vng_admin: ${VNG_ADMIN_GATE}:programmagroei         # admin Spaces, comma-separated; optional
  vng_display_name: "${VNG_ACCESS_GATE_NAME}:Kenniscentrum Innovatie"   # first viewer Space
  vng_display_names: "${VNG_ACCESS_GATE_NAMES}:"      # optional, per position, comma-separated
  explorer: ${EXPLORER_ACCESS_GATE}:none
  govtech: ${GOVTECH_ACCESS_GATE}:none
  check_timeout_ms: ${ACCESS_CHECK_TIMEOUT_MS}:5000
```

| Value | Result |
|---|---|
| `vng: a, b/c` | viewers = [`a`, `b/c`]. Whitespace is trimmed, empty items are rejected |
| `vng_admin` absent or empty | no Monitor Managers; the area is unreachable |
| `<app>_admin` set while `<app>: none` | **start-up stops** |
| duplicate within a set, unparseable item, missing viewer key | **start-up stops** (026 FR-003) |

Start-up log: `[Access] vng: viewers programmagroei; admins programmagroei`.

## 4. Refusals

Unchanged 026 shape. `requireAccess({required:'manage'})` refuses with 403 `ACCESS_DENIED`,
`reason: "none"`, when the held level is below manage. With `fresh: true` it re-determines first,
so `reason` may also be `"unverified"`.

## 5. Frontend

| Screen | Change |
|---|---|
| `LoginScreen` (shared) | fetches §1. Lists each Space as a link under "Members of these Spaces can use the monitor". On error it shows the `login.accessGeneric` line. The sign-in button is never blocked |
| `NoAccessScreen` | `gate` prop → `spaces: GateLink[]`. One link per Space (`data-testid="access-gate-link"` on each) |
| `BrandingHeader` | settings button (`data-testid="admin-entry"`) when `managedScope && me.access.level === 'manage'` |

# Contract: Access Gate configuration

**Feature**: 026-space-access-gate · see research R9

## `server/analytics.yml`

```yaml
access:
  explorer: ${EXPLORER_ACCESS_GATE}:none
  vng: ${VNG_ACCESS_GATE}:programmagroei/landelijkinnovatiemonitor
  govtech: ${GOVTECH_ACCESS_GATE}:none
  vng_display_name: ${VNG_ACCESS_GATE_NAME}:Landelijk Innovatie Monitor   # optional fallback
  check_timeout_ms: ${ACCESS_CHECK_TIMEOUT_MS}:5000
```

## Accepted values for `access.<app>`

| Value | Meaning |
|---|---|
| `none` | explicitly ungated: every signed-in person is admitted |
| `space` | gate on an L0 Space |
| `space/subspace` | gate on an L1 subspace |
| `space/subspace/subsubspace` | gate on an L2 subspace |
| `https://<host>/space/challenges/subspace[/opportunities/subsubspace]` | same as the path form. The host is ignored and the `challenges` / `opportunities` segments are dropped |

## Start-up behaviour

| Condition | Result |
|---|---|
| key missing or empty, or value unparseable | **process exits** with `access.<app>: …` in the error (FR-003) |
| `none` | log `[Access] <app>: UNGATED (explicit)` |
| gate set | log `[Access] <app>: gated by <path> (read)`, then run the anonymous probe |
| probe: Space not found | `error` log: every check for that app is `unverified` (FR-020) |
| probe: Alkemio unreachable | `warn` log, display-name fallback used, probe retried every 60 s until it succeeds |

## Environment examples

| Deployment | `EXPLORER_ACCESS_GATE` | `VNG_ACCESS_GATE` | `GOVTECH_ACCESS_GATE` |
|---|---|---|---|
| production | (unset → `none`) | (unset → LIM) | (unset → `none`) |
| acceptance / test | `none` | a private test subspace path | `none` |
| local against production | `none` | (unset → LIM; the developer must have the Member role on it) | `none` |
| local, gate disabled on purpose | `none` | `none` | `none` |

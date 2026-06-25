# Contract: Dashboard Config Registry & Env Split

Defines how the single BFF keeps **shared** auth/platform config while giving each dashboard its **own** profile with **independent env vars**. Shared blocks are untouched; only `vng:` generalises and a sibling `govtech:` is added.

## `analytics.yml` — shared blocks (UNCHANGED)

`alkemio:`, `oidc:`, `session:`, `server:`, `logging:`, `cache:`, `limits:`, `openai:`, `query:`, `features:` remain exactly as today. In particular:

```yaml
session:
  # GovTech dev origin + prod subdomain APPENDED to the one shared allow-list.
  allowed_origins: "${SESSION_ALLOWED_ORIGINS}:http://localhost:5173,http://localhost:5174,http://localhost:5175"
```

## `analytics.yml` — per-app dashboard profiles

```yaml
# VNG profile (UNCHANGED — own VNG_* env vars)
vng:
  default_hub_nameid: ${VNG_DEFAULT_HUB_NAMEID}:vnginnovationhub
  gemeentedelers_space_nameid: ${VNG_GD_SPACE_NAMEID}:gemeentedelers
  gd_cache_ttl_hours: ${VNG_GD_CACHE_TTL_HOURS}:168
  tag_category_mapping:
    nds: { … }            # as today
    vng2030: { … }        # as today

# GovTech profile (NEW — own GOVTECH_* env vars; mapping seeded = VNG's)
govtech:
  default_hub_nameid: ${GOVTECH_DEFAULT_HUB_NAMEID}:        # operator-set; no baked default
  gemeentedelers_space_nameid: ${GOVTECH_GD_SPACE_NAMEID}:gemeentedelers   # same corpus as VNG
  gd_cache_ttl_hours: ${GOVTECH_GD_CACHE_TTL_HOURS}:168
  tag_category_mapping:
    nds: { … copy of vng.nds … }
    vng2030: { … copy of vng.vng2030 … }
```

## Parsed shape (server/src/config.ts)

```ts
config.dashboards = {
  vng: DashboardAppConfig,        // from `vng:` block
  govtech: DashboardAppConfig,    // from `govtech:` block
}
config.vng = config.dashboards.vng   // back-compat alias
config.vngPort                        // = port + 1 (unchanged)
config.govtechPort                    // = GOVTECH_FRONTEND_PORT || port + 2
```

## Rules

- **Separate, not shared**: GovTech reads only `GOVTECH_*` / the `govtech:` block; it never reads `VNG_*`. VNG never reads `GOVTECH_*`.
- **Shared, not duplicated**: Alkemio/OIDC/session/cache/limits stay single-valued (one BFF, one Alkemio client, one session-crypto key) — required for cross-frontend SSO.
- **Boot safety**: a missing `govtech:` block ⇒ defaults applied (empty default hub ⇒ no preselection, `gemeentedelers` GD space, 168h TTL, empty mappings) so a fresh checkout still boots and the GovTech app shows the full hub list with no preselection.
- **Origin allow-list**: the GovTech origin MUST be present in `session.allowed_origins` (dev `:5175`, prod subdomain) or sign-in returnTo + CORS will reject GovTech.

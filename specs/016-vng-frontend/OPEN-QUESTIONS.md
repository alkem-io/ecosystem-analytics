# Open questions for the user — 016-vng-frontend

Collected during autonomous implementation. Answer these in one go; most are config values or confirmations, not code.

## ✅ RESOLVED via the VNG-Groei investigation (no action needed)

- **NDS / VNG-2030 mapping (was the big blocker)** — RESOLVED. The dashboard's "spaces" source is correct: each **VNG Groei initiative** is published as its **own L0 Space**, with NDS/VNG-2030 classifications as **plain profile tags** using exact label strings (e.g. `"Artificiële Intelligentie"`, `"Wonen en Ruimte"`, `"Bedrijfsvoering & gemeentediensten"`). I updated `server/analytics.yml` `vng.tag_category_mapping` to those exact (lower-cased) labels and verified it counts correctly against real GDC tags. The `"VNG Groei"`/lifecycle/editorial tags are correctly ignored.
- **GD initiatives vs Groei** — RESOLVED/clarified. Two distinct datasets: **GemeenteDelers** (305 callouts, 92 themes — the optional graph fold-in) and **VNG Groei** (23 initiative *spaces*, NDS/VNG-2030 — the dashboard). The dashboard counts the selected Groei spaces; the GD layer is a separate graph enrichment. ⚠️ **One thing to confirm**: should the dashboard ALWAYS count selected spaces (current behaviour), regardless of the "include GD initiatives" graph toggle? Right now toggling GD initiatives flips the dashboard source to GD callouts (which lack NDS/VNG-2030 tags → uncategorised). I recommend **decoupling**: dashboard always counts the selected Groei spaces. Confirm and I'll decouple.

## Blocking real data (config values only)

1. **Default innovation hub nameID** — `VNG_DEFAULT_HUB_NAMEID` is empty. This should almost certainly be the **VNG Groei InnovationHub** (the one aggregating the 23 Groei initiative spaces — its nameID is `GROEI_INNOVATION_HUB_NAMEID` in the vng-gemeente-delers config). What is its nameID on prod/acc? (FR-010)

2. **gemeentedelers space nameID** — defaulted to `gemeentedelers` (`VNG_GD_SPACE_NAMEID`). Confirm the real nameID of the space whose Knowledge Base holds the ~305 GD callouts. (FR-045)

3. **Environment** — the Groei spaces currently exist on **acceptance** (`acc-alkem.io`), not production. Confirm which environment the VNG app should point at (`ALKEMIO_*`/`OIDC_ISSUER`).

## Deployment / hosting

5. **Production subdomains** — confirmed shared-`ea_session` via sibling subdomains. What are the actual parent domain + hostnames for Explorer vs VNG (for `SESSION_COOKIE_DOMAIN`, `SESSION_ALLOWED_ORIGINS`, and ingress)? e.g. `app.<domain>` / `vng.<domain>`. (FR-002/003)

6. **Ingress / k8s** — the Dockerfile was reworked for the new two-frontend layout, but real ingress manifests (routing each subdomain to the right static bundle) are out of scope and need your infra. Want me to draft them?

## Confirmations (lower stakes)

7. **Hub listing scope** — hubs are listed via `platform.library.innovationHubs` (hubs listed in the platform store). Confirm that's the set you want users to choose from (vs account-scoped). (FR-009)

8. **VNG branding** — currently reuses Alkemio branding/tokens with a text label "VNG Kenniscentrum Innovatie" (per your decision). Provide a VNG logo/palette when you want the visual identity applied. (FR-025)

9. **Dutch terminology review** — interim Dutch labels: tabs = "Netwerk / Ruimtedetails / Dashboard"; "Space" rendered as "Ruimte". Alkemio often leaves "Space" untranslated — do you want "Space"/"Spaces" kept in Dutch, or "Ruimte(s)"? (FR-037)

## Known deferrals (FYI — confirm OK)

10. **Explorer code dedup (T008/T009) deferred** — the shared graph/map/services now live in `@ea/shared` and the VNG app uses them, but the **Explorer still has its own copies** (not migrated, to avoid risking the working Explorer). OK to leave as tech debt, or schedule the migration?

11. **Live verification pending** — all server endpoints (hubs, dashboard, GD fold-in) typecheck and pass unit tests, but have NOT been exercised against a live authenticated Alkemio session (needs your login). Recommend a manual smoke run together once you're back.

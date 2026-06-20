# Open questions for the user — 016-vng-frontend

Collected during autonomous implementation. Answer these in one go; most are config values or confirmations, not code.

## Blocking real data (dashboard / hub / GD)

1. **Default innovation hub nameID** — `VNG_DEFAULT_HUB_NAMEID` is currently empty (no hub preselected on load). What is the nameID of the default VNG innovation hub? (FR-010)

2. **gemeentedelers space nameID** — defaulted to `gemeentedelers` (`VNG_GD_SPACE_NAMEID`). Confirm the real nameID of the space whose Knowledge Base holds the ~305 GD initiative callouts. (FR-045)

3. **NDS / VNG-2030 tag→category mapping (most important for real numbers)** — `server/analytics.yml` `vng.tag_category_mapping` uses *placeholder* tag keys (e.g. `"1.cloud"`, `"wonen en ruimte"`). What are the ACTUAL tag strings present on the spaces/callouts that should map to each NDS category (Cloud, Data, AI, Digitalisering, …, Vakmanschap) and each VNG-2030 theme (Bedrijfsvoering, Wonen en Ruimte, Bestaanszekerheid, Klimaat en energie, …)? Until this matches real tags, the dashboard counts everything as "Overig". (FR-022)

4. **Do GD initiatives carry NDS / VNG-2030 tags?** — The dashboard is data-source aware: when the GD layer is ON it counts GD *initiatives* by category. But GD callouts (from the vault) carry the **92 GemeenteDelers themes**, gemeente names, `gd-YYYY`, `sdg-NN` — not obviously NDS/VNG-2030 categories. If GD initiatives don't carry NDS/VNG-2030 tags, the GD-source dashboard will be empty/uncategorised. Should the GD dashboard instead group by **GD theme**, or is there an NDS/VNG-2030 tag on the callouts? (FR-022 / analyze finding I1)

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

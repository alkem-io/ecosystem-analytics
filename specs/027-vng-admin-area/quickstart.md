# Quickstart: validating the VNG administration area

**Feature**: 027-vng-admin-area · contracts in [contracts/](./contracts/) · model in [data-model.md](./data-model.md)

## 0. Release preconditions (infra, before production)

| # | Check | Why |
|---|---|---|
| P1 | `server/data/` in the production pod is on a **persistent** volume (sessions survive a redeploy today; confirm in the manifests, which live outside this repo) | FR-012 |
| P2 | `SETTINGS_BACKUP_DIR` points at storage that survives loss of that volume, or the volume has a daily snapshot policy | FR-012, research R6 |
| P3 | `monitor-settings.seed.json` lists exactly today's `vih-test` Spaces, in order (§2) | SC-008 |
| P4 | `VNG_ADMIN_GATE` is unset (default `programmagroei`) or deliberately set. Its ADMINs become Monitor Managers | FR-007 |

## 1. Local setup

```bash
cd server && cp .env.default .env    # OIDC client etc. as for feature 026
# Optional: isolate this run (cache, sessions and settings share one file) from your dev DB
export DB_PATH=data/cache.quickstart.sqlite
pnpm run dev                          # root: BFF + all SPAs
```

To test the two sets without production roles, use two Spaces where your account holds different
roles:

```bash
VNG_ACCESS_GATE=<space-you-are-MEMBER-of> VNG_ADMIN_GATE=<space-you-are-ADMIN-of> pnpm run dev
```

## 2. Starting set equals today's hub (P3)

```bash
cd server && pnpm vitest run src/settings/seed.test.ts
```

Expected: the seed file is valid. The live check requires a token:

```bash
pnpm tsx scripts/compare-seed-with-hub.ts vih-test
```

It prints `OK: 22 Spaces, same order` (the count is whatever the hub has), or the differences.

## 3. Scenario run (VNG at http://localhost:5174)

| # | Do | Expect |
|---|---|---|
| 1 | Open the sign-in screen, not signed in | viewer Spaces listed with links (`GET /api/auth/access/spaces`) |
| 2 | Sign in as a non-member | no-access screen lists the same Spaces |
| 3 | Sign in as a viewer only | dashboard loads; **no** hub dropdown, no "add Space" search; no settings button; `/admin` shows "no access" |
| 4 | Sign in as an admin of an admin Space | settings button in the header → `/admin`; four sections load independently |
| 5 | Included Spaces: add one (search), remove one, save | pending diff shown first; after save the dashboard (another browser, viewer) shows the new set on reload |
| 6 | Save from two tabs with the same base | second save gets the "set changed" dialog (409) |
| 7 | Paste the link of a Space you cannot read | refused: "You can only add Spaces you can see on Alkemio" |
| 8 | Classifications: pick an initiative you can update, change its phase, save | confirmation; Alkemio shows the new value; your dashboard's phase chart moves it after you return |
| 9 | Pick an initiative you cannot update | read-only with the reason and a link |
| 10 | GemeenteDelers section | counts equal the dashboard's `[GemeenteDelers]` console group; `readAt`/next refresh shown |
| 11 | Remove yourself as ADMIN on Alkemio, then save something | 403. The area switches to "no access" after `/me` is re-read |
| 12 | Refresh the dashboard (force-refresh) and restart the BFF | Included Spaces and history unchanged (SC-005) |
| 13 | Stop the BFF, `node dist/settings/restore-cli.js data/backups/settings.<slug>.<date>.sqlite`, start | the CLI and the start-up log show the restored revision; the area shows that set; you are still signed in |
| 14 | Open GovTech (http://localhost:5175) | unchanged: hub dropdown and Space picker still there |

## 4. Automated checks

```bash
cd server && pnpm run build && pnpm run test     # access sets, settings store, admin routes (real HTTP)
cd ../frontend/vng && pnpm run build && pnpm run test
cd ../govtech && pnpm run build
cd ../ecosystem-analytics && pnpm run build
cd ../.. && VNG_URL=http://localhost:5174 pnpm exec playwright test tests/vng-admin-area.spec.mjs tests/vng-access-gate.spec.mjs tests/mobile-navigation.spec.mjs
```

`mobile-navigation.spec.mjs` must also cover `/admin` at 390, 820 and 1440 px (no horizontal page
scroll, FR-034).

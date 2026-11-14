# `settings/` — the monitor's own durable settings (feature 027)

The VNG monitor's configuration that is **not** read from Alkemio: which Spaces it reports on
(the Included Spaces), the ecosystem key the Ecosystem tab uses, and the change history of both
the Included Spaces and the classifications managers edit through the admin area.

It is **global configuration, not a cache**. It holds Space nameIDs/UUIDs, the ecosystem key and
change records (actor id and display name). It never holds tokens, session ids or Alkemio
content; every name, link or classification the admin area shows is fetched per request with the
manager's own token.

## Where it lives

In the application's **one SQLite file** (`data/cache.<env-slug>.sqlite`, or `DB_PATH`), as its
own tables, beside the cache and the sessions:

| Table | Holds |
|---|---|
| `settings_meta` | the schema version of these tables (never `PRAGMA user_version`, which the cache's run-once maintenance uses) |
| `settings_state` | one row: revision, ecosystem key, last update |
| `included_spaces` | the Included Spaces in order (nameID, UUID once known) |
| `settings_changes` | append-only: seed / update / rename |
| `classification_changes` | append-only: classification edits made through the admin area |

**Never touched by cache operations.** Cache clears, force-refresh, `purgeExpired` and every
`CACHE_MAINTENANCE_VERSION` step only delete from `cache_entries` (`isolation.test.ts`).
Losing the whole file loses the settings too — that is what the daily backup is for.

## Modules

| File | Does |
|---|---|
| `db.ts` | creates/upgrades the tables via `settings_meta` (`initSettingsStore`) |
| `seed.ts` | loads and validates the starting set; seeds empty tables once |
| `store.ts` | `getScope`, `getIncludedSpaces`, `saveIncludedSpaces` (revision check), `history`, `setSpaceId`, `recordRename`, `recordClassificationChange` |
| `backup.ts` | daily settings-only backup with retention; `restoreSettingsFrom` |

Starting set: `src/data/vng/monitor-settings.seed.json` (copied to `dist/data/` by the build).
Regenerate or compare it against a hub with `scripts/compare-seed-with-hub.ts`.

## Start-up (`index.ts`, after `initDatabase`, before any listener)

1. Create/upgrade the settings tables.
2. Load and validate the starting set. Invalid → the process **exits** with `settings: starting set …`.
3. No `settings_state` row → seed it in one transaction (revision 1, one `kind=seed` change,
   note `from starting set v1`). If the tables were **just created**, log a warning: if this
   deployment had settings before, restore a backup.
4. Back up if today's file is missing; then check hourly.
5. Log `[Settings] monitor scope revision <n>, <k> Spaces; last backup <file>`.

A store that has `settings_state` is **never re-seeded**, whatever the starting set says. To
change the Spaces of a running deployment, use the admin area.

## Backup

Once per UTC day, the settings tables — **and only those** — are copied into a new small SQLite
file `settings.<env-slug>.<YYYY-MM-DD>.sqlite` in `settings.backup_dir` (default
`data/backups/`; env `SETTINGS_BACKUP_DIR`), written to a temp name and renamed. No session,
token or cached data is ever in a backup. The newest `settings.backup_keep` (14) are kept.
Skipped when today's file exists, so several replicas never collide. A failure logs an error and
is retried on the next hourly tick; it never stops the app. Put the backup directory on storage
that survives loss of the data volume (a different mount, or a snapshot policy).

## Restore (operator)

1. Scale the deployment to 0, or stop the container.
2. In the container (same env and volume as the server):
   `node dist/settings/restore-cli.js data/backups/settings.<slug>.<date>.sqlite`
   (from a checkout: `pnpm tsx src/settings/restore-cli.ts …`). It replaces only the settings
   tables; the cache and sessions are untouched.
3. Start. The log shows the restored revision. No re-seed happens, because the state row exists.

Changes made after that backup are lost and must be re-entered; the history in the admin area
shows what the restored state contains.

## Concurrency

Every write is `BEGIN IMMEDIATE`: read the revision, compare it with `baseRevision`, write, then
revision + 1. Reads take no lock.

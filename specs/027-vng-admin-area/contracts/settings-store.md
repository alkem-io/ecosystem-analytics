# Contract: Monitor settings store (operations)

**Feature**: 027-vng-admin-area · research R5–R8 · schema in [../data-model.md](../data-model.md)

## 1. Files

| What | Default | Override |
|---|---|---|
| Settings tables | in the application DB `server/data/cache.<env-slug>.sqlite` (one file for the whole app; revised 2026-11-14) | `DB_PATH` (`:memory:` for tests) |
| Backups | `server/data/backups/settings.<env-slug>.<YYYY-MM-DD>.sqlite`, newest 14 kept | `SETTINGS_BACKUP_DIR`, `SETTINGS_BACKUP_KEEP` |
| Starting set | `dist/data/vng/monitor-settings.seed.json` (from `server/src/data/vng/`) | none: change it by a code change |

The settings tables are **never** touched by cache maintenance, cache clears, force-refresh or
`purgeExpired`, which only delete from `cache_entries` and the session tables. Losing the whole
file loses the settings too: that is what the backup is for.

## 2. Start-up sequence

1. After `initDatabase`, create/upgrade the settings tables up to `settings_meta.schema_version`.
2. Load and validate the starting set. If it is invalid, **exit** with `settings: starting set …`.
3. If `settings_state` is absent, seed it in one transaction (revision 1, a `kind=seed` change).
   If the settings tables were just created, log a **warning** that a restore may be needed if
   this deployment had settings before.
4. Run a backup if today's file is missing, then check hourly (one backup per UTC day).
5. Log: `[Settings] monitor scope revision <n>, <k> Spaces; last backup <file>`.

## 3. Backup

- Copies **only the settings tables** (via `ATTACH`, one transaction) into a new small SQLite file,
  written to a temp name and then renamed. Sessions, tokens and cached data never appear in a backup.
- It is skipped when today's file exists, so several replicas never collide.
- A failure logs an **error** and is retried on the next tick. It never stops the app.
- **Release precondition**: `SETTINGS_BACKUP_DIR` should be on storage that survives loss of the
  data volume (a different mount, or a volume snapshot policy). Infra's choice, recorded in
  quickstart §0.

## 4. Restore (operator)

1. Scale the deployment to 0, or stop the container.
2. Run `node dist/settings/restore-cli.js data/backups/settings.<slug>.<date>.sqlite` with the
   server's env and volume. It replaces only the settings tables; the cache and sessions stay.
3. Start. The log shows the restored revision. No re-seed happens, because the state row exists.

Changes made after that backup are lost and must be re-entered. The history in the area shows
what the restored state contains.

## 5. Concurrency

Every write is `BEGIN IMMEDIATE`: read the revision, compare it with `baseRevision`, write, then
revision + 1. A busy timeout of 5 s applies. Reads need no lock.

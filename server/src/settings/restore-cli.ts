/**
 * Restore the monitor settings from a daily backup (feature 027, settings/README.md).
 * Replaces ONLY the settings tables in the application DB; the cache and sessions are
 * untouched. Stop the server first (scale to 0), then:
 *
 *   node dist/settings/restore-cli.js data/backups/settings.<slug>.<YYYY-MM-DD>.sqlite
 *   pnpm tsx src/settings/restore-cli.ts …          (from a checkout)
 *
 * It is compiled into the image, so it runs in the container with the same env as the server.
 * The DB is found exactly as the server finds it (DB_PATH, else data/cache.<slug>.sqlite).
 */
import { loadConfig } from '../config.js';
import { createLogger } from '../logging/logger.js';
import { initDatabase } from '../cache/db.js';
import { initSettingsStore } from './db.js';
import { restoreSettingsFrom } from './backup.js';

const file = process.argv[2];
if (!file) {
  console.error('usage: restore-cli <backup file>');
  process.exit(2);
}
const config = loadConfig();
createLogger(config.logging);
initDatabase(config.oidc.issuer);
initSettingsStore();
const revision = restoreSettingsFrom(file);
console.log(`restored monitor settings revision ${revision} from ${file}`);

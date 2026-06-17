import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createLogger } from './logging/logger.js';
import { initDatabase } from './cache/db.js';
import { purgeExpired } from './cache/cache-service.js';

const config = loadConfig();
const logger = createLogger(config.logging);

logger.info('Starting Ecosystem Analytics server', { context: 'Bootstrap' });
logger.info(`Alkemio endpoint: ${config.alkemioGraphqlEndpoint}`, { context: 'Bootstrap' });

const app = createApp();
initDatabase();

// Housekeeping: sweep expired cache entries, spent pre-auth records, and
// dead/idle sessions so the shared SQLite store does not accumulate stale rows.
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
purgeExpired();
const cleanupTimer = setInterval(() => {
  try {
    purgeExpired();
  } catch (err) {
    logger.warn(`Cleanup sweep failed: ${(err as Error).message}`, { context: 'Bootstrap' });
  }
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref(); // don't keep the process alive for the timer alone

app.listen(config.port, () => {
  logger.info(`Server listening on port ${config.port}`, { context: 'Bootstrap' });
});

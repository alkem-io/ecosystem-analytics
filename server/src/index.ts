import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createLogger } from './logging/logger.js';
import { initDatabase } from './cache/db.js';
import { purgeExpired } from './cache/cache-service.js';

const config = loadConfig();
const logger = createLogger(config.logging);

logger.info('Starting Ecosystem Analytics server', { context: 'Bootstrap' });
logger.info(`Alkemio endpoint: ${config.alkemioGraphqlEndpoint}`, { context: 'Bootstrap' });
logger.info(
  `VNG default innovation hub nameID: "${config.vng.defaultHubNameId || '(none)'}"` +
    ` · GemeenteDelers space nameID: "${config.vng.gemeentedelersSpaceNameId}"`,
  { context: 'Bootstrap' },
);

// Two apps sharing the same /api routes + SQLite session/cache store:
//  - the Explorer SPA on `config.port`
//  - the VNG Kenniscentrum Innovatie SPA on `config.vngPort` (feature 016)
// In production each serves its own static build; the shared `ea_session` cookie
// (parent-domain scoped) means signing in on either subdomain works on both.
const app = createApp('../frontend/dist');
const vngApp = createApp('../frontend-vng/dist');
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
  logger.info(`Explorer + API listening on port ${config.port}`, { context: 'Bootstrap' });
});

vngApp.listen(config.vngPort, () => {
  logger.info(`VNG dashboard + API listening on port ${config.vngPort}`, { context: 'Bootstrap' });
});

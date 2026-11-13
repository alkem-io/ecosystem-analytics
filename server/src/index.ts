import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createLogger } from './logging/logger.js';
import { initDatabase } from './cache/db.js';
import { purgeExpired, runDeploymentCacheMaintenance } from './cache/cache-service.js';
import { LEGACY_GD_POSTS_NOTICE } from './transform/gd-initiative-sources.js';
import { APP_IDS } from './access/policy.js';
import { startGateProbes } from './access/probe.js';

const config = loadConfig();
const logger = createLogger(config.logging);

logger.info('Starting Ecosystem Analytics server', { context: 'Bootstrap' });
logger.info(`Alkemio endpoint: ${config.alkemioGraphqlEndpoint}`, { context: 'Bootstrap' });
logger.info(
  `VNG default innovation hub nameID: "${config.vng.defaultHubNameId || '(none)'}"` +
    ` · GemeenteDelers space nameID: "${config.vng.gemeentedelersSpaceNameId}"`,
  { context: 'Bootstrap' },
);
// A standing reminder to whoever runs this server that the GD posts path must go.
// LEGACY-GD-POSTS: delete with the posts path.
logger.warn(LEGACY_GD_POSTS_NOTICE, { context: 'Bootstrap' });

// Feature 026 — each application's access gate. `loadConfig()` has already refused
// to start if any app is undeclared (FR-003); state each one plainly, then probe the
// gates anonymously in the background (name/link for the "no access" page, and a
// loud warning if a gate is publicly readable — FR-020). Listeners do not wait.
for (const appId of APP_IDS) {
  const { gate } = config.access.apps[appId];
  logger.info(
    gate ? `[Access] ${appId}: gated by ${gate.key} (read)` : `[Access] ${appId}: UNGATED (explicit)`,
    { context: 'Bootstrap' },
  );
}
startGateProbes(
  APP_IDS.flatMap((appId) => {
    const { gate, displayNameFallback } = config.access.apps[appId];
    return gate ? [{ app: appId, gate, displayNameFallback }] : [];
  }),
  { alkemioServerUrl: config.alkemioServerUrl, timeoutMs: config.access.checkTimeoutMs },
);

// Three apps sharing the same /api routes + SQLite session/cache store:
//  - the Explorer SPA on `config.port`
//  - the VNG Kenniscentrum Innovatie SPA on `config.vngPort` (feature 016)
//  - the GovTech Netherlands SPA on `config.govtechPort` (feature 017)
// In production each serves its own static build; the shared `ea_session` cookie
// (parent-domain scoped) means signing in on any subdomain works on all of them.
const app = createApp('explorer', '../frontend/dist');
const vngApp = createApp('vng', '../frontend-vng/dist');
const govtechApp = createApp('govtech', '../frontend-govtech/dist');
// Namespace the default DB file per environment (issuer) so switching between
// e.g. production and acceptance can't reuse another env's cache/session rows.
initDatabase(config.oidc.issuer);

// One-time, deployment-scoped cache maintenance (runs at most once per env DB
// via SQLite user_version). This deployment force-clears the stale GD initiative
// cache so gemeente images reload for every user without a manual Refresh.
const maintenance = runDeploymentCacheMaintenance();
if (maintenance.gdRowsCleared > 0) {
  logger.info(
    `One-time cache refresh: cleared ${maintenance.gdRowsCleared} GD initiative cache row(s)`,
    { context: 'Bootstrap' },
  );
}

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

govtechApp.listen(config.govtechPort, () => {
  logger.info(`GovTech dashboard + API listening on port ${config.govtechPort}`, {
    context: 'Bootstrap',
  });
});

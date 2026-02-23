import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createLogger } from './logging/logger.js';
import { initDatabase } from './cache/db.js';

const config = loadConfig();
const logger = createLogger(config.logging);

logger.info('Starting Ecosystem Analytics server', { context: 'Bootstrap' });
logger.info(`Alkemio endpoint: ${config.alkemioGraphqlEndpoint}`, { context: 'Bootstrap' });

const app = createApp();
initDatabase();

app.listen(config.port, () => {
  logger.info(`Server listening on port ${config.port}`, { context: 'Bootstrap' });
});

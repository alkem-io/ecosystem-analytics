import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { initDatabase } from './cache/db.js';

const config = loadConfig();
const app = createApp();

initDatabase();

app.listen(config.port, () => {
  console.log(`Ecosystem Analytics server running on port ${config.port}`);
});

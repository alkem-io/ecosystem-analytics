import { defineConfig } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Visual regression targets the Explorer (now at frontend/ecosystem-analytics/ after the
// 016 workspace move). This config does NOT launch the Explorer's source app directly:
// it either drives the local Figma Make export under .prototype/alkemio-redesign, or any
// running app via BASE_URL (e.g. BASE_URL=http://localhost:5173 for the Explorer dev server,
// which still runs on :5173). No old top-level `frontend/` path is referenced here.
const prototypeDir = path.join(__dirname, '.prototype', 'alkemio-redesign');
const hasPrototype = fs.existsSync(path.join(prototypeDir, 'package.json'));

const baseURLFromEnv = process.env.BASE_URL;
const usePrototype = process.env.USE_PROTOTYPE === '1' || (hasPrototype && !baseURLFromEnv);

const baseURL = baseURLFromEnv ?? (usePrototype ? 'http://127.0.0.1:5173' : undefined);

/** @type {import('@playwright/test').PlaywrightTestConfig} */
export default defineConfig({
  testDir: 'tests',
  snapshotDir: 'tests/__screenshots__',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light'
  },
  ...(usePrototype
    ? {
        webServer: {
          command: `npm --prefix "${prototypeDir}" run dev -- --host 127.0.0.1 --port 5173`,
          url: 'http://127.0.0.1:5173/analytics',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000
        }
      }
    : {})
});

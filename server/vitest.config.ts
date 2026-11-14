import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Feature 027: lets a parity test import a pure frontend module that reads the shared
  // types through the SPAs' `@server/*` alias (`*.parity.test.ts`, excluded from tsc).
  resolve: {
    alias: { '@server': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec,integration}.ts', 'src/**/*.integration.test.ts'],
  },
});

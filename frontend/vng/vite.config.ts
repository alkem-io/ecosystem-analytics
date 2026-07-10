import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));

export default defineConfig(({ mode }) => {
  // Proxy /api to the shared EA backend (default local port 4100). Override with
  // VITE_PROXY_TARGET in frontend/vng/.env if the backend runs elsewhere.
  const env = loadEnv(mode, __dirname, '');
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://localhost:4100';
  console.info(`[vite:vng] Proxying /api → backend at ${proxyTarget}`);
  return {
    plugins: [tailwindcss(), react()],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      // SPA build timestamp — surfaced in the About dialog so operators can
      // confirm which frontend build is actually served.
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
    build: {
      // The only chunk over the default 500 kB is exceljs (~940 kB), a single
      // pre-minified lib loaded on demand from exportDashboardXlsx() — it never
      // hits initial page load. Raise the limit so the warning still flags real
      // eager-bundle regressions without crying wolf over the lazy export chunk.
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          // Split large third-party libs into their own cacheable chunks so no
          // single chunk balloons past the 500 kB warning threshold and vendor
          // code isn't re-downloaded whenever app code changes.
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id))
              return 'react-vendor';
            if (/[\\/]node_modules[\\/](recharts|victory-vendor)[\\/]/.test(id)) return 'charts';
            if (/[\\/]node_modules[\\/]d3(-[a-z]+)?[\\/]/.test(id)) return 'd3';
            if (id.includes('i18next')) return 'i18n';
            // Everything else (incl. export-only libs reached via dynamic import,
            // like exceljs) is left to the bundler so async-only code splits into
            // its own on-demand chunk instead of being pinned into a vendor chunk.
            return undefined;
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@ea/shared': path.resolve(__dirname, '../shared/src'),
        '@server/types': path.resolve(__dirname, '../../server/src/types'),
      },
    },
    server: {
      port: 5174,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    // No tests exist yet for this app (pre-existing gap, unrelated to TS7) — vitest
    // exits 1 on zero test files by default, which would otherwise fail the
    // workspace-wide `pnpm test` gate.
    test: {
      passWithNoTests: true,
    },
  };
});

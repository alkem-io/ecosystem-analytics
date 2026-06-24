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
  };
});

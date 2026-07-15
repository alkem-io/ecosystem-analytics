import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf-8"));

export default defineConfig(({ mode }) => {
  // Proxy target defaults to the server's local port (4100). Override with
  // VITE_PROXY_TARGET in frontend/.env if the backend runs elsewhere.
  const env = loadEnv(mode, __dirname, "");
  const proxyTarget = env.VITE_PROXY_TARGET || "http://localhost:4100";
  console.info(`[vite] Proxying /api → backend at ${proxyTarget}`);
  return {
    plugins: [tailwindcss(), react()],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    build: {
      rollupOptions: {
        output: {
          // Split large third-party libs into their own cacheable chunks so no
          // single chunk balloons past the 500 kB warning threshold and vendor
          // code isn't re-downloaded whenever app code changes.
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id))
              return "react-vendor";
            if (/[\\/]node_modules[\\/](recharts|victory-vendor)[\\/]/.test(id)) return "charts";
            if (/[\\/]node_modules[\\/]d3(-[a-z]+)?[\\/]/.test(id)) return "d3";
            if (id.includes("i18next")) return "i18n";
            // Everything else (incl. export-only libs reached via dynamic import,
            // like exceljs) is left to the bundler so async-only code splits into
            // its own on-demand chunk instead of being pinned into a vendor chunk.
            return undefined;
          },
        },
      },
    },
    resolve: {
      // i18next declares `typescript` as an optional peer, so pnpm keys a separate
      // copy per resolved TS version. @ea/shared is aliased to source and pulls its
      // own copy, leaving the shared components calling useTranslation() on a second,
      // never-initialised i18next singleton — every key without a defaultValue then
      // renders raw. Force one copy for the whole app.
      dedupe: ["i18next", "react-i18next"],
      alias: {
        "@": path.resolve(__dirname, "src"),
        "@ea/shared": path.resolve(__dirname, "../shared/src"),
        "@server/types": path.resolve(__dirname, "../../server/src/types"),
      },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});

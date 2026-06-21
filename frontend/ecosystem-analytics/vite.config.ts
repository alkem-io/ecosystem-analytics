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
    resolve: {
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

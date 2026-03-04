/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_ECOSYSTEM_ANALYTICS_BACKEND_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

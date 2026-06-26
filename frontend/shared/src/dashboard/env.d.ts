/**
 * Build-time constants injected by each wrapper app's Vite `define` config
 * (`__APP_VERSION__` from package.json, `__BUILD_TIME__` from the build clock).
 * Declared here because the shared AboutDialog consumes them; every consuming
 * app (vng, govtech) defines the values at build time.
 */
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;

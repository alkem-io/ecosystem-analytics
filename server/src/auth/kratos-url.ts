import { loadConfig } from '../config.js';

/**
 * Returns the Kratos public base URL from configuration.
 * ALKEMIO_KRATOS_PUBLIC_URL must be set — if not, the app is misconfigured.
 */
export function resolveKratosPublicUrl(): string {
  const config = loadConfig();

  if (!config.alkemioKratosPublicUrl) {
    throw new Error(
      'ALKEMIO_KRATOS_PUBLIC_URL is not set. The application is not deployed correctly.',
    );
  }

  return config.alkemioKratosPublicUrl;
}

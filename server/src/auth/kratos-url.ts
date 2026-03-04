import { loadConfig } from '../config.js';
import { getLogger } from '../logging/logger.js';

let cachedKratosUrl: string | null = null;

/**
 * Resolves the Kratos public base URL.
 * Priority: env var / config → dynamic discovery from Alkemio GraphQL config endpoint.
 * Result is cached for the lifetime of the process.
 */
export async function resolveKratosPublicUrl(): Promise<string> {
  if (cachedKratosUrl) return cachedKratosUrl;

  const config = loadConfig();

  // 1. Check config / env var
  if (config.alkemioKratosPublicUrl) {
    cachedKratosUrl = config.alkemioKratosPublicUrl;
    getLogger().info(`Kratos URL from config: ${cachedKratosUrl}`, { context: 'SSO' });
    return cachedKratosUrl;
  }

  // 2. Dynamic discovery from Alkemio GraphQL configuration query.
  //    Use the public GraphQL endpoint (derived from server_url) since the
  //    platform configuration query doesn't require authentication.
  try {
    const publicGraphqlUrl = `${config.alkemioServerUrl.replace(/\/$/, '')}/api/public/graphql`;
    const query = `{ platform { configuration { authentication { providers { config { kratosPublicBaseURL } } } } } }`;
    getLogger().debug(`Discovering Kratos URL from ${publicGraphqlUrl}`, { context: 'SSO' });
    const res = await fetch(publicGraphqlUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const json = (await res.json()) as {
      data?: {
        platform?: {
          configuration?: {
            authentication?: {
              providers?: Array<{ config?: { kratosPublicBaseURL?: string } }>;
            };
          };
        };
      };
    };
    const providers = json.data?.platform?.configuration?.authentication?.providers;
    const kratosUrl = providers?.[0]?.config?.kratosPublicBaseURL;
    if (kratosUrl) {
      cachedKratosUrl = kratosUrl;
      getLogger().info(`Kratos URL discovered: ${cachedKratosUrl}`, { context: 'SSO' });
      return cachedKratosUrl;
    }
  } catch (err) {
    getLogger().warn(`Failed to discover Kratos URL: ${(err as Error).message}`, {
      context: 'SSO',
    });
  }

  throw new Error(
    'Cannot resolve Kratos public URL. Set ALKEMIO_KRATOS_PUBLIC_URL or ensure Alkemio GraphQL is reachable.',
  );
}

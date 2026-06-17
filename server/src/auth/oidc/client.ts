import * as oidc from 'openid-client';
import { loadConfig } from '../../config.js';
import { getLogger } from '../../logging/logger.js';

/**
 * OIDC Relying Party configuration (Ory Hydra discovery + client auth).
 *
 * A single code path serves both deployments (FR-006/FR-019); only config
 * differs:
 *   - hosted  → confidential client (`client_secret_basic`, secret present)
 *   - local   → public client (`token_endpoint_auth_method=none`, PKCE only)
 *
 * The discovered {@link oidc.Configuration} is memoized — discovery is a
 * network round-trip we only need once per process.
 */

let configPromise: Promise<oidc.Configuration> | null = null;

/** Select the openid-client ClientAuth implementation from config. */
function selectClientAuth(method: string, clientSecret: string): oidc.ClientAuth {
  switch (method) {
    case 'none':
      // Public client — PKCE is the sole client-auth factor (no secret).
      return oidc.None();
    case 'client_secret_post':
      return oidc.ClientSecretPost(clientSecret);
    case 'client_secret_basic':
    default:
      return oidc.ClientSecretBasic(clientSecret);
  }
}

/** Discover + build the OIDC configuration (memoized). */
export function getOidcConfiguration(): Promise<oidc.Configuration> {
  if (configPromise) return configPromise;

  const { oidc: cfg } = loadConfig();
  const server = new URL(cfg.issuer);
  const clientAuth = selectClientAuth(cfg.tokenEndpointAuthMethod, cfg.clientSecret);

  // Public clients pass no secret; confidential clients pass it via clientAuth.
  const metadata = cfg.clientSecret || undefined;

  const options: oidc.DiscoveryRequestOptions = {};
  if (server.protocol === 'http:') {
    // Permit a plain-HTTP issuer (local Hydra). Production uses https.
    options.execute = [oidc.allowInsecureRequests];
  }

  configPromise = oidc
    .discovery(server, cfg.clientId, metadata, clientAuth, options)
    .then((configuration) => {
      getLogger().info(
        `OIDC discovery complete for issuer ${cfg.issuer} ` +
          `(client=${cfg.clientId}, auth=${cfg.tokenEndpointAuthMethod})`,
        { context: 'OIDC' },
      );
      return configuration;
    })
    .catch((err) => {
      // Reset so a transient discovery failure can be retried on the next request.
      configPromise = null;
      throw err;
    });

  return configPromise;
}

/** Test/refresh hook — clears the memoized configuration. */
export function resetOidcConfiguration(): void {
  configPromise = null;
}

import { GraphQLClient } from 'graphql-request';
import { loadConfig } from '../config.js';
import { getSdk, type Sdk } from './generated/graphql.js';
import type { AuthContext } from '../auth/middleware.js';

/**
 * Create a typed Alkemio SDK instance using the request's auth context.
 *
 * - Bearer mode (manual login): forwards the token via Authorization header
 *   to the non-interactive GraphQL endpoint.
 * - Cookie mode (SSO): forwards the Kratos session cookie to the interactive
 *   GraphQL endpoint (non-interactive doesn't support cookie auth).
 */
export function createAlkemioSdk(auth: AuthContext): Sdk {
  const config = loadConfig();

  let client: GraphQLClient;

  if (auth.mode === 'cookie') {
    const interactiveEndpoint = `${config.alkemioServerUrl.replace(/\/$/, '')}/api/private/graphql`;
    client = new GraphQLClient(interactiveEndpoint, {
      headers: {
        Cookie: `ory_kratos_session=${auth.bearerToken}`,
      },
    });
  } else {
    client = new GraphQLClient(config.alkemioGraphqlEndpoint, {
      headers: {
        Authorization: `Bearer ${auth.bearerToken}`,
      },
    });
  }

  return getSdk(client);
}

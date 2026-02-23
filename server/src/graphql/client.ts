import { GraphQLClient } from 'graphql-request';
import { loadConfig } from '../config.js';
import { getSdk, type Sdk } from './generated/graphql.js';

/**
 * Create a typed Alkemio SDK instance authenticated with the user's bearer token.
 * The token is forwarded as-is from the frontend (Alkemio-issued).
 * All GraphQL interactions MUST use this SDK (TR-016).
 */
export function createAlkemioSdk(bearerToken: string): Sdk {
  const config = loadConfig();

  const client = new GraphQLClient(config.alkemioGraphqlEndpoint, {
    headers: {
      Authorization: `Bearer ${bearerToken}`,
    },
  });

  return getSdk(client);
}

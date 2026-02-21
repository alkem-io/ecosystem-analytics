import { GraphQLClient } from 'graphql-request';
import { loadConfig } from '../config.js';
import { getSdk, type Sdk } from './generated/graphql.js';

/**
 * Create a typed Alkemio SDK instance authenticated with the user's Kratos session.
 * All GraphQL interactions MUST use this SDK (TR-016).
 */
export function createAlkemioSdk(kratosCookies: string): Sdk {
  const config = loadConfig();

  const client = new GraphQLClient(config.alkemioGraphqlEndpoint, {
    headers: {
      cookie: kratosCookies,
    },
  });

  return getSdk(client);
}

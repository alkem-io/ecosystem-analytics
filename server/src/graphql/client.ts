import { GraphQLClient } from 'graphql-request';
import { loadConfig } from '../config.js';

/**
 * Create a GraphQL client configured with the user's bearer token.
 * The client sends requests to the Alkemio GraphQL endpoint via the BFF,
 * forwarding the user's Kratos session cookies for authentication.
 */
export function createGraphQLClient(kratosCookies: string): GraphQLClient {
  const config = loadConfig();

  return new GraphQLClient(config.alkemioGraphqlEndpoint, {
    headers: {
      cookie: kratosCookies,
    },
  });
}

// Note: The generated SDK from codegen (getSdk) will be imported from
// ./generated/graphql.ts once codegen is run against a live Alkemio server.
// For now, the client wrapper is ready to be used with:
//
//   import { getSdk } from './generated/graphql.js';
//   const client = createGraphQLClient(kratosCookies);
//   const sdk = getSdk(client);
//   const me = await sdk.me();

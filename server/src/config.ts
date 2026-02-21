import dotenv from 'dotenv';

dotenv.config();

export interface ServerConfig {
  alkemioServerUrl: string;
  alkemioGraphqlEndpoint: string;
  alkemioKratosPublicUrl: string;
  port: number;
  sessionSecret: string;
  maxSpacesPerQuery: number;
  cacheTtlHours: number;
}

export function loadConfig(): ServerConfig {
  return {
    alkemioServerUrl: requiredEnv('ALKEMIO_SERVER_URL'),
    alkemioGraphqlEndpoint: requiredEnv('ALKEMIO_GRAPHQL_ENDPOINT'),
    alkemioKratosPublicUrl: requiredEnv('ALKEMIO_KRATOS_PUBLIC_URL'),
    port: parseInt(process.env.PORT || '4000', 10),
    sessionSecret: requiredEnv('SESSION_SECRET'),
    maxSpacesPerQuery: parseInt(process.env.MAX_SPACES_PER_QUERY || '10', 10),
    cacheTtlHours: parseInt(process.env.CACHE_TTL_HOURS || '24', 10),
  };
}

function requiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

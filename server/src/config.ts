import dotenv from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import YAML from 'yaml';

dotenv.config();

const YAML_CONFIG_FILENAME = 'analytics.yml';

export interface LoggingConfig {
  level: string;
  consoleEnabled: boolean;
  json: boolean;
}

export interface ServerConfig {
  alkemioServerUrl: string;
  alkemioGraphqlEndpoint: string;
  alkemioKratosPublicUrl: string;
  port: number;
  logging: LoggingConfig;
  maxSpacesPerQuery: number;
  cacheTtlHours: number;
}

/** Resolve the YAML config file path (check env override, cwd, then relative to dist) */
function resolveConfigFilePath(): string {
  const candidates = [
    process.env.ANALYTICS_CONFIG_PATH,
    join(process.cwd(), YAML_CONFIG_FILENAME),
    join(import.meta.dirname, '../../', YAML_CONFIG_FILENAME),
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  throw new Error(
    `Config file '${YAML_CONFIG_FILENAME}' not found. Searched: ${candidates.join(', ')}`,
  );
}

/**
 * Substitute ${ENV_VAR}:default patterns in a YAML scalar value.
 * Follows the Alkemio convention (see alkemio.yml in the server repo).
 */
function substituteEnvVar(nodeValue: unknown): unknown {
  const raw = `${nodeValue}`;
  const match = raw.match(/^\$\{(.*?)\}:?(.*)$/);
  if (!match) return nodeValue;

  const envKey = match[1];
  const defaultValue = match[2];
  const resolved = process.env[envKey] ?? defaultValue;

  if (resolved.toLowerCase() === 'true') return true;
  if (resolved.toLowerCase() === 'false') return false;
  if (resolved !== '' && !isNaN(Number(resolved))) return Number(resolved);

  return resolved;
}

/** Load and parse the YAML config with env var substitution */
function loadYamlConfig(): Record<string, unknown> {
  const filePath = resolveConfigFilePath();
  const rawYaml = readFileSync(filePath, 'utf8');

  const doc = YAML.parseDocument(rawYaml);

  YAML.visit(doc, {
    Scalar(_key, node) {
      if (node.type === 'PLAIN') {
        node.value = substituteEnvVar(node.value);
      }
    },
  });

  return doc.toJSON() as Record<string, unknown>;
}

let cachedConfig: ServerConfig | null = null;

export function loadConfig(): ServerConfig {
  if (cachedConfig) return cachedConfig;

  const yml = loadYamlConfig() as {
    alkemio: { server_url: string; graphql_endpoint: string; kratos_public_url: string };
    server: { port: number };
    logging: { level: string; console_enabled: boolean; json: boolean };
    cache: { ttl_hours: number };
    limits: { max_spaces_per_query: number };
  };

  cachedConfig = {
    alkemioServerUrl: String(yml.alkemio.server_url),
    alkemioGraphqlEndpoint: String(yml.alkemio.graphql_endpoint),
    alkemioKratosPublicUrl: yml.alkemio.kratos_public_url ? String(yml.alkemio.kratos_public_url) : '',
    port: yml.server.port,
    logging: {
      level: yml.logging.level,
      consoleEnabled: yml.logging.console_enabled,
      json: yml.logging.json,
    },
    maxSpacesPerQuery: yml.limits.max_spaces_per_query,
    cacheTtlHours: yml.cache.ttl_hours,
  };

  return cachedConfig;
}

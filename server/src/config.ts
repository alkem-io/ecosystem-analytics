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

export interface OpenAIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

export interface QueryConfig {
  sessionTtlMinutes: number;
  maxQueryLength: number;
  maxFeedbackLength: number;
}

export interface FeaturesConfig {
  aiQueryEnabled: boolean;
}

export interface ServerConfig {
  alkemioServerUrl: string;
  alkemioGraphqlEndpoint: string;
  port: number;
  logging: LoggingConfig;
  maxSpacesPerQuery: number;
  cacheTtlHours: number;
  openai: OpenAIConfig;
  query: QueryConfig;
  features: FeaturesConfig;
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
      node.value = substituteEnvVar(node.value);
    },
  });

  return doc.toJSON() as Record<string, unknown>;
}

let cachedConfig: ServerConfig | null = null;

export function loadConfig(): ServerConfig {
  if (cachedConfig) return cachedConfig;

  const yml = loadYamlConfig() as {
    alkemio: { server_url: string; graphql_endpoint: string };
    server: { port: number };
    logging: { level: string; console_enabled: boolean; json: boolean };
    cache: { ttl_hours: number };
    limits: { max_spaces_per_query: number };
    openai: { api_key: string; base_url: string; model: string; max_tokens: number; temperature: number };
    query: { session_ttl_minutes: number; max_query_length: number; max_feedback_length: number };
    features: { ai_query_enabled: boolean };
  };

  cachedConfig = {
    alkemioServerUrl: yml.alkemio.server_url,
    alkemioGraphqlEndpoint: yml.alkemio.graphql_endpoint,
    port: yml.server.port,
    logging: {
      level: yml.logging.level,
      consoleEnabled: yml.logging.console_enabled,
      json: yml.logging.json,
    },
    maxSpacesPerQuery: yml.limits.max_spaces_per_query,
    cacheTtlHours: yml.cache.ttl_hours,
    openai: {
      apiKey: yml.openai.api_key,
      baseUrl: String(yml.openai.base_url || ''),
      model: yml.openai.model,
      maxTokens: yml.openai.max_tokens,
      temperature: yml.openai.temperature,
    },
    query: {
      sessionTtlMinutes: yml.query.session_ttl_minutes,
      maxQueryLength: yml.query.max_query_length,
      maxFeedbackLength: yml.query.max_feedback_length,
    },
    features: {
      aiQueryEnabled: yml.features.ai_query_enabled,
    },
  };

  return cachedConfig;
}

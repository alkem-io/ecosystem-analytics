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

/** OIDC Relying Party configuration (EA as its own Alkemio/Hydra client). */
export interface OidcConfig {
  issuer: string;
  clientId: string;
  /** Empty string for a public (PKCE-only) client. */
  clientSecret: string;
  tokenEndpointAuthMethod: 'client_secret_basic' | 'client_secret_post' | 'none';
  redirectUri: string;
  /** Space-delimited scope string, e.g. "openid profile email offline_access alkemio". */
  scopes: string;
  /** Empty string when no explicit audience is required. */
  audience: string;
  /** Lifetime of a pre-auth (state/nonce/PKCE) record before it is rejected/purged. */
  preauthTtlMinutes: number;
}

/** EA server-side session configuration. */
export interface SessionConfig {
  /** Empty => host-only cookie (localhost); e.g. ".alkem.io" hosted. */
  cookieDomain: string;
  idleTimeoutHours: number;
  /** Decoded 32-byte AES-256-GCM key (never logged). */
  encKey: Buffer;
  /** CORS allow-list of trusted browser origins. */
  allowedOrigins: string[];
}

export interface ServerConfig {
  alkemioServerUrl: string;
  alkemioGraphqlEndpoint: string;
  alkemioKratosPublicUrl: string;
  port: number;
  logging: LoggingConfig;
  maxSpacesPerQuery: number;
  cacheTtlHours: number;
  openai: OpenAIConfig;
  query: QueryConfig;
  features: FeaturesConfig;
  oidc: OidcConfig;
  session: SessionConfig;
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
    alkemio: { server_url: string; graphql_endpoint: string; kratos_public_url: string };
    server: { port: number };
    logging: { level: string; console_enabled: boolean; json: boolean };
    cache: { ttl_hours: number };
    limits: { max_spaces_per_query: number };
    openai: { api_key: string; base_url: string; model: string; max_tokens: number; temperature: number };
    query: { session_ttl_minutes: number; max_query_length: number; max_feedback_length: number };
    features: { ai_query_enabled: boolean };
    oidc: {
      issuer: string;
      client_id: string;
      client_secret: string;
      token_endpoint_auth_method: string;
      redirect_uri: string;
      scopes: string;
      audience: string;
      preauth_ttl_minutes: number;
    };
    session: {
      cookie_domain: string;
      idle_timeout_hours: number;
      enc_key: string;
      allowed_origins: string;
    };
  };

  const oidc = parseOidcConfig(yml.oidc);
  const session = parseSessionConfig(yml.session);

  cachedConfig = {
    alkemioServerUrl: String(yml.alkemio.server_url),
    alkemioGraphqlEndpoint: String(yml.alkemio.graphql_endpoint),
    alkemioKratosPublicUrl: String(yml.alkemio.kratos_public_url),
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
    oidc,
    session,
  };

  return cachedConfig;
}

/** Parse + validate the OIDC block, failing fast on misconfiguration (FR-018/FR-019). */
function parseOidcConfig(raw: {
  issuer: string;
  client_id: string;
  client_secret: string;
  token_endpoint_auth_method: string;
  redirect_uri: string;
  scopes: string;
  audience: string;
  preauth_ttl_minutes: number;
}): OidcConfig {
  const authMethod = String(raw.token_endpoint_auth_method || 'client_secret_basic');
  if (!['client_secret_basic', 'client_secret_post', 'none'].includes(authMethod)) {
    throw new Error(
      `Invalid oidc.token_endpoint_auth_method '${authMethod}'. ` +
        `Expected 'client_secret_basic', 'client_secret_post', or 'none'.`,
    );
  }

  const clientSecret = raw.client_secret ? String(raw.client_secret) : '';
  // Confidential clients MUST have a secret; public (PKCE-only) clients MUST NOT need one (FR-019).
  if (authMethod !== 'none' && !clientSecret) {
    throw new Error(
      `OIDC client_secret is required when token_endpoint_auth_method='${authMethod}'. ` +
        `Set OIDC_CLIENT_SECRET for the hosted confidential client, or use ` +
        `OIDC_TOKEN_AUTH_METHOD=none for the local public client (FR-019).`,
    );
  }

  const issuer = String(raw.issuer || '');
  if (!issuer) throw new Error('OIDC_ISSUER is required.');
  const clientId = String(raw.client_id || '');
  if (!clientId) throw new Error('OIDC_CLIENT_ID is required.');
  const redirectUri = String(raw.redirect_uri || '');
  if (!redirectUri) throw new Error('OIDC_REDIRECT_URI is required.');

  return {
    issuer,
    clientId,
    clientSecret,
    tokenEndpointAuthMethod: authMethod as OidcConfig['tokenEndpointAuthMethod'],
    redirectUri,
    scopes: String(raw.scopes || 'openid profile email offline_access alkemio'),
    audience: raw.audience ? String(raw.audience) : '',
    preauthTtlMinutes: Number(raw.preauth_ttl_minutes) || 10,
  };
}

/** Parse + validate the session block; the AES key must decode to exactly 32 bytes (FR-018a). */
function parseSessionConfig(raw: {
  cookie_domain: string;
  idle_timeout_hours: number;
  enc_key: string;
  allowed_origins: string;
}): SessionConfig {
  const encKeyB64 = raw.enc_key ? String(raw.enc_key) : '';
  if (!encKeyB64) {
    throw new Error(
      'OIDC_SESSION_ENC_KEY is required (base64 of a 32-byte AES-256 key). ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }
  const encKey = Buffer.from(encKeyB64, 'base64');
  if (encKey.length !== 32) {
    throw new Error(
      `OIDC_SESSION_ENC_KEY must decode to exactly 32 bytes (got ${encKey.length}). ` +
        'It must be the base64 encoding of a 32-byte AES-256 key.',
    );
  }

  const allowedOrigins = String(raw.allowed_origins || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  return {
    cookieDomain: raw.cookie_domain ? String(raw.cookie_domain) : '',
    idleTimeoutHours: Number(raw.idle_timeout_hours) || 8,
    encKey,
    allowedOrigins,
  };
}

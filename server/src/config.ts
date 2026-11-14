import dotenv from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import YAML from 'yaml';
import {
  APP_IDS,
  parseGateList,
  setKey,
  type AccessSets,
  type AppId,
} from './access/policy.js';

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

/**
 * Per-dashboard frontend configuration (feature 016 VNG, feature 017 GovTech).
 * Each Dutch dashboard (VNG, GovTech, …) has its own independent profile; the
 * shared Alkemio/OIDC/session config is single-valued (one BFF).
 */
export interface DashboardAppConfig {
  /** Default innovation hub nameID applied on first load (empty => none). FR-012. */
  defaultHubNameId: string;
  /** nameID of the GemeenteDelers space whose Knowledge Base holds the GD initiatives. FR-034. */
  gemeentedelersSpaceNameId: string;
  /** Long cache TTL for the archival GD initiative layer. FR-035. */
  gdCacheTtlHours: number;
  /**
   * Long cache TTL for the selection-independent gemeente geo-location set
   * (feature 019, FR-005b). Locations essentially never move, so this matches the
   * GD corpus at ~1 week.
   */
  geoCacheTtlHours: number;
  /**
   * Which Alkemio Classification drives which dashboard panel (feature 020, FR-010).
   * Each value is a classification's `displayLabel`, matched case- and
   * whitespace-insensitively — it NAMES a vocabulary, it never restates one: the
   * categories themselves always come from Alkemio (FR-007/FR-011).
   *
   * An empty string means no classification is designated for that panel, which
   * renders it with only the "no classification" bucket rather than hiding it.
   */
  classifications: {
    nds: string;
    vng2030: string;
    phase: string;
    /** Technology Readiness Level — an ordered vocabulary (TRL 1 → 9), read like `phase`. */
    trl: string;
  };
}

/** Back-compat alias — `VngConfig` was the original (016) name for a dashboard profile. */
export type VngConfig = DashboardAppConfig;

/** Known dashboard app ids (each maps to a `dashboards` registry profile + a served port). */
export type DashboardAppId = 'vng' | 'govtech';

/**
 * The access gate (feature 026, two sets since 027). Each application is gated by its
 * viewer Spaces (and optionally admin Spaces) or explicitly ungated — never by default
 * (FR-001, FR-003).
 */
export interface AppAccessConfig {
  /** `null` = explicitly ungated (`access.<app>: none`). */
  sets: AccessSets | null;
  /**
   * Fallback display names for the viewer Spaces, by position: `<app>_display_name` for
   * the first, `<app>_display_names` (comma-separated) for the rest. Empty = none.
   */
  displayNames: string[];
}

export interface AccessConfig {
  apps: Record<AppId, AppAccessConfig>;
  /** Per-person privilege check timeout; a timeout is "could not verify" (fail closed). */
  checkTimeoutMs: number;
}

export interface ServerConfig {
  alkemioServerUrl: string;
  alkemioGraphqlEndpoint: string;
  alkemioKratosPublicUrl: string;
  /** Primary port — serves the Explorer SPA + /api (feature 016: VNG served on `vngPort`). */
  port: number;
  /** Second port serving the VNG SPA + the same /api (shared session). Defaults to port+1. */
  vngPort: number;
  /** Third port serving the GovTech SPA + the same /api (shared session). Defaults to port+2 (feature 017). */
  govtechPort: number;
  logging: LoggingConfig;
  /** Generous safety cap on spaces a single request may select; large sets are loaded by chunking, not rejected. */
  maxSpacesPerRequest: number;
  /** Max spaces Alkemio's activityFeedGrouped accepts per query; activity is fetched in chunks of this size. */
  activitySpacesPerQuery: number;
  cacheTtlHours: number;
  openai: OpenAIConfig;
  query: QueryConfig;
  features: FeaturesConfig;
  oidc: OidcConfig;
  session: SessionConfig;
  /** Per-app dashboard profiles, keyed by app id (feature 017). `vng` preserved; `govtech` added. */
  dashboards: Record<DashboardAppId, DashboardAppConfig>;
  /** Back-compat alias of `dashboards.vng` (existing readers/services depend on it). */
  vng: VngConfig;
  /** Per-application access gate (feature 026). */
  access: AccessConfig;
  /** The monitor settings store (feature 027, `server/src/settings/`). */
  settings: SettingsConfig;
}

/** Feature 027 — where the monitor settings DB is backed up, and how many backups to keep. */
export interface SettingsConfig {
  /** Empty = `data/backups/`. */
  backupDir: string;
  backupKeep: number;
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
    limits: { max_spaces_per_request: number; activity_spaces_per_query: number };
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
    vng?: DashboardYamlBlock;
    govtech?: DashboardYamlBlock;
    access?: Record<string, unknown>;
    settings?: { backup_dir?: unknown; backup_keep?: unknown };
  };

  const oidc = parseOidcConfig(yml.oidc);
  const session = parseSessionConfig(yml.session);
  const vng = parseDashboardConfig(yml.vng);
  const govtech = parseDashboardConfig(yml.govtech);
  const access = parseAccessConfig(yml.access);

  cachedConfig = {
    alkemioServerUrl: String(yml.alkemio.server_url),
    alkemioGraphqlEndpoint: String(yml.alkemio.graphql_endpoint),
    alkemioKratosPublicUrl: String(yml.alkemio.kratos_public_url),
    port: yml.server.port,
    vngPort: Number(process.env.VNG_FRONTEND_PORT) || yml.server.port + 1,
    govtechPort: Number(process.env.GOVTECH_FRONTEND_PORT) || yml.server.port + 2,
    logging: {
      level: yml.logging.level,
      consoleEnabled: yml.logging.console_enabled,
      json: yml.logging.json,
    },
    maxSpacesPerRequest: yml.limits.max_spaces_per_request,
    activitySpacesPerQuery: yml.limits.activity_spaces_per_query,
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
    dashboards: { vng, govtech },
    vng,
    access,
    settings: {
      backupDir: yml.settings?.backup_dir ? String(yml.settings.backup_dir).trim() : '',
      backupKeep: Math.max(1, Number(yml.settings?.backup_keep) || 14),
    },
  };

  return cachedConfig;
}

/** Shape of a per-dashboard YAML block (`vng:` / `govtech:`). All keys optional (defaults applied). */
interface DashboardYamlBlock {
  default_hub_nameid?: string;
  gemeentedelers_space_nameid?: string;
  gd_cache_ttl_hours?: number;
  geo_cache_ttl_hours?: number;
  classifications?: { nds?: unknown; vng2030?: unknown; phase?: unknown; trl?: unknown };
}

/**
 * Parse an optional dashboard block (`vng:` / `govtech:`), applying defaults so a
 * fresh checkout boots even when the block is absent. Each app's profile is
 * independent (feature 017: separate env vars, not shared).
 */
function parseDashboardConfig(raw?: DashboardYamlBlock): DashboardAppConfig {
  // An ABSENT key falls back to the default label; a key present but empty is an
  // explicit "no classification designated for this panel" and is honoured as such.
  const designation = (value: unknown, fallback: string): string =>
    value === undefined || value === null ? fallback : String(value).trim();

  return {
    // Trim so stray whitespace in the env value (e.g. "vih-test  ") can't break the
    // Alkemio nameID lookup.
    defaultHubNameId: raw?.default_hub_nameid ? String(raw.default_hub_nameid).trim() : '',
    gemeentedelersSpaceNameId: raw?.gemeentedelers_space_nameid
      ? String(raw.gemeentedelers_space_nameid).trim()
      : 'gemeentedelers',
    gdCacheTtlHours: Number(raw?.gd_cache_ttl_hours) || 168,
    geoCacheTtlHours: Number(raw?.geo_cache_ttl_hours) || 168,
    // Designations are stored verbatim so the config stays readable; normalisation
    // happens at match time in transform/classifications.ts.
    classifications: {
      nds: designation(raw?.classifications?.nds, 'NDS-prioriteit'),
      vng2030: designation(raw?.classifications?.vng2030, 'VNG 2030 thema'),
      phase: designation(raw?.classifications?.phase, 'Fase'),
      trl: designation(raw?.classifications?.trl, 'TRL'),
    },
  };
}

/**
 * Parse + validate the `access:` block (feature 026 contracts/config-access.md, extended by
 * 027 contracts/api-access-sets.md §3). Every application MUST be declared — its viewer
 * Spaces (comma-separated paths/URLs) or the literal `none`. `<app>_admin` optionally lists
 * the admin Spaces. Start-up stops (this throws) when a viewer value is missing or empty,
 * an item does not parse, an item is duplicated within a set, or `<app>_admin` is set
 * while `<app>: none` — so a typo can never leave an application open (FR-003).
 */
export function parseAccessConfig(raw: Record<string, unknown> | undefined): AccessConfig {
  const block = raw ?? {};
  const text = (value: unknown) => (value === undefined || value === null ? '' : String(value).trim());
  const apps = {} as AccessConfig['apps'];
  for (const app of APP_IDS) {
    const value = text(block[app]);
    if (!value) {
      throw new Error(
        `access.${app} is not set. Declare the viewer Space(s) (e.g. 'space/subspace') or ` +
          `'none' to run ${app} ungated on purpose (feature 026, FR-003).`,
      );
    }
    const adminValue = text(block[`${app}_admin`]);
    const displayNames = [
      text(block[`${app}_display_name`]),
      ...text(block[`${app}_display_names`])
        .split(',')
        .map((n) => n.trim()),
    ];
    while (displayNames.length && !displayNames[displayNames.length - 1]) displayNames.pop();

    if (value.toLowerCase() === 'none') {
      if (adminValue) {
        throw new Error(
          `access.${app}_admin is set while access.${app} is 'none'. An ungated application ` +
            `cannot have admin Spaces — gate it, or remove access.${app}_admin.`,
        );
      }
      apps[app] = { sets: null, displayNames: [] };
      continue;
    }

    const parse = (key: string, raw: string) => {
      try {
        return parseGateList(raw);
      } catch (err) {
        throw new Error(`access.${key}: '${raw}' is not valid — ${(err as Error).message}.`);
      }
    };
    const viewers = parse(app, value);
    const admins = parse(`${app}_admin`, adminValue);
    apps[app] = { sets: { viewers, admins, setKey: setKey(viewers, admins) }, displayNames };
  }
  return { apps, checkTimeoutMs: Number(block.check_timeout_ms) || 5000 };
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
    preauthTtlMinutes: Number(raw.preauth_ttl_minutes) || 30,
  };
}

/**
 * The dev-only AES key committed in analytics.yml/.env.default so local boots
 * out of the box. Public in git history — must never be the effective key in a
 * shared/hosted env; parseSessionConfig fails closed on it outside local dev.
 */
const DEV_ONLY_ENC_KEY_FALLBACK = 'GGvIJ/WJIRBGWoNO0thfWCd2XbEXqdhlokW+qVO484I=';

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
  // Fail closed outside local dev if the committed dev-only fallback key is in
  // effect (env var forgotten). This key is public in git history — using it in
  // any shared/hosted env means every session token is encrypted under a known
  // key. Local dev (NODE_ENV development/test/unset) may still boot on it.
  const nodeEnv = process.env.NODE_ENV ?? '';
  const isLocalDev = nodeEnv === '' || nodeEnv === 'development' || nodeEnv === 'test';
  if (!isLocalDev && encKeyB64 === DEV_ONLY_ENC_KEY_FALLBACK) {
    throw new Error(
      'OIDC_SESSION_ENC_KEY is unset in a non-development environment, so the ' +
        'committed dev-only fallback key would be used. Refusing to start: inject a ' +
        'fresh 32-byte key from the k8s secret. This is a fail-closed guard (SOC 2 CC6.7).',
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

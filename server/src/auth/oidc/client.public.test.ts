process.env.DB_PATH = ':memory:';
import { describe, it, expect, afterEach, vi } from 'vitest';

// Spy on client-auth selection without a real Hydra.
vi.mock('openid-client', () => ({
  discovery: vi.fn(async () => ({ serverMetadata: () => ({ supportsPKCE: () => true }) })),
  None: vi.fn(() => ({ method: 'none' })),
  ClientSecretBasic: vi.fn(() => ({ method: 'basic' })),
  ClientSecretPost: vi.fn(() => ({ method: 'post' })),
  allowInsecureRequests: () => {},
}));
import * as oidc from 'openid-client';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
  vi.clearAllMocks();
});

describe('confidential-vs-public client selection (FR-006/FR-019)', () => {
  it('public client (token_endpoint_auth_method=none) needs no secret and uses None()', async () => {
    vi.resetModules();
    process.env.OIDC_TOKEN_AUTH_METHOD = 'none';
    delete process.env.OIDC_CLIENT_SECRET;

    const { loadConfig } = await import('../../config.js');
    const cfg = loadConfig();
    expect(cfg.oidc.tokenEndpointAuthMethod).toBe('none');
    expect(cfg.oidc.clientSecret).toBe('');

    const { getOidcConfiguration } = await import('./client.js');
    await getOidcConfiguration();
    expect(oidc.None).toHaveBeenCalled();
    expect(oidc.ClientSecretBasic).not.toHaveBeenCalled();
  });

  it('confidential client (client_secret_basic) uses ClientSecretBasic with the secret', async () => {
    vi.resetModules();
    process.env.OIDC_TOKEN_AUTH_METHOD = 'client_secret_basic';
    process.env.OIDC_CLIENT_SECRET = 'a-real-secret';

    const { getOidcConfiguration } = await import('./client.js');
    await getOidcConfiguration();
    expect(oidc.ClientSecretBasic).toHaveBeenCalledWith('a-real-secret');
    expect(oidc.None).not.toHaveBeenCalled();
  });

  it('confidential method without a secret fails fast at config load (FR-018)', async () => {
    vi.resetModules();
    process.env.OIDC_TOKEN_AUTH_METHOD = 'client_secret_basic';
    delete process.env.OIDC_CLIENT_SECRET;

    const { loadConfig } = await import('../../config.js');
    expect(() => loadConfig()).toThrow(/client_secret is required/i);
  });
});

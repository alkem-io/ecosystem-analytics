/**
 * Test environment bootstrap. Sets the OIDC/session env vars that `loadConfig`
 * validates fail-fast, so importing any module that reads config does not throw.
 * These are dummy values — no real secrets.
 */
process.env.OIDC_ISSUER ??= 'https://identity.example.test/';
process.env.OIDC_CLIENT_ID ??= 'ecosystem-analytics-test';
process.env.OIDC_CLIENT_SECRET ??= 'test-secret';
process.env.OIDC_TOKEN_AUTH_METHOD ??= 'client_secret_basic';
process.env.OIDC_REDIRECT_URI ??= 'http://localhost:5173/api/auth/oidc/callback';
process.env.OIDC_SCOPES ??= 'openid profile email offline_access alkemio';
process.env.SESSION_COOKIE_DOMAIN ??= '';
process.env.SESSION_ALLOWED_ORIGINS ??= 'http://localhost:5173';
// Deterministic 32-byte AES key (base64) for crypto/session tests.
process.env.OIDC_SESSION_ENC_KEY ??= Buffer.alloc(32, 7).toString('base64');

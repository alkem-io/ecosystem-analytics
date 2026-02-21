import { Request, Response } from 'express';
import { loadConfig } from '../config.js';

/**
 * GET /api/auth/login
 *
 * Initiates the Ory Kratos browser login flow by redirecting the user
 * to the Alkemio login page. After successful auth, Kratos redirects
 * back to the callback URL.
 *
 * FR-001: Redirect-based SSO — credentials are NEVER entered in this tool.
 *
 * In production the tool is deployed on the same primary domain as Alkemio,
 * so the return_to URL is whitelisted automatically. For local development
 * the Alkemio Kratos instance must whitelist the PUBLIC_URL, or
 * DEV_AUTH_BYPASS=true can be set to skip SSO (see /api/auth/dev-login).
 */
export async function loginHandler(_req: Request, res: Response) {
  const config = loadConfig();
  const kratosUrl = config.alkemioKratosPublicUrl;

  const callbackUrl = `${config.publicUrl}/api/auth/callback`;
  const loginUrl = `${kratosUrl}/self-service/login/browser?return_to=${encodeURIComponent(callbackUrl)}`;

  res.redirect(loginUrl);
}

import { Request, Response } from 'express';
import { loadConfig } from '../config.js';

/**
 * GET /api/auth/login
 *
 * Initiates the Ory Kratos browser login flow by redirecting the user
 * to the Alkemio login page. After successful auth, Kratos redirects
 * back to the callback URL.
 *
 * Reference: alkemio/client-web Kratos browser-flow integration.
 */
export async function loginHandler(_req: Request, res: Response) {
  const config = loadConfig();
  const kratosUrl = config.alkemioKratosPublicUrl;

  // Initiate a Kratos browser login flow
  // The return_to URL brings the user back to our callback endpoint
  const callbackUrl = `${config.alkemioServerUrl}/api/auth/callback`;
  const loginUrl = `${kratosUrl}/self-service/login/browser?return_to=${encodeURIComponent(callbackUrl)}`;

  res.redirect(loginUrl);
}

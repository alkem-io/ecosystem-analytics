import { Request, Response } from 'express';
import { AlkemioClient } from '@alkemio/client-lib';
import { loadConfig } from '../config.js';
import { getLogger } from '../logging/logger.js';


/**
 * POST /api/auth/login
 *
 * Accepts { email, password } and authenticates against Alkemio's Kratos
 * using @alkemio/client-lib (non-interactive API flow). Returns the Kratos
 * session_token which the frontend uses as a Bearer token.
 *
 * This mirrors the pattern used by analytics-playground.
 */
export async function loginHandler(req: Request, res: Response) {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: 'INVALID_REQUEST', message: 'Email and password are required' });
    return;
  }

  const config = loadConfig();

  try {
    const alkemioClient = new AlkemioClient({
      apiEndpointPrivateGraphql: config.alkemioGraphqlEndpoint,
      authInfo: {
        credentials: { email, password },
      },
    });

    await alkemioClient.enableAuthentication();
    const token = alkemioClient.apiToken;

    if (!token) {
      res.status(401).json({ error: 'AUTH_FAILED', message: 'Authentication failed — no token received' });
      return;
    }

    getLogger().info(`User authenticated: ${email}`, { context: 'Auth' });
    res.json({ token });
  } catch (err) {
    const message = (err as Error).message;
    getLogger().error(`Login failed: ${message}`, { context: 'Auth' });

    if (message.includes('401') || message.includes('credentials') || message.includes('password')) {
      res.status(401).json({ error: 'AUTH_FAILED', message: 'Invalid email or password' });
    } else {
      res.status(502).json({ error: 'AUTH_ERROR', message: 'Unable to reach authentication service' });
    }
  }
}

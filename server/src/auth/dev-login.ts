import { Request, Response } from 'express';
import { loadConfig } from '../config.js';

/**
 * POST /api/auth/dev-login
 *
 * Development-only endpoint that authenticates directly against Kratos
 * using the API flow, bypassing the browser redirect. This exists solely
 * because Alkemio's production Kratos instance does not whitelist localhost
 * in its return_to URLs.
 *
 * This endpoint is ONLY available when DEV_AUTH_BYPASS=true.
 * It MUST NOT be enabled in production.
 *
 * In production, the standard redirect-based SSO flow (/api/auth/login)
 * is used instead — the tool is deployed on the same domain as Alkemio.
 */
export async function devLoginHandler(req: Request, res: Response) {
  const config = loadConfig();

  if (!config.devAuthBypass) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Dev login is not enabled' });
    return;
  }

  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: 'INVALID_REQUEST', message: 'Email and password are required' });
    return;
  }

  try {
    const kratosUrl = config.alkemioKratosPublicUrl;

    // Step 1: Initiate a Kratos API login flow
    const flowResponse = await fetch(`${kratosUrl}/self-service/login/api`);

    if (!flowResponse.ok) {
      res.status(502).json({ error: 'AUTH_UPSTREAM', message: 'Failed to initiate login flow' });
      return;
    }

    const flow = (await flowResponse.json()) as { id: string; ui: { action: string } };

    // Step 2: Submit credentials to the flow action URL
    const submitResponse = await fetch(flow.ui.action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'password',
        identifier: email,
        password,
      }),
    });

    if (!submitResponse.ok) {
      const errorBody = await submitResponse.json().catch(() => null);
      const message =
        errorBody?.ui?.messages?.[0]?.text ||
        errorBody?.error?.message ||
        'Invalid credentials';
      res.status(401).json({ error: 'AUTH_FAILED', message });
      return;
    }

    const session = (await submitResponse.json()) as {
      session: {
        identity: {
          id: string;
          traits: { email: string; name?: { first?: string; last?: string } };
        };
      };
      session_token: string;
    };

    const kratosSessionToken = session.session_token;
    const kratosCookies = `ory_kratos_session=${kratosSessionToken}`;

    const identity = session.session.identity;
    const tokenPayload = {
      userId: identity.id,
      email: identity.traits.email,
      displayName: identity.traits.name
        ? `${identity.traits.name.first || ''} ${identity.traits.name.last || ''}`.trim()
        : identity.traits.email,
      kratosCookies,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24h
    };

    const token = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url');

    res.json({ token, user: { displayName: tokenPayload.displayName, email: tokenPayload.email } });
  } catch (err) {
    console.error('Dev login failed:', (err as Error).message);
    res.status(502).json({ error: 'AUTH_UPSTREAM', message: 'Authentication service unavailable' });
  }
}

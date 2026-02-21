import { Request, Response } from 'express';
import { loadConfig } from '../config.js';

/**
 * GET /api/auth/callback
 *
 * Handles the return from Alkemio/Kratos login. Extracts the Kratos session
 * cookie, exchanges it for a bearer token, and redirects to the frontend.
 *
 * Reference: alkemio/client-web Kratos browser-flow callback handling.
 */
export async function callbackHandler(req: Request, res: Response) {
  const config = loadConfig();

  try {
    // After Kratos browser login, session cookies are set.
    // Forward the cookies to Kratos to validate the session and get identity.
    const kratosSessionUrl = `${config.alkemioKratosPublicUrl}/sessions/whoami`;

    const cookieHeader = req.headers.cookie || '';
    const sessionResponse = await fetch(kratosSessionUrl, {
      headers: { cookie: cookieHeader },
    });

    if (!sessionResponse.ok) {
      res.status(401).json({ error: 'AUTH_FAILED', message: 'Invalid session from Kratos' });
      return;
    }

    const session = (await sessionResponse.json()) as {
      identity: {
        id: string;
        traits: { email: string; name?: { first?: string; last?: string } };
      };
    };

    // Store session data — in production this would use a session store.
    // For now, encode essential info into a simple token the frontend can use.
    const tokenPayload = {
      userId: session.identity.id,
      email: session.identity.traits.email,
      displayName: session.identity.traits.name
        ? `${session.identity.traits.name.first || ''} ${session.identity.traits.name.last || ''}`.trim()
        : session.identity.traits.email,
      kratosCookies: cookieHeader,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24h
    };

    // Encode as base64 token (in production, use signed JWT)
    const token = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url');

    // Redirect to frontend with token
    res.redirect(`/?token=${token}`);
  } catch (err) {
    console.error('Auth callback error:', (err as Error).message);
    res.status(401).json({ error: 'AUTH_FAILED', message: 'Authentication failed' });
  }
}

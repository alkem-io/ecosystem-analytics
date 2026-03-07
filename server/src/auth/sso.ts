import { Request, Response } from 'express';
import { resolveKratosPublicUrl } from './kratos-url.js';
import { SSO_COOKIE_PREFIX } from './middleware.js';
import { loadConfig } from '../config.js';
import { getLogger } from '../logging/logger.js';
import type { SsoDetectResponse } from '../types/api.js';

/**
 * POST /api/auth/sso/detect
 *
 * Reads the `ory_kratos_session` cookie from the request (forwarded by the
 * browser when `credentials: 'include'` is used on the same parent domain),
 * calls Kratos's `/sessions/whoami` endpoint to validate the session, and
 * returns the user's identity and session token.
 *
 * This is a public endpoint — no Bearer token required.
 */
export async function ssoDetectHandler(req: Request, res: Response) {
  const noSession: SsoDetectResponse = { detected: false };

  // Parse cookies from the raw Cookie header
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    res.json(noSession);
    return;
  }

  const kratosSessionCookie = parseCookieValue(cookieHeader, 'ory_kratos_session');
  if (!kratosSessionCookie) {
    res.json(noSession);
    return;
  }

  try {
    const kratosUrl = resolveKratosPublicUrl();
    const whoamiUrl = `${kratosUrl.replace(/\/$/, '')}/sessions/whoami`;

    const debug: string[] = [];
    debug.push(`Calling Kratos whoami at: ${whoamiUrl}`);
    debug.push(`Cookie value (first 20 chars): ${kratosSessionCookie.slice(0, 20)}...`);

    const whoamiRes = await fetch(whoamiUrl, {
      headers: {
        Cookie: `ory_kratos_session=${kratosSessionCookie}`,
      },
    });

    debug.push(`Kratos whoami response status: ${whoamiRes.status}`);

    if (!whoamiRes.ok) {
      const body = await whoamiRes.text();
      debug.push(`Kratos whoami error body: ${body.slice(0, 500)}`);
      res.json({ ...noSession, _debug: debug });
      return;
    }

    const session = (await whoamiRes.json()) as KratosWhoamiResponse;
    debug.push(`Whoami response keys: ${Object.keys(session).join(', ')}`);
    debug.push(`Session active: ${session.active}`);
    debug.push(`Has tokenized: ${!!session.tokenized}`);
    debug.push(`Has session_token: ${!!session.session_token}`);
    debug.push(`Identity email: ${session.identity?.traits?.email}`);

    const displayName =
      session.identity?.traits?.name?.first && session.identity?.traits?.name?.last
        ? `${session.identity.traits.name.first} ${session.identity.traits.name.last}`
        : (session.identity?.traits?.email ?? 'Unknown');

    // Prefer Kratos-issued token if available; otherwise use the session cookie
    // with a prefix so the BFF can forward it as a cookie to the interactive
    // GraphQL endpoint (the non-interactive endpoint doesn't support cookie auth).
    const token = session.tokenized ?? session.session_token ?? `${SSO_COOKIE_PREFIX}${kratosSessionCookie}`;

    const response: SsoDetectResponse = {
      detected: true,
      displayName,
      avatarUrl: null,
      token,
    };

    debug.push(`Session detected for: ${displayName}, has token: ${!!response.token}`);
    res.json({ ...response, _debug: debug });
  } catch (err) {
    const config = loadConfig();
    const envDebug = [
      `Detection failed: ${(err as Error).message}`,
      `--- Environment ---`,
      `ALKEMIO_SERVER_URL: ${config.alkemioServerUrl || '(empty)'}`,
      `ALKEMIO_GRAPHQL_ENDPOINT: ${config.alkemioGraphqlEndpoint || '(empty)'}`,
      `ALKEMIO_KRATOS_PUBLIC_URL: ${config.alkemioKratosPublicUrl || '(empty)'}`,
      `alkemioKratosPublicUrl type: ${typeof config.alkemioKratosPublicUrl}`,
      `alkemioServerUrl type: ${typeof config.alkemioServerUrl}`,
    ];
    res.json({ ...noSession, _debug: envDebug });
  }
}

/** Parse a specific cookie value from a raw Cookie header string */
function parseCookieValue(cookieHeader: string, name: string): string | undefined {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

/** Minimal type for the Kratos whoami response */
interface KratosWhoamiResponse {
  id: string;
  active?: boolean;
  session_token?: string;
  tokenized?: string;
  identity?: {
    id: string;
    traits?: {
      email?: string;
      name?: {
        first?: string;
        last?: string;
      };
    };
  };
}

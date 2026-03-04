import { Request, Response } from 'express';
import { resolveKratosPublicUrl } from './kratos-url.js';
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
    const kratosUrl = await resolveKratosPublicUrl();
    const whoamiUrl = `${kratosUrl.replace(/\/$/, '')}/sessions/whoami`;

    const whoamiRes = await fetch(whoamiUrl, {
      headers: {
        Cookie: `ory_kratos_session=${kratosSessionCookie}`,
      },
    });

    if (!whoamiRes.ok) {
      getLogger().debug('Kratos whoami returned non-OK status', { context: 'SSO' });
      res.json(noSession);
      return;
    }

    const session = (await whoamiRes.json()) as KratosWhoamiResponse;

    const displayName =
      session.identity?.traits?.name?.first && session.identity?.traits?.name?.last
        ? `${session.identity.traits.name.first} ${session.identity.traits.name.last}`
        : (session.identity?.traits?.email ?? 'Unknown');

    const response: SsoDetectResponse = {
      detected: true,
      displayName,
      avatarUrl: null,
      token: session.tokenized ?? session.session_token ?? undefined,
    };

    if (!response.token) {
      getLogger().warn('No session_token in whoami response; SSO token forwarding may not work', {
        context: 'SSO',
      });
    }

    getLogger().info(`SSO session detected for: ${displayName}`, { context: 'SSO' });
    res.json(response);
  } catch (err) {
    getLogger().error(`SSO detection failed: ${(err as Error).message}`, { context: 'SSO' });
    res.json(noSession);
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

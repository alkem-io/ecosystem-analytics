import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth/middleware.js';
import { ensureFreshAccessToken } from '../auth/oidc/refresh.js';
import { decrypt } from '../auth/oidc/crypto.js';
import { loadConfig } from '../config.js';

export const imageProxyRouter = Router();

/**
 * True only for https URLs whose host is exactly `alkem.io` or a subdomain of
 * it. A bare `endsWith('alkem.io')` also matches attacker-registrable
 * look-alikes (e.g. `notalkem.io`) — and since the proxy forwards the user's
 * Bearer access token, that would be an SSRF → token-exfiltration path.
 */
export function isAllowedImageUrl(imageUrl: string): boolean {
  try {
    const parsed = new URL(imageUrl);
    const host = parsed.hostname;
    const hostAllowed = host === 'alkem.io' || host.endsWith('.alkem.io');
    return parsed.protocol === 'https:' && hostAllowed;
  } catch {
    return false;
  }
}

// Session-protected: the browser sends the httpOnly `ea_session` cookie with
// the <img> request (same-origin). The access token is sourced server-side from
// the session — it is never present in the browser (FR-018).
imageProxyRouter.use(authMiddleware);

/**
 * GET /api/image-proxy?url=<encoded-alkemio-url>
 * Proxies image requests to Alkemio's private storage using the session's
 * (refreshed) access token. Only alkem.io URLs are allowed.
 */
imageProxyRouter.get('/', async (req: Request, res: Response) => {
  const imageUrl = req.query.url as string | undefined;

  if (!imageUrl) {
    res.status(400).json({ error: 'Missing url parameter' });
    return;
  }

  // Only allow proxying to https alkem.io and its subdomains (see helper).
  if (!isAllowedImageUrl(imageUrl)) {
    res.status(403).json({ error: 'Only https alkem.io URLs are allowed' });
    return;
  }

  try {
    const session = await ensureFreshAccessToken(req.auth!.session);
    const token = decrypt(session.accessTokenEnc, loadConfig().session.encKey);
    const response = await fetch(imageUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      res.status(response.status).end();
      return;
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.startsWith('image/')) {
      res.status(502).json({ error: 'Upstream did not return an image' });
      return;
    }
    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    const buffer = Buffer.from(await response.arrayBuffer());
    res.setHeader('X-Image-Size', buffer.length);
    res.send(buffer);
  } catch {
    res.status(502).json({ error: 'Failed to fetch image' });
  }
});

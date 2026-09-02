import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth/middleware.js';
import { ensureFreshAccessToken } from '../auth/oidc/refresh.js';
import { decrypt } from '../auth/oidc/crypto.js';
import { loadConfig } from '../config.js';

export const imageProxyRouter = Router();

/**
 * True only for https URLs whose host is exactly the CONFIGURED Alkemio host, or a
 * subdomain of it.
 *
 * The host comes from `alkemio.server_url` rather than being hard-coded to
 * `alkem.io`, because sibling deployments are not subdomains: `acc-alkem.io` does
 * NOT end with `.alkem.io`, so a hard-coded check 403s every avatar when the BFF is
 * pointed at acceptance. The allow-list follows whatever host the operator already
 * trusts enough to send GraphQL — no wider.
 *
 * The exact-or-dot-prefixed test is load-bearing: a bare `endsWith('alkem.io')` also
 * matches attacker-registrable look-alikes (e.g. `notalkem.io`), and since the proxy
 * forwards the user's Bearer access token, that would be an SSRF →
 * token-exfiltration path.
 */
export function isAllowedImageUrl(imageUrl: string, allowedHost?: string): boolean {
  try {
    const parsed = new URL(imageUrl);
    const host = parsed.hostname.toLowerCase();
    const base = (allowedHost ?? new URL(loadConfig().alkemioServerUrl).hostname).toLowerCase();
    const hostAllowed = host === base || host.endsWith(`.${base}`);
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

  // Only allow proxying to the configured Alkemio host + its subdomains (see helper).
  const allowedHost = new URL(loadConfig().alkemioServerUrl).hostname;
  if (!isAllowedImageUrl(imageUrl, allowedHost)) {
    res.status(403).json({ error: `Only https ${allowedHost} URLs are allowed` });
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

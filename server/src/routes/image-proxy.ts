import { Router, Request, Response } from 'express';

export const imageProxyRouter = Router();

/**
 * GET /api/image-proxy?url=<encoded-alkemio-url>&token=<bearer-token>
 * Proxies image requests to Alkemio's private storage, forwarding the bearer token.
 * Accepts token via query param so <img> tags can use it directly.
 */
imageProxyRouter.get('/', async (req: Request, res: Response) => {
  const imageUrl = req.query.url as string | undefined;
  const token = req.query.token as string | undefined
    || req.headers.authorization?.replace('Bearer ', '');

  if (!imageUrl) {
    res.status(400).json({ error: 'Missing url parameter' });
    return;
  }

  if (!token) {
    res.status(401).json({ error: 'Missing token' });
    return;
  }

  // Only allow proxying to alkem.io domains
  try {
    const parsed = new URL(imageUrl);
    if (!parsed.hostname.endsWith('alkem.io')) {
      res.status(403).json({ error: 'Only alkem.io URLs are allowed' });
      return;
    }
  } catch {
    res.status(400).json({ error: 'Invalid URL' });
    return;
  }

  try {
    const response = await fetch(imageUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      res.status(response.status).end();
      return;
    }

    // Forward content type and cache headers
    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    // Pipe the response body
    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch {
    res.status(502).json({ error: 'Failed to fetch image' });
  }
});

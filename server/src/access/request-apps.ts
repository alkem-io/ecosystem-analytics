import { isAppId, type AppId } from './policy.js';

/** The parts of a request that can name an application (an Express `Request` satisfies it). */
export interface RequestLike {
  path: string;
  query: Record<string, unknown>;
  body: unknown;
}

/**
 * Every application a request belongs to (research R1): the application whose
 * listener served it, plus any application whose own feature it names. Every one
 * of them must admit the person.
 *
 * Every listener mounts every route, so the listener alone would let a refused
 * person reach `/api/vng/*` through the Explorer's port. The named app closes that.
 * The Explorer's normal features name no application and stay under the listener's
 * policy only (FR-012a). `/api/ecosystem/*` is hub-scoped and names no application.
 *
 * `path` is the full path (`req.originalUrl` minus the query, as `req.path` gives
 * at app level).
 */
export function appsForRequest(listener: AppId, req: RequestLike): AppId[] {
  const apps = new Set<AppId>([listener]);

  // /api/<app>/… — the app-aware dashboard routes.
  const segment = req.path.split('/')[2];
  if (req.path.startsWith('/api/') && isAppId(segment) && segment !== 'explorer') {
    apps.add(segment);
  }

  // /api/hubs?app=<app> — resolves that app's default hub.
  if (req.path === '/api/hubs' || req.path.startsWith('/api/hubs/')) {
    const named = req.query?.app;
    if (isAppId(named)) apps.add(named);
  }

  // /api/graph/* with body.app — a dashboard bundle (counts for that app's profile).
  if (req.path.startsWith('/api/graph/')) {
    const body = req.body;
    if (body && typeof body === 'object') {
      const named = (body as { app?: unknown }).app;
      if (isAppId(named)) apps.add(named);
    }
  }

  return [...apps];
}

/**
 * Feature 025 — `POST /api/graph/generate` negotiates on `Accept`:
 *  - `text/event-stream` → ordered `stage` → `item` → `result` frames (or a terminal
 *    `error`), validation still answered as plain 400 JSON before any frame;
 *  - anything else → the plain dataset exactly as before (Explorer, FR-018), or the
 *    bundle when `X-EA-Bundle: 1` is sent.
 */
process.env.DB_PATH = ':memory:';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LoadReporter } from '../services/progress/load-reporter.js';

const { generateGraphBundle } = vi.hoisted(() => ({ generateGraphBundle: vi.fn() }));
vi.mock('../services/graph-service.js', () => ({
  generateGraphBundle,
  generateGraph: async (...args: unknown[]) => (await generateGraphBundle(...args)).dataset,
  getProgress: () => ({ step: 'ready', spacesTotal: 0, spacesCompleted: 0 }),
}));
vi.mock('../cache/cache-service.js', () => ({ clearUserCache: () => 0 }));
vi.mock('../config.js', () => ({
  loadConfig: () => ({ maxSpacesPerRequest: 50, dashboards: { vng: {} }, vng: {} }),
}));
vi.mock('../auth/session.js', () => ({
  destroySession: vi.fn(),
  SESSION_COOKIE: 'ea_session',
  clearCookieOptions: () => ({}),
}));

import { graphRouter } from './graph.js';

const DATASET = { version: '1.0.0', nodes: [], edges: [] };

/** A minimal Express-like response that records headers, writes and JSON bodies. */
function makeRes() {
  const out = { status: 200, headers: {} as Record<string, string>, chunks: [] as string[], json: undefined as unknown, ended: false };
  const res: any = {
    writableEnded: false,
    status: (c: number) => ((out.status = c), res),
    setHeader: (k: string, v: string) => ((out.headers[k.toLowerCase()] = v), res),
    getHeader: (k: string) => out.headers[k.toLowerCase()],
    flushHeaders: () => {},
    write: (s: string) => (out.chunks.push(s), true),
    end: () => ((out.ended = true), (res.writableEnded = true), res),
    json: (b: unknown) => ((out.json = b), (out.ended = true), res),
    clearCookie: () => res,
  };
  return { res, out };
}

function makeReq(body: unknown, headers: Record<string, string>) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    body,
    headers: h,
    get: (k: string) => h[k.toLowerCase()],
    accepts: (types: string[]) => {
      const accept = h['accept'] ?? '*/*';
      if (accept.includes('text/event-stream')) return 'text/event-stream';
      return types[0];
    },
    auth: { userId: 'u1', session: { sessionId: 's1' } },
  } as any;
}

async function post(body: unknown, headers: Record<string, string>) {
  const layer = (graphRouter as any).stack.find(
    (l: any) => l.route?.path === '/generate' && l.route?.methods?.post,
  );
  const { res, out } = makeRes();
  const handler = layer.route.stack.at(-1).handle; // the route's own handler (after middleware)
  await handler(makeReq(body, headers), res);
  return out;
}

/** Parse SSE frames back into events. */
const frames = (chunks: string[]) =>
  chunks
    .join('')
    .split('\n\n')
    .filter((f) => f.startsWith('event:'))
    .map((f) => JSON.parse(f.split('\n').find((l) => l.startsWith('data:'))!.slice(5)));

beforeEach(() => {
  generateGraphBundle.mockReset();
});

describe('POST /api/graph/generate — streamed (feature 025)', () => {
  it('emits stage → item → result frames in order, as the build reports them', async () => {
    generateGraphBundle.mockImplementation(async (_u, _a, _req, reporter: LoadReporter) => {
      reporter.loading(0, 2, 'signalen');
      reporter.loading(2, 2);
      reporter.processing();
      reporter.itemDone('spaces');
      return { dataset: DATASET, dashboard: { categories: { base: {} }, distribution: { base: {} } } };
    });
    const out = await post({ spaceIds: ['a', 'b'], app: 'vng' }, { accept: 'text/event-stream' });
    expect(out.status).toBe(200);
    expect(out.headers['content-type']).toBe('text/event-stream');
    const events = frames(out.chunks);
    expect(events.map((e) => `${e.type}:${e.stage ?? ''}`)).toEqual([
      'stage:loading',
      'stage:loading',
      'stage:processing',
      'item:done',
      'result:',
    ]);
    expect(events[0]).toMatchObject({ item: 'spaces', done: 0, total: 2, current: 'signalen' });
    expect(events.at(-1)).toMatchObject({ dataset: DATASET, dashboard: expect.any(Object) });
    expect(out.ended).toBe(true);
  });

  it('answers validation errors as plain 400 JSON before opening a stream', async () => {
    const out = await post({ spaceIds: [] }, { accept: 'text/event-stream' });
    expect(out.status).toBe(400);
    expect(out.json).toMatchObject({ error: 'INVALID_REQUEST' });
    expect(out.chunks).toHaveLength(0);
    expect(generateGraphBundle).not.toHaveBeenCalled();
  });

  it('a thrown build becomes a terminal error frame, and the stream still closes', async () => {
    generateGraphBundle.mockRejectedValue(new Error('VNG snapshot data not found'));
    const out = await post({ spaceIds: ['a'] }, { accept: 'text/event-stream' });
    const events = frames(out.chunks);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'error', error: { key: 'load.failed.spaces' } });
    expect(out.ended).toBe(true);
  });

  it('keeps the JSON path byte-identical for the Explorer, and the bundle behind X-EA-Bundle', async () => {
    generateGraphBundle.mockResolvedValue({ dataset: DATASET, dashboard: { categories: { base: {} } } });
    const plain = await post({ spaceIds: ['a'] }, { accept: 'application/json' });
    expect(plain.json).toEqual(DATASET);
    const bundle = await post({ spaceIds: ['a'] }, { accept: 'application/json', 'x-ea-bundle': '1' });
    expect(bundle.json).toMatchObject({ dataset: DATASET, dashboard: expect.any(Object) });
  });
});

/**
 * Feature 026 — the access gate on the client: which screen a signed-in shell shows,
 * and how a mid-session 403 ACCESS_DENIED is turned into that screen (FR-013–FR-015).
 *
 * The workspace has no DOM test environment, so the shell's decision is exercised
 * through `accessScreenFor` and the request helpers through a stubbed `fetch`; the
 * rendered screens are covered by tests/vng-access-gate.spec.mjs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessReport } from '@server/types/access.js';
import { accessScreenFor } from '@ea/shared/access/access-screen.js';
import {
  AccessDeniedError,
  onAccessDenied,
  resetAccessSignal,
  throwIfAccessDenied,
} from '@ea/shared/access/access-signal.js';
import { api, apiStream } from '@ea/shared/services/api.js';
import { loadGraph, loadGraphJson } from '@ea/shared/services/graph-loader.js';
import * as auth from '@ea/shared/services/auth.js';

const viewerSpaces = [
  { key: 'x', displayName: 'Landelijk Innovatie Monitor', url: 'https://alkem.io/x', exists: 'yes' as const },
];
const report = (over: Partial<AccessReport>): AccessReport => ({
  app: 'vng',
  status: 'admitted',
  level: 'read',
  gated: true,
  viewerSpaces,
  ...over,
});

describe('accessScreenFor', () => {
  it('renders the app for an admitted person, at Read or Manage, gated or not', () => {
    expect(accessScreenFor(report({}))).toBe('app');
    expect(accessScreenFor(report({ level: 'manage' }))).toBe('app');
    expect(accessScreenFor(report({ gated: false, viewerSpaces: [] }))).toBe('app');
  });

  it('renders the no-access screen for a refused person', () => {
    expect(accessScreenFor(report({ status: 'none', level: 'none' }))).toBe('no-access');
  });

  it('renders the could-not-verify screen — never no-access — when the check failed (FR-014)', () => {
    expect(accessScreenFor(report({ status: 'unverified', level: null }))).toBe('unverified');
  });

  it('renders the app against an older BFF that reports no access (the server still enforces)', () => {
    expect(accessScreenFor(undefined)).toBe('app');
    expect(accessScreenFor(null)).toBe('app');
  });
});

const denied = (reason: 'none' | 'unverified') =>
  new Response(JSON.stringify({ error: 'ACCESS_DENIED', reason, app: 'vng', message: 'x' }), {
    status: 403,
    headers: { 'content-type': 'application/json' },
  });

describe('a 403 ACCESS_DENIED from any request path', () => {
  let heard: string[];
  let unsubscribe: () => void;
  let redirect: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetAccessSignal();
    heard = [];
    unsubscribe = onAccessDenied((reason) => heard.push(reason));
    redirect = vi.spyOn(auth, 'redirectToLogin').mockImplementation(() => {});
  });
  afterEach(() => {
    unsubscribe();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('signals the shell once and throws AccessDeniedError from api.get', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => denied('none')),
    );
    await expect(api.get('/api/spaces')).rejects.toBeInstanceOf(AccessDeniedError);
    expect(heard).toEqual(['none']);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('signals once for a burst of parallel refusals', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => denied('none')),
    );
    const results = await Promise.allSettled([api.get('/a'), api.get('/b'), api.post('/c', {})]);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(heard).toEqual(['none']);
  });

  it('carries the "unverified" reason', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => denied('unverified')),
    );
    const err = await api.get('/api/spaces').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AccessDeniedError);
    expect((err as AccessDeniedError).reason).toBe('unverified');
    expect(heard).toEqual(['unverified']);
  });

  it('is handled on the streamed graph path, which never falls back to JSON', async () => {
    const fetchMock = vi.fn(async () => denied('none'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      loadGraph({ spaceIds: ['a'] } as never, () => {}, new AbortController().signal),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(heard).toEqual(['none']);
  });

  it('is handled on the JSON graph path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => denied('none')),
    );
    await expect(
      loadGraphJson({ spaceIds: ['a'] } as never, () => {}, new AbortController().signal),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    expect(heard).toEqual(['none']);
  });

  it('is handled on apiStream', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => denied('none')),
    );
    await expect(apiStream('/api/graph/generate', {}, () => {})).rejects.toBeInstanceOf(
      AccessDeniedError,
    );
  });

  it('fires again after the shell re-arms it (after "check again")', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => denied('none')),
    );
    await api.get('/a').catch(() => {});
    resetAccessSignal();
    await api.get('/b').catch(() => {});
    expect(heard).toEqual(['none', 'none']);
  });

  it('leaves any other 403 to the caller, without signalling', async () => {
    const other = new Response(JSON.stringify({ error: 'FORBIDDEN', message: 'nope' }), {
      status: 403,
    });
    await expect(throwIfAccessDenied(other)).resolves.toBeUndefined();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ error: 'X', message: 'nope' }), { status: 403 }),
      ),
    );
    await expect(api.get('/a')).rejects.not.toBeInstanceOf(AccessDeniedError);
    expect(heard).toEqual([]);
  });

  it('does not touch a successful response', async () => {
    await expect(throwIfAccessDenied(new Response('{}', { status: 200 }))).resolves.toBeUndefined();
  });
});

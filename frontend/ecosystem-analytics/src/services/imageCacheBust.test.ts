/**
 * Covers the per-user image cache-bust token from `@ea/shared`.
 *
 * The module keeps state in module scope + localStorage, so each test resets both via
 * `vi.resetModules()` and re-imports. These tests run in vitest's node environment,
 * which has no DOM — a minimal localStorage stub avoids pulling in jsdom for one module.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

type CacheBust = typeof import('@ea/shared/lib/imageCacheBust.js');

function installLocalStorageStub(): void {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  });
}

async function freshModule(): Promise<CacheBust> {
  vi.resetModules();
  return import('@ea/shared/lib/imageCacheBust.js');
}

beforeEach(() => {
  installLocalStorageStub();
});

describe('withImageCacheBust', () => {
  it('leaves URLs untouched before any refresh, so first paint stays cacheable', async () => {
    const m = await freshModule();
    m.scopeImageCacheBustToUser('user-1');

    expect(m.getImageCacheBust()).toBe(0);
    expect(m.withImageCacheBust('/api/image-proxy?url=x')).toBe('/api/image-proxy?url=x');
    expect(m.withImageCacheBust('https://cdn.example/a.png')).toBe('https://cdn.example/a.png');
  });

  it('passes null through', async () => {
    const m = await freshModule();
    m.scopeImageCacheBustToUser('user-1');
    m.bumpImageCacheBust();

    expect(m.withImageCacheBust(null)).toBeNull();
  });

  it('picks the right separator for URLs with and without a query string', async () => {
    const m = await freshModule();
    m.scopeImageCacheBustToUser('user-1');
    m.bumpImageCacheBust();

    expect(m.withImageCacheBust('/api/image-proxy?url=x')).toBe('/api/image-proxy?url=x&_cb=1');
    expect(m.withImageCacheBust('https://cdn.example/a.png')).toBe(
      'https://cdn.example/a.png?_cb=1',
    );
  });

  it('holds the token steady between refreshes, so repeat renders reuse the cache', async () => {
    const m = await freshModule();
    m.scopeImageCacheBustToUser('user-1');
    m.bumpImageCacheBust();

    const first = m.withImageCacheBust('https://cdn.example/a.png');
    expect(m.withImageCacheBust('https://cdn.example/a.png')).toBe(first);
    expect(m.withImageCacheBust('https://cdn.example/a.png')).toBe(first);
  });

  it('moves to a new stable value on each refresh', async () => {
    const m = await freshModule();
    m.scopeImageCacheBustToUser('user-1');

    m.bumpImageCacheBust();
    expect(m.withImageCacheBust('https://cdn.example/a.png')).toBe(
      'https://cdn.example/a.png?_cb=1',
    );

    m.bumpImageCacheBust();
    expect(m.withImageCacheBust('https://cdn.example/a.png')).toBe(
      'https://cdn.example/a.png?_cb=2',
    );
  });
});

describe('per-user persistence', () => {
  it('keeps the token across a reload, so a refresh is not undone by reloading', async () => {
    const before = await freshModule();
    before.scopeImageCacheBustToUser('user-1');
    before.bumpImageCacheBust();
    expect(before.getImageCacheBust()).toBe(1);

    // Simulate a page reload: fresh module state, same localStorage.
    const after = await freshModule();
    after.scopeImageCacheBustToUser('user-1');

    expect(after.getImageCacheBust()).toBe(1);
    expect(after.withImageCacheBust('https://cdn.example/a.png')).toBe(
      'https://cdn.example/a.png?_cb=1',
    );
  });

  it('scopes the token per user rather than leaking across a user switch', async () => {
    const m = await freshModule();
    m.scopeImageCacheBustToUser('user-1');
    m.bumpImageCacheBust();
    m.bumpImageCacheBust();
    expect(m.getImageCacheBust()).toBe(2);

    m.scopeImageCacheBustToUser('user-2');
    expect(m.getImageCacheBust()).toBe(0);

    // Switching back restores user-1's own token.
    m.scopeImageCacheBustToUser('user-1');
    expect(m.getImageCacheBust()).toBe(2);
  });

  it('re-scoping the same user is a no-op, so repeat fetchMe calls do not reset it', async () => {
    const m = await freshModule();
    m.scopeImageCacheBustToUser('user-1');
    m.bumpImageCacheBust();

    m.scopeImageCacheBustToUser('user-1');
    m.scopeImageCacheBustToUser('user-1');

    expect(m.getImageCacheBust()).toBe(1);
  });

  it('falls back to 0 when the persisted value is corrupt', async () => {
    localStorage.setItem('ea:imageCacheBust:user-1', 'not-a-number');
    const m = await freshModule();
    m.scopeImageCacheBustToUser('user-1');

    expect(m.getImageCacheBust()).toBe(0);
  });
});

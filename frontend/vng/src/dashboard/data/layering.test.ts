/**
 * Feature 025, US4 — the three layers are enforced, not just documented.
 *
 * Display (pages, components) and derivations (data/derive, utils) never fetch: the
 * only modules allowed to talk to the BFF are the provider, its loader, the read hooks
 * and the graph loader. If a tab grows a `useState` of a dataset or an `api.` call, this
 * test fails before a reviewer has to notice. Two static fetches are allow-listed on
 * purpose: the graph tab's region boundary (a static asset, not data) and the login
 * screen's feature flags (before any data exists).
 */
import { describe, it, expect } from 'vitest';

// Vite's glob import reads the sources at test time — no fs, no node types needed.
const SOURCES = import.meta.glob(
  '../../../../shared/src/dashboard/{pages,components,utils,data/derive}/**/*.{ts,tsx}',
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const rel = (path: string) => path.replace(/^.*\/shared\/src\/dashboard\//, '');
const ALLOWED_FETCHES = new Map([
  ['pages/GraphTab.tsx', /fetch\(resolveMapConfig\(mapRegion\)\.url\)/],
  ['components/LoginScreen.tsx', /fetch\('\/api\/features'\)/],
]);
const FORBIDDEN = [
  /from\s+'[./]*services\/api\.js'/,
  /from\s+'[./]*services\/graph-loader\.js'/,
  /\bapiStream\b/,
  /\bapi\.(get|post|put|delete)\(/,
  /['"`]\/api\/graph/,
];

const files = () =>
  Object.entries(SOURCES)
    .filter(([path]) => !/\.test\./.test(path))
    .map(([path, src]) => [rel(path), src] as const);

describe('dashboard layering (feature 025)', () => {
  it('display and derivation modules never fetch', () => {
    const offenders: string[] = [];
    for (const [file, source] of files()) {
      const allowed = ALLOWED_FETCHES.get(file);
      const src = allowed ? source.replace(allowed, '') : source;
      if (FORBIDDEN.some((re) => re.test(src)) || /\bfetch\(/.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('no tab keeps dataset state of its own', () => {
    const offenders = files()
      .filter(([file, src]) => file.startsWith('pages/') && /useState<[^>]*Dataset[^>]*>/.test(src))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it('scans a meaningful set of files', () => {
    expect(files().length).toBeGreaterThan(20);
  });
});

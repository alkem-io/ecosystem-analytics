/**
 * `server/src/types/` is the ONLY server code the frontend Docker stage copies (see the
 * Dockerfile's build-frontend stage), because the SPAs import it via `@server/types`.
 * Any import that escapes this folder compiles locally — the whole repo is there — and
 * then breaks the image build. Guard the boundary here, where it fails in seconds.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(import.meta.dirname, 'types');

describe('server/src/types is self-contained', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.ts'));

  it.each(files)('%s imports nothing from outside server/src/types', (file) => {
    const source = readFileSync(join(DIR, file), 'utf8');
    const specifiers = [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    const escaping = specifiers.filter((s) => s.startsWith('..'));
    expect(escaping, `${file} imports ${escaping.join(', ')}`).toEqual([]);
  });
});

describe('server/src/types holds no tests', () => {
  it('— the frontends compile this folder without Node or Vitest types', () => {
    expect(readdirSync(DIR).filter((f) => f.endsWith('.test.ts'))).toEqual([]);
  });
});

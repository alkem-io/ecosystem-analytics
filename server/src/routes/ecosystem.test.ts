process.env.DB_PATH = ':memory:';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// The readability probe talks to Alkemio with the caller's token; stub it so this spec
// can drive the §IV filter directly. `readable` is the set of nameIDs the CALLER can see.
const readable = new Set<string>();
vi.mock('../services/space-readability.js', () => ({
  canReadSpace: vi.fn(async (_auth: unknown, nameId: string) => readable.has(nameId)),
  resetSpaceReadabilityCache: () => {},
}));

import { initDatabase } from '../cache/db.js';
import { setChoice } from '../cache/orchestrator-choice-store.js';
import { ecosystemRouter, isValidNameId } from './ecosystem.js';
import { BUILT_IN_ORCHESTRATORS } from '../data/ecosystem/orchestrators.js';

const HUB = 'vih-test';

beforeEach(() => {
  initDatabase();
  readable.clear();
});

/** Minimal Express response double. */
function makeRes() {
  const out: { status: number; body: any } = { status: 200, body: undefined };
  const res = {
    status(code: number) {
      out.status = code;
      return res;
    },
    json(body: unknown) {
      out.body = body;
      return res;
    },
  };
  return { res, out };
}

/** Invoke one of the router's handlers directly (the repo has no supertest). */
async function call(
  method: 'get' | 'put' | 'delete',
  hubNameId: string,
  { body, userId = 'user-a' }: { body?: unknown; userId?: string } = {},
) {
  const layer = (ecosystemRouter as any).stack.find(
    (l: any) => l.route?.path === '/orchestrator/:hubNameId' && l.route?.methods?.[method],
  );
  expect(layer, `no ${method.toUpperCase()} handler`).toBeDefined();
  const { res, out } = makeRes();
  await layer.route.stack[0].handle({ params: { hubNameId }, body, auth: { userId } }, res);
  return out;
}

describe('nameID guard', () => {
  it('accepts Alkemio nameIDs', () => {
    expect(isValidNameId('vih-test')).toBe(true);
    expect(isValidNameId('programmagroei')).toBe(true);
  });

  it('rejects anything that is not one', () => {
    for (const bad of ['VIH-Test', 'vih test', '../etc/passwd', "vih'; DROP TABLE--", '', 'x'.repeat(65), undefined, 42]) {
      expect(isValidNameId(bad)).toBe(false);
    }
  });
});

describe('the router is protected', () => {
  it('runs the session middleware before any handler', () => {
    const middleware = (ecosystemRouter as any).stack.filter((l: any) => !l.route);
    expect(middleware.length).toBeGreaterThanOrEqual(2); // authMiddleware + resolveUser
  });
});

describe('GET /orchestrator/:hubNameId', () => {
  it('400s on a hubNameId that is not a nameID', async () => {
    const out = await call('get', '../secrets');
    expect(out.status).toBe(400);
    expect(out.body).toMatchObject({ error: 'INVALID_REQUEST' });
  });

  it('returns the built-in default when nobody has chosen', async () => {
    expect((await call('get', HUB)).body).toEqual({
      hubNameId: HUB,
      own: null,
      community: null,
      builtIn: 'programmagroei',
    });
  });

  it('returns builtIn null for a hub the table does not know', async () => {
    expect((await call('get', 'vnginnovationhub')).body.builtIn).toBeNull();
  });

  it('returns this viewer’s own choice, and never another viewer’s', async () => {
    setChoice('user-a', HUB, 'signalen', 1000);
    expect((await call('get', HUB, { userId: 'user-a' })).body.own).toBe('signalen');
    expect((await call('get', HUB, { userId: 'user-b' })).body.own).toBeNull();
  });

  it('answers with exactly the four contract keys', async () => {
    expect(Object.keys((await call('get', HUB)).body).sort()).toEqual([
      'builtIn',
      'community',
      'hubNameId',
      'own',
    ]);
  });
});

// ── Constitution IV: the community preset must not leak a Space across users ──────
describe('the community preset is filtered for readability', () => {
  it('returns the most-chosen space when the caller can read it', async () => {
    setChoice('user-a', HUB, 'signalen', 1000);
    setChoice('user-b', HUB, 'signalen', 1000);
    readable.add('signalen');

    expect((await call('get', HUB, { userId: 'user-c' })).body.community).toEqual({
      spaceNameId: 'signalen',
      count: 2,
    });
  });

  it('skips a top choice the caller cannot read and offers the next readable one', async () => {
    setChoice('user-a', HUB, 'geheime-ruimte', 1000);
    setChoice('user-b', HUB, 'geheime-ruimte', 1000);
    setChoice('user-c', HUB, 'signalen', 1000);
    readable.add('signalen'); // NOT the private one

    const body = (await call('get', HUB, { userId: 'user-d' })).body;
    expect(body.community).toEqual({ spaceNameId: 'signalen', count: 1 });
    expect(JSON.stringify(body)).not.toContain('geheime-ruimte');
  });

  it('returns no preset at all when the caller can read none of the candidates', async () => {
    setChoice('user-a', HUB, 'geheime-ruimte', 1000);
    setChoice('user-b', HUB, 'andere-geheime', 1000);

    const body = (await call('get', HUB, { userId: 'user-d' })).body;
    expect(body.community).toBeNull();
    expect(JSON.stringify(body)).not.toContain('geheim');
    // …and the viewer still gets a usable preset from the built-in table.
    expect(body.builtIn).toBe('programmagroei');
  });
});

describe('PUT /orchestrator/:hubNameId', () => {
  it('stores the choice and answers with the post-write state', async () => {
    const out = await call('put', HUB, { body: { spaceNameId: 'signalen' } });
    expect(out.status).toBe(200);
    expect(out.body.own).toBe('signalen');
    expect((await call('get', HUB)).body.own).toBe('signalen');
  });

  it('replaces an earlier choice rather than adding one', async () => {
    await call('put', HUB, { body: { spaceNameId: 'signalen' } });
    await call('put', HUB, { body: { spaceNameId: 'programmagroei' } });
    expect((await call('get', HUB)).body.own).toBe('programmagroei');
  });

  it('400s on a missing or malformed spaceNameId', async () => {
    expect((await call('put', HUB, { body: {} })).status).toBe(400);
    expect((await call('put', HUB, { body: { spaceNameId: 'Not A NameID' } })).status).toBe(400);
    expect((await call('put', HUB, { body: undefined })).status).toBe(400);
  });
});

describe('DELETE /orchestrator/:hubNameId', () => {
  it('withdraws the choice and is idempotent', async () => {
    await call('put', HUB, { body: { spaceNameId: 'signalen' } });
    expect((await call('delete', HUB)).body.own).toBeNull();
    expect((await call('delete', HUB)).status).toBe(200);
  });

  it('also withdraws it from the community count', async () => {
    setChoice('user-a', HUB, 'signalen', 1000);
    readable.add('signalen');
    expect((await call('get', HUB, { userId: 'user-b' })).body.community?.count).toBe(1);

    await call('delete', HUB, { userId: 'user-a' });
    expect((await call('get', HUB, { userId: 'user-b' })).body.community).toBeNull();
  });
});

describe('built-in table', () => {
  it('maps both VIH representations to the Kenniscentrum Innovatie space', () => {
    expect(BUILT_IN_ORCHESTRATORS['vih-test']).toBe('programmagroei');
    expect(BUILT_IN_ORCHESTRATORS.vih).toBe('programmagroei');
  });

  it('deliberately leaves the acceptance hub out, so it resolves by community/guess', () => {
    expect(BUILT_IN_ORCHESTRATORS.vnginnovationhub).toBeUndefined();
  });

  it('is frozen — a stopgap table is not a runtime registry', () => {
    expect(Object.isFrozen(BUILT_IN_ORCHESTRATORS)).toBe(true);
  });
});

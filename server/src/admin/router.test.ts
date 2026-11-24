/**
 * Feature 027 — the admin API over real HTTP: the real `createApp` listeners, real session
 * rows, the real settings tables; only the role check and Alkemio are faked. Covers
 * contracts/api-admin.md §2–§7 and SC-004 (no way round the screen).
 */
process.env.DB_PATH = ':memory:';
process.env.EXPLORER_ACCESS_GATE = 'none';
process.env.VNG_ACCESS_GATE = 'programmagroei';
process.env.VNG_ADMIN_GATE = 'beheer';
process.env.GOVTECH_ACCESS_GATE = 'none';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { FakeAlkemio, gqlError } from '../testing/fake-alkemio.js';

const alkemio = new FakeAlkemio();
vi.mock('dotenv', () => ({ default: { config: () => ({}) } }));
vi.mock('../access/determine.js', () => ({ determineLevel: vi.fn() }));
const ownSpaces = vi.hoisted(() => ({ list: [] as Array<{ id: string; nameId: string; displayName: string }> }));
vi.mock('../services/space-service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/space-service.js')>()),
  listUserSpacesCached: vi.fn(async () => ownSpaces.list),
}));
// The anonymous existence probe: real by default; the access-tab tests fake it.
const probe = vi.hoisted(() => ({ real: null as null | ((...a: unknown[]) => unknown) }));
vi.mock('../access/probe.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../access/probe.js')>();
  probe.real = original.probeGate as never;
  return { ...original, probeGate: vi.fn(original.probeGate) };
});
vi.mock('../graphql/client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../graphql/client.js')>()),
  createAlkemioSdk: vi.fn(async () => alkemio.sdk()),
}));

import { createApp } from '../app.js';
import { getDatabase, initDatabase } from '../cache/db.js';
import { GD_CACHE_SPACE_ID, getCacheEntry, setCacheEntry } from '../cache/cache-service.js';
import { initSettingsStore } from '../settings/db.js';
import { seedIfEmpty } from '../settings/seed.js';
import { saveAccess } from '../settings/access-store.js';
import { getScope, saveIncludedSpaces, setSpaceId } from '../settings/store.js';
import { createAlkemioSdk } from '../graphql/client.js';
import { determineLevel } from '../access/determine.js';
import { probeGate } from '../access/probe.js';
import { HttpHarness } from '../testing/http-harness.js';

const determine = vi.mocked(determineLevel);
const http = new HttpHarness();

const entry = (id: string, label: string, cardinality: 'SINGLE_SELECT' | 'MULTI_SELECT', selected: string[] = []) => ({
  id,
  displayLabel: label,
  cardinality,
  values: [
    { id: `${id}-1`, label: `${label} één` },
    { id: `${id}-2`, label: `${label} twee` },
  ],
  selectedValueIDs: selected,
});

beforeAll(async () => {
  initDatabase();
  await http.listen('vng', createApp('vng', '../nowhere'));
  await http.listen('explorer', createApp('explorer', '../nowhere'));
});
afterAll(() => http.close());

beforeEach(() => {
  initDatabase();
  seedIfEmpty(initSettingsStore(), { version: 1, ecosystemKey: 'vih-test', includedSpaces: ['signalen', 'gdc'] });
  alkemio.spaces.clear();
  alkemio.mutations = [];
  alkemio.mutationError = null;
  alkemio.beforeMutation = null;
  alkemio.add({
    id: 'id-signalen',
    nameID: 'signalen',
    displayName: 'Signalen',
    privileges: ['READ', 'UPDATE'],
    classifications: [entry('fase', 'Fase', 'SINGLE_SELECT', ['fase-1']), entry('nds', 'NDS-prioriteit', 'MULTI_SELECT')],
  });
  alkemio.add({ id: 'id-gdc', nameID: 'gdc', displayName: 'GDC', privileges: ['READ'] });
  alkemio.add({ id: 'id-open', nameID: 'openstad', displayName: 'OpenStad' });
  alkemio.add({ id: 'id-secret', nameID: 'geheim', displayName: 'Geheim', forbidden: true });
  alkemio.add({ id: 'id-sub', nameID: 'deelruimte', displayName: 'Deelruimte', level: 'L1' });
  determine.mockReset();
});

const asManager = () => {
  determine.mockResolvedValue('manage');
  return http.newSession({ displayName: 'Mia Manager' });
};
const asViewer = () => {
  determine.mockResolvedValue('read');
  return http.newSession();
};

describe('who reaches the admin API (SC-004)', () => {
  const routes: Array<[string, string, unknown?]> = [
    ['GET', '/api/vng/admin/access'],
    ['GET', '/api/vng/admin/included-spaces'],
    ['GET', '/api/vng/admin/history'],
    ['PUT', '/api/vng/admin/included-spaces', { baseRevision: 1, spaceNameIds: ['signalen'] }],
    ['GET', '/api/vng/admin/space-search?q=open'],
    ['GET', '/api/vng/admin/space-resolve?ref=openstad'],
    ['GET', '/api/vng/admin/initiatives'],
    ['GET', '/api/vng/admin/initiatives/signalen/classifications'],
    ['PUT', '/api/vng/admin/initiatives/signalen/classifications', { changes: [] }],
    ['GET', '/api/vng/admin/gd-source'],
  ];

  it('answers 401 without a session', async () => {
    for (const [method, path, body] of routes) {
      expect((await http.call('vng', path, { method, body })).status, path).toBe(401);
    }
  });

  it('refuses a viewer with 403 ACCESS_DENIED on every route, on the VNG and Explorer listeners', async () => {
    const cookie = asViewer();
    for (const listener of ['vng', 'explorer']) {
      for (const [method, path, body] of routes) {
        const r = await http.call(listener, path, { method, body, cookie });
        expect(r.status, `${listener} ${method} ${path}`).toBe(403);
        expect(r.json).toMatchObject({ error: 'ACCESS_DENIED', reason: 'none', app: 'vng' });
      }
    }
    expect(getScope().revision).toBe(1);
    expect(alkemio.mutations).toEqual([]);
  });
});

describe('GET /access', () => {
  it('gives a manager both lists and their own standing', async () => {
    const r = await http.call('vng', '/api/vng/admin/access', { cookie: asManager() });
    expect(r.status).toBe(200);
    expect(r.json.viewers.map((v: { key: string }) => v.key)).toEqual(['programmagroei']);
    expect(r.json.admins.map((v: { key: string }) => v.key)).toEqual(['beheer']);
    expect(r.json.me).toEqual({ displayName: 'Mia Manager', viewer: true, manager: true });
  });

  it('reports a Space the probe did not find as exists: "no"', async () => {
    const { probeGate } = await import('../access/probe.js');
    await probeGate({ path: ['beheer'], key: 'beheer' }, '', {
      sdk: { accessGateProbeL0: async () => ({ data: { lookupByName: { space: null } } }) } as never,
      alkemioServerUrl: 'https://alkem.io',
    });
    const r = await http.call('vng', '/api/vng/admin/access', { cookie: asManager() });
    expect(r.json.admins[0]).toMatchObject({ key: 'beheer', exists: 'no' });
  });
});

describe('Included Spaces — read (US3)', () => {
  it('lists the stored set in order, with names, links and classification status', async () => {
    const r = await http.call('vng', '/api/vng/admin/included-spaces', { cookie: asManager() });
    expect(r.status).toBe(200);
    expect(r.json.revision).toBe(1);
    expect(r.json.spaces.map((s: { nameId: string }) => s.nameId)).toEqual(['signalen', 'gdc']);
    expect(r.json.spaces[0]).toMatchObject({
      displayName: 'Signalen',
      url: 'https://alkem.io/signalen',
      readable: true,
      found: true,
      spaceId: 'id-signalen',
      classificationStatus: { set: 1, designated: 4 },
    });
    expect(r.json.lastChange).toMatchObject({ kind: 'seed', note: 'from starting set v1' });
  });

  it('shows the actual values of every designated classification, in configured order', async () => {
    alkemio.spaces.get('gdc')!.isContentPublic = false;
    alkemio.spaces.get('gdc')!.visibility = 'ARCHIVED';
    const r = await http.call('vng', '/api/vng/admin/included-spaces', { cookie: asManager() });
    expect(r.json.spaces[0].visibility).toEqual({ contentPublic: true, status: 'ACTIVE' });
    expect(r.json.spaces[1].visibility).toEqual({ contentPublic: false, status: 'ARCHIVED' });
    expect(r.json.designations.map((d: { key: string }) => d.key)).toEqual(['nds', 'vng2030', 'phase', 'trl']);
    expect(r.json.spaces[0].classifications).toEqual([
      { key: 'nds', present: true, values: [], rank: null },
      { key: 'vng2030', present: false, values: [], rank: null },
      { key: 'phase', present: true, values: ['Fase één'], rank: 0 },
      { key: 'trl', present: false, values: [], rank: null },
    ]);
  });

  it('reveals nothing but the nameID of a Space the manager cannot read, and flags a gone one', async () => {
    alkemio.spaces.get('signalen')!.forbidden = true;
    alkemio.spaces.delete('gdc');
    const r = await http.call('vng', '/api/vng/admin/included-spaces', { cookie: asManager() });
    expect(r.json.spaces[0]).toEqual({
      nameId: 'signalen',
      spaceId: null,
      position: 0,
      displayName: null,
      url: null,
      readable: false,
      found: true,
      visibility: null,
      classificationStatus: null,
      classifications: null,
    });
    expect(r.json.spaces[1]).toMatchObject({ nameId: 'gdc', readable: false, found: false });
  });

  it('detects and records a rename on Alkemio by the remembered UUID', async () => {
    setSpaceId('gdc', 'id-gdc');
    const gdc = alkemio.spaces.get('gdc')!;
    alkemio.spaces.delete('gdc');
    alkemio.add({ ...gdc, nameID: 'gdc-nieuw' });
    const cookie = asManager();
    const r = await http.call('vng', '/api/vng/admin/included-spaces', { cookie });
    expect(r.json.spaces[1]).toMatchObject({ nameId: 'gdc-nieuw', readable: true });
    expect(r.json.revision).toBe(2);
    expect(getScope().spaceNameIds).toEqual(['signalen', 'gdc-nieuw']);
    const h = await http.call('vng', '/api/vng/admin/history?limit=1', { cookie });
    expect(h.json.entries[0]).toMatchObject({ type: 'spaces', kind: 'rename', note: 'renamed gdc→gdc-nieuw' });
    expect(typeof h.json.next).toBe('string');
    const older = await http.call('vng', `/api/vng/admin/history?limit=1&before=${encodeURIComponent(h.json.next)}`, { cookie });
    expect(older.json.entries[0]).toMatchObject({ type: 'spaces', kind: 'seed' });
    expect(older.json.next).toBeNull();
  });
});

describe('Included Spaces — consistent answers', () => {
  it('does not show a Space that took over the nameID of an included one', async () => {
    setSpaceId('gdc', 'id-gdc');
    alkemio.spaces.delete('gdc');
    alkemio.add({ id: 'id-other', nameID: 'gdc', displayName: 'Een andere Space' });
    const r = await http.call('vng', '/api/vng/admin/included-spaces', { cookie: asManager() });
    expect(r.json.spaces[1]).toMatchObject({ nameId: 'gdc', readable: false, found: false, displayName: null });
  });

  it('follows the stored UUID when its old nameID was reused by another Space', async () => {
    setSpaceId('gdc', 'id-gdc');
    const gdc = alkemio.spaces.get('gdc')!;
    alkemio.spaces.delete('gdc');
    alkemio.add({ ...gdc, nameID: 'gdc-nieuw' });
    alkemio.add({ id: 'id-other', nameID: 'gdc', displayName: 'Een andere Space' });
    const r = await http.call('vng', '/api/vng/admin/included-spaces', { cookie: asManager() });
    expect(r.json.spaces[1]).toMatchObject({ nameId: 'gdc-nieuw', displayName: 'GDC', spaceId: 'id-gdc' });
    expect(getScope().spaceNameIds).toEqual(['signalen', 'gdc-nieuw']);
  });

  it('returns rows and revision that belong together when someone saves meanwhile', async () => {
    let raced = false;
    const real = alkemio.sdk();
    vi.mocked(createAlkemioSdk).mockResolvedValueOnce({
      ...real,
      AdminSpaceClassifications: async (vars: { nameId: string }) => {
        if (!raced) {
          raced = true;
          saveIncludedSpaces({ baseRevision: 1, nameIds: ['openstad'], actor: { userId: 'u2', displayName: 'Sam' } });
        }
        return real.AdminSpaceClassifications(vars);
      },
    } as never);
    const r = await http.call('vng', '/api/vng/admin/included-spaces', { cookie: asManager() });
    expect(r.json.revision).toBe(2);
    expect(r.json.spaces.map((s: { nameId: string }) => s.nameId)).toEqual(['openstad']);
    expect(r.json.lastChange).toMatchObject({ actorName: 'Sam' });
  });

  it('answers a save with the revision after a rename it found, so the next save is no conflict', async () => {
    setSpaceId('gdc', 'id-gdc');
    const gdc = alkemio.spaces.get('gdc')!;
    alkemio.spaces.delete('gdc');
    alkemio.add({ ...gdc, nameID: 'gdc-nieuw' });
    const cookie = asManager();
    const put = (body: unknown) =>
      http.call('vng', '/api/vng/admin/included-spaces', { method: 'PUT', body, cookie });
    const first = await put({ baseRevision: 1, spaceNameIds: ['gdc', 'signalen'] });
    expect(first.status).toBe(200);
    expect(first.json.revision).toBe(getScope().revision);
    const next = await put({ baseRevision: first.json.revision, spaceNameIds: ['signalen', 'gdc-nieuw'] });
    expect(next.status).toBe(200);
  });
});

describe('who made a change, by name', () => {
  it('names the Spaces in the history, and repairs rows that were recorded with the id', async () => {
    // A session whose name is not known yet (and Alkemio's `me` not reachable): the id.
    const nameless = (determine.mockResolvedValue('manage'), http.newSession({ userId: 'u-anna', displayName: '' }));
    await http.call('vng', '/api/vng/admin/included-spaces', { cookie: nameless }); // learns names
    await http.call('vng', '/api/vng/admin/included-spaces', {
      method: 'PUT',
      body: { baseRevision: 1, spaceNameIds: ['signalen'] },
      cookie: nameless,
    });
    // The same person, name now known: their row is repaired on the next visit.
    const named = http.newSession({ userId: 'u-anna', displayName: 'Anna Admin' });
    const h = await http.call('vng', '/api/vng/admin/history', { cookie: named });
    expect(h.json.entries[0]).toMatchObject({ type: 'spaces', kind: 'update', actorName: 'Anna Admin', removed: ['gdc'] });
    expect(h.json.names).toMatchObject({ gdc: 'GDC' });
  });
});

describe('Included Spaces — write (US4)', () => {
  const put = (cookie: string, body: unknown) =>
    http.call('vng', '/api/vng/admin/included-spaces', { method: 'PUT', body, cookie });

  it('saves, and the new set is what every viewer’s /api/vng/scope returns', async () => {
    const r = await put(asManager(), { baseRevision: 1, spaceNameIds: ['openstad', 'signalen'] });
    expect(r.status).toBe(200);
    expect(r.json.revision).toBe(2);
    expect(r.json.lastChange).toMatchObject({ kind: 'update', actorName: 'Mia Manager', added: ['openstad'], removed: ['gdc'] });
    const scope = await http.call('vng', '/api/vng/scope', { cookie: asViewer() });
    expect(scope.json).toEqual({ revision: 2, ecosystemKey: 'vih-test', spaceNameIds: ['openstad', 'signalen'] });
  });

  it('answers 409 with the current set for a stale base revision', async () => {
    const cookie = asManager();
    await put(cookie, { baseRevision: 1, spaceNameIds: ['signalen'] });
    const r = await put(cookie, { baseRevision: 1, spaceNameIds: ['gdc'] });
    expect(r.status).toBe(409);
    expect(r.json.error).toBe('REVISION_CONFLICT');
    expect(r.json.current.revision).toBe(2);
    expect(r.json.current.spaces.map((s: { nameId: string }) => s.nameId)).toEqual(['signalen']);
  });

  it('refuses to add a Space the manager cannot read, and changes nothing', async () => {
    const r = await put(asManager(), { baseRevision: 1, spaceNameIds: ['signalen', 'gdc', 'geheim', 'bestaat-niet'] });
    expect(r.status).toBe(422);
    expect(r.json).toEqual({
      error: 'INVALID_SPACES',
      problems: [
        { nameId: 'geheim', problem: 'NOT_READABLE' },
        { nameId: 'bestaat-niet', problem: 'NOT_READABLE' },
      ],
    });
    expect(getScope()).toMatchObject({ revision: 1, spaceNameIds: ['signalen', 'gdc'] });
  });

  it('refuses a subspace and a duplicate', async () => {
    const sub = await put(asManager(), { baseRevision: 1, spaceNameIds: ['signalen', 'deelruimte'] });
    expect(sub.json.problems).toEqual([{ nameId: 'deelruimte', problem: 'NOT_TOP_LEVEL' }]);
    const dup = await put(asManager(), { baseRevision: 1, spaceNameIds: ['signalen', 'signalen'] });
    expect(dup.json.problems).toEqual([{ nameId: 'signalen', problem: 'DUPLICATE' }]);
  });

  it('asks for confirmation before emptying the set', async () => {
    const cookie = asManager();
    expect((await put(cookie, { baseRevision: 1, spaceNameIds: [] })).json).toEqual({ error: 'EMPTY_NOT_CONFIRMED' });
    expect((await put(cookie, { baseRevision: 1, spaceNameIds: [], confirmEmpty: true })).status).toBe(200);
    expect(getScope().spaceNameIds).toEqual([]);
  });

  it('lets a manager keep or remove a Space already in the set that they can no longer read', async () => {
    alkemio.spaces.get('gdc')!.forbidden = true;
    const cookie = asManager();
    expect((await put(cookie, { baseRevision: 1, spaceNameIds: ['gdc', 'signalen'] })).status).toBe(200);
    expect((await put(cookie, { baseRevision: 2, spaceNameIds: ['signalen'] })).status).toBe(200);
  });

  it('refuses a manager whose ADMIN role was removed since /me, thanks to the fresh check (FR-009)', async () => {
    const cookie = asManager();
    expect((await http.call('vng', '/api/vng/admin/access', { cookie })).status).toBe(200);
    determine.mockResolvedValue('read'); // removed on Alkemio
    const r = await put(cookie, { baseRevision: 1, spaceNameIds: ['signalen'] });
    expect(r.status).toBe(403);
    expect(getScope().revision).toBe(1);
  });
});

describe('finding a Space to add (US4)', () => {
  it('searches top-level Spaces the manager can see, marking those already included', async () => {
    const cookie = asManager();
    const r = await http.call('vng', '/api/vng/admin/space-search?q=e', { cookie });
    expect(r.status).toBe(422);
    const ok = await http.call('vng', '/api/vng/admin/space-search?q=al', { cookie });
    expect(ok.json.results).toEqual([
      { nameId: 'signalen', displayName: 'Signalen', url: 'https://alkem.io/signalen', included: true },
    ]);
    const sub = await http.call('vng', '/api/vng/admin/space-search?q=deel', { cookie });
    expect(sub.json.results).toEqual([]);
  });

  it('matches the manager’s own Spaces on part of a word, which Alkemio’s word search cannot', async () => {
    ownSpaces.list = [{ id: 'id-b', nameId: 'buildingcitizentech', displayName: 'Building Citizen Tech' }];
    const r = await http.call('vng', '/api/vng/admin/space-search?q=buil', { cookie: asManager() });
    ownSpaces.list = [];
    expect(r.json.results).toEqual([
      {
        nameId: 'buildingcitizentech',
        displayName: 'Building Citizen Tech',
        url: expect.stringMatching(/\/buildingcitizentech$/),
        included: false,
      },
    ]);
  });

  it('also finds a Space by its exact short name (nameID), which word search misses', async () => {
    alkemio.add({ id: 'id-tina', nameID: 'tina', displayName: 'Team Innovatie' });
    const r = await http.call('vng', '/api/vng/admin/space-search?q=tina', { cookie: asManager() });
    expect(r.json.results).toEqual([
      { nameId: 'tina', displayName: 'Team Innovatie', url: 'https://alkem.io/tina', included: false },
    ]);
  });

  it('resolves a pasted link or nameID', async () => {
    const cookie = asManager();
    const ok = await http.call('vng', `/api/vng/admin/space-resolve?ref=${encodeURIComponent('https://alkem.io/openstad')}`, { cookie });
    expect(ok.json.space).toMatchObject({ nameId: 'openstad', included: false });
    const deep = await http.call('vng', `/api/vng/admin/space-resolve?ref=${encodeURIComponent('https://alkem.io/openstad/challenges/x')}`, { cookie });
    expect(deep).toMatchObject({ status: 422, json: { error: 'NOT_TOP_LEVEL' } });
    expect((await http.call('vng', '/api/vng/admin/space-resolve?ref=geheim', { cookie })).json).toEqual({ error: 'NOT_READABLE' });
    expect((await http.call('vng', '/api/vng/admin/space-resolve?ref=bestaat-niet', { cookie })).json).toEqual({ error: 'NOT_READABLE' });
    expect((await http.call('vng', '/api/vng/admin/space-resolve?ref=%21%21', { cookie })).json).toEqual({ error: 'UNPARSEABLE' });
  });
});

describe('classifications (US5)', () => {
  const read = (cookie: string, nameId: string) =>
    http.call('vng', `/api/vng/admin/initiatives/${nameId}/classifications`, { cookie });
  const write = (cookie: string, nameId: string, changes: unknown) =>
    http.call('vng', `/api/vng/admin/initiatives/${nameId}/classifications`, { method: 'PUT', body: { changes }, cookie });

  it('reads the designated classifications by label; absent ones are "not set"', async () => {
    const r = await read(asManager(), 'signalen');
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ canEdit: true, reason: null, initiative: { nameId: 'signalen', kind: 'included', displayName: 'Signalen' } });
    const byKey = Object.fromEntries(r.json.classifications.map((c: { key: string }) => [c.key, c]));
    expect(byKey.phase).toMatchObject({ present: true, entryId: 'fase', cardinality: 'SINGLE_SELECT', selectedValueIds: ['fase-1'] });
    expect(byKey.nds).toMatchObject({ present: true, cardinality: 'MULTI_SELECT' });
    expect(byKey.trl).toMatchObject({ present: false, entryId: null });
  });

  it('is read-only without the UPDATE privilege, and a write changes nothing', async () => {
    alkemio.spaces.get('gdc')!.classifications = [entry('f2', 'Fase', 'SINGLE_SELECT')];
    const cookie = asManager();
    expect((await read(cookie, 'gdc')).json).toMatchObject({ canEdit: false, reason: 'NO_UPDATE_RIGHT' });
    const w = await write(cookie, 'gdc', [{ entryId: 'f2', expectedSelectedValueIds: [], selectedValueIds: ['f2-1'] }]);
    expect(w.json.results).toEqual([expect.objectContaining({ entryId: 'f2', outcome: 'NOT_PERMITTED' })]);
    expect(alkemio.mutations).toEqual([]);
  });

  it('shows a GD post as not editable, and an unknown initiative as not readable', async () => {
    const cookie = asManager();
    const userId = (getDatabase().prepare('SELECT user_id FROM oidc_sessions ORDER BY created_at DESC LIMIT 1').get() as { user_id: string }).user_id;
    setCacheEntry(userId, GD_CACHE_SPACE_ID, JSON.stringify({
      nodes: [],
      edges: [],
      initiativeCount: 1,
      callouts: [{ id: 'p1', nameId: 'oude-post', displayName: 'Oude post', source: 'post', tags: [], gemeenteCount: 0 }],
    }), 1);
    expect((await read(cookie, 'oude-post')).json).toMatchObject({ canEdit: false, reason: 'GD_POST', classifications: [] });
    expect((await read(cookie, 'iets-anders')).status).toBe(404);
    const list = await http.call('vng', '/api/vng/admin/initiatives', { cookie });
    expect(list.json.initiatives.map((i: { nameId: string; kind: string }) => `${i.kind}:${i.nameId}`)).toEqual([
      'included:gdc',
      'gd-post:oude-post',
      'included:signalen',
    ]);
  });

  it('refuses two values on a single-select entry with 422 and writes nothing', async () => {
    const w = await write(asManager(), 'signalen', [
      { entryId: 'fase', expectedSelectedValueIds: ['fase-1'], selectedValueIds: ['fase-1', 'fase-2'] },
    ]);
    expect(w).toMatchObject({ status: 422, json: { error: 'INVALID_SELECTION', entryId: 'fase' } });
    expect(alkemio.mutations).toEqual([]);
  });

  it('reports CHANGED_ON_ALKEMIO when someone changed it meanwhile, without writing', async () => {
    const w = await write(asManager(), 'signalen', [
      { entryId: 'fase', expectedSelectedValueIds: [], selectedValueIds: ['fase-2'] },
    ]);
    expect(w.json.results[0]).toMatchObject({ outcome: 'CHANGED_ON_ALKEMIO', current: { selectedValueIds: ['fase-1'] } });
    expect(alkemio.mutations).toEqual([]);
  });

  it('reports NOT_PERMITTED on FORBIDDEN and records nothing', async () => {
    alkemio.mutationError = gqlError('FORBIDDEN_POLICY');
    const w = await write(asManager(), 'signalen', [
      { entryId: 'fase', expectedSelectedValueIds: ['fase-1'], selectedValueIds: ['fase-2'] },
    ]);
    expect(w.json.results[0].outcome).toBe('NOT_PERMITTED');
    expect(getDatabase().prepare('SELECT COUNT(*) AS n FROM classification_changes').get()).toEqual({ n: 0 });
  });

  it('saves, records one change and invalidates only the editor’s cached row for that Space', async () => {
    const cookie = asManager();
    const editor = (getDatabase().prepare('SELECT user_id FROM oidc_sessions ORDER BY created_at DESC LIMIT 1').get() as { user_id: string }).user_id;
    setCacheEntry(editor, 'signalen', '{}');
    setCacheEntry(editor, 'gdc', '{}');
    setCacheEntry('someone-else', 'signalen', '{}');
    const w = await write(cookie, 'signalen', [
      { entryId: 'fase', expectedSelectedValueIds: ['fase-1'], selectedValueIds: ['fase-2'] },
    ]);
    expect(w.json.results[0]).toMatchObject({ entryId: 'fase', outcome: 'SAVED', current: { selectedValueIds: ['fase-2'] } });
    expect(w.json.classifications.classifications.find((c: { key: string }) => c.key === 'phase').selectedValueIds).toEqual(['fase-2']);
    expect(alkemio.mutations).toEqual([{ entryId: 'fase', selectedValueIDs: ['fase-2'] }]);
    const rows = getDatabase().prepare('SELECT actor_name, entry_label, from_json, to_json FROM classification_changes').all();
    expect(rows).toEqual([
      {
        actor_name: 'Mia Manager',
        entry_label: 'Fase',
        from_json: JSON.stringify([{ id: 'fase-1', label: 'Fase één' }]),
        to_json: JSON.stringify([{ id: 'fase-2', label: 'Fase twee' }]),
      },
    ]);
    expect(getCacheEntry(editor, 'signalen')).toBeNull();
    expect(getCacheEntry(editor, 'gdc')).not.toBeNull();
    expect(getCacheEntry('someone-else', 'signalen')).not.toBeNull();
  });

  const editorId = () =>
    (getDatabase().prepare('SELECT user_id FROM oidc_sessions ORDER BY created_at DESC LIMIT 1').get() as { user_id: string })
      .user_id;

  it('saves a GD subspace outside the Included Spaces, and still answers with its classifications', async () => {
    alkemio.add({
      id: 'id-gdsub',
      nameID: 'gd-sub',
      level: 'L1',
      displayName: 'GD subspace',
      privileges: ['READ', 'UPDATE'],
      classifications: [entry('gdfase', 'Fase', 'SINGLE_SELECT')],
    });
    const cookie = asManager();
    const editor = editorId();
    setCacheEntry(editor, GD_CACHE_SPACE_ID, JSON.stringify({
      nodes: [],
      edges: [],
      initiativeCount: 1,
      callouts: [{ id: 'id-gdsub', nameId: 'gd-sub', displayName: 'GD subspace', source: 'subspace', tags: [], gemeenteCount: 0 }],
    }), 1);
    const w = await write(cookie, 'gd-sub', [{ entryId: 'gdfase', expectedSelectedValueIds: [], selectedValueIds: ['gdfase-2'] }]);
    expect(w.status).toBe(200);
    expect(w.json.results[0].outcome).toBe('SAVED');
    expect(w.json.classifications.classifications.find((c: { key: string }) => c.key === 'phase').selectedValueIds).toEqual(['gdfase-2']);
    expect(getCacheEntry(editor, GD_CACHE_SPACE_ID)).toBeNull();
  });

  it('invalidates the editor’s row, and reports what was saved, when a later re-read fails', async () => {
    const cookie = asManager();
    const editor = editorId();
    setCacheEntry(editor, 'signalen', '{}');
    const real = alkemio.sdk();
    let reads = 0;
    vi.mocked(createAlkemioSdk).mockResolvedValueOnce({
      ...real,
      // 1: validation, 2: before the first write — everything after that fails.
      AdminSpaceClassifications: async (vars: { nameId: string }) => {
        if (++reads > 2) throw new Error('socket hang up');
        return real.AdminSpaceClassifications(vars);
      },
    } as never);
    const w = await write(cookie, 'signalen', [
      { entryId: 'fase', expectedSelectedValueIds: ['fase-1'], selectedValueIds: ['fase-2'] },
      { entryId: 'nds', expectedSelectedValueIds: [], selectedValueIds: ['nds-1'] },
    ]);
    expect(w.status).toBe(200);
    expect(w.json.results.map((r: { outcome: string }) => r.outcome)).toEqual(['SAVED', 'FAILED']);
    expect(w.json.classifications.classifications.find((c: { key: string }) => c.key === 'phase').selectedValueIds).toEqual(['fase-2']);
    expect(getCacheEntry(editor, 'signalen')).toBeNull();
  });

  it('puts classification and Space-list edits in ONE audit log, newest first, by name', async () => {
    const cookie = asManager();
    await http.call('vng', '/api/vng/admin/included-spaces', { cookie }); // learns the names
    await http.call('vng', '/api/vng/admin/included-spaces', {
      method: 'PUT',
      body: { baseRevision: 1, spaceNameIds: ['signalen'] },
      cookie,
    });
    await new Promise((r) => setTimeout(r, 5)); // distinct timestamps
    await write(cookie, 'signalen', [{ entryId: 'fase', expectedSelectedValueIds: ['fase-1'], selectedValueIds: ['fase-2'] }]);
    const h = await http.call('vng', '/api/vng/admin/history', { cookie });
    expect(h.json.entries.map((e: { type: string; kind?: string }) => e.kind ?? e.type)).toEqual([
      'classification',
      'update',
      'seed',
    ]);
    expect(h.json.entries[0]).toMatchObject({
      actorName: 'Mia Manager',
      spaceNameId: 'signalen',
      entryLabel: 'Fase',
      from: ['Fase één'],
      to: ['Fase twee'],
    });
    expect(h.json.names).toMatchObject({ signalen: 'Signalen', gdc: 'GDC' });
    // Paging walks the same list, without gaps or repeats.
    const seen: string[] = [];
    let next: string | null = null;
    do {
      const p = await http.call('vng', `/api/vng/admin/history?limit=1${next ? `&before=${encodeURIComponent(next)}` : ''}`, { cookie });
      seen.push(...p.json.entries.map((e: { type: string; kind?: string }) => e.kind ?? e.type));
      next = p.json.next;
    } while (next);
    expect(seen).toEqual(['classification', 'update', 'seed']);
  });
});

describe('GET /gd-source (US6)', () => {
  it('reports unavailable, with no counts, when the GD space cannot be read', async () => {
    const r = await http.call('vng', '/api/vng/admin/gd-source', { cookie: asManager() });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ available: false, total: 0, initiatives: [] });
    expect(r.json.error).toMatch(/GD_SPACE_UNREADABLE|LOAD_FAILED/);
  });
});

describe('access Spaces — the "Toegang" tab', () => {
  // Every Space exists except `bestaat-niet`.
  beforeEach(() => {
    vi.mocked(probeGate).mockImplementation(async (gate) => ({
      displayName: gate.key === 'innovatiemonitor' ? 'Innovatiemonitor' : gate.key,
      url: `https://alkem.io/${gate.key}`,
      exists: gate.key === 'bestaat-niet' ? 'no' : 'yes',
    }));
  });
  afterEach(() => {
    vi.mocked(probeGate).mockImplementation(probe.real as never);
  });
  const put = (cookie: string, body: unknown) =>
    http.call('vng', '/api/vng/admin/access', { method: 'PUT', body, cookie });
  /** A manager while `beheer` is an admin Space; only a viewer under any other admin set. */
  const managerOfBeheer = () => {
    determine.mockImplementation(async (_auth, sets) =>
      sets.admins.some((a) => a.key === 'beheer') ? 'manage' : 'read',
    );
    return http.newSession({ displayName: 'Mia Manager' });
  };

  it('shows the configured sets as editable, from the configuration', async () => {
    const r = await http.call('vng', '/api/vng/admin/access', { cookie: asManager() });
    expect(r.json).toMatchObject({ editable: true, source: 'config', revision: 0 });
    expect(r.json.viewers.map((s: { key: string }) => s.key)).toEqual(['programmagroei']);
    expect(r.json.admins.map((s: { key: string }) => s.key)).toEqual(['beheer']);
  });

  it('saves new sets: they apply at once, publicly too, and land in the audit log', async () => {
    const cookie = managerOfBeheer();
    const r = await put(cookie, {
      baseRevision: 0,
      viewers: ['programmagroei', 'https://alkem.io/innovatiemonitor'],
      admins: ['beheer', 'innovatiemonitor'],
    });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ source: 'settings', revision: 1, updatedByName: 'Mia Manager' });
    expect(r.json.viewers.map((s: { key: string }) => s.key)).toEqual(['programmagroei', 'innovatiemonitor']);
    expect(r.json.admins.map((s: { key: string; displayName: string }) => s.displayName)).toEqual([
      'beheer',
      'Innovatiemonitor',
    ]);
    // The sign-in screen's public list follows.
    const pub = await http.call('vng', '/api/auth/access/spaces?app=vng');
    expect(pub.json.spaces.map((s: { key: string }) => s.key)).toEqual(['programmagroei', 'innovatiemonitor']);
    const h = await http.call('vng', '/api/vng/admin/history', { cookie });
    expect(h.json.entries[0]).toMatchObject({
      type: 'access',
      actorName: 'Mia Manager',
      from: { viewers: [{ key: 'programmagroei' }], admins: [{ key: 'beheer' }] },
      to: { admins: [{ key: 'beheer' }, { key: 'innovatiemonitor', displayName: 'Innovatiemonitor' }] },
    });
    // A stale revision is a conflict, and changes nothing.
    const stale = await put(cookie, { baseRevision: 0, viewers: ['programmagroei'], admins: ['beheer'] });
    expect(stale).toMatchObject({ status: 409, json: { error: 'CONFLICT', revision: 1 } });
  });

  it('reports a conflict, not success, when someone else saved while the checks ran', async () => {
    const cookie = managerOfBeheer();
    const mine = { viewers: ['programmagroei'], admins: ['beheer'] };
    expect((await put(cookie, { baseRevision: 0, ...mine })).json.revision).toBe(1);
    // The same sets again (a no-op) — but another manager saves during the probe.
    let raced = false;
    vi.mocked(probeGate).mockImplementation(async (gate) => {
      if (!raced) {
        raced = true;
        const set = [{ key: 'beheer', displayName: 'beheer' }];
        saveAccess({ app: 'vng', baseRevision: 1, from: { viewers: set, admins: set }, viewers: set, admins: set, actor: { userId: 'u2', displayName: 'Sam' } });
      }
      return { displayName: gate.key, url: `https://alkem.io/${gate.key}`, exists: 'yes' };
    });
    expect(await put(cookie, { baseRevision: 1, ...mine })).toMatchObject({ status: 409, json: { error: 'CONFLICT', revision: 2 } });
  });

  it('refuses sets that would lock the saving manager out, and stores nothing', async () => {
    const cookie = managerOfBeheer();
    const r = await put(cookie, { baseRevision: 0, viewers: ['programmagroei'], admins: ['innovatiemonitor'] });
    expect(r).toMatchObject({ status: 409, json: { error: 'WOULD_LOCK_OUT' } });
    expect(getDatabase().prepare('SELECT COUNT(*) AS n FROM access_sets').get()).toEqual({ n: 0 });
    expect((await http.call('vng', '/api/vng/admin/access', { cookie })).json.source).toBe('config');
  });

  it('refuses an empty set, an unknown Space, a duplicate and an unreadable item', async () => {
    const cookie = managerOfBeheer();
    expect((await put(cookie, { baseRevision: 0, viewers: ['programmagroei'], admins: [] })).json).toMatchObject({
      error: 'EMPTY_SET',
      role: 'admins',
    });
    expect(
      (await put(cookie, { baseRevision: 0, viewers: ['programmagroei', 'bestaat-niet'], admins: ['beheer'] })).json,
    ).toMatchObject({ error: 'NOT_FOUND', item: 'bestaat-niet' });
    expect(
      (await put(cookie, { baseRevision: 0, viewers: ['programmagroei', 'programmagroei'], admins: ['beheer'] })).json,
    ).toMatchObject({ error: 'DUPLICATE' });
    expect((await put(cookie, { baseRevision: 0, viewers: ['a b c'], admins: ['beheer'] })).json).toMatchObject({
      error: 'UNPARSEABLE',
    });
  });

  it('is refused to a viewer', async () => {
    determine.mockResolvedValue('read');
    const r = await put(http.newSession({ displayName: 'Vera' }), { baseRevision: 0, viewers: ['x'], admins: ['y'] });
    expect(r.status).toBe(403);
  });
});

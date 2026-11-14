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
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { FakeAlkemio, gqlError } from '../testing/fake-alkemio.js';

const alkemio = new FakeAlkemio();
vi.mock('dotenv', () => ({ default: { config: () => ({}) } }));
vi.mock('../access/determine.js', () => ({ determineLevel: vi.fn() }));
vi.mock('../graphql/client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../graphql/client.js')>()),
  createAlkemioSdk: vi.fn(async () => alkemio.sdk()),
}));

import { createApp } from '../app.js';
import { getDatabase, initDatabase } from '../cache/db.js';
import { GD_CACHE_SPACE_ID, getCacheEntry, setCacheEntry } from '../cache/cache-service.js';
import { initSettingsStore } from '../settings/db.js';
import { seedIfEmpty } from '../settings/seed.js';
import { getScope, setSpaceId } from '../settings/store.js';
import { determineLevel } from '../access/determine.js';
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
    ['GET', '/api/vng/admin/included-spaces/history'],
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
      classificationStatus: null,
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
    const h = await http.call('vng', '/api/vng/admin/included-spaces/history?limit=1', { cookie });
    expect(h.json.changes[0]).toMatchObject({ kind: 'rename', note: 'renamed gdc→gdc-nieuw' });
    expect(h.json.next).toBe(2);
    const older = await http.call('vng', '/api/vng/admin/included-spaces/history?limit=1&before=2', { cookie });
    expect(older.json.changes[0]).toMatchObject({ kind: 'seed' });
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
});

describe('GET /gd-source (US6)', () => {
  it('reports unavailable, with no counts, when the GD space cannot be read', async () => {
    const r = await http.call('vng', '/api/vng/admin/gd-source', { cookie: asManager() });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ available: false, total: 0, initiatives: [] });
    expect(r.json.error).toMatch(/GD_SPACE_UNREADABLE|LOAD_FAILED/);
  });
});

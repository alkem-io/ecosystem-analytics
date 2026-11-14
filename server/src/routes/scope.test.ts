/** Feature 027 — `GET /api/vng/scope` over real HTTP (contracts/api-admin.md §1). */
process.env.DB_PATH = ':memory:';
process.env.EXPLORER_ACCESS_GATE = 'none';
process.env.VNG_ACCESS_GATE = 'programmagroei';
process.env.GOVTECH_ACCESS_GATE = 'none';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

vi.mock('dotenv', () => ({ default: { config: () => ({}) } }));
vi.mock('../access/determine.js', () => ({ determineLevel: vi.fn() }));
vi.mock('../graphql/client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../graphql/client.js')>()),
  createAlkemioSdk: vi.fn(async () => {
    throw new Error('Alkemio is not reachable from tests');
  }),
}));

import { createApp } from '../app.js';
import { initDatabase } from '../cache/db.js';
import { initSettingsStore } from '../settings/db.js';
import { seedIfEmpty } from '../settings/seed.js';
import { determineLevel } from '../access/determine.js';
import { createAlkemioSdk } from '../graphql/client.js';
import { HttpHarness } from '../testing/http-harness.js';

const determine = vi.mocked(determineLevel);
const http = new HttpHarness();

beforeAll(async () => {
  initDatabase();
  seedIfEmpty((initDatabase(), initSettingsStore()), {
    version: 1,
    ecosystemKey: 'vih-test',
    includedSpaces: ['signalen', 'gdc'],
  });
  await http.listen('vng', createApp('vng', '../nowhere'));
  await http.listen('explorer', createApp('explorer', '../nowhere'));
});
afterAll(() => http.close());
beforeEach(() => determine.mockReset());

describe('GET /api/vng/scope', () => {
  it('answers 401 without a session', async () => {
    expect((await http.call('vng', '/api/vng/scope')).status).toBe(401);
  });

  it('refuses a person without access with 403, also through the Explorer listener', async () => {
    determine.mockResolvedValue('none');
    const cookie = http.newSession();
    for (const listener of ['vng', 'explorer']) {
      const r = await http.call(listener, '/api/vng/scope', { cookie });
      expect(r.status).toBe(403);
      expect(r.json).toMatchObject({ error: 'ACCESS_DENIED', app: 'vng' });
    }
  });

  it('gives a viewer the seeded list, without calling Alkemio', async () => {
    determine.mockResolvedValue('read');
    vi.mocked(createAlkemioSdk).mockClear();
    const r = await http.call('vng', '/api/vng/scope', { cookie: http.newSession() });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ revision: 1, ecosystemKey: 'vih-test', spaceNameIds: ['signalen', 'gdc'] });
    expect(createAlkemioSdk).not.toHaveBeenCalled();
  });
});

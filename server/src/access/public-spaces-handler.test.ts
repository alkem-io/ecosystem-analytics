/** Feature 027 — `GET /api/auth/access/spaces` over real HTTP (contracts/api-access-sets.md §1). */
process.env.DB_PATH = ':memory:';
process.env.EXPLORER_ACCESS_GATE = 'none';
process.env.VNG_ACCESS_GATE = 'programmagroei, programmagroei/landelijkinnovatiemonitor';
process.env.VNG_ACCESS_GATE_NAME = 'Kenniscentrum Innovatie';
process.env.VNG_ACCESS_GATE_NAMES = '';
process.env.VNG_ADMIN_GATE = 'beheerders';
process.env.GOVTECH_ACCESS_GATE = 'none';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

vi.mock('dotenv', () => ({ default: { config: () => ({}) } }));
vi.mock('./determine.js', () => ({ determineLevel: vi.fn() }));

import { createApp } from '../app.js';
import { initDatabase } from '../cache/db.js';
import { determineLevel } from './determine.js';
import { probeGate, resetGateInfo, type ProbeSdk } from './probe.js';
import { HttpHarness } from '../testing/http-harness.js';

const http = new HttpHarness();

beforeAll(async () => {
  initDatabase();
  await http.listen('vng', createApp('vng', '../nowhere'));
  await http.listen('explorer', createApp('explorer', '../nowhere'));
});
afterAll(() => http.close());
beforeEach(() => {
  resetGateInfo();
  vi.mocked(determineLevel).mockReset();
});

describe('GET /api/auth/access/spaces', () => {
  it('works without a session and lists only the viewer Spaces of the VNG listener', async () => {
    const r = await http.call('vng', '/api/auth/access/spaces');
    expect(r.status).toBe(200);
    expect(r.json).toEqual({
      app: 'vng',
      gated: true,
      spaces: [
        {
          key: 'programmagroei',
          displayName: 'Kenniscentrum Innovatie',
          url: 'https://alkem.io/programmagroei',
        },
        {
          // No configured name and no probe yet: the last path segment.
          key: 'programmagroei/landelijkinnovatiemonitor',
          displayName: 'landelijkinnovatiemonitor',
          url: 'https://alkem.io/programmagroei/challenges/landelijkinnovatiemonitor',
        },
      ],
    });
    expect(JSON.stringify(r.json)).not.toContain('beheerders');
  });

  it('uses the probe’s public name once it is known', async () => {
    const sdk = {
      accessGateProbeL0: async () => ({
        data: {
          lookupByName: {
            space: { id: 'x', about: { profile: { displayName: 'Programma Groei', url: 'https://alkem.io/programmagroei' } } },
          },
        },
      }),
    } as unknown as ProbeSdk;
    await probeGate({ path: ['programmagroei'], key: 'programmagroei' }, '', {
      sdk,
      alkemioServerUrl: 'https://alkem.io',
    });
    const r = await http.call('vng', '/api/auth/access/spaces');
    expect(r.json.spaces[0].displayName).toBe('Programma Groei');
  });

  it('reports an ungated listener with no Spaces', async () => {
    const r = await http.call('explorer', '/api/auth/access/spaces');
    expect(r.json).toEqual({ app: 'explorer', gated: false, spaces: [] });
  });

  it('is never gated, even for a session whose holder is refused', async () => {
    vi.mocked(determineLevel).mockResolvedValue('none');
    const cookie = http.newSession();
    expect((await http.call('vng', '/api/vng/scope', { cookie })).status).toBe(403);
    const r = await http.call('vng', '/api/auth/access/spaces', { cookie });
    expect(r.status).toBe(200);
    expect(r.json.spaces).toHaveLength(2);
  });
});

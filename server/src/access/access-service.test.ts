process.env.DB_PATH = ':memory:';
process.env.EXPLORER_ACCESS_GATE = 'none';
process.env.VNG_ACCESS_GATE = 'programmagroei/landelijkinnovatiemonitor';
process.env.GOVTECH_ACCESS_GATE = 'govtechspace/govgate';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('dotenv', () => ({ default: { config: () => ({}) } }));
vi.mock('./determine.js', () => ({ determineLevel: vi.fn() }));

import { initDatabase } from '../cache/db.js';
import { determineLevel } from './determine.js';
import { decide, policyFor, report } from './access-service.js';
import { getDecision } from './decision-store.js';
import { probeGate, resetGateInfo, type ProbeSdk } from './probe.js';
import type { AuthContext } from '../auth/middleware.js';

const determine = vi.mocked(determineLevel);
const LIM_KEY = 'programmagroei/landelijkinnovatiemonitor';
const auth = (sessionId: string, userId = 'u1') =>
  ({ userId, session: { sessionId } }) as unknown as AuthContext;

beforeEach(() => {
  initDatabase();
  resetGateInfo();
  determine.mockReset();
});

describe('policyFor', () => {
  it('reads each app policy from config, requiring Read when gated', () => {
    expect(policyFor('explorer')).toEqual({ app: 'explorer', gate: null });
    expect(policyFor('vng')).toEqual({
      app: 'vng',
      gate: { path: ['programmagroei', 'landelijkinnovatiemonitor'], key: LIM_KEY },
      required: 'read',
    });
  });
});

describe('decide', () => {
  it('never calls Alkemio for an ungated app', async () => {
    expect(await decide(auth('s1'), 'explorer')).toBe('read');
    expect(determine).not.toHaveBeenCalled();
  });

  it('decides once per session and app, then reuses the held decision (FR-006)', async () => {
    determine.mockResolvedValue('read');
    expect(await decide(auth('s1'), 'vng')).toBe('read');
    expect(await decide(auth('s1'), 'vng')).toBe('read');
    expect(determine).toHaveBeenCalledTimes(1);
    expect(getDecision('s1', 'vng', LIM_KEY)?.level).toBe('read');
  });

  it('asks Alkemio once for a burst of parallel first requests', async () => {
    let release!: (v: 'read') => void;
    determine.mockReturnValue(new Promise((r) => (release = r)));
    const all = Promise.all([
      decide(auth('s1'), 'vng'),
      decide(auth('s1'), 'vng'),
      decide(auth('s1'), 'vng'),
    ]);
    release('read');
    expect(await all).toEqual(['read', 'read', 'read']);
    expect(determine).toHaveBeenCalledTimes(1);
  });

  it('holds a refusal too, but `force` re-decides and replaces it', async () => {
    determine.mockResolvedValueOnce('none').mockResolvedValueOnce('read');
    expect(await decide(auth('s1'), 'vng')).toBe('none');
    expect(await decide(auth('s1'), 'vng')).toBe('none');
    expect(await decide(auth('s1'), 'vng', { force: true })).toBe('read');
    expect(getDecision('s1', 'vng', LIM_KEY)?.level).toBe('read');
    expect(determine).toHaveBeenCalledTimes(2);
  });

  it('never holds "could not verify": the next request asks again', async () => {
    determine.mockResolvedValueOnce('unverified').mockResolvedValueOnce('read');
    expect(await decide(auth('s1'), 'vng')).toBe('unverified');
    expect(getDecision('s1', 'vng', LIM_KEY)).toBeNull();
    expect(await decide(auth('s1'), 'vng')).toBe('read');
  });

  it('keeps sessions and applications independent (FR-003a)', async () => {
    determine
      .mockResolvedValueOnce('none')
      .mockResolvedValueOnce('read')
      .mockResolvedValueOnce('manage');
    expect(await decide(auth('s1'), 'vng')).toBe('none');
    expect(await decide(auth('s1'), 'govtech')).toBe('read');
    expect(await decide(auth('s2', 'u2'), 'vng')).toBe('manage');
  });

  it('passes what the probe learnt about the gate to the check', async () => {
    const sdk = {
      accessGateProbeL1: async () => ({
        data: { lookupByName: { space: { id: 'l0', subspaceByNameID: null } } },
      }),
    } as unknown as ProbeSdk;
    await probeGate('vng', policyFor('vng').gate!, '', {
      sdk,
      alkemioServerUrl: 'https://alkem.io',
    });
    determine.mockResolvedValue('unverified');
    await decide(auth('s1'), 'vng');
    expect(determine.mock.calls[0][2]).toBe('no');
  });

  it('propagates an Alkemio auth error', async () => {
    const err = new Error('unauthenticated');
    determine.mockRejectedValue(err);
    await expect(decide(auth('s1'), 'vng')).rejects.toBe(err);
  });
});

describe('report', () => {
  it('reports an ungated app as admitted with no gate', async () => {
    expect(await report(auth('s1'), 'explorer')).toEqual({
      app: 'explorer',
      status: 'admitted',
      level: 'read',
      gated: false,
      gate: null,
    });
  });

  it('reports each outcome of a gated app with the gate name and link', async () => {
    const gate = {
      displayName: 'Landelijk Innovatie Monitor',
      url: 'https://alkem.io/programmagroei/challenges/landelijkinnovatiemonitor',
    };
    determine.mockResolvedValueOnce('manage');
    expect(await report(auth('a'), 'vng')).toEqual({
      app: 'vng',
      status: 'admitted',
      level: 'manage',
      gated: true,
      gate,
    });
    determine.mockResolvedValueOnce('read');
    expect((await report(auth('b'), 'vng')).level).toBe('read');
    determine.mockResolvedValueOnce('none');
    expect(await report(auth('c'), 'vng')).toEqual({
      app: 'vng',
      status: 'none',
      level: 'none',
      gated: true,
      gate,
    });
    determine.mockResolvedValueOnce('unverified');
    expect(await report(auth('d'), 'vng')).toEqual({
      app: 'vng',
      status: 'unverified',
      level: null,
      gated: true,
      gate,
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getGateInfo, probeGate, resetGateInfo, type ProbeSdk } from './probe.js';
import { getLogger } from '../logging/logger.js';
import type { GateRef } from './policy.js';

const LIM: GateRef = {
  path: ['programmagroei', 'landelijkinnovatiemonitor'],
  key: 'programmagroei/landelijkinnovatiemonitor',
};
const SERVER = 'https://alkem.io';

function node(over: { name?: string; url?: string } = {}) {
  return {
    id: 'gate',
    about: {
      profile: {
        displayName: over.name ?? 'Landelijk Innovatie Monitor',
        url: over.url ?? 'https://alkem.io/programmagroei/challenges/landelijkinnovatiemonitor',
      },
    },
  };
}

function sdkResolving(gate: ReturnType<typeof node> | null): ProbeSdk {
  const l1 = vi.fn(async () => ({
    data: { lookupByName: { space: { id: 'l0', subspaceByNameID: gate } } },
  }));
  return {
    accessGateProbeL0: vi.fn(),
    accessGateProbeL1: l1,
    accessGateProbeL2: vi.fn(),
  } as unknown as ProbeSdk;
}

function sdkRejecting(err: unknown): ProbeSdk {
  const fail = vi.fn(async () => {
    throw err;
  });
  return {
    accessGateProbeL0: fail,
    accessGateProbeL1: fail,
    accessGateProbeL2: fail,
  } as unknown as ProbeSdk;
}

const gqlError = (code: string) =>
  Object.assign(new Error(code), {
    response: { status: 200, errors: [{ message: code, extensions: { code } }] },
  });

const probe = (sdk: ProbeSdk, fallback = '') =>
  probeGate('vng', LIM, fallback, { sdk, alkemioServerUrl: SERVER });

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetGateInfo();
  warn = vi.spyOn(getLogger(), 'warn').mockImplementation(() => getLogger());
  error = vi.spyOn(getLogger(), 'error').mockImplementation(() => getLogger());
});
afterEach(() => vi.restoreAllMocks());

describe('probeGate', () => {
  it('records the public name and link of the gate, with no warning — public or not', async () => {
    const info = await probe(sdkResolving(node()));
    expect(info).toEqual({
      displayName: 'Landelijk Innovatie Monitor',
      url: 'https://alkem.io/programmagroei/challenges/landelijkinnovatiemonitor',
      exists: 'yes',
    });
    expect(getGateInfo('vng')).toEqual(info);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('treats an anonymous FORBIDDEN as "exists, private" and uses the fallback name', async () => {
    const info = await probe(sdkRejecting(gqlError('FORBIDDEN_POLICY')), 'LIM');
    expect(info).toEqual({
      displayName: 'LIM',
      url: 'https://alkem.io/programmagroei/challenges/landelijkinnovatiemonitor',
      exists: 'yes',
    });
    expect(error).not.toHaveBeenCalled();
  });

  it('logs an operator error when the gate does not exist', async () => {
    expect((await probe(sdkResolving(null))).exists).toBe('no');
    expect(error).toHaveBeenCalledTimes(1);
    error.mockClear();
    expect((await probe(sdkRejecting(gqlError('ENTITY_NOT_FOUND')))).exists).toBe('no');
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('falls back to config, then the nameID, when Alkemio is unreachable', async () => {
    const withName = await probe(
      sdkRejecting(new TypeError('fetch failed')),
      'Landelijk Innovatie Monitor',
    );
    expect(withName).toEqual({
      displayName: 'Landelijk Innovatie Monitor',
      url: 'https://alkem.io/programmagroei/challenges/landelijkinnovatiemonitor',
      exists: 'unknown',
    });
    const bare = await probe(sdkRejecting(new TypeError('fetch failed')));
    expect(bare.displayName).toBe('landelijkinnovatiemonitor');
    expect(warn).toHaveBeenCalled();
  });

  it('builds the URL from the server URL when Alkemio returns none', async () => {
    const info = await probe(sdkResolving(node({ url: '' })));
    expect(info.url).toBe('https://alkem.io/programmagroei/challenges/landelijkinnovatiemonitor');
  });
});

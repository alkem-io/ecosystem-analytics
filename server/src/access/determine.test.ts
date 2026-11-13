import { describe, it, expect, vi } from 'vitest';
import { determineLevel, type GateSdk } from './determine.js';
import type { GateRef } from './policy.js';
import type { AuthContext } from '../auth/middleware.js';

const AUTH = { userId: 'u1', session: { sessionId: 's1' } } as unknown as AuthContext;
const L0: GateRef = { path: ['programmagroei'], key: 'programmagroei' };
const L1: GateRef = {
  path: ['programmagroei', 'landelijkinnovatiemonitor'],
  key: 'programmagroei/landelijkinnovatiemonitor',
};
const L2: GateRef = { path: ['a1', 'b2', 'c3'], key: 'a1/b2/c3' };

const gate = (roles: string[] | undefined) => ({
  id: 'gate',
  community: roles ? { roleSet: { myRoles: roles } } : undefined,
});

/** A fake SDK whose three queries resolve the given gate node at every depth. */
function sdkResolving(node: ReturnType<typeof gate> | null | undefined): GateSdk {
  return {
    accessGateL0: vi.fn(async () => ({ data: { lookupByName: { space: node } } })),
    accessGateL1: vi.fn(async () => ({
      data: { lookupByName: { space: { id: 'l0', subspaceByNameID: node } } },
    })),
    accessGateL2: vi.fn(async () => ({
      data: {
        lookupByName: {
          space: { id: 'l0', subspaceByNameID: { id: 'l1', subspaceByNameID: node } },
        },
      },
    })),
  } as unknown as GateSdk;
}

/** A fake SDK whose every query rejects with `err`. */
function sdkRejecting(err: unknown): GateSdk {
  const fail = vi.fn(async () => {
    throw err;
  });
  return { accessGateL0: fail, accessGateL1: fail, accessGateL2: fail } as unknown as GateSdk;
}

/** The shape graphql-request's ClientError carries. */
function graphqlError(code: string, message = 'boom', status = 200) {
  return Object.assign(new Error(message), {
    response: { status, errors: [{ message, extensions: { code } }] },
  });
}

const run = (sdk: GateSdk, ref: GateRef = L1, exists: 'yes' | 'no' | 'unknown' = 'yes') =>
  determineLevel(AUTH, ref, exists, { sdkFor: async () => sdk, timeoutMs: 5000 });

describe('determineLevel — roles returned', () => {
  it('maps the person’s roles on the gate Space to a level', async () => {
    expect(await run(sdkResolving(gate(['MEMBER'])))).toBe('read');
    expect(await run(sdkResolving(gate(['MEMBER', 'ADMIN'])))).toBe('manage');
    expect(await run(sdkResolving(gate(['LEAD'])))).toBe('none');
    expect(await run(sdkResolving(gate(undefined)))).toBe('none');
  });

  it('queries at the depth of the gate', async () => {
    const sdk = sdkResolving(gate(['MEMBER']));
    await run(sdk, L0);
    await run(sdk, L1);
    await run(sdk, L2);
    expect(sdk.accessGateL0).toHaveBeenCalledWith({ space: 'programmagroei' });
    expect(sdk.accessGateL1).toHaveBeenCalledWith({
      space: 'programmagroei',
      sub: 'landelijkinnovatiemonitor',
    });
    expect(sdk.accessGateL2).toHaveBeenCalledWith({ space: 'a1', sub: 'b2', subsub: 'c3' });
  });
});

describe('determineLevel — the person cannot see the gate', () => {
  it('is none when the gate comes back null and the probe found the gate', async () => {
    expect(await run(sdkResolving(null))).toBe('none');
    expect(await run(sdkResolving(undefined), L0)).toBe('none');
  });

  it('is none on a FORBIDDEN / ENTITY_NOT_FOUND error when the probe found the gate', async () => {
    expect(await run(sdkRejecting(graphqlError('FORBIDDEN_POLICY')))).toBe('none');
    expect(await run(sdkRejecting(graphqlError('FORBIDDEN')))).toBe('none');
    expect(await run(sdkRejecting(graphqlError('ENTITY_NOT_FOUND')))).toBe('none');
    expect(
      await run(
        sdkRejecting(
          graphqlError('', "User (x) does not have credentials that grant 'read' access"),
        ),
      ),
    ).toBe('none');
  });

  it('does NOT mistake a refusal for an expired session (no sign-in loop)', async () => {
    // Message mentions "authorization" but the code says forbidden → still `none`.
    await expect(
      run(sdkRejecting(graphqlError('FORBIDDEN_POLICY', 'Authorization: unable to read space'))),
    ).resolves.toBe('none');
  });

  it('is unverified when the probe never confirmed the gate exists', async () => {
    expect(await run(sdkResolving(null), L1, 'unknown')).toBe('unverified');
    expect(await run(sdkResolving(null), L1, 'no')).toBe('unverified');
    expect(await run(sdkRejecting(graphqlError('ENTITY_NOT_FOUND')), L1, 'unknown')).toBe(
      'unverified',
    );
  });
});

describe('determineLevel — session or transport problems', () => {
  it('rethrows an Alkemio auth error so the caller invalidates the session', async () => {
    const unauth = graphqlError('UNAUTHENTICATED', 'not authenticated');
    await expect(run(sdkRejecting(unauth))).rejects.toBe(unauth);
    const http401 = Object.assign(new Error('401'), { response: { status: 401 } });
    await expect(run(sdkRejecting(http401))).rejects.toBe(http401);
  });

  it('fails closed as unverified on a network error, timeout or 5xx', async () => {
    expect(await run(sdkRejecting(new TypeError('fetch failed')))).toBe('unverified');
    expect(await run(sdkRejecting(new DOMException('timed out', 'TimeoutError')))).toBe(
      'unverified',
    );
    expect(
      await run(sdkRejecting(Object.assign(new Error('502'), { response: { status: 502 } }))),
    ).toBe('unverified');
    expect(await run(sdkRejecting(graphqlError('INTERNAL_SERVER_ERROR')))).toBe('unverified');
  });

  it('fails closed when even building the client fails', async () => {
    const outcome = await determineLevel(AUTH, L1, 'yes', {
      sdkFor: async () => {
        throw new Error('decrypt failed');
      },
      timeoutMs: 5000,
    });
    expect(outcome).toBe('unverified');
  });
});

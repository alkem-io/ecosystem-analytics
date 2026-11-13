import { createAnonymousAlkemioSdk } from '../graphql/client.js';
import type { Sdk } from '../graphql/generated/graphql.js';
import { getLogger } from '../logging/logger.js';
import { gateUrlPath, type AppId, type GateRef } from './policy.js';
import type { GateExistence } from './determine.js';

/** The slice of the typed SDK the anonymous probe uses. */
export type ProbeSdk = Pick<Sdk, 'accessGateProbeL0' | 'accessGateProbeL1' | 'accessGateProbeL2'>;

/**
 * What the BFF knows about a gate Space independently of any viewer (research R6):
 * the name and link shown on the "no access" page — which a refused person usually
 * cannot read for themselves — and whether the gate exists (FR-020).
 */
export interface GateInfo {
  displayName: string;
  url: string;
  exists: GateExistence;
}

export interface ProbeDeps {
  sdk?: ProbeSdk;
  alkemioServerUrl: string;
  timeoutMs?: number;
}

const registry = new Map<AppId, GateInfo>();

/** The last probe result for an application's gate (undefined for an ungated app). */
export function getGateInfo(app: AppId): GateInfo | undefined {
  return registry.get(app);
}

/** Test helper — forget every probe result. */
export function resetGateInfo(): void {
  registry.clear();
}

interface ProbeNode {
  about?: { profile?: { displayName?: string; url?: string } } | null;
}

/**
 * Read the gate Space ANONYMOUSLY (no token, no user data) and record what was found:
 *
 * - found → its public name/link
 * - anonymous FORBIDDEN → it exists but is private
 * - null / NOT_FOUND → operator error: every check will be "could not verify"
 * - unreachable → `unknown`; name/link from config, then the nameID (caller retries)
 */
export async function probeGate(
  app: AppId,
  gate: GateRef,
  displayNameFallback: string,
  deps: ProbeDeps,
): Promise<GateInfo> {
  const log = getLogger();
  const fallbackName = displayNameFallback || gate.path[gate.path.length - 1];
  const derivedUrl = `${deps.alkemioServerUrl.replace(/\/+$/, '')}${gateUrlPath(gate)}`;
  const label = `${app}: gate '${gate.key}'`;
  let info: GateInfo;

  try {
    const sdk = deps.sdk ?? createAnonymousAlkemioSdk({ timeoutMs: deps.timeoutMs });
    const node = await queryProbe(sdk, gate);
    info = node
      ? {
          displayName: node.about?.profile?.displayName || fallbackName,
          url: node.about?.profile?.url || derivedUrl,
          exists: 'yes',
        }
      : { displayName: fallbackName, url: derivedUrl, exists: 'no' };
  } catch (err) {
    const code = errorCode(err);
    if (/FORBIDDEN/i.test(code)) {
      info = { displayName: fallbackName, url: derivedUrl, exists: 'yes' };
    } else if (/NOT_FOUND/i.test(code)) {
      info = { displayName: fallbackName, url: derivedUrl, exists: 'no' };
    } else {
      info = { displayName: fallbackName, url: derivedUrl, exists: 'unknown' };
      log.warn(`${label} could not be probed (${(err as Error).message}); will retry`, {
        context: 'Access',
      });
    }
  }

  if (info.exists === 'no') {
    log.error(
      `${label} was NOT FOUND on Alkemio. Nobody can be admitted to ${app} — check access.${app}.`,
      { context: 'Access' },
    );
  }

  registry.set(app, info);
  return info;
}

async function queryProbe(sdk: ProbeSdk, gate: GateRef): Promise<ProbeNode | null | undefined> {
  const [space, sub, subsub] = gate.path;
  switch (gate.path.length) {
    case 1:
      return (await sdk.accessGateProbeL0({ space })).data.lookupByName.space;
    case 2:
      return (await sdk.accessGateProbeL1({ space, sub })).data.lookupByName.space
        ?.subspaceByNameID;
    case 3:
      return (await sdk.accessGateProbeL2({ space, sub, subsub })).data.lookupByName.space
        ?.subspaceByNameID?.subspaceByNameID;
    default:
      throw new Error(`gate depth ${gate.path.length} is not supported`);
  }
}

function errorCode(err: unknown): string {
  const errors = (err as { response?: { errors?: Array<{ extensions?: { code?: string } }> } })
    ?.response?.errors;
  return (errors ?? []).map((e) => e?.extensions?.code ?? '').join(' ');
}

const RETRY_MS = 60_000;

/**
 * Probe every gated application's gate at start-up, without blocking the listeners;
 * retry every 60 s while Alkemio is unreachable (`exists === 'unknown'`).
 */
export function startGateProbes(
  gates: Array<{ app: AppId; gate: GateRef; displayNameFallback: string }>,
  deps: Omit<ProbeDeps, 'sdk'>,
): void {
  for (const { app, gate, displayNameFallback } of gates) {
    const attempt = (): void => {
      void probeGate(app, gate, displayNameFallback, deps).then((info) => {
        if (info.exists === 'unknown') setTimeout(attempt, RETRY_MS).unref();
      });
    };
    attempt();
  }
}

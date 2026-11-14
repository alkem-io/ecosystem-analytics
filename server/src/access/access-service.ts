import type { AuthContext } from '../auth/middleware.js';
import { loadConfig } from '../config.js';
import { getLogger } from '../logging/logger.js';
import type { AccessReport, GateLink } from '../types/access.js';
import { determineLevel, type DetermineOutcome } from './determine.js';
import { clearDecision, getDecision, putDecision } from './decision-store.js';
import { gateUrlPath, type AccessPolicy, type AppId, type GateRef } from './policy.js';
import { getGateInfo } from './probe.js';

/**
 * The one place access is decided (FR-018a). Each application's base policy comes
 * from `access.<app>` and requires Read; a route may declare a stricter policy
 * (e.g. the management area, `required: 'manage'`) and is judged by the SAME held
 * decision — a decision records the level, not a yes/no.
 */
export function policyFor(app: AppId): AccessPolicy {
  const sets = loadConfig().access.apps[app].sets;
  return sets ? { app, gate: sets, required: 'read' } : { app, gate: null };
}

/**
 * A Space as shown to people (feature 027): the probe's public name and link, else the
 * configured fallback name, else the last path segment, and a link built from the server
 * URL. Never per-person data.
 */
export function gateLink(ref: GateRef, fallbackName = ''): GateLink {
  const info = getGateInfo(ref.key);
  return {
    key: ref.key,
    displayName: info?.displayName || fallbackName || ref.path[ref.path.length - 1],
    url: info?.url || `${loadConfig().alkemioServerUrl.replace(/\/+$/, '')}${gateUrlPath(ref)}`,
    exists: info?.exists ?? 'unknown',
  };
}

/** An application's viewer Spaces as links, with the configured names by position. */
export function viewerLinks(app: AppId): GateLink[] {
  const { sets, displayNames } = loadConfig().access.apps[app];
  return (sets?.viewers ?? []).map((ref, i) => gateLink(ref, displayNames[i]));
}

/** An application's admin Spaces as links (only the admin API shows these). */
export function adminLinks(app: AppId): GateLink[] {
  const { sets, displayNames } = loadConfig().access.apps[app];
  return (sets?.admins ?? []).map((ref) => {
    const asViewer = sets?.viewers.findIndex((v) => v.key === ref.key) ?? -1;
    return gateLink(ref, asViewer >= 0 ? displayNames[asViewer] : '');
  });
}

/** In-flight checks, so a burst of parallel first requests asks Alkemio once. */
const inFlight = new Map<string, Promise<DetermineOutcome>>();

/**
 * The person's access level for `app` in this session (FR-006):
 * - ungated → `read` (no Alkemio call);
 * - otherwise the held decision, unless `force` ("check again") or none is held;
 * - a fresh check is held for the rest of the session — except "could not verify",
 *   which is never held so the next request tries again.
 * An Alkemio auth error propagates (the caller invalidates the session).
 */
export async function decide(
  auth: AuthContext,
  app: AppId,
  opts: { force?: boolean } = {},
): Promise<DetermineOutcome> {
  const policy = policyFor(app);
  if (policy.gate === null) return 'read';
  const sets = policy.gate;
  const sessionId = auth.session.sessionId;

  if (opts.force) {
    clearDecision(sessionId, app);
  } else {
    const held = getDecision(sessionId, app, sets.setKey);
    if (held) return held.level;
  }

  const flightKey = `${sessionId}\u0000${app}`;
  const pending = inFlight.get(flightKey);
  if (pending) return pending;

  const check = (async () => {
    const existsFor = (key: string) => getGateInfo(key)?.exists ?? 'unknown';
    const outcome = await determineLevel(auth, sets, existsFor, {
      timeoutMs: loadConfig().access.checkTimeoutMs,
    });
    if (outcome !== 'unverified') putDecision(sessionId, app, sets.setKey, outcome);
    if (outcome === 'none' || outcome === 'unverified') {
      // FR-019: who, which app, what — never a token, session id or cookie.
      getLogger().info(
        `${app}: user ${auth.userId} ${outcome === 'none' ? 'has no access' : 'could not be verified'}`,
        {
          context: 'Access',
        },
      );
    }
    return outcome;
  })();

  inFlight.set(flightKey, check);
  try {
    return await check;
  } finally {
    inFlight.delete(flightKey);
  }
}

/** Turn an outcome into what the frontends render (contracts/api-access-sets.md §2). */
export function reportFor(app: AppId, outcome: DetermineOutcome): AccessReport {
  const policy = policyFor(app);
  if (policy.gate === null) {
    return { app, status: 'admitted', level: 'read', gated: false, viewerSpaces: [] };
  }
  const viewerSpaces = viewerLinks(app);
  if (outcome === 'unverified') {
    return { app, status: 'unverified', level: null, gated: true, viewerSpaces };
  }
  return {
    app,
    status: outcome === 'none' ? 'none' : 'admitted',
    level: outcome,
    gated: true,
    viewerSpaces,
  };
}

/** Decide (or reuse the held decision) and report it. */
export async function report(
  auth: AuthContext,
  app: AppId,
  opts: { force?: boolean } = {},
): Promise<AccessReport> {
  return reportFor(app, await decide(auth, app, opts));
}

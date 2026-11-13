import type { AuthContext } from '../auth/middleware.js';
import { loadConfig } from '../config.js';
import { getLogger } from '../logging/logger.js';
import type { AccessReport } from '../types/access.js';
import { determineLevel, type DetermineOutcome } from './determine.js';
import { clearDecision, getDecision, putDecision } from './decision-store.js';
import { gateUrlPath, type AccessPolicy, type AppId } from './policy.js';
import { getGateInfo } from './probe.js';

/**
 * The one place access is decided (FR-018a). Each application's base policy comes
 * from `access.<app>` and requires Read; a route may declare a stricter policy
 * (e.g. the management area, `required: 'manage'`) and is judged by the SAME held
 * decision — a decision records the level, not a yes/no.
 */
export function policyFor(app: AppId): AccessPolicy {
  const gate = loadConfig().access.apps[app].gate;
  return gate ? { app, gate, required: 'read' } : { app, gate: null };
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
  const gate = policy.gate;
  const sessionId = auth.session.sessionId;

  if (opts.force) {
    clearDecision(sessionId, app);
  } else {
    const held = getDecision(sessionId, app, gate.key);
    if (held) return held.level;
  }

  const flightKey = `${sessionId}\u0000${app}`;
  const pending = inFlight.get(flightKey);
  if (pending) return pending;

  const check = (async () => {
    const exists = getGateInfo(app)?.exists ?? 'unknown';
    const outcome = await determineLevel(auth, gate, exists, {
      timeoutMs: loadConfig().access.checkTimeoutMs,
    });
    if (outcome !== 'unverified') putDecision(sessionId, app, gate.key, outcome);
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

/** Turn an outcome into what the frontends render (contracts/api-access.md §1). */
export function reportFor(app: AppId, outcome: DetermineOutcome): AccessReport {
  const policy = policyFor(app);
  if (policy.gate === null) {
    return { app, status: 'admitted', level: 'read', gated: false, gate: null };
  }
  const info = getGateInfo(app);
  const fallback = loadConfig().access.apps[app].displayNameFallback;
  const gate = {
    displayName: info?.displayName || fallback || policy.gate.path[policy.gate.path.length - 1],
    url:
      info?.url ||
      `${loadConfig().alkemioServerUrl.replace(/\/+$/, '')}${gateUrlPath(policy.gate)}`,
  };
  if (outcome === 'unverified') {
    return { app, status: 'unverified', level: null, gated: true, gate };
  }
  return {
    app,
    status: outcome === 'none' ? 'none' : 'admitted',
    level: outcome,
    gated: true,
    gate,
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

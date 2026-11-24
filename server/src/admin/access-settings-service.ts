import type { AuthContext } from '../auth/middleware.js';
import { loadConfig } from '../config.js';
import { adminLinks, viewerLinks } from '../access/access-service.js';
import { determineLevel } from '../access/determine.js';
import { effectiveAccess } from '../access/effective-sets.js';
import { parseGateRef, setKey, type GateRef } from '../access/policy.js';
import { probeGate } from '../access/probe.js';
import { AccessConflictError, saveAccess, type StoredSpace } from '../settings/access-store.js';
import type { Actor } from '../settings/store.js';
import type { AdminAccessView } from '../types/admin.js';
import { AdminRequestError } from './space-search-service.js';

/** More than this per set is a configuration mistake, not a policy. */
const MAX_PER_SET = 10;

/** The "Toegang" tab (feature 027): who may view and manage, and whether that is editable here. */
export function accessView(me: AdminAccessView['me']): AdminAccessView {
  const eff = effectiveAccess('vng');
  return {
    viewers: viewerLinks('vng'),
    admins: adminLinks('vng'),
    me,
    // An app the deployment left ungated (`none`) cannot be gated from here.
    editable: eff.sets !== null,
    source: eff.source,
    revision: eff.revision,
    updatedAt: eff.updatedAt,
    updatedByName: eff.updatedByName,
  };
}

export interface AccessSettingsInput {
  baseRevision: number;
  /** Space paths (`space`, `space/subspace`) or Alkemio Space links. */
  viewers: string[];
  admins: string[];
}

/** Parse, de-duplicate-check and bound one set; refuse with the offending item. */
function parseSet(role: 'viewers' | 'admins', items: unknown): GateRef[] {
  if (!Array.isArray(items)) throw new AdminRequestError(400, 'INVALID_BODY');
  if (items.length === 0) throw new AdminRequestError(422, 'EMPTY_SET', { role });
  if (items.length > MAX_PER_SET) throw new AdminRequestError(422, 'TOO_MANY', { role, max: MAX_PER_SET });
  const refs: GateRef[] = [];
  for (const item of items) {
    let ref: GateRef | null = null;
    try {
      ref = typeof item === 'string' ? parseGateRef(item.trim()) : null;
    } catch {
      ref = null; // not a valid Alkemio nameID / link
    }
    if (!ref) throw new AdminRequestError(422, 'UNPARSEABLE', { role, item: String(item) });
    if (refs.some((r) => r.key === ref.key)) throw new AdminRequestError(422, 'DUPLICATE', { role, item: ref.key });
    refs.push(ref);
  }
  return refs;
}

/**
 * `PUT /api/vng/admin/access` — replace who may view and who may manage the monitor.
 *
 * Every Space must exist on Alkemio (checked anonymously, as at start-up, which also
 * records its public name and link for the sign-in screen). Both sets must be non-empty:
 * an empty viewer set would admit nobody and an empty admin set would leave nobody able
 * to undo it. And the manager saving must still be a manager under the NEW sets, checked
 * with their own roles on Alkemio — otherwise one click could lock every manager out.
 * The set key changes with the sets, so every held decision is re-made on the next request.
 */
export async function saveAccessSettings(
  auth: AuthContext,
  actor: Actor,
  body: AccessSettingsInput,
): Promise<{ revision: number }> {
  const eff = effectiveAccess('vng');
  if (!eff.sets) throw new AdminRequestError(409, 'NOT_EDITABLE');
  if (!Number.isInteger(body?.baseRevision)) throw new AdminRequestError(400, 'INVALID_BODY');
  const viewers = parseSet('viewers', body.viewers);
  const admins = parseSet('admins', body.admins);

  const config = loadConfig();
  const probeDeps = { alkemioServerUrl: config.alkemioServerUrl, timeoutMs: config.access.checkTimeoutMs };
  const distinct = new Map([...viewers, ...admins].map((r) => [r.key, r]));
  const infos = new Map(
    await Promise.all(
      [...distinct.values()].map(
        async (ref) => [ref.key, await probeGate(ref, eff.names.get(ref.key) ?? '', probeDeps)] as const,
      ),
    ),
  );
  for (const [key, info] of infos) {
    if (info.exists === 'no') throw new AdminRequestError(422, 'NOT_FOUND', { item: key });
    if (info.exists === 'unknown') throw new AdminRequestError(503, 'COULD_NOT_VERIFY', { item: key });
  }

  // The lockout guard: the saving manager's own roles, under the proposed sets.
  const level = await determineLevel(
    auth,
    { viewers, admins },
    (key) => infos.get(key)?.exists ?? 'unknown',
    { timeoutMs: config.access.checkTimeoutMs },
  );
  if (level === 'unverified') throw new AdminRequestError(503, 'COULD_NOT_VERIFY');
  if (level !== 'manage') throw new AdminRequestError(409, 'WOULD_LOCK_OUT');

  const stored = (refs: GateRef[]): StoredSpace[] =>
    refs.map((r) => ({ key: r.key, displayName: infos.get(r.key)!.displayName }));
  const asStored = (links: Array<{ key: string; displayName: string }>): StoredSpace[] =>
    links.map((l) => ({ key: l.key, displayName: l.displayName }));
  // Re-read: another manager may have saved while the checks above waited on Alkemio.
  const now = effectiveAccess('vng');
  if (now.revision !== body.baseRevision) {
    throw new AdminRequestError(409, 'CONFLICT', { revision: now.revision });
  }
  if (now.source === 'settings' && setKey(viewers, admins) === now.sets?.setKey) {
    return { revision: now.revision }; // nothing changed
  }
  try {
    const revision = saveAccess({
      app: 'vng',
      baseRevision: body.baseRevision,
      from: { viewers: asStored(viewerLinks('vng')), admins: asStored(adminLinks('vng')) },
      viewers: stored(viewers),
      admins: stored(admins),
      actor,
    });
    return { revision };
  } catch (err) {
    if (err instanceof AccessConflictError) {
      throw new AdminRequestError(409, 'CONFLICT', { revision: err.current });
    }
    throw err;
  }
}

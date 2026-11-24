import { loadConfig } from '../config.js';
import { getStoredAccess } from '../settings/access-store.js';
import { parseGateRef, setKey, type AccessSets, type AppId, type GateRef } from './policy.js';

/**
 * The access sets in force for an application (feature 027, "Toegang" tab):
 * - an ungated application (`access.<app>: none`) stays ungated — that is a deployment
 *   decision the admin area cannot override;
 * - otherwise the sets a Monitor Manager saved, when there are any;
 * - otherwise the deployment configuration.
 * Read per call (two indexed SQLite reads), so a save applies to the very next request.
 * The set key changes with the sets, so every held decision is re-made under them.
 */
export interface EffectiveAccess {
  sets: AccessSets | null;
  /** Name per Space key, for the screens when the probe has none. */
  names: ReadonlyMap<string, string>;
  /** Where the sets come from. */
  source: 'config' | 'settings';
  /** The stored revision; 0 while the configuration applies. */
  revision: number;
  updatedAt: string | null;
  updatedByName: string | null;
}

export function effectiveAccess(app: AppId): EffectiveAccess {
  const configured = loadConfig().access.apps[app];
  if (!configured.sets) {
    return { sets: null, names: new Map(), source: 'config', revision: 0, updatedAt: null, updatedByName: null };
  }
  const stored = getStoredAccess(app);
  if (stored) {
    const refs = (list: { key: string }[]) =>
      list.map((s) => parseGateRef(s.key)).filter((r): r is GateRef => r !== null);
    const viewers = refs(stored.viewers);
    const admins = refs(stored.admins);
    // A stored set always holds ≥ 1 viewer (the save refuses less); guard anyway — an
    // empty viewer set must never mean "nobody is checked".
    if (viewers.length > 0) {
      return {
        sets: { viewers, admins, setKey: setKey(viewers, admins) },
        names: new Map([...stored.viewers, ...stored.admins].map((s) => [s.key, s.displayName])),
        source: 'settings',
        revision: stored.revision,
        updatedAt: stored.updatedAt,
        updatedByName: stored.updatedByName,
      };
    }
  }
  const names = new Map<string, string>();
  configured.sets.viewers.forEach((ref, i) => {
    if (configured.displayNames[i]) names.set(ref.key, configured.displayNames[i]);
  });
  return { sets: configured.sets, names, source: 'config', revision: 0, updatedAt: null, updatedByName: null };
}

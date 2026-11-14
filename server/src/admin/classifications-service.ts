import type { AuthContext } from '../auth/middleware.js';
import { GD_CACHE_SPACE_ID, getCacheEntry, invalidateCache } from '../cache/cache-service.js';
import { isAlkemioAuthError } from '../graphql/client.js';
import { invalidateDatasetMemo } from '../services/graph-service.js';
import { resolveDesignated } from '../transform/classifications.js';
import { getScope, recordClassificationChange, type Actor } from '../settings/store.js';
import type {
  ClassificationChangeResult,
  DesignatedClassificationView,
  InitiativeClassificationsView,
  InitiativeRef,
} from '../types/admin.js';
import { vngDesignations } from './included-spaces-service.js';
import { AdminRequestError } from './space-search-service.js';
import {
  adminSdkFor,
  isForbidden,
  lookupSpaceById,
  lookupSpaceByName,
  recalledName,
  type AdminEntry,
  type AdminSdk,
  type AdminSpace,
  type SpaceLookup,
} from './space-lookup.js';

/**
 * One initiative's designated classifications, read and written on Alkemio with the
 * MANAGER's token (feature 027, research R12). Alkemio stays the judge of every write.
 */

interface GdRowInitiative {
  id: string;
  nameId: string;
  displayName: string;
  source: 'subspace' | 'post';
}

/** The manager's OWN cached GD row, if any (never built here, never anyone else's). */
function gdInitiativesOf(userId: string): GdRowInitiative[] {
  const row = getCacheEntry(userId, GD_CACHE_SPACE_ID);
  if (!row) return [];
  try {
    const subgraph = JSON.parse(row.datasetJson) as {
      callouts?: Array<{ id: string; nameId?: string; displayName: string; source?: 'subspace' | 'post' }>;
    };
    return (subgraph.callouts ?? []).flatMap((c) =>
      c.nameId && c.source ? [{ id: c.id, nameId: c.nameId, displayName: c.displayName, source: c.source }] : [],
    );
  } catch {
    return [];
  }
}

/**
 * `GET /api/vng/admin/initiatives?q=` — the Included Spaces plus the GD initiatives from
 * the manager's own cached data. Names come from what the manager was recently shown;
 * otherwise the nameID. With no `q`, the first 50 by display name.
 */
export function listInitiatives(auth: AuthContext, q = ''): InitiativeRef[] {
  const included: InitiativeRef[] = getScope().spaceNameIds.map((nameId) => ({
    nameId,
    displayName: recalledName(auth.userId, nameId) ?? nameId,
    kind: 'included',
  }));
  const taken = new Set(included.map((i) => i.nameId));
  const gd: InitiativeRef[] = gdInitiativesOf(auth.userId)
    .filter((i) => !taken.has(i.nameId))
    .map((i) => ({
      nameId: i.nameId,
      displayName: i.displayName,
      kind: i.source === 'post' ? 'gd-post' : 'gd-subspace',
    }));
  const needle = q.trim().toLowerCase();
  const all = [...included, ...gd]
    .filter(
      (i) => !needle || i.displayName.toLowerCase().includes(needle) || i.nameId.toLowerCase().includes(needle),
    )
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'nl'));
  return all.slice(0, 50);
}

function designatedViews(space: AdminSpace | null): DesignatedClassificationView[] {
  return vngDesignations().map(({ key, label }) => {
    const entry = space ? (resolveDesignated(space.classifications, label) as AdminEntry | null) : null;
    return entry
      ? {
          key,
          label: entry.displayLabel,
          present: true,
          entryId: entry.id,
          cardinality: entry.cardinality,
          values: entry.values,
          selectedValueIds: entry.selectedValueIDs,
        }
      : { key, label, present: false, entryId: null, cardinality: null, values: [], selectedValueIds: [] };
  });
}

interface Resolved {
  ref: InitiativeRef;
  lookup: SpaceLookup | null;
}

/** Find the initiative: an Included Space (L0, by nameID), else a GD subspace (by UUID). */
async function resolveInitiative(auth: AuthContext, nameId: string, sdk: AdminSdk): Promise<Resolved> {
  if (getScope().spaceNameIds.includes(nameId)) {
    const lookup = await lookupSpaceByName(sdk, nameId);
    return { ref: { nameId, displayName: nameId, kind: 'included' }, lookup };
  }
  const gd = gdInitiativesOf(auth.userId).find((i) => i.nameId === nameId);
  if (gd?.source === 'post') {
    return { ref: { nameId, displayName: gd.displayName, kind: 'gd-post' }, lookup: null };
  }
  if (gd) {
    return {
      ref: { nameId, displayName: gd.displayName, kind: 'gd-subspace' },
      lookup: await lookupSpaceById(sdk, gd.id),
    };
  }
  // Not one of the monitor's initiatives: nothing to show (and nothing to reveal).
  throw new AdminRequestError(404, 'NOT_READABLE');
}

function viewOf({ ref, lookup }: Resolved): InitiativeClassificationsView {
  if (!lookup) {
    // LEGACY-GD-POSTS: a post has no classifications of its own (FR-026).
    return {
      initiative: { ...ref, url: null },
      canEdit: false,
      reason: 'GD_POST',
      classifications: [],
    };
  }
  if (lookup.status !== 'ok') throw new AdminRequestError(404, 'NOT_READABLE');
  const space = lookup.space;
  // R12: UPDATE on the Space's About predicts whether the selection mutation is allowed.
  // Verified on acceptance per task T058; Alkemio still judges every write.
  const canEdit = space.privileges.includes('UPDATE');
  return {
    initiative: { ...ref, displayName: space.displayName, url: space.url },
    canEdit,
    reason: canEdit ? null : 'NO_UPDATE_RIGHT',
    classifications: designatedViews(space),
  };
}

/** `GET /api/vng/admin/initiatives/:nameId/classifications`. */
export async function readInitiativeClassifications(
  auth: AuthContext,
  nameId: string,
  sdk?: AdminSdk,
): Promise<InitiativeClassificationsView> {
  const client = sdk ?? (await adminSdkFor(auth));
  return viewOf(await resolveInitiative(auth, nameId, client));
}

export interface ClassificationChangeInput {
  entryId: string;
  expectedSelectedValueIds: string[];
  selectedValueIds: string[];
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000');

/**
 * `PUT /api/vng/admin/initiatives/:nameId/classifications` (contracts/api-admin.md §6).
 *
 * 1. Validate everything first — only designated, present entries; SINGLE_SELECT takes at
 *    most one id; every id in the vocabulary. Any failure: 422 `INVALID_SELECTION`, nothing
 *    written.
 * 2. Then per entry, in order: re-read it; a selection that no longer matches what the
 *    manager saw is `CHANGED_ON_ALKEMIO`, a vanished vocabulary id is `VALUE_REMOVED`;
 *    otherwise write it. FORBIDDEN is `NOT_PERMITTED`, anything else `FAILED`.
 * 3. Each `SAVED` entry is recorded; after any, the EDITOR's cached rows for that Space
 *    are invalidated so their dashboard shows the change on return (FR-025).
 */
export async function applyClassificationChanges(
  auth: AuthContext,
  actor: Actor,
  nameId: string,
  changes: ClassificationChangeInput[],
  sdk?: AdminSdk,
): Promise<{ results: ClassificationChangeResult[]; classifications: InitiativeClassificationsView }> {
  const client = sdk ?? (await adminSdkFor(auth));
  const reread = () => resolveInitiative(auth, nameId, client);

  let resolved = await reread();
  const before = viewOf(resolved);
  const byEntry = new Map(
    before.classifications.filter((c) => c.present && c.entryId).map((c) => [c.entryId as string, c]),
  );

  if (!Array.isArray(changes) || changes.length === 0) {
    throw new AdminRequestError(422, 'INVALID_SELECTION', { entryId: null });
  }
  for (const change of changes) {
    const entry = byEntry.get(change?.entryId);
    const ids = change?.selectedValueIds;
    const ok =
      entry &&
      Array.isArray(ids) &&
      Array.isArray(change.expectedSelectedValueIds) &&
      new Set(ids).size === ids.length &&
      (entry.cardinality !== 'SINGLE_SELECT' || ids.length <= 1) &&
      ids.every((id) => entry.values.some((v) => v.id === id));
    if (!ok) throw new AdminRequestError(422, 'INVALID_SELECTION', { entryId: change?.entryId ?? null });
  }

  const results: ClassificationChangeResult[] = [];
  if (!before.canEdit) {
    for (const change of changes) {
      results.push({ entryId: change.entryId, outcome: 'NOT_PERMITTED', current: byEntry.get(change.entryId) ?? null });
    }
    return { results, classifications: before };
  }

  let saved = 0;
  for (const change of changes) {
    resolved = await reread();
    let current: DesignatedClassificationView | null;
    try {
      current = viewOf(resolved).classifications.find((c) => c.entryId === change.entryId) ?? null;
    } catch {
      current = null;
    }
    if (!current) {
      results.push({ entryId: change.entryId, outcome: 'FAILED', current: null });
      continue;
    }
    if (!sameSet(current.selectedValueIds, change.expectedSelectedValueIds)) {
      results.push({ entryId: change.entryId, outcome: 'CHANGED_ON_ALKEMIO', current });
      continue;
    }
    if (!change.selectedValueIds.every((id) => current!.values.some((v) => v.id === id))) {
      results.push({ entryId: change.entryId, outcome: 'VALUE_REMOVED', current });
      continue;
    }
    try {
      await client.UpdateClassificationSelection({
        entryId: change.entryId,
        selectedValueIDs: change.selectedValueIds,
      });
    } catch (err) {
      if (isForbidden(err)) {
        results.push({ entryId: change.entryId, outcome: 'NOT_PERMITTED', current });
        continue;
      }
      if (isAlkemioAuthError(err)) throw err;
      results.push({ entryId: change.entryId, outcome: 'FAILED', current });
      continue;
    }
    const label = (id: string) => current!.values.find((v) => v.id === id)?.label ?? id;
    recordClassificationChange({
      actor,
      spaceNameId: nameId,
      entryId: change.entryId,
      entryLabel: current.label,
      from: current.selectedValueIds.map((id) => ({ id, label: label(id) })),
      to: change.selectedValueIds.map((id) => ({ id, label: label(id) })),
    });
    saved += 1;
    results.push({
      entryId: change.entryId,
      outcome: 'SAVED',
      current: { ...current, selectedValueIds: change.selectedValueIds },
    });
  }

  if (saved > 0) {
    // FR-025: only the editor's own rows. Other viewers see the change within their TTL.
    if (resolved.ref.kind === 'gd-subspace') invalidateCache(auth.userId, [GD_CACHE_SPACE_ID]);
    else invalidateCache(auth.userId, [nameId]);
    invalidateDatasetMemo(auth.userId);
  }

  return { results, classifications: viewOf(await reread()) };
}

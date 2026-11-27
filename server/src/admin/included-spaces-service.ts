import type { AuthContext } from '../auth/middleware.js';
import { loadConfig } from '../config.js';
import { resolveDesignated } from '../transform/classifications.js';
import type { DesignatedValues, IncludedSpaceView, IncludedSpacesView } from '../types/admin.js';
import {
  getIncludedSpaces,
  getState,
  lastChange,
  recordRename,
  setSpaceId,
  type IncludedSpaceRow,
} from '../settings/store.js';
import {
  adminSdkFor,
  lookupSpaceById,
  lookupSpaceByName,
  mapLimit,
  rememberName,
  type AdminEntry,
  type AdminSdk,
  type AdminSpace,
} from './space-lookup.js';

/** The VNG designations that count towards a Space's classification status. */
export function vngDesignations(): Array<{ key: 'nds' | 'vng2030' | 'phase' | 'trl'; label: string }> {
  const c = loadConfig().dashboards.vng.classifications;
  return (['nds', 'vng2030', 'phase', 'trl'] as const)
    .map((key) => ({ key, label: c[key] }))
    .filter((d) => !!d.label);
}

/** How many of the designated classifications a Space has set (≥ 1 value selected). */
export function classificationStatus(entries: readonly AdminEntry[]): { set: number; designated: number } {
  const designations = vngDesignations();
  const set = designations.filter((d) => {
    const entry = resolveDesignated(entries, d.label) as AdminEntry | null;
    return !!entry && entry.selectedValueIDs.length > 0;
  }).length;
  return { set, designated: designations.length };
}

/** The lowest position of a selected value in the classification's own order. */
function selectedRank(entry: AdminEntry): number | null {
  const at = entry.values.findIndex((v) => entry.selectedValueIDs.includes(v.id));
  return at === -1 ? null : at;
}

/** The selected value labels of each designated classification, in designation order. */
export function designatedValues(entries: readonly AdminEntry[]): DesignatedValues[] {
  return vngDesignations().map(({ key, label }) => {
    const entry = resolveDesignated(entries, label) as AdminEntry | null;
    if (!entry) return { key, present: false, values: [], rank: null };
    const byId = new Map(entry.values.map((v) => [v.id, v.label]));
    return {
      key,
      present: true,
      values: entry.selectedValueIDs.map((id) => byId.get(id) ?? id),
      rank: selectedRank(entry),
    };
  });
}

const view = (row: IncludedSpaceRow, space: AdminSpace | null, found: boolean): IncludedSpaceView => ({
  nameId: space?.nameId ?? row.nameId,
  spaceId: space?.id ?? row.spaceId,
  position: row.position,
  displayName: space?.displayName ?? null,
  url: space?.url ?? null,
  readable: !!space,
  found,
  visibility: space ? { contentPublic: space.isContentPublic, status: space.visibility } : null,
  classificationStatus: space ? classificationStatus(space.classifications) : null,
  classifications: space ? designatedValues(space.classifications) : null,
  hidden: row.hidden,
});

/**
 * Resolve each Included Space with the MANAGER's token, at most 5 at a time (research R8):
 * by nameID; if not found and its UUID is known, by UUID — a hit under a new nameID is a
 * rename on Alkemio and is recorded, so the dashboard keeps loading it. A first sight of
 * a Space's UUID is remembered, and from then on decides: a nameID that now belongs to
 * another Space is looked up by UUID instead. A Space the manager cannot read reveals nothing but its
 * nameID; one Alkemio no longer has is `found: false`.
 */
export async function resolveIncludedSpaceViews(
  auth: AuthContext,
  rows: IncludedSpaceRow[] = getIncludedSpaces(),
  sdk?: AdminSdk,
): Promise<IncludedSpaceView[]> {
  const client = sdk ?? (await adminSdkFor(auth));
  return mapLimit(rows, 5, async (row) => {
    let result = await lookupSpaceByName(client, row.nameId);
    // A hit with another UUID is a DIFFERENT Space that took over a freed nameID.
    const taken = result.status === 'ok' && !!row.spaceId && result.space.id !== row.spaceId;
    if ((result.status === 'not-found' || taken) && row.spaceId) {
      const byId = await lookupSpaceById(client, row.spaceId);
      if (byId.status === 'ok' && byId.space.nameId !== row.nameId) {
        recordRename(row.nameId, byId.space.nameId, row.spaceId);
      }
      result = byId;
    }
    if (result.status === 'ok') {
      if (!row.spaceId) setSpaceId(row.nameId, result.space.id);
      rememberName(auth.userId, result.space.nameId, result.space.displayName);
      return view(row, result.space, true);
    }
    return view(row, null, result.status === 'not-readable');
  });
}

const MAX_RESOLVE_ATTEMPTS = 3;

/** `GET /api/vng/admin/included-spaces` (contracts/api-admin.md §3). */
export async function includedSpacesView(auth: AuthContext, sdk?: AdminSdk): Promise<IncludedSpacesView> {
  // The rows and the revision must belong together: with another manager's newer revision
  // on these rows, the next save would overwrite their change without a conflict. So
  // resolve again when the settings moved meanwhile (a rename found just now counts too).
  for (let attempt = 1; ; attempt++) {
    const revision = getState().revision;
    const change = lastChange();
    const spaces = await resolveIncludedSpaceViews(auth, getIncludedSpaces(), sdk);
    if (getState().revision === revision || attempt === MAX_RESOLVE_ATTEMPTS) {
      // Still moving: the OLDER revision, which at worst costs a conflict dialog.
      return { revision, designations: vngDesignations(), spaces, lastChange: change };
    }
  }
}

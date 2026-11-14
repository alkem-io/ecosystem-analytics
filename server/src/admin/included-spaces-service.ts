import type { AuthContext } from '../auth/middleware.js';
import { loadConfig } from '../config.js';
import { resolveDesignated } from '../transform/classifications.js';
import type { IncludedSpaceView, IncludedSpacesView } from '../types/admin.js';
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

const view = (row: IncludedSpaceRow, space: AdminSpace | null, found: boolean): IncludedSpaceView => ({
  nameId: space?.nameId ?? row.nameId,
  spaceId: space?.id ?? row.spaceId,
  position: row.position,
  displayName: space?.displayName ?? null,
  url: space?.url ?? null,
  readable: !!space,
  found,
  classificationStatus: space ? classificationStatus(space.classifications) : null,
});

/**
 * Resolve each Included Space with the MANAGER's token, at most 5 at a time (research R8):
 * by nameID; if not found and its UUID is known, by UUID — a hit under a new nameID is a
 * rename on Alkemio and is recorded, so the dashboard keeps loading it. A first sight of
 * a Space's UUID is remembered. A Space the manager cannot read reveals nothing but its
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
    if (result.status === 'not-found' && row.spaceId) {
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

/** `GET /api/vng/admin/included-spaces` (contracts/api-admin.md §3). */
export async function includedSpacesView(auth: AuthContext, sdk?: AdminSdk): Promise<IncludedSpacesView> {
  const spaces = await resolveIncludedSpaceViews(auth, getIncludedSpaces(), sdk);
  // Read the revision AFTER resolving: a rename found just now bumps it.
  return { revision: getState().revision, spaces, lastChange: lastChange() };
}

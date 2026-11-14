import type { AuthContext } from '../auth/middleware.js';
import { createAlkemioSdk, isAlkemioAuthError } from '../graphql/client.js';
import type { Sdk } from '../graphql/generated/graphql.js';

/**
 * One Space as the admin area reads it, ALWAYS with the manager's own token (feature 027,
 * Constitution IV): a Space they cannot read is reported as such and nothing of it leaks.
 */

export type AdminSdk = Pick<
  Sdk,
  | 'AdminSpaceClassifications'
  | 'AdminSpaceClassificationsById'
  | 'AdminSpaceSearch'
  | 'UpdateClassificationSelection'
>;

/** Build the manager's SDK. A seam for tests (`vi.mock('../graphql/client.js')`). */
export const adminSdkFor = (auth: AuthContext): Promise<AdminSdk> => createAlkemioSdk(auth);

export interface AdminEntry {
  id: string;
  displayLabel: string;
  cardinality: 'SINGLE_SELECT' | 'MULTI_SELECT';
  sortOrder: number;
  values: Array<{ id: string; label: string }>;
  selectedValueIDs: string[];
}

export interface AdminSpace {
  id: string;
  nameId: string;
  level: 'L0' | 'L1' | 'L2';
  displayName: string;
  url: string | null;
  privileges: string[];
  classifications: AdminEntry[];
}

export type SpaceLookup =
  | { status: 'ok'; space: AdminSpace }
  | { status: 'not-found' }
  | { status: 'not-readable' };

interface RawSpace {
  id: string;
  nameID: string;
  level: string;
  about?: {
    authorization?: { myPrivileges?: string[] | null } | null;
    profile?: { displayName?: string | null; url?: string | null } | null;
    classifications?: Array<{
      id: string;
      displayLabel: string;
      cardinality: string;
      sortOrder: number;
      values?: Array<{ id: string; label: string }> | null;
      selectedValueIDs?: string[] | null;
    }> | null;
  } | null;
}

function toAdminSpace(raw: RawSpace): AdminSpace {
  return {
    id: raw.id,
    nameId: raw.nameID,
    level: (raw.level as AdminSpace['level']) ?? 'L0',
    displayName: raw.about?.profile?.displayName || raw.nameID,
    url: raw.about?.profile?.url ?? null,
    privileges: raw.about?.authorization?.myPrivileges ?? [],
    classifications: (raw.about?.classifications ?? []).map((c) => ({
      id: c.id,
      displayLabel: c.displayLabel,
      cardinality: c.cardinality === 'MULTI_SELECT' ? 'MULTI_SELECT' : 'SINGLE_SELECT',
      sortOrder: c.sortOrder ?? 0,
      values: c.values ?? [],
      selectedValueIDs: c.selectedValueIDs ?? [],
    })),
  };
}

const codes = (err: unknown): string[] =>
  ((err as { response?: { errors?: Array<{ extensions?: { code?: string }; message?: string }> } })
    ?.response?.errors ?? []).map((e) => `${e?.extensions?.code ?? ''} ${e?.message ?? ''}`);

export const isForbidden = (err: unknown): boolean =>
  codes(err).some((c) => /FORBIDDEN|does not have credentials/i.test(c));
const isNotFound = (err: unknown): boolean =>
  codes(err).some((c) => /NOT_FOUND|not found/i.test(c));

/** graphql-request throws on any error, even when `data` is partly present. */
function partial<T>(err: unknown): T | undefined {
  return (err as { response?: { data?: T } })?.response?.data;
}

async function classify(
  run: () => Promise<RawSpace | null | undefined>,
  fromPartial: (err: unknown) => RawSpace | null | undefined,
): Promise<SpaceLookup> {
  try {
    const raw = await run();
    return raw ? { status: 'ok', space: toAdminSpace(raw) } : { status: 'not-found' };
  } catch (err) {
    if (isAlkemioAuthError(err) && !isForbidden(err)) throw err;
    const raw = fromPartial(err);
    if (raw?.id) return { status: 'ok', space: toAdminSpace(raw) }; // a refused sub-field only
    if (isForbidden(err)) return { status: 'not-readable' };
    if (isNotFound(err)) return { status: 'not-found' };
    throw err;
  }
}

type ByName = Awaited<ReturnType<AdminSdk['AdminSpaceClassifications']>>['data'];
type ById = Awaited<ReturnType<AdminSdk['AdminSpaceClassificationsById']>>['data'];

/** A top-level Space by nameID. */
export function lookupSpaceByName(sdk: AdminSdk, nameId: string): Promise<SpaceLookup> {
  return classify(
    async () => (await sdk.AdminSpaceClassifications({ nameId })).data.lookupByName.space as RawSpace,
    (err) => partial<ByName>(err)?.lookupByName?.space as RawSpace | undefined,
  );
}

/** Any Space by UUID (finds renamed Spaces and GD subspaces). */
export function lookupSpaceById(sdk: AdminSdk, id: string): Promise<SpaceLookup> {
  return classify(
    async () => (await sdk.AdminSpaceClassificationsById({ id })).data.lookup.space as RawSpace,
    (err) => partial<ById>(err)?.lookup?.space as RawSpace | undefined,
  );
}

/** Run `fn` over `items` with at most `limit` in flight; results in input order. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Display names the manager has been shown recently, so the initiative picker can name
 * the Included Spaces without re-reading every one. Per user; short-lived; never shared.
 */
const NAME_TTL_MS = 10 * 60_000;
const names = new Map<string, { name: string; at: number }>();
export function rememberName(userId: string, nameId: string, name: string): void {
  if (names.size > 5_000) names.clear();
  names.set(`${userId}\u0000${nameId}`, { name, at: Date.now() });
}
export function recalledName(userId: string, nameId: string): string | null {
  const hit = names.get(`${userId}\u0000${nameId}`);
  return hit && Date.now() - hit.at < NAME_TTL_MS ? hit.name : null;
}

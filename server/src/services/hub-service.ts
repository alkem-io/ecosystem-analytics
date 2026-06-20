/**
 * Innovation hub service (feature 016, US1).
 *
 * Lists the innovation hubs the platform exposes and resolves a hub's listed
 * spaces (its `spaceListFilter`) — the input set for the VNG graph/details/dashboard
 * (FR-009). One query (`InnovationHubs`) returns hubs + their spaces; both routes
 * derive from it.
 */
import { createAlkemioSdk } from '../graphql/client.js';
import type { AuthContext } from '../auth/middleware.js';
import type {
  InnovationHubsQuery,
  InnovationHubByIdQuery,
} from '../graphql/generated/alkemio-schema.js';

/** The common InnovationHub shape returned by both the list and by-id queries. */
type RawHub = InnovationHubsQuery['platform']['library']['innovationHubs'][number];

export interface VngHubSpace {
  nameId: string;
  displayName: string;
  visibility: string;
}
export interface VngHub {
  id: string;
  nameId: string;
  displayName: string;
  spaces: VngHubSpace[];
}

/** Map a single raw InnovationHub to the VNG hub shape. */
export function mapHub(hub: RawHub): VngHub {
  return {
    id: hub.id,
    nameId: hub.nameID,
    displayName: hub.profile.displayName,
    spaces: (hub.spaceListFilter ?? []).map((space) => ({
      nameId: space.nameID,
      displayName: space.about.profile.displayName,
      visibility: String(space.visibility),
    })),
  };
}

/** Pure mapping of the raw InnovationHubs query result to the VNG hub shape. */
export function mapInnovationHubs(query: InnovationHubsQuery): VngHub[] {
  return query.platform.library.innovationHubs.map(mapHub);
}

/**
 * Fetch the **store-listed** innovation hubs (with their listed spaces). NOTE:
 * `platform.library.innovationHubs` only returns hubs listed in the platform
 * store — hubs that are not store-listed (e.g. the VNG hubs) won't appear here
 * and must be resolved directly via {@link resolveHubByNameId}.
 */
export async function fetchInnovationHubs(auth: AuthContext): Promise<VngHub[]> {
  const sdk = await createAlkemioSdk(auth);
  const res = await sdk.InnovationHubs();
  return mapInnovationHubs(res.data);
}

/**
 * Resolve ANY innovation hub by nameID (independent of store-listing), via
 * lookupByName → lookup. Returns null when the hub doesn't exist / isn't visible.
 */
export async function resolveHubByNameId(
  auth: AuthContext,
  nameId: string,
): Promise<VngHub | null> {
  const sdk = await createAlkemioSdk(auth);
  const idRes = await sdk.InnovationHubByNameId({ nameId });
  const id = idRes.data.lookupByName.innovationHub;
  if (!id) return null;
  const hubRes = await sdk.InnovationHubById({ id });
  const hub: InnovationHubByIdQuery['lookup']['innovationHub'] = hubRes.data.lookup.innovationHub;
  return hub ? mapHub(hub) : null;
}

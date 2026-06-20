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
import type { InnovationHubsQuery } from '../graphql/generated/alkemio-schema.js';

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

/** Pure mapping of the raw InnovationHubs query result to the VNG hub shape. */
export function mapInnovationHubs(query: InnovationHubsQuery): VngHub[] {
  return query.platform.library.innovationHubs.map((hub) => ({
    id: hub.id,
    nameId: hub.nameID,
    displayName: hub.profile.displayName,
    spaces: (hub.spaceListFilter ?? []).map((space) => ({
      nameId: space.nameID,
      displayName: space.about.profile.displayName,
      visibility: String(space.visibility),
    })),
  }));
}

/** Fetch all innovation hubs (with their listed spaces) available to the user. */
export async function fetchInnovationHubs(auth: AuthContext): Promise<VngHub[]> {
  const sdk = await createAlkemioSdk(auth);
  const res = await sdk.InnovationHubs();
  return mapInnovationHubs(res.data);
}

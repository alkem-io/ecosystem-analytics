/**
 * VNG dashboard category counting (feature 016, US3).
 *
 * Pure counting core: given countable entities (selected spaces, or GD initiatives
 * when that layer is active — FR-022) each carrying tags, and the operator-defined
 * tag→category mapping (from analytics.yml), produce per-dimension category counts.
 *
 * Each entity contributes at most once per category it maps into; entities that map
 * to no category in any dimension are counted as uncategorised (FR-024).
 */
import { loadConfig, type VngConfig } from '../config.js';
import { createAlkemioSdk } from '../graphql/client.js';
import type { AuthContext } from '../auth/middleware.js';
import { fetchGemeentedelersCallouts } from './gd-initiatives-service.js';
import type {
  DashboardCountable,
  DashboardDimension,
  VngDashboardResponse,
} from '../types/api.js';

/** Count entities into the configured NDS and VNG-2030 category dimensions. */
export function countDashboard(
  entities: DashboardCountable[],
  mapping: VngConfig['tagCategoryMapping'],
  source: VngDashboardResponse['source'],
): VngDashboardResponse {
  const dimensionDefs: { key: string; map: Record<string, string> }[] = [
    { key: 'nds', map: mapping.nds },
    { key: 'vng2030', map: mapping.vng2030 },
  ];

  // Pre-seed every category key (so zero-count bars still render — US3 scenario 3).
  // Each category accumulates the entity LABELS that fall into it (for tooltips).
  const items: Record<string, Map<string, string[]>> = {};
  for (const dim of dimensionDefs) {
    items[dim.key] = new Map(Object.values(dim.map).map((cat) => [cat, []]));
  }

  let uncategorisedCount = 0;

  for (const entity of entities) {
    const normTags = entity.tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
    let categorisedAnywhere = false;

    for (const dim of dimensionDefs) {
      const hit = new Set<string>();
      for (const tag of normTags) {
        const category = dim.map[tag];
        if (category) hit.add(category);
      }
      for (const category of hit) {
        items[dim.key].get(category)?.push(entity.label);
        categorisedAnywhere = true;
      }
    }

    if (!categorisedAnywhere) uncategorisedCount += 1;
  }

  const dimensions: DashboardDimension[] = dimensionDefs.map((dim) => ({
    key: dim.key,
    categories: [...items[dim.key].entries()].map(([key, labels]) => ({
      key,
      count: labels.length,
      items: labels.sort((a, b) => a.localeCompare(b)),
    })),
  }));

  return { source, totalCounted: entities.length, uncategorisedCount, dimensions };
}

/**
 * Assemble the dashboard for the selected spaces (data-source aware, FR-022):
 * when `includeInitiatives`, count GD initiatives; otherwise count selected spaces.
 */
export async function assembleDashboard(
  auth: AuthContext,
  spaceIds: string[],
  includeInitiatives: boolean,
): Promise<VngDashboardResponse> {
  const config = loadConfig();
  const sdk = await createAlkemioSdk(auth);

  let entities: DashboardCountable[];
  let source: VngDashboardResponse['source'];

  if (includeInitiatives) {
    source = 'gd-initiatives';
    const callouts = await fetchGemeentedelersCallouts(auth, sdk);
    entities = callouts.map((c) => ({ id: c.id, label: c.displayName, tags: c.tags }));
  } else {
    source = 'spaces';
    const tagsPerSpace = await Promise.all(
      spaceIds.map(async (nameId) => {
        const res = await sdk.SpaceProfileTags({ nameId });
        const space = res.data.lookupByName.space;
        const tagsets = space?.about.profile.tagsets ?? [];
        return {
          id: nameId,
          label: space?.about.profile.displayName ?? nameId,
          tags: tagsets.flatMap((ts) => ts.tags),
        };
      }),
    );
    entities = tagsPerSpace;
  }

  return countDashboard(entities, config.vng.tagCategoryMapping, source);
}

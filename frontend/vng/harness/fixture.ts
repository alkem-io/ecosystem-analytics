import { NodeType, type GraphNode } from '@server/types/graph.js';
import type { GemeenteLocation } from '@server/types/api.js';
import type { CityRow } from '@ea/shared';

/**
 * Located nodes for the §VII guard harness (feature 021, T007).
 *
 * Deliberately spread across the country — including close to the German and Belgian
 * borders and on the coast — so that a mask which leaks has something to reveal it.
 * The interior points reuse the coordinates the pixel-verified Playwright specs
 * already sample, so the two agree on where "inside the Netherlands" is.
 *
 * Test-only. Never imported by the application.
 */
function gemeente(id: string, name: string, longitude: number, latitude: number): GraphNode {
  return {
    id,
    type: NodeType.ORGANIZATION,
    displayName: name,
    nameId: id,
    weight: 1,
    // Required by the shipped clustering code (`node.scopeGroups[0]`) — deliberately
    // NOT cast away, so the compiler keeps this fixture honest about what a real node is.
    scopeGroups: [],
    isGemeente: true,
    location: { country: 'Netherlands', city: name, latitude, longitude },
  };
}

export const HARNESS_NODES: GraphNode[] = [
  // Interior — the same points the pixel-verified specs assert must show map detail.
  gemeente('gemeente-utrecht', 'Utrecht', 5.12, 52.09),
  gemeente('gemeente-groningen', 'Groningen', 6.57, 53.22),
  gemeente('gemeente-maastricht', 'Maastricht', 5.69, 50.85),
  // Near the German border — where an eastward leak would show first.
  gemeente('gemeente-enschede', 'Enschede', 6.89, 52.22),
  gemeente('gemeente-venlo', 'Venlo', 6.17, 51.37),
  // Near the Belgian border.
  gemeente('gemeente-terneuzen', 'Terneuzen', 3.83, 51.33),
  // On the coast — where the sea must stay blank.
  gemeente('gemeente-den-helder', 'Den Helder', 4.76, 52.96),
  gemeente('gemeente-vlissingen', 'Vlissingen', 3.57, 51.44),
];

/**
 * The same gemeentes as `HARNESS_NODES`, in the shapes the Usage Explorer map needs.
 *
 * Derived from one source so the two surfaces are framed on the same geography — a guard
 * that samples different places on each surface is not comparing like with like.
 */
export const HARNESS_LOCATIONS: GemeenteLocation[] = HARNESS_NODES.map((n, i) => ({
  nameId: n.nameId,
  title: n.displayName,
  cbsCode: `GM${String(1000 + i)}`,
  latitude: n.location!.latitude!,
  longitude: n.location!.longitude!,
  provinceCode: 'PV26',
  provinceName: 'Utrecht',
}));

export const HARNESS_CITY_ROWS: CityRow[] = HARNESS_NODES.map((n) => ({
  id: n.id,
  nameId: n.nameId,
  name: n.displayName,
  provinceName: 'Utrecht',
  population: 100_000,
  initiatives: [],
  initiativeCount: 1,
  groeiCount: 1,
  gdCount: 0,
  vng2030: [],
  nds: [],
  themes: [],
  node: n,
}));

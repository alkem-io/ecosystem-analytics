import type { GraphDataset, GraphNode } from '@server/types/graph.js';

/**
 * City-perspective aggregation (feature 018).
 *
 * The inverse of the Initiatives tab: instead of "which gemeentes does this
 * initiative touch?", this answers "which initiatives does this gemeente take part
 * in?". Both are views of the same bipartite relation already present in the graph,
 * so this module derives everything from the {@link GraphDataset} the tabs already
 * fetch — no extra request.
 *
 * THE COUNT RULE IS NORMATIVE — see specs/018-city-analysis/contracts/city-aggregation.md.
 * `server/src/services/vng-dashboard-service.ts#countCityInitiatives` implements the
 * same rule for the dashboard chart, and both are pinned by mirrored conformance tests
 * (frontend/vng/src/dashboard/cities.test.ts, server/src/services/vng-cities.test.ts).
 * If the rule changes, all four change together — that is what keeps FR-028 true.
 */

/** Groei initiatives are top-level spaces only — L1/L2 subspaces are not initiatives. */
const GROEI_TYPE = 'SPACE_L0';
const GD_TYPE = 'INITIATIVE';

/** One initiative a city participates in. */
export interface CityInitiativeRef {
  id: string;
  name: string;
  /** 'groei' = a selected top-level space; 'gd' = a GemeenteDelers callout. */
  kind: 'groei' | 'gd';
  vng2030: string[];
  nds: string[];
  themes: string[];
}

/** One city (gemeente organisation) and everything the city views show about it. */
export interface CityRow {
  /** Gemeente ORGANIZATION node id — the row key. */
  id: string;
  nameId: string | null;
  /**
   * Official CBS municipality code — the stable join key. Alkemio's `nameID` is editable
   * and has changed under us, so anything matching a gemeente across two independently
   * cached datasets should prefer this. Null for an org outside the registry.
   */
  cbsCode: string | null;
  name: string;
  provinceName: string | null;
  /** Inhabitants, or null when UNKNOWN. Never coerced to 0 (FR-005). */
  population: number | null;
  /** The initiatives this city takes part in, sorted by name. */
  initiatives: CityInitiativeRef[];
  /** initiatives.length — the number every view must agree on (FR-028). */
  initiativeCount: number;
  groeiCount: number;
  gdCount: number;
  /** Union of the initiatives' classifications, de-duplicated and sorted. */
  vng2030: string[];
  nds: string[];
  themes: string[];
  /** The underlying node — needed for the map pin and the avatar. */
  node: GraphNode;
}

const byName = (a: string, b: string) => a.localeCompare(b);

/** Distinct + sorted union of the given lists. */
function union(lists: (string[] | undefined)[]): string[] {
  const set = new Set<string>();
  for (const list of lists) for (const v of list ?? []) set.add(v);
  return [...set].sort(byName);
}

/**
 * Build one {@link CityRow} per gemeente organisation in the dataset.
 *
 * A city participates in an initiative when the dataset holds at least one edge, in
 * either direction, between the gemeente node and a `SPACE_L0` or `INITIATIVE` node.
 * Edge type is irrelevant; repeated edges between the same pair count once; `SPACE_L1`,
 * `SPACE_L2`, `USER` and `THEME` nodes are not initiatives.
 */
export function buildCityRows(dataset: GraphDataset | null): CityRow[] {
  if (!dataset) return [];

  const cityNodes = new Map<string, GraphNode>();
  const initiativeNodes = new Map<string, GraphNode>();
  for (const n of dataset.nodes) {
    if (n.type === 'ORGANIZATION' && n.isGemeente === true) cityNodes.set(n.id, n);
    else if (n.type === GROEI_TYPE || n.type === GD_TYPE) initiativeNodes.set(n.id, n);
  }

  // city node id → distinct initiative node ids (de-duplicates repeated edges).
  const initiativeIdsByCity = new Map<string, Set<string>>();
  const link = (cityId: string, initiativeId: string) => {
    let s = initiativeIdsByCity.get(cityId);
    if (!s) initiativeIdsByCity.set(cityId, (s = new Set()));
    s.add(initiativeId);
  };
  for (const e of dataset.edges) {
    if (cityNodes.has(e.sourceId) && initiativeNodes.has(e.targetId)) link(e.sourceId, e.targetId);
    else if (cityNodes.has(e.targetId) && initiativeNodes.has(e.sourceId)) link(e.targetId, e.sourceId);
  }

  const rows: CityRow[] = [];
  for (const node of cityNodes.values()) {
    const initiatives: CityInitiativeRef[] = [...(initiativeIdsByCity.get(node.id) ?? [])]
      .map((id) => initiativeNodes.get(id) as GraphNode)
      .map((n) => ({
        id: n.id,
        name: n.displayName,
        kind: n.type === GROEI_TYPE ? ('groei' as const) : ('gd' as const),
        vng2030: n.vng2030Categories ?? [],
        nds: n.ndsCategories ?? [],
        themes: n.vngThemes ?? [],
      }))
      .sort((a, b) => byName(a.name, b.name));

    rows.push({
      id: node.id,
      nameId: node.nameId,
      cbsCode: node.cbsCode ?? null,
      name: node.displayName,
      provinceName: node.provinceName ?? null,
      population: node.population ?? null,
      initiatives,
      initiativeCount: initiatives.length,
      groeiCount: initiatives.filter((i) => i.kind === 'groei').length,
      gdCount: initiatives.filter((i) => i.kind === 'gd').length,
      vng2030: union(initiatives.map((i) => i.vng2030)),
      nds: union(initiatives.map((i) => i.nds)),
      themes: union(initiatives.map((i) => i.themes)),
      node,
    });
  }

  return rows.sort((a, b) => byName(a.name, b.name));
}

/**
 * THE initiative-row rule, client side (feature 022).
 *
 * One row per initiative in a GraphDataset: every selected top-level space (Groei) and
 * every GemeenteDelers callout (GD). Extracted verbatim from InitiativesTab, which had
 * grown this derivation inline, so the Initiatives table and the Funnel cannot disagree
 * about what an initiative is or how many gemeentes take part in it.
 *
 * The gemeente count is the EDGE RULE: distinct gemeente ORGANIZATION nodes connected to
 * the initiative node by any edge, in either direction. It is deliberately NOT the
 * description-text rule that `assembleGemeenteDistribution`'s GD side uses server-side
 * (that one counts gemeentes named in prose even where no organisation node exists). The
 * Funnel sizes its dots on this count (spec A-006), which is what makes its dot set
 * identical to the Initiatives table's row set (FR-017/SC-002).
 *
 * Mirrors `countSpaceGemeentes` / `countCityInitiatives` in
 * server/src/services/vng-dashboard-service.ts — the same discipline `utils/cities.ts`
 * already uses for the city rule.
 */
import { ActivityTier, type GraphDataset, type NodePhase } from '@server/types/graph.js';

/** Groei initiatives are top-level spaces only — subspaces (L1/L2) are not initiatives. */
const GROEI_TYPE = 'SPACE_L0';

export type InitiativeKind = 'groei' | 'gd';

export interface InitiativeRow {
  id: string;
  name: string;
  kind: InitiativeKind;
  /** Distinct associated gemeente names, sorted. Its length is THE participation count. */
  gemeentes: string[];
  /** Distinct provinces of this initiative's gemeentes. */
  provinces: string[];
  /** Distinct member / lead user counts. Null for GD initiatives — no membership. */
  members: number | null;
  leads: number | null;
  themes: string[];
  nds: string[];
  vng2030: string[];
  sdg: string[];
  awards: string[];
  commonGround: boolean;
  /** Activity counts per period — only meaningful for Groei rows. */
  activity: { day: number; week: number; month: number; total: number } | null;
  tier: ActivityTier | null;
  /**
   * Growth phase reached, from `GraphNode.phase` (feature 022). Always null for GD rows:
   * GemeenteDelers is a completed programme and carries no phase (spec A-005).
   */
  phase: NodePhase | null;
  /**
   * Technology Readiness Level reached, from `GraphNode.trl` — same shape and same
   * "highest selected level wins" reading as `phase`. Null for GD rows and for Groei
   * rows that select no level.
   */
  trl: NodePhase | null;
  /** Authored classification groups, for the funnel's hover card (FR-018). */
  classifications: { id: string; label: string; values: { id: string; label: string }[] }[];
}

/**
 * Flatten a dataset into one row per initiative, reading the classification fields
 * directly off the node and deriving connected gemeentes from edges.
 */
export function buildInitiativeRows(dataset: GraphDataset | null | undefined): InitiativeRow[] {
  if (!dataset) return [];

  const gemeenteName = new Map<string, string>();
  // Gemeente node id → its province name (set on gemeente ORG nodes server-side).
  const gemeenteProvince = new Map<string, string>();
  const userIds = new Set<string>();
  for (const n of dataset.nodes) {
    if (n.type === 'ORGANIZATION' && n.isGemeente === true) {
      gemeenteName.set(n.id, n.displayName);
      if (n.provinceName) gemeenteProvince.set(n.id, n.provinceName);
    } else if (n.type === 'USER') userIds.add(n.id);
  }

  const adj = new Map<string, Set<string>>();
  // Distinct member / lead users per space, keyed by space node id.
  const memberUsers = new Map<string, Set<string>>();
  const leadUsers = new Map<string, Set<string>>();
  const link = (map: Map<string, Set<string>>, a: string, b: string) => {
    let s = map.get(a);
    if (!s) map.set(a, (s = new Set()));
    s.add(b);
  };
  for (const e of dataset.edges) {
    link(adj, e.sourceId, e.targetId);
    link(adj, e.targetId, e.sourceId);
    if (e.type === 'MEMBER' || e.type === 'LEAD') {
      const userId = userIds.has(e.sourceId)
        ? e.sourceId
        : userIds.has(e.targetId)
          ? e.targetId
          : null;
      if (userId) {
        const spaceId = userId === e.sourceId ? e.targetId : e.sourceId;
        link(e.type === 'MEMBER' ? memberUsers : leadUsers, spaceId, userId);
      }
    }
  }

  const rows: InitiativeRow[] = [];
  for (const n of dataset.nodes) {
    const isSpace = n.type === GROEI_TYPE;
    const isInitiative = n.type === 'INITIATIVE';
    if (!isSpace && !isInitiative) continue;

    const neighbours = adj.get(n.id);
    const gemeenteIds = neighbours ? [...neighbours].filter((id) => gemeenteName.has(id)) : [];
    const gemeentes = gemeenteIds
      .map((id) => gemeenteName.get(id) as string)
      .sort((a, b) => a.localeCompare(b));
    const provinces = [
      ...new Set(gemeenteIds.map((id) => gemeenteProvince.get(id)).filter(Boolean) as string[]),
    ].sort((a, b) => a.localeCompare(b));

    rows.push({
      id: n.id,
      name: n.displayName,
      kind: isSpace ? 'groei' : 'gd',
      gemeentes,
      provinces,
      members: isSpace ? (memberUsers.get(n.id)?.size ?? 0) : null,
      leads: isSpace ? (leadUsers.get(n.id)?.size ?? 0) : null,
      themes: n.vngThemes ?? [],
      nds: n.ndsCategories ?? [],
      vng2030: n.vng2030Categories ?? [],
      sdg: n.globalGoals ?? [],
      awards: n.initiativeClassifications ?? [],
      commonGround: n.commonGround === true,
      activity: isSpace
        ? {
            day: n.activityByPeriod?.day ?? 0,
            week: n.activityByPeriod?.week ?? 0,
            month: n.activityByPeriod?.month ?? 0,
            total: n.totalActivityCount ?? n.activityByPeriod?.allTime ?? 0,
          }
        : null,
      tier: isSpace ? (n.spaceActivityTier ?? ActivityTier.INACTIVE) : null,
      // GD initiatives never carry a phase, whatever the node happens to hold.
      phase: isSpace ? (n.phase ?? null) : null,
      trl: isSpace ? (n.trl ?? null) : null,
      classifications: n.classifications ?? [],
    });
  }
  return rows;
}

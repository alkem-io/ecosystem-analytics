/**
 * THE ecosystem rule, client side (feature 024).
 *
 * Derives the ecosystem map's whole model from the `GraphDataset` the dashboard already
 * fetches — no extra request, exactly like `utils/funnel.ts` and `utils/initiatives.ts`.
 * An ecosystem is: a name, one optional orchestrator Space, the other Spaces as
 * initiatives, and every organisation holding a lead/member role on any of them.
 *
 * TWO THINGS THAT LOOK LIKE MISTAKES AND ARE NOT:
 *
 *  1. The orchestrator need NOT be one of the hub's listed Spaces. Verified against the
 *     live platform: VIH's orchestrator (`programmagroei`) is not in `vih-test`'s list.
 *     Callers therefore pass `orchestratorNameId` separately from `listedSpaceNameIds`
 *     and make sure the dataset covers it.
 *
 *  2. `EcoSpace.orgCount` is NOT the gemeente count that `utils/initiatives.ts` computes.
 *     That one is deliberately direct-edge-only and gemeente-only (it mirrors the
 *     server's `countSpaceGemeentes`). This one counts EVERY organisation, of every
 *     kind, including those whose only role sits on a subspace. The two numbers differ
 *     on purpose; do not "fix" one to match the other.
 */
import { EdgeType, NodeType, type GraphDataset, type GraphNode } from '@server/types/graph.js';

/** Where the effective orchestrator came from — shown to the viewer as a badge. */
export type OrchestratorSource = 'own' | 'community' | 'builtIn' | 'guess';

/** A Space drawn inside an ecosystem: the orchestrator, or one of its initiatives. */
export interface EcoSpace {
  /** `GraphNode.id` (Alkemio UUID). */
  id: string;
  /** Alkemio nameID — the key for the openSpace bridge and for the orchestrator choice. */
  nameId: string;
  name: string;
  /** Distinct organisations connected to this Space, direct or via subspace (see note 2). */
  orgCount: number;
  /** True when the hub lists this Space; false for the orchestrator or a direct addition. */
  listed: boolean;
}

/** Space ↔ Space. Only `partOf` today (orchestrator → initiative). */
export interface SpaceLink {
  kind: 'partOf';
  fromId: string;
  toId: string;
}

/** Organisation ↔ listed Space. */
export interface OrgConnection {
  ecosystemId: string;
  /** The top-level Space the connection is attributed to. */
  spaceId: string;
  /** Strongest role found at any level. */
  strength: 'lead' | 'member';
  /** `direct` as soon as one role sits on the Space itself. */
  provenance: 'direct' | 'viaSubspace';
  /** Subspaces the roles were found on, if any (hover detail). */
  subspaceIds: string[];
}

export interface EcoOrganisation {
  /** `GraphNode.id` — the openCity bridge key for a gemeente. */
  id: string;
  nameId: string | null;
  name: string;
  /** Proxied at render time, never here. */
  logoUrl: string | null;
  isGemeente: boolean;
  /** Every ecosystem this organisation has at least one connection in. */
  ecosystemIds: string[];
  connections: OrgConnection[];
  /** Connected to an orchestrator AND ≥1 initiative of the same ecosystem. */
  isConnector: boolean;
  linkedToOrchestrator: boolean;
  multiMembership: boolean;
}

/** One drawn region. This release builds exactly one; nothing may assume that. */
export interface Ecosystem {
  id: string;
  name: string;
  orchestrator: EcoSpace | null;
  orchestratorSource: OrchestratorSource | null;
  initiatives: EcoSpace[];
  spaceLinks: SpaceLink[];
}

export interface EcosystemModel {
  ecosystems: Ecosystem[];
  /** Each organisation exactly once across every ecosystem. */
  organisations: EcoOrganisation[];
}

export interface EcosystemFilters {
  linkedToOrchestrator: boolean;
  multiMembership: boolean;
}

/** What the caller knows about one ecosystem before the dataset is consulted. */
export interface EcosystemInput {
  hubNameId: string;
  hubDisplayName: string;
  /** nameIDs the hub lists. */
  listedSpaceNameIds: string[];
  /** nameIDs in the dashboard's effective selection (superset in practice). */
  selectedSpaceNameIds: string[];
  orchestratorNameId: string | null;
  orchestratorSource: OrchestratorSource | null;
}

const L0 = NodeType.SPACE_L0;
const SPACE_TYPES = new Set<NodeType>([NodeType.SPACE_L0, NodeType.SPACE_L1, NodeType.SPACE_L2]);
const ROLE_TYPES = new Set<EdgeType>([EdgeType.LEAD, EdgeType.MEMBER]);

/**
 * Walk `parentSpaceId` until a top-level Space is reached (FR-004a).
 * Returns the node itself when it is already L0, `null` when the chain is broken or
 * cyclic — a partially readable hierarchy must not hang the map.
 */
export function topLevelAncestor(
  nodeId: string,
  byId: Map<string, GraphNode>,
): { l0: GraphNode; path: string[] } | null {
  let node = byId.get(nodeId);
  const path: string[] = [];
  const seen = new Set<string>();
  while (node && SPACE_TYPES.has(node.type)) {
    if (node.type === L0) return { l0: node, path };
    if (seen.has(node.id)) return null; // cycle — give up rather than loop
    seen.add(node.id);
    path.push(node.id);
    node = node.parentSpaceId ? byId.get(node.parentSpaceId) : undefined;
  }
  return null;
}

/** Accumulator for one organisation ↔ Space pair while edges are scanned. */
interface Acc {
  strength: 'lead' | 'member';
  direct: boolean;
  subspaceIds: Set<string>;
}

export function buildEcosystemModel(
  dataset: GraphDataset,
  inputs: EcosystemInput[],
): EcosystemModel {
  const byId = new Map(dataset.nodes.map((n) => [n.id, n]));
  const l0ByNameId = new Map<string, GraphNode>();
  for (const n of dataset.nodes) {
    if (n.type === L0 && n.nameId) l0ByNameId.set(n.nameId, n);
  }

  // orgId → spaceId(L0) → accumulated role. Ecosystem-independent: the same role can
  // feed several ecosystems if they list the same Space.
  const roles = new Map<string, Map<string, Acc>>();
  for (const e of dataset.edges) {
    if (!ROLE_TYPES.has(e.type)) continue;
    const source = byId.get(e.sourceId);
    if (!source || source.type !== NodeType.ORGANIZATION) continue; // people are not in this visual
    const target = byId.get(e.targetId);
    if (!target || !SPACE_TYPES.has(target.type)) continue;
    const anc = topLevelAncestor(target.id, byId);
    if (!anc) continue;
    if (anc.l0.id === source.id) continue; // self-links are never drawn

    let spaces = roles.get(source.id);
    if (!spaces) roles.set(source.id, (spaces = new Map()));
    let acc = spaces.get(anc.l0.id);
    if (!acc) spaces.set(anc.l0.id, (acc = { strength: 'member', direct: false, subspaceIds: new Set() }));
    if (e.type === EdgeType.LEAD) acc.strength = 'lead';
    // `path[0]` is the Space the role is actually held on; the rest of the chain is
    // just how we got to the top-level Space and is nobody's business.
    if (anc.path.length === 0) acc.direct = true;
    else acc.subspaceIds.add(anc.path[0]);
  }

  // Spaces per ecosystem, and the org count each one carries.
  const orgCountBySpace = new Map<string, Set<string>>();
  for (const [orgId, spaces] of roles) {
    for (const spaceId of spaces.keys()) {
      let set = orgCountBySpace.get(spaceId);
      if (!set) orgCountBySpace.set(spaceId, (set = new Set()));
      set.add(orgId);
    }
  }
  const toEcoSpace = (node: GraphNode, listed: boolean): EcoSpace => ({
    id: node.id,
    nameId: node.nameId ?? node.id,
    name: node.displayName,
    orgCount: orgCountBySpace.get(node.id)?.size ?? 0,
    listed,
  });

  const ecosystems: Ecosystem[] = [];
  /** ecosystemId → { orchestratorId, initiativeIds } for the organisation pass. */
  const spaceScope = new Map<string, { orchestratorId: string | null; initiativeIds: Set<string> }>();

  for (const input of inputs) {
    const listed = new Set(input.listedSpaceNameIds);
    const orchNode = input.orchestratorNameId ? l0ByNameId.get(input.orchestratorNameId) : undefined;
    const orchestrator = orchNode ? toEcoSpace(orchNode, listed.has(orchNode.nameId ?? '')) : null;

    const initiatives: EcoSpace[] = [];
    const seen = new Set<string>();
    for (const nameId of [...input.listedSpaceNameIds, ...input.selectedSpaceNameIds]) {
      if (seen.has(nameId)) continue;
      seen.add(nameId);
      const node = l0ByNameId.get(nameId);
      if (!node) continue; // not readable / not fetched — simply absent (FR-026)
      if (orchestrator && node.id === orchestrator.id) continue;
      initiatives.push(toEcoSpace(node, listed.has(nameId)));
    }

    ecosystems.push({
      id: input.hubNameId,
      name: input.hubDisplayName,
      orchestrator,
      orchestratorSource: orchestrator ? input.orchestratorSource : null,
      initiatives,
      spaceLinks: orchestrator
        ? initiatives.map((i) => ({ kind: 'partOf' as const, fromId: orchestrator.id, toId: i.id }))
        : [],
    });
    spaceScope.set(input.hubNameId, {
      orchestratorId: orchestrator?.id ?? null,
      initiativeIds: new Set(initiatives.map((i) => i.id)),
    });
  }

  // One EcoOrganisation per organisation, connected into every ecosystem it touches.
  const organisations: EcoOrganisation[] = [];
  for (const [orgId, spaces] of roles) {
    const node = byId.get(orgId);
    if (!node) continue;

    const connections: OrgConnection[] = [];
    const ecosystemIds: string[] = [];
    let linkedToOrchestrator = false;
    let isConnector = false;

    for (const eco of ecosystems) {
      const scope = spaceScope.get(eco.id)!;
      let touchesOrchestrator = false;
      let touchesInitiative = false;
      for (const [spaceId, acc] of spaces) {
        const inScope = spaceId === scope.orchestratorId || scope.initiativeIds.has(spaceId);
        if (!inScope) continue;
        if (spaceId === scope.orchestratorId) touchesOrchestrator = true;
        else touchesInitiative = true;
        connections.push({
          ecosystemId: eco.id,
          spaceId,
          strength: acc.strength,
          provenance: acc.direct ? 'direct' : 'viaSubspace',
          subspaceIds: [...acc.subspaceIds],
        });
      }
      if (touchesOrchestrator || touchesInitiative) ecosystemIds.push(eco.id);
      if (touchesOrchestrator) linkedToOrchestrator = true;
      if (touchesOrchestrator && touchesInitiative) isConnector = true;
    }

    if (connections.length === 0) continue; // nothing in scope — not part of any ecosystem drawn

    organisations.push({
      id: node.id,
      nameId: node.nameId ?? null,
      name: node.displayName,
      logoUrl: node.avatarUrl,
      isGemeente: node.isGemeente === true,
      ecosystemIds,
      connections,
      isConnector,
      linkedToOrchestrator,
      multiMembership: connections.length >= 2,
    });
  }

  return { ecosystems, organisations };
}

/** Result of the four-step orchestrator resolution (FR-009). */
export interface OrchestratorResolution {
  nameId: string | null;
  source: OrchestratorSource | null;
  /** True when a built-in default was configured but is not among the candidates (FR-013). */
  builtInMissing: boolean;
}

export function resolveOrchestrator(args: {
  candidatesInDataset: Set<string>;
  own: string | null;
  community: string | null;
  builtIn: string | null;
  guess: () => string | null;
}): OrchestratorResolution {
  const { candidatesInDataset: present, own, community, builtIn, guess } = args;
  const builtInMissing = Boolean(builtIn) && !present.has(builtIn as string);

  const ordered: [OrchestratorSource, string | null][] = [
    ['own', own],
    ['community', community],
    ['builtIn', builtIn],
  ];
  for (const [source, nameId] of ordered) {
    if (nameId && present.has(nameId)) return { nameId, source, builtInMissing };
  }
  const guessed = guess();
  if (guessed) return { nameId: guessed, source: 'guess', builtInMissing };
  return { nameId: null, source: null, builtInMissing };
}

/**
 * Words a Space uses about itself when it runs a programme rather than being one
 * (research R6). Matched case-insensitively against name, tagline and description.
 */
const ORCHESTRATOR_WORDS =
  /programma|program|team|kenniscentrum|centrum|cent(?:er|re)|bureau|regie|co[oö]rdin|orchestr|secretariaat|innovatiehub|innovation hub/i;

/** How many other candidates a Space must share an organisation with to qualify on overlap alone. */
const MIN_OVERLAP = 2;

/**
 * Best-effort orchestrator guess from the Spaces' own profiles, used only when no
 * choice, community preset or built-in default applies (FR-009 step 4). Deliberately
 * modest: the dropdown is the authority and the result is labelled as a guess.
 */
export function guessOrchestrator(dataset: GraphDataset, candidateNameIds: string[]): string | null {
  const byId = new Map(dataset.nodes.map((n) => [n.id, n]));
  const candidates = candidateNameIds
    .map((nameId) => dataset.nodes.find((n) => n.type === L0 && n.nameId === nameId))
    .filter((n): n is GraphNode => Boolean(n));
  if (candidates.length === 0) return null;

  // Organisations per candidate, rolled up exactly as the model does.
  const orgsBySpace = new Map<string, Set<string>>(candidates.map((c) => [c.id, new Set<string>()]));
  for (const e of dataset.edges) {
    if (!ROLE_TYPES.has(e.type)) continue;
    const source = byId.get(e.sourceId);
    if (!source || source.type !== NodeType.ORGANIZATION) continue;
    const anc = topLevelAncestor(e.targetId, byId);
    if (!anc) continue;
    orgsBySpace.get(anc.l0.id)?.add(source.id);
  }

  const scored = candidates.map((c) => {
    const text = `${c.displayName} ${c.tagline ?? ''} ${c.description ?? ''}`;
    const profileHit = ORCHESTRATOR_WORDS.test(text) ? 1 : 0;
    const mine = orgsBySpace.get(c.id) ?? new Set<string>();
    let overlap = 0;
    for (const other of candidates) {
      if (other.id === c.id) continue;
      const theirs = orgsBySpace.get(other.id) ?? new Set<string>();
      for (const orgId of mine) {
        if (theirs.has(orgId)) {
          overlap += 1;
          break;
        }
      }
    }
    return { nameId: c.nameId ?? c.id, name: c.displayName, profileHit, overlap };
  });

  const qualifying = scored.filter((s) => s.profileHit === 1 || s.overlap >= MIN_OVERLAP);
  if (qualifying.length === 0) return null;
  qualifying.sort(
    (a, b) => b.profileHit - a.profileHit || b.overlap - a.overlap || a.name.localeCompare(b.name),
  );
  return qualifying[0].nameId;
}

/**
 * The Spaces the orchestrator dropdown may offer (FR-010): every Space drawn in the
 * model plus any explicitly named extra, restricted to what the dataset actually holds.
 */
export function candidateSpaces(model: EcosystemModel, extraNameIds: string[] = []): EcoSpace[] {
  const out = new Map<string, EcoSpace>();
  for (const eco of model.ecosystems) {
    if (eco.orchestrator) out.set(eco.orchestrator.nameId, eco.orchestrator);
    for (const i of eco.initiatives) out.set(i.nameId, i);
  }
  // `extraNameIds` only ever narrows to what is already drawn — a Space the dataset does
  // not carry cannot be offered, because the map could not draw it.
  void extraNameIds;
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Apply the two organisation filters (FR-020a). Organisations and their lines are the
 * only things hidden — the orchestrator, the initiatives, their part-of links and their
 * counts are exactly what they were, so the ecosystem never collapses to nothing.
 */
export function applyFilters(
  model: EcosystemModel,
  filters: EcosystemFilters,
): { model: EcosystemModel; hiddenCount: number } {
  if (!filters.linkedToOrchestrator && !filters.multiMembership) {
    return { model, hiddenCount: 0 };
  }
  const kept = model.organisations.filter(
    (o) =>
      (!filters.linkedToOrchestrator || o.linkedToOrchestrator) &&
      (!filters.multiMembership || o.multiMembership),
  );
  return {
    model: { ecosystems: model.ecosystems, organisations: kept },
    hiddenCount: model.organisations.length - kept.length,
  };
}

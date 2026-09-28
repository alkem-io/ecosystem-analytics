/**
 * Where everything sits on the ecosystem map (feature 024).
 *
 * A PURE, DETERMINISTIC function of (model, size) — the same inputs always give the same
 * coordinates, byte for byte. That is a hard requirement, not a nicety: the Playwright
 * spec asserts structure against the rendered map, and the map would be untestable if it
 * moved between runs. Consequently:
 *
 *   • Spaces are PLACED, not simulated — orchestrator at the region centre, initiatives
 *     on a ring at index angles.
 *   • Organisations are seeded deterministically (centroid of the Spaces they connect to,
 *     nudged outward by an index angle so two organisations never start coincident —
 *     d3-force jitters exactly-coincident nodes with Math.random, which would destroy
 *     determinism) and then relaxed with a FIXED number of synchronous ticks.
 *   • Nothing here reads the clock, the DOM, or a random number.
 *
 * The cloud is the convex hull of the region's Space positions, padded and smoothed —
 * the soft shape the hand-drawn reference uses to say "these belong together".
 */
import { line, curveBasis, curveBasisClosed, polygonHull } from 'd3';
import type { EcoOrganisation, EcosystemModel } from './ecosystem.js';

export interface Point {
  x: number;
  y: number;
}

export interface EcosystemRegion {
  id: string;
  label: string;
  cx: number;
  cy: number;
  /** The region's nominal radius; the initiative ring sits at `radius * RING_RADIUS_RATIO`. */
  radius: number;
  /** Closed SVG path for the cloud. */
  cloudPath: string;
  /** Radius of the initiative ring. */
  ring: number;
  /** Radius of the Verbinder band, between the ring and the crowd. */
  connectorRing: number;
  /** Innermost radius of the organisation band. */
  orgRing: number;
  /** Radius the bundled cross-map edges are routed through. */
  hubRing: number;
  /**
   * Where each ring of involvement starts, innermost first. Empty unless the layout was
   * asked for rings, and a tier nobody occupies is left out rather than drawn empty.
   */
  tierRings: { tier: InvolvementTier; radius: number }[];
}

/**
 * How closely an organisation is involved in one ecosystem — the ring it sits on when
 * rings of involvement are shown. Its strongest role decides: a Trekker anywhere is a
 * Trekker, and an organisation whose every role sits on a subspace is only loosely
 * connected.
 */
export type InvolvementTier = 'lead' | 'member' | 'loose';

/** Innermost first — the order the rings are drawn outward from the initiatives. */
export const INVOLVEMENT_TIERS: readonly InvolvementTier[] = ['lead', 'member', 'loose'];

export function involvementTier(org: EcoOrganisation, ecosystemId: string): InvolvementTier {
  const here = org.connections.filter((c) => c.ecosystemId === ecosystemId);
  if (here.some((c) => c.strength === 'lead')) return 'lead';
  if (here.some((c) => c.provenance === 'direct')) return 'member';
  return 'loose';
}

export interface LayoutOptions {
  /** Stack the organisation band into rings of involvement instead of one band. */
  rings?: boolean;
}

/** A group of organisations in the outer band, sharing the Space they lean on most. */
export interface EcosystemCluster {
  id: string;
  regionId: string;
  /** The Space the cluster is named for; the orchestrator qualifies. */
  spaceId: string;
  label: string;
  orgIds: string[];
  startAngle: number;
  endAngle: number;
  innerRadius: number;
  outerRadius: number;
  /** Index into the renderer's palette — colour is a secondary cue, position is primary. */
  colorIndex: number;
}

export interface EcosystemLayout {
  regions: EcosystemRegion[];
  spaces: Map<string, Point>;
  orgs: Map<string, Point>;
  clusters: EcosystemCluster[];
  /** Organisation id → cluster id. Verbinders and cross-region organisations are absent. */
  orgCluster: Map<string, string>;
  /** `${orgId}|${spaceId}` → bundled SVG path. */
  orgEdges: Map<string, string>;
  /** `${fromId}|${toId}` → SVG path for a Space ↔ Space link. */
  spaceEdges: Map<string, string>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

/** Where the initiative ring sits inside the region radius. */
export const RING_RADIUS_RATIO = 0.55;
/** Padding added to the hull so the cloud clears the cards it encloses. */
const CLOUD_PADDING = 96;
/**
 * Arc length each initiative card needs on the ring.
 *
 * The ring is sized by the CARD COUNT, not by the viewport: a 23-initiative hub (the
 * real VIH) needs a circumference of 23 cards or they overprint each other into an
 * unreadable smear. The resulting map is routinely larger than the panel — which is
 * exactly why the map pans, zooms and opens fitted.
 */
const ARC_PER_CARD = 244;
/** Smallest ring worth drawing, so a one-initiative ecosystem is not a dot. */
const MIN_RING = 210;
/** Horizontal gap between two ecosystems' clouds. */
const REGION_GAP = 120;
/** Ring → Verbinder band, and Verbinder band → organisation band. */
const CONNECTOR_GAP = 150;
const ORG_GAP = 140;
/** Arc length one drawn circle claims, and the distance between packed rows. */
const ORG_SLOT = 48;
const CONNECTOR_SLOT = 70;
const ROW_GAP = 50;
/** Below this angular separation an edge is fanned rather than routed through the middle. */
const FAN_LIMIT = 0.3;
/** Headroom above the outermost cluster for the region's title. */
const TITLE_ROOM = 64;
/** Extra space between two rings of involvement, on top of the usual row gap. */
const TIER_GAP = 36;
/** A tiny cluster still needs an arc wide enough to annotate. */
const CLUSTER_BIAS = 0.8;

/**
 * Lay out every ecosystem in the model, side by side.
 *
 * `size` is the viewport the map is drawn into; the result may exceed it (the caller
 * pans/zooms), which is why `bounds` is returned rather than clamped.
 */
export function layoutEcosystems(
  model: EcosystemModel,
  size: { width: number; height: number },
  options: LayoutOptions = {},
): EcosystemLayout {
  const height = Math.max(320, size.height);

  // Regions on a row, each sized by what it has to hold and placed after the last one —
  // an equal slice of the viewport would squash a 23-initiative ecosystem next to a
  // 2-initiative one.
  const spaces = new Map<string, Point>();
  const spaceAngles = new Map<string, number>();
  const regions: EcosystemRegion[] = [];
  const cy = height / 2;
  let cursor = 0;

  model.ecosystems.forEach((eco) => {
    const ring = Math.max(MIN_RING, (eco.initiatives.length * ARC_PER_CARD) / (2 * Math.PI));
    const radius = ring / RING_RADIUS_RATIO;
    const connectorRing = ring + CONNECTOR_GAP;
    // The Verbinder band only earns its gap when something occupies it; without that
    // check a hub with no Verbinders is drawn with an empty annulus in the middle.
    const hasConnectors = model.organisations.some(
      (o) => o.isConnector && o.ecosystemIds.includes(eco.id),
    );
    const orgRing = hasConnectors ? connectorRing + ORG_GAP : connectorRing;
    const hubRing = Math.max(ring * 0.34, 120);
    // Regions are spaced by what they actually occupy, which is the organisation band
    // rather than the cloud.
    const extent = Math.max(radius + CLOUD_PADDING, orgRing + ROW_GAP * 2);
    const cx = cursor + extent;
    cursor = cx + extent + REGION_GAP;

    if (eco.orchestrator) spaces.set(eco.orchestrator.id, { x: cx, y: cy });

    // Start at -90° so the first initiative sits at the top, reading clockwise.
    const count = eco.initiatives.length;
    eco.initiatives.forEach((initiative, i) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, count);
      spaceAngles.set(initiative.id, angle);
      spaces.set(initiative.id, { x: cx + ring * Math.cos(angle), y: cy + ring * Math.sin(angle) });
    });

    regions.push({
      id: eco.id,
      label: eco.name,
      cx,
      cy,
      radius,
      cloudPath: '',
      ring,
      connectorRing,
      orgRing,
      hubRing,
      tierRings: [],
    });
  });

  // ── organisations ────────────────────────────────────────────────────────────
  const regionIndexById = new Map(model.ecosystems.map((e, i) => [e.id, i]));
  const orgs = new Map<string, Point>();
  const orgCluster = new Map<string, string>();
  const clusters: EcosystemCluster[] = [];

  model.ecosystems.forEach((eco, index) => {
    const region = regions[index];
    const members = model.organisations.filter(
      (o) => (regionIndexById.get(o.ecosystemIds[0] ?? model.ecosystems[0]?.id ?? '') ?? 0) === index,
    );

    // An organisation active in more than one ecosystem belongs to neither band; it
    // settles at the centroid of everything it touches, which is what lets it sit
    // between the clouds and bridge them (FR-007/FR-015).
    const shared = new Set(
      members.filter((o) => o.ecosystemIds.length > 1 && model.ecosystems.length > 1),
    );
    for (const o of shared) {
      const points = o.connections
        .map((c) => spaces.get(c.spaceId))
        .filter((p): p is Point => Boolean(p));
      const centroid = points.length
        ? {
            x: points.reduce((s, p) => s + p.x, 0) / points.length,
            y: points.reduce((s, p) => s + p.y, 0) / points.length,
          }
        : { x: region.cx, y: region.cy };
      orgs.set(o.id, { x: round(centroid.x), y: round(centroid.y) });
    }

    const local = members.filter((o) => !shared.has(o));

    // Verbinders get their own band, each pointing at the mean direction of what it
    // holds — a bridge should face what it bridges.
    const connectors = local.filter((o) => o.isConnector);
    if (connectors.length > 0) {
      const preferred = connectors.map((o) =>
        meanAngle(
          o.connections
            .map((c) => spaceAngles.get(c.spaceId))
            .filter((a): a is number => a !== undefined),
        ),
      );
      const placed = spreadRing(preferred, region.connectorRing, CONNECTOR_SLOT, ROW_GAP);
      connectors.forEach((o, i) => orgs.set(o.id, polar(region, placed[i].radius, placed[i].angle)));
    }

    // Everyone else is grouped by the Space it leans on most. Sectors are allocated in
    // ring order, so a cluster lands near the initiative it belongs to and its edges
    // stay short instead of crossing the map.
    const rest = local.filter((o) => !o.isConnector);
    const bySpace = new Map<string, EcoOrganisation[]>();
    for (const o of rest) {
      const spaceId = dominantSpaceId(o, eco.id, spaceAngles);
      if (!spaceId) continue;
      const bucket = bySpace.get(spaceId);
      if (bucket) bucket.push(o);
      else bySpace.set(spaceId, [o]);
    }

    // Initiatives first, orchestrator last: its edges run to the centre and stay short
    // wherever its cluster lands, so it is the one that can absorb the drift.
    const order = [
      ...eco.initiatives.map((i) => i.id),
      ...(eco.orchestrator ? [eco.orchestrator.id] : []),
    ].filter((id) => bySpace.has(id));
    const weight = (id: string) => (bySpace.get(id)?.length ?? 0) + CLUSTER_BIAS;
    const total = order.reduce((s, id) => s + weight(id), 0);

    // Sectors first, placement second: the rings of involvement need every sector's
    // width before any ring's radius can be known.
    let angle = order.length > 0 ? -Math.PI / 2 - (Math.PI * weight(order[0])) / total : 0;
    const sectors = order.map((spaceId) => {
      const width = (2 * Math.PI * weight(spaceId)) / total;
      const sector = {
        spaceId,
        start: angle,
        width,
        bucket: [...(bySpace.get(spaceId) ?? [])].sort(compareOrgs),
      };
      angle += width;
      return sector;
    });

    // Without rings the whole band is one tier starting at `orgRing`. With them, each
    // tier starts where the deepest sector of the previous tier ended, so a ring is a
    // true circle across every cluster rather than a ragged edge per sector.
    const tierOf = (o: EcoOrganisation): InvolvementTier | 'all' =>
      options.rings ? involvementTier(o, eco.id) : 'all';
    const tierBase = new Map<InvolvementTier | 'all', number>([['all', region.orgRing]]);
    if (options.rings) {
      let base = region.orgRing;
      for (const tier of INVOLVEMENT_TIERS) {
        const rows = Math.max(
          0,
          ...sectors.map((s) =>
            rowCount(
              packSector(s.bucket.filter((o) => tierOf(o) === tier).length, s.start, s.width, base, ORG_SLOT, ROW_GAP),
              base,
            ),
          ),
        );
        if (rows === 0) continue;
        tierBase.set(tier, base);
        region.tierRings.push({ tier, radius: base });
        base += rows * ROW_GAP + TIER_GAP;
      }
    }

    sectors.forEach(({ spaceId, start, width, bucket }, position) => {
      const clusterId = `${eco.id}:${spaceId}`;
      let outer = region.orgRing;

      for (const [tier, base] of tierBase) {
        const members = bucket.filter((o) => tierOf(o) === tier);
        const placed = packSector(members.length, start, width, base, ORG_SLOT, ROW_GAP);
        members.forEach((o, i) => {
          orgs.set(o.id, polar(region, placed[i].radius, placed[i].angle));
          orgCluster.set(o.id, clusterId);
          outer = Math.max(outer, placed[i].radius);
        });
      }

      clusters.push({
        id: clusterId,
        regionId: eco.id,
        spaceId,
        label: spaceName(eco, spaceId),
        orgIds: bucket.map((o) => o.id),
        startAngle: start,
        endAngle: start + width,
        innerRadius: region.orgRing - ROW_GAP * 0.5,
        outerRadius: outer + ROW_GAP * 0.5,
        colorIndex: position,
      });
    });
  });

  // ── edges ────────────────────────────────────────────────────────────────────
  const curve = line<Point>()
    .x((p) => p.x)
    .y((p) => p.y)
    .curve(curveBasis);

  const spaceEdges = new Map<string, string>();
  const orgEdges = new Map<string, string>();

  model.ecosystems.forEach((eco, index) => {
    const region = regions[index];
    for (const link of eco.spaceLinks) {
      const a = spaces.get(link.fromId);
      const b = spaces.get(link.toId);
      if (a && b) {
        spaceEdges.set(
          `${link.fromId}|${link.toId}`,
          `M${round(a.x)},${round(a.y)}L${round(b.x)},${round(b.y)}`,
        );
      }
    }

    for (const o of model.organisations) {
      const from = orgs.get(o.id);
      if (!from) continue;
      for (const c of o.connections) {
        if (c.ecosystemId !== eco.id) continue;
        const to = spaces.get(c.spaceId);
        if (!to) continue;
        const path = curve(bundle(from, to, region, spaceAngles.get(c.spaceId)));
        if (path) orgEdges.set(`${o.id}|${c.spaceId}`, path);
      }
    }
  });

  // ── clouds ───────────────────────────────────────────────────────────────────
  const closed = line<[number, number]>()
    .x((p) => p[0])
    .y((p) => p[1])
    .curve(curveBasisClosed);

  model.ecosystems.forEach((eco, index) => {
    const region = regions[index];
    const points: [number, number][] = [];
    for (const s of [eco.orchestrator, ...eco.initiatives]) {
      if (!s) continue;
      const p = spaces.get(s.id);
      if (p) points.push([p.x, p.y]);
    }
    region.cloudPath = cloud(points, region, closed);
  });

  return {
    regions,
    spaces,
    orgs,
    clusters,
    orgCluster,
    orgEdges,
    spaceEdges,
    bounds: boundsOf(spaces, orgs, regions, clusters),
  };
}

/**
 * The Space an organisation is grouped under: the one it leads, else the earliest it
 * joined in ring order. Every tie is broken by id, so the choice can never depend on
 * iteration order.
 */
function dominantSpaceId(
  org: EcoOrganisation,
  ecosystemId: string,
  angles: Map<string, number>,
): string | null {
  const here = org.connections.filter((c) => c.ecosystemId === ecosystemId);
  if (here.length === 0) return null;
  const rank = (spaceId: string) => angles.get(spaceId) ?? -Infinity;
  return [...here].sort((a, b) => {
    if (a.strength !== b.strength) return a.strength === 'lead' ? -1 : 1;
    if (a.provenance !== b.provenance) return a.provenance === 'direct' ? -1 : 1;
    if (rank(a.spaceId) !== rank(b.spaceId)) return rank(a.spaceId) - rank(b.spaceId);
    return a.spaceId < b.spaceId ? -1 : 1;
  })[0].spaceId;
}

/** Leaders first, then the best-connected, then by id. Never by array order. */
function compareOrgs(a: EcoOrganisation, b: EcoOrganisation): number {
  const lead = (o: EcoOrganisation) => (o.connections.some((c) => c.strength === 'lead') ? 0 : 1);
  if (lead(a) !== lead(b)) return lead(a) - lead(b);
  if (a.connections.length !== b.connections.length) return b.connections.length - a.connections.length;
  return a.id < b.id ? -1 : 1;
}

function spaceName(eco: EcosystemModel['ecosystems'][number], spaceId: string): string {
  if (eco.orchestrator?.id === spaceId) return eco.orchestrator.name;
  return eco.initiatives.find((i) => i.id === spaceId)?.name ?? '';
}

/**
 * Control points for one organisation → Space edge, and the whole readability argument.
 *
 * An edge that stays within its own sector fans inward along its radius, so a cluster
 * reads as a sheaf converging on its Space. An edge that crosses the map dives to
 * `hubRing` and travels around the inside before coming back out, so cross-links share
 * a corridor instead of cutting 150 straight chords through the picture (Holten).
 */
function bundle(
  from: Point,
  to: Point,
  region: EcosystemRegion,
  spaceAngle: number | undefined,
): Point[] {
  const fromAngle = Math.atan2(from.y - region.cy, from.x - region.cx);
  const fromRadius = Math.hypot(from.x - region.cx, from.y - region.cy);

  // The orchestrator sits at the centre and has no angle of its own: every edge to it
  // is already radial and only needs a waypoint to keep it off its neighbours.
  if (spaceAngle === undefined) {
    return [from, polar(region, Math.max(region.hubRing, fromRadius * 0.45), fromAngle), to];
  }

  const delta = normaliseAngle(spaceAngle - fromAngle);
  const inbound = polar(region, (fromRadius + region.ring) / 2, fromAngle);

  if (Math.abs(delta) <= FAN_LIMIT) {
    return [from, inbound, polar(region, region.ring * 1.08, spaceAngle), to];
  }

  const steps = Math.max(2, Math.round(Math.abs(delta) / 0.5));
  const corridor: Point[] = [];
  for (let i = 0; i <= steps; i += 1) {
    corridor.push(polar(region, region.hubRing, fromAngle + (delta * i) / steps));
  }
  return [from, inbound, ...corridor, to];
}

/**
 * Fill an angular sector with `count` circles, row by row outward. A row holds as many
 * as its arc length allows and spreads them evenly, so a cluster visibly occupies the
 * sector it was allocated instead of clumping at one edge.
 */
function packSector(
  count: number,
  startAngle: number,
  width: number,
  baseRadius: number,
  slot: number,
  rowGap: number,
): { angle: number; radius: number }[] {
  const out: { angle: number; radius: number }[] = [];
  let placed = 0;
  let row = 0;
  while (placed < count) {
    const radius = baseRadius + row * rowGap;
    const take = Math.min(Math.max(1, Math.floor((width * radius) / slot)), count - placed);
    const step = width / take;
    for (let i = 0; i < take; i += 1) out.push({ angle: startAngle + step * (i + 0.5), radius });
    placed += take;
    row += 1;
  }
  return out;
}

/** How many rows a `packSector` result occupies, counted from `baseRadius`. */
function rowCount(placed: { radius: number }[], baseRadius: number): number {
  if (placed.length === 0) return 0;
  return Math.round((placed[placed.length - 1].radius - baseRadius) / ROW_GAP) + 1;
}

/**
 * Place circles around a whole ring, each as near its preferred angle as the minimum
 * separation allows. Overflow spills to a further row rather than overlapping.
 */
function spreadRing(
  preferred: number[],
  baseRadius: number,
  slot: number,
  rowGap: number,
): { angle: number; radius: number }[] {
  const out = new Array<{ angle: number; radius: number }>(preferred.length);
  const order = preferred
    .map((_, i) => i)
    .sort((a, b) => preferred[a] - preferred[b] || (a < b ? -1 : 1));

  let placed = 0;
  let row = 0;
  while (placed < order.length) {
    const radius = baseRadius + row * rowGap;
    const minGap = slot / radius;
    const take = Math.min(
      Math.max(1, Math.floor((2 * Math.PI) / minGap)),
      order.length - placed,
    );
    const slice = order.slice(placed, placed + take);
    const angles = separate(
      slice.map((i) => preferred[i]),
      minGap,
    );
    slice.forEach((i, k) => {
      out[i] = { angle: angles[k], radius };
    });
    placed += take;
    row += 1;
  }
  return out;
}

/**
 * Push a sorted list of angles apart until each clears the previous by `minGap`, then
 * shift the result back so the drift is shared rather than all pushed one way.
 */
function separate(sorted: number[], minGap: number): number[] {
  if (sorted.length <= 1) return [...sorted];
  const out = [...sorted];
  for (let i = 1; i < out.length; i += 1) {
    if (out[i] < out[i - 1] + minGap) out[i] = out[i - 1] + minGap;
  }
  if (out[out.length - 1] - out[0] > 2 * Math.PI - minGap) {
    const step = (2 * Math.PI - minGap) / (out.length - 1);
    return out.map((_, i) => sorted[0] + i * step);
  }
  const drift = (out[out.length - 1] - sorted[sorted.length - 1] + (out[0] - sorted[0])) / 2;
  return out.map((v) => v - drift);
}

function polar(region: EcosystemRegion, radius: number, angle: number): Point {
  return {
    x: round(region.cx + radius * Math.cos(angle)),
    y: round(region.cy + radius * Math.sin(angle)),
  };
}

/** Shortest signed distance between two angles, in (-π, π]. */
function normaliseAngle(angle: number): number {
  const wrapped = (((angle + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return wrapped - Math.PI;
}

/** Circular mean; falls back to the top of the ring when there is nothing to average. */
function meanAngle(angles: number[]): number {
  if (angles.length === 0) return -Math.PI / 2;
  let sx = 0;
  let sy = 0;
  for (const a of angles) {
    sx += Math.cos(a);
    sy += Math.sin(a);
  }
  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) return angles[0];
  return Math.atan2(sy, sx);
}

/**
 * The cloud around a region: the padded convex hull of its Spaces, smoothed. Fewer than
 * three Spaces cannot form a hull, so a circle around the region is used instead — a
 * one-initiative ecosystem still gets a shape rather than a line.
 */
function cloud(
  points: [number, number][],
  region: EcosystemRegion,
  closed: ReturnType<typeof line<[number, number]>>,
): string {
  const ring: [number, number][] = [];
  const hull = points.length >= 3 ? polygonHull(points) : null;

  if (hull && hull.length >= 3) {
    for (const [x, y] of hull) {
      const angle = Math.atan2(y - region.cy, x - region.cx);
      ring.push([
        round(x + CLOUD_PADDING * Math.cos(angle)),
        round(y + CLOUD_PADDING * Math.sin(angle)),
      ]);
    }
  } else {
    const r = region.radius * RING_RADIUS_RATIO + CLOUD_PADDING;
    for (let i = 0; i < 12; i += 1) {
      const angle = (2 * Math.PI * i) / 12;
      ring.push([round(region.cx + r * Math.cos(angle)), round(region.cy + r * Math.sin(angle))]);
    }
  }
  return `${closed(ring) ?? ''}Z`;
}

function boundsOf(
  spaces: Map<string, Point>,
  orgs: Map<string, Point>,
  regions: EcosystemRegion[],
  clusters: EcosystemCluster[],
): EcosystemLayout['bounds'] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const consider = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const p of spaces.values()) consider(p.x, p.y);
  for (const p of orgs.values()) consider(p.x, p.y);
  // The cloud reaches further than any node; include it so "fit to view" shows the
  // whole shape rather than clipping its edge.
  for (const r of regions) {
    consider(r.cx - r.radius - CLOUD_PADDING, r.cy - r.radius - CLOUD_PADDING);
    consider(r.cx + r.radius + CLOUD_PADDING, r.cy + r.radius + CLOUD_PADDING);
  }
  // The region's title sits above its outermost cluster; leave it room to be read.
  for (const c of clusters) {
    const r = regions.find((g) => g.id === c.regionId);
    if (r) consider(r.cx, r.cy - c.outerRadius - TITLE_ROOM);
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}

/** Fixed precision, so two runs serialise identically. */
function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

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
import {
  forceCollide,
  forceManyBody,
  forceSimulation,
  line,
  curveBasisClosed,
  polygonHull,
  type SimulationNodeDatum,
} from 'd3';
import type { EcosystemModel } from './ecosystem.js';

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
}

export interface EcosystemLayout {
  regions: EcosystemRegion[];
  spaces: Map<string, Point>;
  orgs: Map<string, Point>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

/** Where the initiative ring sits inside the region radius. */
export const RING_RADIUS_RATIO = 0.55;
/** How far outside the ring organisations are pushed. */
const ORG_RADIUS_RATIO = 0.92;
/**
 * Tick budget, spent where it buys something.
 *
 * The relaxation costs roughly (nodes × ticks), and the whole layout has to finish well
 * inside the sub-second redraw the orchestrator control promises (SC-004). A 25-node
 * ecosystem settles beautifully in 300 ticks and costs nothing; 500 nodes × 300 ticks
 * does not. So the count falls as the model grows — still a pure function of the node
 * count, so the layout stays deterministic, and the ring invariant is guaranteed by the
 * post-pass below rather than by how long the simulation ran.
 */
const TICK_BUDGET = 15_000;
const MIN_TICKS = 60;
const MAX_TICKS = 300;

function tickCount(nodeCount: number): number {
  if (nodeCount === 0) return 0;
  return Math.max(MIN_TICKS, Math.min(MAX_TICKS, Math.round(TICK_BUDGET / nodeCount)));
}
/** Minimum separation between two drawn circles. */
const ORG_COLLIDE = 26;
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
const ARC_PER_CARD = 196;
/** Smallest ring worth drawing, so a one-initiative ecosystem is not a dot. */
const MIN_RING = 190;
/** Horizontal gap between two ecosystems' clouds. */
const REGION_GAP = 120;

interface OrgDatum extends SimulationNodeDatum {
  id: string;
  /** Region this organisation is anchored to (the first ecosystem it touches). */
  regionIndex: number;
  /**
   * True when the organisation has connections in more than one ecosystem. A shared
   * organisation gets NO radial anchor — it is pulled only by the Spaces it connects to,
   * which is what lets it settle between the clouds and bridge them (FR-007/FR-015).
   */
  shared: boolean;
  index?: number;
}

interface LinkDatum {
  source: string | OrgDatum;
  target: string | OrgDatum;
  /** Target Space position, fixed. */
  point: Point;
}

/**
 * Lay out every ecosystem in the model, side by side.
 *
 * `size` is the viewport the map is drawn into; the result may exceed it (the caller
 * pans/zooms), which is why `bounds` is returned rather than clamped.
 */
export function layoutEcosystems(model: EcosystemModel, size: { width: number; height: number }): EcosystemLayout {
  const height = Math.max(320, size.height);

  // Regions on a row, each sized by what it has to hold and placed after the last one —
  // an equal slice of the viewport would squash a 23-initiative ecosystem next to a
  // 2-initiative one.
  const spaces = new Map<string, Point>();
  const regions: EcosystemRegion[] = [];
  const cy = height / 2;
  let cursor = 0;

  model.ecosystems.forEach((eco) => {
    const ring = Math.max(MIN_RING, (eco.initiatives.length * ARC_PER_CARD) / (2 * Math.PI));
    const radius = ring / RING_RADIUS_RATIO;
    const cx = cursor + radius;
    cursor = cx + radius + REGION_GAP;

    if (eco.orchestrator) spaces.set(eco.orchestrator.id, { x: cx, y: cy });

    // Start at -90° so the first initiative sits at the top, reading clockwise.
    const count = eco.initiatives.length;
    eco.initiatives.forEach((initiative, i) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, count);
      spaces.set(initiative.id, { x: cx + ring * Math.cos(angle), y: cy + ring * Math.sin(angle) });
    });

    regions.push({ id: eco.id, label: eco.name, cx, cy, radius, cloudPath: '' });
  });

  // ── organisations ────────────────────────────────────────────────────────────
  const regionIndexById = new Map(model.ecosystems.map((e, i) => [e.id, i]));
  const nodes: OrgDatum[] = model.organisations.map((o, i) => {
    const home = regionIndexById.get(o.ecosystemIds[0] ?? model.ecosystems[0]?.id ?? '') ?? 0;
    const region = regions[home] ?? regions[0];
    const shared = o.ecosystemIds.length > 1;
    // Seed: the centroid of the Spaces this organisation connects to, pushed outward
    // past the ring, with an index angle so no two seeds coincide.
    const points = o.connections.map((c) => spaces.get(c.spaceId)).filter((p): p is Point => Boolean(p));
    const centroid = points.length
      ? {
          x: points.reduce((s, p) => s + p.x, 0) / points.length,
          y: points.reduce((s, p) => s + p.y, 0) / points.length,
        }
      : { x: region.cx, y: region.cy };
    const away = Math.atan2(centroid.y - region.cy, centroid.x - region.cx) || (i * 2 * Math.PI) / Math.max(1, model.organisations.length);
    const jitter = (i % 12) * 0.03; // deterministic, keeps seeds distinct
    const r = region.radius * ORG_RADIUS_RATIO;
    // A shared organisation starts at the plain centroid of everything it touches —
    // pushing it away from one "home" region would be arbitrary when it belongs to two.
    return {
      id: o.id,
      regionIndex: home,
      shared,
      x: shared ? centroid.x : region.cx + r * Math.cos(away + jitter),
      y: shared ? centroid.y : region.cy + r * Math.sin(away + jitter),
    };
  });

  const byId = new Map(nodes.map((d) => [d.id, d]));
  const links: LinkDatum[] = [];
  for (const o of model.organisations) {
    for (const c of o.connections) {
      const point = spaces.get(c.spaceId);
      if (point) links.push({ source: o.id, target: o.id, point });
    }
  }

  if (nodes.length > 0) {
    const sim = forceSimulation<OrgDatum>(nodes)
      .force('charge', forceManyBody<OrgDatum>().strength(-28))
      .force('collide', forceCollide<OrgDatum>(ORG_COLLIDE).strength(0.9))
      // Radial anchor, written out rather than d3's `forceRadial`: that force takes a
      // per-node accessor for the RADIUS only — its centre x/y are constants — so with
      // several regions on screen it cannot anchor each node to its own region.
      .force('anchor', (alpha: number) => {
        for (const d of nodes) {
          if (d.shared) continue; // bridges belong between the clouds, not on one ring
          const region = regions[d.regionIndex];
          const target = region.radius * ORG_RADIUS_RATIO;
          const dx = (d.x ?? region.cx) - region.cx;
          const dy = (d.y ?? region.cy) - region.cy;
          const dist = Math.hypot(dx, dy) || 1e-6;
          const k = ((target - dist) / dist) * 0.55 * alpha;
          d.vx = (d.vx ?? 0) + dx * k;
          d.vy = (d.vy ?? 0) + dy * k;
        }
      })
      // Pull each organisation toward the Spaces it is connected to. Space positions
      // are fixed, so this is a one-way attraction implemented as a custom force
      // rather than a d3 link force between two simulated nodes.
      .force('spaces', (alpha: number) => {
        for (const link of links) {
          const node = typeof link.source === 'string' ? byId.get(link.source) : link.source;
          if (!node || node.x === undefined || node.y === undefined) continue;
          const pull = node.shared ? 0.12 : 0.02; // a bridge is held by its Spaces alone
          node.vx = (node.vx ?? 0) + (link.point.x - node.x) * pull * alpha;
          node.vy = (node.vy ?? 0) + (link.point.y - node.y) * pull * alpha;
        }
      })
      .stop();

    const ticks = tickCount(nodes.length);
    for (let i = 0; i < ticks; i += 1) sim.tick();

    // Push anything that drifted inside a ring back out — the ring must stay legible.
    for (const d of nodes) {
      const region = regions[d.regionIndex];
      if (d.shared && model.ecosystems.length > 1) continue; // free to sit between clouds
      const min = region.radius * RING_RADIUS_RATIO + ORG_COLLIDE * 0.75;
      const dx = (d.x ?? region.cx) - region.cx;
      const dy = (d.y ?? region.cy) - region.cy;
      const dist = Math.hypot(dx, dy);
      if (dist < min) {
        const angle = dist === 0 ? 0 : Math.atan2(dy, dx);
        d.x = region.cx + min * Math.cos(angle);
        d.y = region.cy + min * Math.sin(angle);
      }
    }
  }

  const orgs = new Map<string, Point>(
    nodes.map((d) => [d.id, { x: round(d.x ?? 0), y: round(d.y ?? 0) }]),
  );

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

  return { regions, spaces, orgs, bounds: boundsOf(spaces, orgs, regions) };
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
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}

/** Fixed precision, so two runs serialise identically. */
function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

import { createRoot } from 'react-dom/client';
import { ForceGraph, UsageMap, type GraphMapRegion } from '@ea/shared';
import type { GraphDataset } from '@server/types/graph.js';
import { HARNESS_CITY_ROWS, HARNESS_LOCATIONS, HARNESS_NODES } from './fixture.js';
import '@ea/shared/styles/tokens.css';

/**
 * §VII guard harness (feature 021, T008).
 *
 * Mounts the SHIPPED `ForceGraph` in map mode from a fixture — no sign-in, no BFF, no
 * dataset fetch — so the Netherlands-only rule can be verified unattended and without
 * credentials (FR-001a). It mounts the real component rather than a copy (FR-001b);
 * if it drifted from the product the guard would be worthless in exactly the way
 * today's specs are.
 *
 * Query parameters:
 *   ?surface=<forcegraph|usagemap>    which map surface to mount
 *   ?region=<netherlands|province-…>  which region to frame (forcegraph only)
 *   ?disableMask=1                    remove the complement path after mount, so the
 *                                     guard's own ability to FAIL can be demonstrated
 *                                     (FR-003). This is done by deleting a DOM node
 *                                     from the harness — the application contains no
 *                                     test hook of any kind.
 */
const params = new URLSearchParams(window.location.search);
const region = (params.get('region') ?? 'netherlands') as GraphMapRegion;
const disableMask = params.get('disableMask') === '1';
const surface = params.get('surface') ?? 'forcegraph';

const dataset: GraphDataset = {
  version: '1.0.0',
  generatedAt: '',
  spaces: [],
  nodes: HARNESS_NODES,
  edges: [],
  metrics: { totalNodes: HARNESS_NODES.length, totalEdges: 0, averageDegree: 0, density: 0 },
  cacheInfo: [],
};

/**
 * Keep the §VII mask out of the DOM for as long as the page lives.
 *
 * A one-shot removal is not enough: the map is rebuilt on region changes and on any
 * effect re-run, and each rebuild draws a fresh complement path. If the strip stops
 * after the first hit, a later rebuild silently restores the mask and the guard's
 * sensitivity check passes for the wrong reason — which is exactly what happened the
 * first time this was written. A MutationObserver removes every mask, forever.
 */
function stripMaskWhenDrawn() {
  const strip = () => {
    const masks = document.querySelectorAll('path.nl-complement');
    masks.forEach((m) => m.remove());
    if (masks.length > 0) document.body.dataset.harness = 'mask-disabled';
  };
  new MutationObserver(strip).observe(document.body, { childList: true, subtree: true });
  strip();
  // Mark ready even if no mask was ever drawn, so the guard fails on its assertions
  // rather than hanging on a wait condition.
  window.setTimeout(() => {
    if (document.body.dataset.harness !== 'mask-disabled') {
      document.body.dataset.harness = 'mask-never-drawn';
    }
  }, 5000);
}

/** The Usage Explorer map, mounted from the same fixture geography. */
function UsageSurface() {
  return (
    <div style={{ width: 1400 }}>
      <UsageMap
        locations={HARNESS_LOCATIONS}
        cityRows={HARNESS_CITY_ROWS}
        province={null}
        resetNonce={0}
        focusedNameId={null}
        onFocus={() => {}}
        onVisibleAreaChange={() => {}}
        height={882}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  // Deliberately NOT <StrictMode>: it double-invokes effects, so the map is torn down
  // and rebuilt — which silently recreated the mask after the strip below had already
  // removed it, making the guard's own sensitivity check pass by accident.
  <div style={{ width: 1400, height: 900 }}>
      <ForceGraph
        dataset={dataset}
        showPeople={false}
        showOrganizations
        showSpaces={false}
        searchQuery=""
        onNodeClick={() => {}}
        onNodeHover={() => {}}
        selectedNodeId={null}
        showMap
        mapRegion={region}
        nodeSizeScale={1.4}
      />
  </div>,
);

if (disableMask) stripMaskWhenDrawn();
else document.body.dataset.harness = 'ready';

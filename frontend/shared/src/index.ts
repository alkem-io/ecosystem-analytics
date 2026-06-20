/**
 * @ea/shared — code shared by the Ecosystem Analytics frontends
 * (Explorer + VNG Kenniscentrum Innovatie).
 *
 * Extraction is incremental (see specs/016-vng-frontend/tasks.md T007/T009/T012):
 * graph (ForceGraph), map (MapOverlay), panels (DetailsDrawer), services (api/auth),
 * and shadcn ui primitives land here over time.
 */
export { cn } from './lib/cn.js';
export { proxyImageUrl } from './lib/imageProxy.js';
export { api } from './services/api.js';
export { login, logout, fetchMe, type MeResponse } from './services/auth.js';

// Graph + map visualization (force-directed network over a static basemap).
export { default as ForceGraph } from './graph/ForceGraph.js';
export { default as HoverCard } from './graph/HoverCard.js';
export { default as MapOverlay, type MapRegion } from './map/MapOverlay.js';
export { computeClusters, type Cluster, type ClusterMode } from './graph/clustering.js';
export {
  computeProximityGroups,
  type ProximityCluster,
  type ProximityNode,
} from './graph/proximityClustering.js';
export {
  isWithinRegion,
  computePinnedNodeIds,
  computeMapBounds,
} from './graph/mapBoundary.js';

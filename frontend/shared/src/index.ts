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

// UI primitives (shadcn-style: Radix + Tailwind + CVA). Shared copies of the
// reusable shadcn primitives so every SPA consumes one source of truth. These
// rely on the consuming app's Tailwind theme tokens (see @ea/shared/styles).
export { Avatar, AvatarImage, AvatarFallback } from './ui/avatar.js';
export { Badge, badgeVariants, type BadgeProps } from './ui/badge.js';
export { Button, buttonVariants, type ButtonProps } from './ui/button.js';
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from './ui/card.js';
export { Checkbox } from './ui/checkbox.js';
export { Input } from './ui/input.js';
export { Label } from './ui/label.js';
export { ScrollArea, ScrollBar } from './ui/scroll-area.js';
export { Separator } from './ui/separator.js';
export { Textarea, type TextareaProps } from './ui/textarea.js';
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './ui/tooltip.js';

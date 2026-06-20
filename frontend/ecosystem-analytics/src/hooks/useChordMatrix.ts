/**
 * Hook: useChordMatrix
 * Computes a ChordMatrixResult from GraphNode[] + GraphEdge[].
 * Builds an N×N shared-member matrix per data-model.md Section 7 algorithm.
 * Supports role filter and group level (L0/L1).
 */

import { useMemo } from 'react';
import type { GraphDataset, GraphNode, GraphEdge } from '@server/types/graph.js';
import { NodeType, EdgeType } from '@server/types/graph.js';
import type { ChordMode, ChordMatrixResult, ChordSpaceMeta } from '../types/views.js';
import { getNodeDisplayImage } from '../services/imageUtils.js';

export interface UseChordMatrixReturn {
  result: ChordMatrixResult | null;
  loading: boolean;
}

interface UseChordMatrixOptions {
  dataset: GraphDataset | null;
  chordMode: ChordMode;
  groupLevel: 'L0' | 'L1';
  roleFilter?: EdgeType[];
}

export function useChordMatrix({
  dataset,
  chordMode,
  groupLevel,
  roleFilter,
}: UseChordMatrixOptions): UseChordMatrixReturn {
  const result = useMemo(() => {
    if (!dataset) return null;

    if (chordMode === 'shared-members') {
      return buildSharedMemberMatrix(dataset.nodes, dataset.edges, groupLevel, roleFilter);
    } else {
      return buildSharedTagMatrix(dataset.nodes, groupLevel);
    }
  }, [dataset, chordMode, groupLevel, roleFilter]);

  return { result, loading: false };
}

/**
 * Build an N×N shared-member matrix from edges (data-model.md Section 7).
 * 1. Filter edges to roleFilter types
 * 2. Build Map<userId, Set<spaceId>> from user→space edges
 * 3. For each user, iterate all pairs of their spaces → increment matrix[i][j] and matrix[j][i]
 * 4. Diagonal matrix[i][i] = total unique members (for arc sizing)
 */
function buildSharedMemberMatrix(
  nodes: GraphNode[],
  edges: GraphEdge[],
  groupLevel: 'L0' | 'L1',
  roleFilter?: EdgeType[],
): ChordMatrixResult {
  // Determine which space types to use as groups
  const spaceType = groupLevel === 'L0' ? NodeType.SPACE_L0 : NodeType.SPACE_L1;
  const spaces = nodes.filter((n) => n.type === spaceType);

  if (spaces.length === 0) {
    return { matrix: [], spaceNames: [], spaceIds: [], spaceMeta: [] };
  }

  const spaceIds = spaces.map((s) => s.id);
  const spaceNames = spaces.map((s) => s.displayName);
  const spaceIndex = new Map<string, number>();
  spaces.forEach((s, i) => spaceIndex.set(s.id, i));

  // Build per-space metadata
  const spaceMeta: ChordSpaceMeta[] = spaces.map((s) => ({
    avatarUrl: getNodeDisplayImage({ type: s.type, avatarUrl: s.avatarUrl, bannerUrl: s.bannerUrl }),
    bannerUrl: s.bannerUrl,
    privacyMode: s.privacyMode,
    activityTier: s.spaceActivityTier ?? undefined,
    tagline: s.tagline,
    memberCount: 0, // will be filled from diagonal
  }));

  // For L1 grouping, we need to map L2 spaces up to their L1 parent
  // and L0 spaces are excluded, only L1 spaces are chord groups
  const spaceToGroupIndex = new Map<string, number>();

  if (groupLevel === 'L0') {
    // Every space maps to its L0 root (via scopeGroups or parentSpaceId chain)
    for (const node of nodes) {
      if (node.type === NodeType.SPACE_L0) {
        spaceToGroupIndex.set(node.id, spaceIndex.get(node.id) ?? -1);
      } else if (node.type === NodeType.SPACE_L1 || node.type === NodeType.SPACE_L2) {
        // Find L0 ancestor via scopeGroups
        for (const sg of node.scopeGroups) {
          const idx = spaceIndex.get(sg);
          if (idx !== undefined) {
            spaceToGroupIndex.set(node.id, idx);
            break;
          }
        }
      }
    }
  } else {
    // L1 grouping — each L1 is its own group; L2s map to parent L1
    for (const node of nodes) {
      if (node.type === NodeType.SPACE_L1) {
        const idx = spaceIndex.get(node.id);
        if (idx !== undefined) spaceToGroupIndex.set(node.id, idx);
      } else if (node.type === NodeType.SPACE_L2 && node.parentSpaceId) {
        const idx = spaceIndex.get(node.parentSpaceId);
        if (idx !== undefined) spaceToGroupIndex.set(node.id, idx);
      }
    }
  }

  // Filter edges
  const allowedTypes = new Set(roleFilter ?? [EdgeType.MEMBER, EdgeType.LEAD, EdgeType.ADMIN]);

  // Build user→space-groups mapping
  const userSpaces = new Map<string, Set<number>>();

  for (const edge of edges) {
    if (!allowedTypes.has(edge.type)) continue;
    const sourceNode = nodes.find((n) => n.id === edge.sourceId);
    if (!sourceNode || (sourceNode.type !== NodeType.USER && sourceNode.type !== NodeType.ORGANIZATION)) continue;

    const groupIdx = spaceToGroupIndex.get(edge.targetId);
    if (groupIdx === undefined || groupIdx < 0) continue;

    let groups = userSpaces.get(edge.sourceId);
    if (!groups) {
      groups = new Set();
      userSpaces.set(edge.sourceId, groups);
    }
    groups.add(groupIdx);
  }

  // Build matrix
  const n = spaces.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (const [, groups] of userSpaces) {
    const indices = Array.from(groups);
    // Diagonal: count unique members
    for (const i of indices) {
      matrix[i][i]++;
    }
    // Off-diagonal: shared members
    for (let a = 0; a < indices.length; a++) {
      for (let b = a + 1; b < indices.length; b++) {
        matrix[indices[a]][indices[b]]++;
        matrix[indices[b]][indices[a]]++;
      }
    }
  }

  // Fill member counts from diagonal
  for (let i = 0; i < n; i++) {
    spaceMeta[i].memberCount = matrix[i][i];
  }

  return { matrix, spaceNames, spaceIds, spaceMeta };
}

/**
 * Build an N×N shared-tag matrix.
 * Tags are extracted from space nodes' tags property.
 * Elements[i][j] = number of tags shared between space i and j.
 */
function buildSharedTagMatrix(
  nodes: GraphNode[],
  groupLevel: 'L0' | 'L1',
): ChordMatrixResult {
  const spaceType = groupLevel === 'L0' ? NodeType.SPACE_L0 : NodeType.SPACE_L1;
  const spaces = nodes.filter((n) => n.type === spaceType);

  if (spaces.length === 0) {
    return { matrix: [], spaceNames: [], spaceIds: [], spaceMeta: [] };
  }

  const spaceIds = spaces.map((s) => s.id);
  const spaceNames = spaces.map((s) => s.displayName);

  // Build per-space metadata
  const spaceMeta: ChordSpaceMeta[] = spaces.map((s) => ({
    avatarUrl: getNodeDisplayImage({ type: s.type, avatarUrl: s.avatarUrl, bannerUrl: s.bannerUrl }),
    bannerUrl: s.bannerUrl,
    privacyMode: s.privacyMode,
    activityTier: s.spaceActivityTier ?? undefined,
    tagline: s.tagline,
    memberCount: 0,
  }));

  // Collect all tags per space
  const spaceTags: Set<string>[] = spaces.map((s) => {
    const tags = new Set<string>();
    if (s.tags?.keywords) s.tags.keywords.forEach((t) => tags.add(t.toLowerCase()));
    if (s.tags?.skills) s.tags.skills.forEach((t) => tags.add(t.toLowerCase()));
    if (s.tags?.default) s.tags.default.forEach((t) => tags.add(t.toLowerCase()));
    return tags;
  });

  const n = spaces.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  // Diagonal: total tags per space
  for (let i = 0; i < n; i++) {
    matrix[i][i] = spaceTags[i].size;
    spaceMeta[i].memberCount = spaceTags[i].size;
  }

  // Off-diagonal: intersection count
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let shared = 0;
      for (const tag of spaceTags[i]) {
        if (spaceTags[j].has(tag)) shared++;
      }
      matrix[i][j] = shared;
      matrix[j][i] = shared;
    }
  }

  return { matrix, spaceNames, spaceIds, spaceMeta };
}

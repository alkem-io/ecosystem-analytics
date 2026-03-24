import { useState, useCallback, useMemo } from 'react';
import { api } from '../services/api.js';
import type { DashboardDataset, CalloutDetail, ContributorDetail, HeadlineMetrics, TimelineBucket, PhaseInfo, OrganizationActivity, SubspaceMetrics } from '@server/types/dashboard.js';

export type TimeRangePreset = 'all' | 'last30' | 'lastQuarter' | 'lastYear';

export interface DashboardFilterState {
  timeRange: TimeRangePreset;
  phaseId: string | null;
  /** Selected L1 subspace ID, or null for "Entire space" */
  subspaceId: string | null;
  /** Selected L2 sub-subspace ID, or null for "All sub-subspaces" */
  subSubspaceId: string | null;
}

export interface FilteredDashboard {
  headline: HeadlineMetrics;
  callouts: CalloutDetail[];
  contributors: ContributorDetail[];
  timeline: TimelineBucket[];
  organizations: OrganizationActivity[];
  subspaces: SubspaceMetrics[];
  /** Phases relevant to the currently selected scope */
  scopedPhases: PhaseInfo[];
}

export function useDashboard() {
  const [dataset, setDataset] = useState<DashboardDataset | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [filters, setFilters] = useState<DashboardFilterState>({
    timeRange: 'all',
    phaseId: null,
    subspaceId: null,
    subSubspaceId: null,
  });

  const generate = useCallback(async (spaceId: string, forceRefresh = false) => {
    setLoading(true);
    setError(null);
    setSelectedSpaceId(spaceId);
    setFilters({ timeRange: 'all', phaseId: null, subspaceId: null, subSubspaceId: null });

    try {
      const result = await api.generateDashboard(spaceId, forceRefresh);
      setDataset(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const setTimeRange = useCallback((timeRange: TimeRangePreset) => {
    setFilters((prev) => ({ ...prev, timeRange }));
  }, []);

  const setPhaseId = useCallback((phaseId: string | null) => {
    setFilters((prev) => ({ ...prev, phaseId }));
  }, []);

  const setSubspaceId = useCallback((subspaceId: string | null) => {
    // When changing L1, reset L2 and phase since they depend on scope
    setFilters((prev) => ({ ...prev, subspaceId, subSubspaceId: null, phaseId: null }));
  }, []);

  const setSubSubspaceId = useCallback((subSubspaceId: string | null) => {
    // When changing L2, reset phase since it depends on scope
    setFilters((prev) => ({ ...prev, subSubspaceId, phaseId: null }));
  }, []);

  // Client-side filtering
  const filtered = useMemo<FilteredDashboard | null>(() => {
    if (!dataset) return null;

    let callouts = dataset.callouts;

    // Filter by subspace scope (cascading: L1 → L2)
    if (filters.subSubspaceId) {
      // Specific L2 selected
      callouts = callouts.filter((c) => c.subspaceId === filters.subSubspaceId);
    } else if (filters.subspaceId) {
      // L1 selected: include L1 callouts + all its L2 children
      const l2Ids = new Set(
        dataset.subspaceTree
          .find((s) => s.id === filters.subspaceId)
          ?.children.map((c) => c.id) ?? [],
      );
      callouts = callouts.filter(
        (c) => c.subspaceId === filters.subspaceId || l2Ids.has(c.subspaceId ?? ''),
      );
    }
    // else: no scope filter → all callouts from entire space

    // Derive scoped phases from the filtered callouts (before phase/time filters)
    const phaseCountMap = new Map<string, { displayName: string; count: number }>();
    for (const c of callouts) {
      if (c.phaseId) {
        const entry = phaseCountMap.get(c.phaseId);
        if (entry) {
          entry.count++;
        } else {
          phaseCountMap.set(c.phaseId, { displayName: c.phaseName, count: 1 });
        }
      }
    }
    const scopedPhases: PhaseInfo[] = [];
    // Use dataset.phases for ordering, but only include phases present in current scope
    for (const p of dataset.phases) {
      const entry = phaseCountMap.get(p.id);
      if (entry) {
        scopedPhases.push({ ...p, calloutCount: entry.count });
      }
    }
    // Add any phases not in dataset.phases (edge case)
    for (const [id, entry] of phaseCountMap) {
      if (!scopedPhases.some((p) => p.id === id)) {
        scopedPhases.push({ id, displayName: entry.displayName, sortOrder: 999, calloutCount: entry.count });
      }
    }

    // Filter by phase
    if (filters.phaseId) {
      callouts = callouts.filter((c) => c.phaseId === filters.phaseId);
    }

    // Filter by time range
    const cutoff = getTimeCutoff(filters.timeRange);
    if (cutoff) {
      const cutoffStr = cutoff.toISOString();
      callouts = callouts.filter((c) => {
        return c.createdDate >= cutoffStr || (c.lastActivityDate && c.lastActivityDate >= cutoffStr);
      });
    }

    // Recompute headline metrics from filtered callouts
    const totalCallouts = callouts.length;
    const totalContributions = callouts.reduce((s, c) => s + c.contributionCount, 0);
    const totalComments = callouts.reduce((s, c) => s + c.commentCount, 0);
    const contributionsByType = {
      post: callouts.reduce((s, c) => s + c.contributionsByType.post, 0),
      memo: callouts.reduce((s, c) => s + c.contributionsByType.memo, 0),
      link: callouts.reduce((s, c) => s + c.contributionsByType.link, 0),
      whiteboard: callouts.reduce((s, c) => s + c.contributionsByType.whiteboard, 0),
    };
    const unanswered = callouts.filter((c) => c.contributionCount === 0).length;

    const noFilters = !filters.phaseId && !cutoff && !filters.subspaceId && !filters.subSubspaceId;

    // --- Filter contributors ---
    let contributors = dataset.contributors;
    if (!noFilters) {
      // Subspace filter: keep contributors active in matching subspaces, recalculate counts
      if (filters.subSubspaceId || filters.subspaceId) {
        const relevantIds = new Set<string>();
        if (filters.subSubspaceId) {
          relevantIds.add(filters.subSubspaceId);
        } else if (filters.subspaceId) {
          relevantIds.add(filters.subspaceId);
          for (const ch of dataset.subspaceTree.find((s) => s.id === filters.subspaceId)?.children ?? []) {
            relevantIds.add(ch.id);
          }
        }
        contributors = contributors
          .map((c) => {
            const subs = c.perSubspace.filter((ps) => relevantIds.has(ps.subspaceId));
            if (subs.length === 0) return null;
            const scopedContribs = subs.reduce((sum, ps) => sum + ps.count, 0);
            return { ...c, totalContributions: scopedContribs, perSubspace: subs, activeSubspaceCount: subs.length };
          })
          .filter((c): c is ContributorDetail => c !== null)
          .sort((a, b) => b.totalContributions - a.totalContributions);
      }

      // Time filter: keep contributors active in the period; recalculate counts from perMonth
      if (cutoff) {
        const cutoffMonth = cutoff.toISOString().slice(0, 7);
        contributors = contributors
          .map((c) => {
            const relevantMonths = c.perMonth.filter((pm) => pm.month >= cutoffMonth);
            if (relevantMonths.length === 0 && c.totalComments === 0) return null;
            const scopedContribs = relevantMonths.reduce((sum, pm) => sum + pm.count, 0);
            if (scopedContribs === 0 && c.totalComments === 0) return null;
            return { ...c, totalContributions: scopedContribs, perMonth: relevantMonths };
          })
          .filter((c): c is ContributorDetail => c !== null)
          .sort((a, b) => b.totalContributions - a.totalContributions);
      }
    }

    const activeContributorCount = contributors.filter((c) => c.totalContributions > 0).length;

    // --- Filter organizations from filtered contributors ---
    let organizations: OrganizationActivity[];
    if (noFilters) {
      organizations = dataset.organizations;
    } else {
      const orgMap = new Map<string, OrganizationActivity>();
      const origOrgs = new Map(dataset.organizations.map((o) => [o.organizationId, o]));
      for (const c of contributors) {
        if (!c.organizationId) continue;
        let org = orgMap.get(c.organizationId);
        if (!org) {
          const orig = origOrgs.get(c.organizationId);
          org = {
            organizationId: c.organizationId,
            displayName: c.organizationName ?? orig?.displayName ?? 'Unknown',
            avatarUrl: orig?.avatarUrl ?? null,
            memberCount: 0,
            activeContributorCount: 0,
            totalContributions: 0,
          };
          orgMap.set(c.organizationId, org);
        }
        org.memberCount++;
        if (c.totalContributions > 0) org.activeContributorCount++;
        org.totalContributions += c.totalContributions;
      }
      organizations = Array.from(orgMap.values()).sort((a, b) => b.totalContributions - a.totalContributions);
    }

    // --- Filter subspace metrics from filtered callouts ---
    let subspaces: SubspaceMetrics[];
    if (noFilters) {
      subspaces = dataset.subspaces;
    } else {
      const subMap = new Map<string, SubspaceMetrics>();
      for (const sub of dataset.subspaces) {
        subMap.set(sub.id, { ...sub, totalCallouts: 0, totalContributions: 0, totalComments: 0, uniqueContributors: 0 });
      }
      const contributorsBySubspace = new Map<string, Set<string>>();
      for (const c of callouts) {
        if (!c.subspaceId) continue;
        const sub = subMap.get(c.subspaceId);
        if (sub) {
          sub.totalCallouts++;
          sub.totalContributions += c.contributionCount;
          sub.totalComments += c.commentCount;
        }
        if (c.createdById) {
          let set = contributorsBySubspace.get(c.subspaceId);
          if (!set) { set = new Set(); contributorsBySubspace.set(c.subspaceId, set); }
          set.add(c.createdById);
        }
      }
      for (const [id, set] of contributorsBySubspace) {
        const sub = subMap.get(id);
        if (sub) sub.uniqueContributors = set.size;
      }
      subspaces = Array.from(subMap.values()).filter((s) => s.totalCallouts > 0);
    }

    const headline: HeadlineMetrics = noFilters
      ? dataset.headline
      : {
          ...dataset.headline,
          totalCallouts,
          totalContributions,
          contributionsByType,
          totalComments,
          totalUniqueContributors: activeContributorCount,
          engagementRatio: dataset.headline.totalMembers > 0 ? activeContributorCount / dataset.headline.totalMembers : 0,
          unansweredCalloutPct: totalCallouts > 0 ? unanswered / totalCallouts : 0,
          avgContributionsPerCallout: totalCallouts > 0 ? totalContributions / totalCallouts : 0,
          avgCommentsPerContribution: totalContributions > 0 ? totalComments / totalContributions : 0,
          totalWhiteboards: contributionsByType.whiteboard,
        };

    // Filter and aggregate timeline entries by subspace scope
    let timelineEntries = dataset.timeline;

    // Filter timeline entries by subspace scope
    if (filters.subSubspaceId) {
      timelineEntries = timelineEntries.filter((t) => t.subspaceId === filters.subSubspaceId);
    } else if (filters.subspaceId) {
      const l2Ids = new Set(
        dataset.subspaceTree
          .find((s) => s.id === filters.subspaceId)
          ?.children.map((c) => c.id) ?? [],
      );
      timelineEntries = timelineEntries.filter(
        (t) => t.subspaceId === filters.subspaceId || l2Ids.has(t.subspaceId ?? ''),
      );
    }
    // else: no scope → all entries

    // Filter by time
    if (cutoff) {
      const cutoffMonth = cutoff.toISOString().slice(0, 7);
      timelineEntries = timelineEntries.filter((t) => t.period >= cutoffMonth);
    }

    // Aggregate per-subspace entries into combined monthly buckets
    const timelineMap = new Map<string, TimelineBucket>();
    for (const t of timelineEntries) {
      const existing = timelineMap.get(t.period);
      if (existing) {
        existing.contributions += t.contributions;
        existing.byType.post += t.byType.post;
        existing.byType.memo += t.byType.memo;
        existing.byType.link += t.byType.link;
        existing.byType.whiteboard += t.byType.whiteboard;
        existing.comments += t.comments;
        existing.uniqueContributors += t.uniqueContributors; // approximate when aggregating
        existing.newContributors += t.newContributors;
      } else {
        timelineMap.set(t.period, { ...t, byType: { ...t.byType } });
      }
    }
    const timeline = Array.from(timelineMap.values()).sort((a, b) => a.period.localeCompare(b.period));

    return { headline, callouts, contributors, timeline, organizations, subspaces, scopedPhases };
  }, [dataset, filters]);

  return {
    dataset,
    filtered,
    loading,
    error,
    selectedSpaceId,
    filters,
    generate,
    setTimeRange,
    setPhaseId,
    setSubspaceId,
    setSubSubspaceId,
  };
}

function getTimeCutoff(preset: TimeRangePreset): Date | null {
  if (preset === 'all') return null;
  const now = new Date();
  switch (preset) {
    case 'last30':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case 'lastQuarter':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case 'lastYear':
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  }
}

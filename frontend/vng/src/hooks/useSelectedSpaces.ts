import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHubs, type HubSummary, type HubSpace } from './useHubs.js';

/** A space in the effective selected set, carrying its provenance (FR-013). */
export interface SelectedSpace {
  nameId: string;
  displayName: string;
  /** Where the space came from: the active hub, or a direct user addition. */
  origin: 'hub' | 'direct';
}

/** Persistent selection state (data-model §3). */
export interface SelectionState {
  activeHubNameId: string | null;
  hubSpaceIds: string[];
  directAdded: string[];
  directRemoved: string[];
  showGemeentes: boolean;
  includeInitiatives: boolean;
}

const STORAGE_KEY = 'vng_selection';

const DEFAULT_STATE: SelectionState = {
  activeHubNameId: null,
  hubSpaceIds: [],
  directAdded: [],
  directRemoved: [],
  showGemeentes: true,
  includeInitiatives: false,
};

function loadState(): SelectionState {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_STATE };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw) as Partial<SelectionState>;
    return {
      ...DEFAULT_STATE,
      ...parsed,
      hubSpaceIds: parsed.hubSpaceIds ?? [],
      directAdded: parsed.directAdded ?? [],
      directRemoved: parsed.directRemoved ?? [],
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export interface UseSelectedSpacesResult {
  state: SelectionState;
  /** Hubs available to the user (for the HubSelector). */
  hubs: HubSummary[];
  hubsLoading: boolean;
  hubsError: string | null;
  /** True while the active hub's spaces are being resolved. */
  resolvingHub: boolean;
  hubResolveError: string | null;
  /** The effective set = (hubSpaceIds ∪ directAdded) − directRemoved, with provenance. */
  selectedSpaces: SelectedSpace[];
  /** Just the nameIds of the effective set (drives graph/dashboard). */
  effectiveSpaceIds: string[];
  setActiveHub: (nameId: string) => void;
  addSpace: (space: { nameId: string; displayName: string }) => void;
  removeSpace: (nameId: string) => void;
  /** Bulk-remove spaces (used by the panel's "Remove selected" action). */
  removeSpaces: (nameIds: string[]) => void;
  /** Ensure every space of the active hub is back in the effective set. */
  selectAllHubSpaces: () => void;
  /** Re-fetch the active hub's listed spaces and select them all again. */
  loadHubSpaces: () => void;
  /** Empty the whole effective set (drops hub spaces and direct additions). */
  clearSelection: () => void;
  setShowGemeentes: (value: boolean) => void;
  setIncludeInitiatives: (value: boolean) => void;
  /** Monotonically increasing token; bumped by {@link refresh} to force reloads. */
  refreshNonce: number;
  /** Force a cache-bypassing reload of the graph and dashboard. */
  refresh: () => void;
}

/**
 * Manage the VNG selected-space set (US1/US2). The effective set is the union of
 * the active hub's spaces and direct additions, minus direct removals. Switching
 * hub recomputes hubSpaceIds while retaining still-applicable direct selections
 * (FR-012, US2 scenario 3). State persists to localStorage.
 */
export function useSelectedSpaces(): UseSelectedSpacesResult {
  const { hubs, defaultHubNameId, loading: hubsLoading, error: hubsError, fetchHubSpaces } =
    useHubs();

  const [state, setState] = useState<SelectionState>(loadState);
  const [resolvingHub, setResolvingHub] = useState(false);
  const [hubResolveError, setHubResolveError] = useState<string | null>(null);

  // Bumped by refresh() to force a cache-bypassing reload of the graph/dashboard.
  const [refreshNonce, setRefreshNonce] = useState(0);

  // Display names for resolved spaces (hub + direct), keyed by nameId.
  const [displayNames, setDisplayNames] = useState<Record<string, string>>({});

  // Persist on every change, then notify same-tab listeners. The browser's
  // 'storage' event does NOT fire in the tab that performed the write, so we
  // dispatch a custom 'vng:selection' event for in-tab consumers (e.g. GraphTab
  // when it is reading from localStorage rather than props).
  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore quota / serialization errors */
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('vng:selection'));
    }
  }, [state]);

  // Preselect the configured default hub on first load (only if none chosen yet).
  const appliedDefault = useRef(false);
  useEffect(() => {
    if (appliedDefault.current) return;
    if (state.activeHubNameId) {
      appliedDefault.current = true;
      return;
    }
    if (defaultHubNameId) {
      appliedDefault.current = true;
      setState((s) => ({ ...s, activeHubNameId: defaultHubNameId }));
    }
  }, [defaultHubNameId, state.activeHubNameId]);

  // Resolve the active hub's spaces whenever it changes.
  const activeHubNameId = state.activeHubNameId;
  useEffect(() => {
    if (!activeHubNameId) {
      setState((s) => (s.hubSpaceIds.length ? { ...s, hubSpaceIds: [] } : s));
      return;
    }
    let cancelled = false;
    setResolvingHub(true);
    setHubResolveError(null);
    fetchHubSpaces(activeHubNameId)
      .then((spaces: HubSpace[]) => {
        if (cancelled) return;
        const ids = spaces.map((sp) => sp.nameId);
        setDisplayNames((prev) => {
          const next = { ...prev };
          for (const sp of spaces) next[sp.nameId] = sp.displayName;
          return next;
        });
        setState((s) => ({ ...s, hubSpaceIds: ids }));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setHubResolveError(err instanceof Error ? err.message : String(err));
        setState((s) => ({ ...s, hubSpaceIds: [] }));
      })
      .finally(() => {
        if (!cancelled) setResolvingHub(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeHubNameId, fetchHubSpaces]);

  const setActiveHub = useCallback((nameId: string) => {
    appliedDefault.current = true;
    setState((s) => ({ ...s, activeHubNameId: nameId }));
  }, []);

  const addSpace = useCallback((space: { nameId: string; displayName: string }) => {
    setDisplayNames((prev) => ({ ...prev, [space.nameId]: space.displayName }));
    setState((s) => {
      const directRemoved = s.directRemoved.filter((id) => id !== space.nameId);
      const directAdded = s.directAdded.includes(space.nameId)
        ? s.directAdded
        : [...s.directAdded, space.nameId];
      return { ...s, directAdded, directRemoved };
    });
  }, []);

  const removeSpace = useCallback((nameId: string) => {
    setState((s) => {
      const directAdded = s.directAdded.filter((id) => id !== nameId);
      // If it was a hub space, record an explicit removal so it stays excluded.
      const directRemoved =
        s.hubSpaceIds.includes(nameId) && !s.directRemoved.includes(nameId)
          ? [...s.directRemoved, nameId]
          : s.directRemoved;
      return { ...s, directAdded, directRemoved };
    });
  }, []);

  const removeSpaces = useCallback((nameIds: string[]) => {
    if (nameIds.length === 0) return;
    const toRemove = new Set(nameIds);
    setState((s) => {
      const directAdded = s.directAdded.filter((id) => !toRemove.has(id));
      // Record explicit removals for any hub spaces so they stay excluded.
      const directRemoved = [...s.directRemoved];
      const removedSet = new Set(directRemoved);
      for (const id of nameIds) {
        if (s.hubSpaceIds.includes(id) && !removedSet.has(id)) {
          directRemoved.push(id);
          removedSet.add(id);
        }
      }
      return { ...s, directAdded, directRemoved };
    });
  }, []);

  const selectAllHubSpaces = useCallback(() => {
    // Clear any removals that hid hub spaces so all hubSpaceIds are included again.
    setState((s) => {
      const hubSet = new Set(s.hubSpaceIds);
      const directRemoved = s.directRemoved.filter((id) => !hubSet.has(id));
      return directRemoved.length === s.directRemoved.length
        ? s
        : { ...s, directRemoved };
    });
  }, []);

  const loadHubSpaces = useCallback(() => {
    if (!activeHubNameId) return;
    let cancelled = false;
    setResolvingHub(true);
    setHubResolveError(null);
    fetchHubSpaces(activeHubNameId)
      .then((spaces: HubSpace[]) => {
        if (cancelled) return;
        const ids = spaces.map((sp) => sp.nameId);
        setDisplayNames((prev) => {
          const next = { ...prev };
          for (const sp of spaces) next[sp.nameId] = sp.displayName;
          return next;
        });
        // Set the hub spaces and clear any removals that hid them so they all
        // become selected again.
        setState((s) => {
          const idSet = new Set(ids);
          const directRemoved = s.directRemoved.filter((id) => !idSet.has(id));
          return { ...s, hubSpaceIds: ids, directRemoved };
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setHubResolveError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setResolvingHub(false);
      });
  }, [activeHubNameId, fetchHubSpaces]);

  const clearSelection = useCallback(() => {
    // Empty the effective set: drop direct additions and remove every hub space.
    setState((s) => ({
      ...s,
      directAdded: [],
      directRemoved: [...new Set([...s.directRemoved, ...s.hubSpaceIds])],
    }));
  }, []);

  const refresh = useCallback(() => setRefreshNonce((n) => n + 1), []);

  const setShowGemeentes = useCallback((value: boolean) => {
    setState((s) => ({ ...s, showGemeentes: value }));
  }, []);

  const setIncludeInitiatives = useCallback((value: boolean) => {
    setState((s) => ({ ...s, includeInitiatives: value }));
  }, []);

  // effective = (hubSpaceIds ∪ directAdded) − directRemoved
  const selectedSpaces = useMemo<SelectedSpace[]>(() => {
    const removed = new Set(state.directRemoved);
    const result: SelectedSpace[] = [];
    const seen = new Set<string>();
    for (const id of state.hubSpaceIds) {
      if (removed.has(id) || seen.has(id)) continue;
      seen.add(id);
      result.push({ nameId: id, displayName: displayNames[id] ?? id, origin: 'hub' });
    }
    for (const id of state.directAdded) {
      if (removed.has(id) || seen.has(id)) continue;
      seen.add(id);
      result.push({ nameId: id, displayName: displayNames[id] ?? id, origin: 'direct' });
    }
    return result;
  }, [state.hubSpaceIds, state.directAdded, state.directRemoved, displayNames]);

  const effectiveSpaceIds = useMemo(
    () => selectedSpaces.map((s) => s.nameId),
    [selectedSpaces],
  );

  return {
    state,
    hubs,
    hubsLoading,
    hubsError,
    resolvingHub,
    hubResolveError,
    selectedSpaces,
    effectiveSpaceIds,
    setActiveHub,
    addSpace,
    removeSpace,
    removeSpaces,
    selectAllHubSpaces,
    loadHubSpaces,
    clearSelection,
    setShowGemeentes,
    setIncludeInitiatives,
    refreshNonce,
    refresh,
  };
}

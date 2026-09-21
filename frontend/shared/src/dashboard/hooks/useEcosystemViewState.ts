import { useCallback, useEffect, useState } from 'react';
import { useAppConfig } from '../../app/AppConfig.js';
import type { EcosystemFilters } from '../utils/ecosystem.js';
import type { MapTransform } from '../components/EcosystemMap.js';

export interface EcosystemViewState {
  filters: EcosystemFilters;
  transform: MapTransform | null;
  /**
   * Orchestrator choice held locally because the server refused to remember it — a
   * guest (feature 023). Signed-in viewers never use this: their choice lives server-side
   * and follows them across devices.
   */
  guestChoice?: string | null;
}

/** Just enough of `Storage` to read and write — so the logic is testable without a DOM. */
export interface ViewStateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const EMPTY_VIEW_STATE: EcosystemViewState = {
  filters: { linkedToOrchestrator: false, multiMembership: false },
  transform: null,
  guestChoice: null,
};

/**
 * The map's view state, per hub, for the length of the visit (FR-025).
 *
 * Tabs unmount when the viewer switches away — the graph→details bridge does exactly
 * that on their behalf — so filters and viewport must live outside the component or a
 * click-through would silently reset the picture. `sessionStorage` is the same mechanism
 * the selection panel uses, and every access is guarded: a browser with site data blocked
 * must still render the map, just without memory.
 */
export function useEcosystemViewState(hubNameId: string | null) {
  const { storagePrefix } = useAppConfig();
  const key = hubNameId ? viewStateKey(storagePrefix, hubNameId) : null;
  const [state, setState] = useState<EcosystemViewState>(EMPTY_VIEW_STATE);

  useEffect(() => {
    if (!key) {
      setState(EMPTY_VIEW_STATE);
      return;
    }
    setState(readViewState(safeStorage(), key));
  }, [key]);

  const update = useCallback(
    (patch: Partial<EcosystemViewState>) => {
      setState((prev) => {
        const next = { ...prev, ...patch };
        if (key) writeViewState(safeStorage(), key, next);
        return next;
      });
    },
    [key],
  );

  const setFilters = useCallback((filters: EcosystemFilters) => update({ filters }), [update]);
  const setTransform = useCallback((transform: MapTransform) => update({ transform }), [update]);
  const setGuestChoice = useCallback(
    (guestChoice: string | null) => update({ guestChoice }),
    [update],
  );

  return {
    filters: state.filters,
    transform: state.transform ?? null,
    guestChoice: state.guestChoice ?? null,
    setFilters,
    setTransform,
    setGuestChoice,
  };
}

/**
 * Read stored view state, tolerating everything a browser can throw at it: a blocked
 * store, a cleared store, half-written JSON, or a shape written by an older build.
 */
export function readViewState(storage: ViewStateStorage | null, key: string): EcosystemViewState {
  if (!storage) return EMPTY_VIEW_STATE;
  try {
    const raw = storage.getItem(key);
    if (!raw) return EMPTY_VIEW_STATE;
    const parsed = JSON.parse(raw) as Partial<EcosystemViewState>;
    return {
      filters: {
        linkedToOrchestrator: parsed.filters?.linkedToOrchestrator === true,
        multiMembership: parsed.filters?.multiMembership === true,
      },
      transform: parsed.transform ?? null,
      guestChoice: parsed.guestChoice ?? null,
    };
  } catch {
    return EMPTY_VIEW_STATE;
  }
}

export function writeViewState(
  storage: ViewStateStorage | null,
  key: string,
  value: EcosystemViewState,
): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    /* private window, blocked site data — the map works, it just forgets */
  }
}

/** `sessionStorage` is itself a throwing getter in some privacy modes. */
function safeStorage(): ViewStateStorage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** The storage key for one dashboard's view of one hub. */
export function viewStateKey(storagePrefix: string, hubNameId: string): string {
  return `${storagePrefix}:ecosystem:${hubNameId}`;
}

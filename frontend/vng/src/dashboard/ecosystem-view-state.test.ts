/**
 * The map's view state survives a trip to another tab (feature 024, FR-025).
 *
 * This matters more than it looks: the graph→details and cities→city bridges switch tabs
 * ON THE VIEWER'S BEHALF, and every tab unmounts when it is left. Without this, clicking
 * an initiative would silently reset the filters and the zoom the viewer just set up.
 *
 * The workspace has no DOM test environment (and this feature adds no dependency), so
 * the hook's storage logic is exercised through its exported helpers against a fake
 * Storage — which is where every failure mode actually lives: blocked stores, cleared
 * stores, half-written JSON, and state written by an older build.
 */
import { describe, expect, it } from 'vitest';
import {
  EMPTY_VIEW_STATE,
  readViewState,
  viewStateKey,
  writeViewState,
  type ViewStateStorage,
} from '@ea/shared/dashboard/hooks/useEcosystemViewState.js';

/** A Storage stand-in; `mode` reproduces the two ways a real one misbehaves. */
function fakeStorage(mode: 'ok' | 'throws' = 'ok'): ViewStateStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem(key) {
      if (mode === 'throws') throw new Error('blocked');
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      if (mode === 'throws') throw new Error('blocked');
      data.set(key, value);
    },
  };
}

const KEY = viewStateKey('vng', 'vih-test');

describe('the storage key', () => {
  it('is scoped by dashboard and hub, so two dashboards never collide', () => {
    expect(KEY).toBe('vng:ecosystem:vih-test');
    expect(viewStateKey('govtech', 'vih-test')).not.toBe(KEY);
    expect(viewStateKey('vng', 'other-hub')).not.toBe(KEY);
  });
});

describe('round trip', () => {
  it('restores filters and viewport — the tab switch', () => {
    const storage = fakeStorage();
    writeViewState(storage, KEY, {
      filters: { linkedToOrchestrator: true, multiMembership: false },
      transform: { k: 1.75, x: -40, y: 12 },
      guestChoice: null,
    });

    const restored = readViewState(storage, KEY);
    expect(restored.filters).toEqual({ linkedToOrchestrator: true, multiMembership: false });
    expect(restored.transform).toEqual({ k: 1.75, x: -40, y: 12 });
  });

  it('remembers a guest’s orchestrator choice for the visit', () => {
    const storage = fakeStorage();
    writeViewState(storage, KEY, { ...EMPTY_VIEW_STATE, guestChoice: 'programmagroei' });
    expect(readViewState(storage, KEY).guestChoice).toBe('programmagroei');
  });

  it('keeps each hub’s state apart', () => {
    const storage = fakeStorage();
    writeViewState(storage, KEY, {
      ...EMPTY_VIEW_STATE,
      filters: { linkedToOrchestrator: true, multiMembership: true },
    });
    expect(readViewState(storage, viewStateKey('vng', 'other-hub'))).toEqual(EMPTY_VIEW_STATE);
  });
});

describe('degrades rather than breaks', () => {
  it('reads empty state when nothing is stored', () => {
    expect(readViewState(fakeStorage(), KEY)).toEqual(EMPTY_VIEW_STATE);
  });

  it('survives a browser that refuses session storage', () => {
    const storage = fakeStorage('throws');
    expect(readViewState(storage, KEY)).toEqual(EMPTY_VIEW_STATE);
    expect(() => writeViewState(storage, KEY, EMPTY_VIEW_STATE)).not.toThrow();
  });

  it('survives having no storage at all', () => {
    expect(readViewState(null, KEY)).toEqual(EMPTY_VIEW_STATE);
    expect(() => writeViewState(null, KEY, EMPTY_VIEW_STATE)).not.toThrow();
  });

  it('ignores corrupt stored state rather than throwing', () => {
    const storage = fakeStorage();
    storage.data.set(KEY, '{not json');
    expect(readViewState(storage, KEY)).toEqual(EMPTY_VIEW_STATE);
  });

  it('coerces a half-written or older shape into a usable one', () => {
    const storage = fakeStorage();
    storage.data.set(KEY, JSON.stringify({ filters: { linkedToOrchestrator: 'yes' } }));
    const state = readViewState(storage, KEY);
    // Only a real `true` counts — a truthy string is not a filter.
    expect(state.filters).toEqual({ linkedToOrchestrator: false, multiMembership: false });
    expect(state.transform).toBeNull();
  });
});

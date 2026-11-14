/**
 * Feature 027 — the VNG monitor reports on its managers' Spaces (`managedScope`). Viewers
 * can only narrow the set; a selection saved before the feature loses its direct
 * additions. GovTech (no flag) keeps the hub behaviour unchanged.
 */
import { describe, expect, it } from 'vitest';
import {
  effectiveSelection,
  parseSelectionState,
  withAddedSpace,
} from '@ea/shared/dashboard/hooks/useSelectedSpaces.js';

const legacy = JSON.stringify({
  activeHubNameId: 'vih-test',
  hubSpaceIds: ['a', 'b', 'c'],
  directAdded: ['x', 'y'],
  directRemoved: ['b'],
  showGemeentes: true,
  includeInitiatives: false,
});

const ids = (state: Parameters<typeof effectiveSelection>[0]) =>
  effectiveSelection(state).map((s) => s.nameId);

describe('managed scope (VNG)', () => {
  it('drops the direct additions of a selection saved before the feature, keeping removals', () => {
    const state = parseSelectionState(legacy, { managedScope: true });
    expect(state.directAdded).toEqual([]);
    expect(state.directRemoved).toEqual(['b']);
  });

  it('reports on the scope minus the viewer’s removals', () => {
    const state = parseSelectionState(legacy, { managedScope: true });
    const scoped = { ...state, hubSpaceIds: ['a', 'b', 'c', 'd'] };
    expect(ids(scoped)).toEqual(['a', 'c', 'd']);
  });

  it('ignores adding a Space', () => {
    const state = parseSelectionState(legacy, { managedScope: true });
    expect(withAddedSpace(state, 'z', { managedScope: true })).toBe(state);
  });
});

describe('without managed scope (GovTech)', () => {
  it('keeps direct additions and lets the viewer add Spaces', () => {
    const state = parseSelectionState(legacy);
    expect(state.directAdded).toEqual(['x', 'y']);
    expect(ids(state)).toEqual(['a', 'c', 'x', 'y']);
    const added = withAddedSpace(state, 'b');
    expect(added.directRemoved).toEqual([]);
    expect(ids(added)).toEqual(['a', 'b', 'c', 'x', 'y']);
  });
});

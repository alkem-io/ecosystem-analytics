/**
 * Feature 027 — the VNG monitor reports on ALL of its managers' Spaces (`managedScope`).
 * Viewers cannot change the set in either direction, so a selection saved by an older
 * build loses its additions AND its removals. GovTech (no flag) keeps the hub behaviour.
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
  it('drops the additions and removals of a selection saved by an older build', () => {
    const state = parseSelectionState(legacy, { managedScope: true });
    expect(state.directAdded).toEqual([]);
    expect(state.directRemoved).toEqual([]);
  });

  it('reports on exactly the monitor’s Spaces', () => {
    const state = parseSelectionState(legacy, { managedScope: true });
    const scoped = { ...state, hubSpaceIds: ['a', 'b', 'c', 'd'] };
    expect(ids(scoped)).toEqual(['a', 'b', 'c', 'd']);
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

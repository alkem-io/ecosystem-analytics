import { describe, it, expect } from 'vitest';
import { buildInitiativeLayer } from './initiatives.js';
import { NodeType, EdgeType } from '../types/graph.js';
import type { VngRegistry, RegistryTheme } from '../services/vng-registry.js';
import type { GdCalloutInput } from '../types/api.js';

const THEME: RegistryTheme = { slug: 'energietransitie', title: 'Energietransitie', priorLabels: [] };

const registry: VngRegistry = {
  isGemeenteNameId: (id) => id === 'gemeente-groningen' || id === 'gemeente-utrecht',
  resolveGemeenteByTag: (tag) => {
    const t = tag.trim().toLowerCase();
    if (t === 'groningen') return 'gemeente-groningen';
    if (t === 'utrecht') return 'gemeente-utrecht';
    return null;
  },
  resolveThemeByTag: (tag) => (tag.trim().toLowerCase() === 'energietransitie' ? THEME : null),
  gemeenteNameIds: () => ['gemeente-groningen', 'gemeente-utrecht'],
  meta: () => ({
    generatedFrom: 'test',
    municipalityCount: 2,
    themeCount: 1,
    initiativeCountAtGeneration: 0,
    programme: { name: 'GemeenteDelers', years: '2021–2025', sourceUrl: 'https://vng.nl' },
  }),
};

// Groningen resolves to an existing org node; Utrecht is unresolvable.
const resolveGemeenteNodeId = (nameId: string): string | null =>
  nameId === 'gemeente-groningen' ? 'org-groningen' : null;

describe('buildInitiativeLayer', () => {
  it('creates an initiative node with parsed year/classification/sdg and edges to gemeente + theme', () => {
    const callouts: GdCalloutInput[] = [
      {
        id: 'cal-1',
        nameId: 'mooi-initiatief',
        displayName: 'Mooi initiatief',
        tags: ['Groningen', 'Energietransitie', 'gd-2024', 'sdg-08', 'winner'],
        sourceUrl: 'https://vng.nl/praktijkvoorbeelden/x',
      },
    ];
    const layer = buildInitiativeLayer(callouts, registry, resolveGemeenteNodeId);

    const initiative = layer.nodes.find((n) => n.type === NodeType.INITIATIVE);
    expect(initiative).toMatchObject({
      id: 'cal-1',
      nameId: 'mooi-initiatief',
      initiativeYear: 2024,
      initiativeClassifications: ['winner'],
      globalGoals: ['sdg-08'],
      sourceUrl: 'https://vng.nl/praktijkvoorbeelden/x',
    });

    const theme = layer.nodes.find((n) => n.type === NodeType.THEME);
    expect(theme).toMatchObject({ id: 'theme:energietransitie', displayName: 'Energietransitie' });

    expect(layer.edges).toContainEqual(
      expect.objectContaining({ sourceId: 'cal-1', targetId: 'org-groningen', type: EdgeType.INITIATIVE_GEMEENTE }),
    );
    expect(layer.edges).toContainEqual(
      expect.objectContaining({ sourceId: 'cal-1', targetId: 'theme:energietransitie', type: EdgeType.INITIATIVE_THEME }),
    );
  });

  it('records unresolvable gemeente references instead of creating duplicate nodes', () => {
    const callouts: GdCalloutInput[] = [
      { id: 'cal-2', nameId: 'utrecht-case', displayName: 'Utrecht', tags: ['Utrecht'] },
    ];
    const layer = buildInitiativeLayer(callouts, registry, resolveGemeenteNodeId);
    expect(layer.unresolvedGemeenteNameIds).toEqual(['gemeente-utrecht']);
    expect(layer.edges).toHaveLength(0);
  });

  it('canonicalises a shared theme to one node across initiatives (no duplicates)', () => {
    const callouts: GdCalloutInput[] = [
      { id: 'a', nameId: 'a', displayName: 'A', tags: ['Energietransitie'] },
      { id: 'b', nameId: 'b', displayName: 'B', tags: ['Energietransitie'] },
    ];
    const layer = buildInitiativeLayer(callouts, registry, resolveGemeenteNodeId);
    const themeNodes = layer.nodes.filter((n) => n.type === NodeType.THEME);
    expect(themeNodes).toHaveLength(1);
    const themeEdges = layer.edges.filter((e) => e.type === EdgeType.INITIATIVE_THEME);
    expect(themeEdges).toHaveLength(2);
  });
});

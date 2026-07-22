import { describe, it, expect } from 'vitest';
import { buildInitiativeLayer, hasCommonGroundTag } from './initiatives.js';
import { NodeType, EdgeType } from '../types/graph.js';
import type { VngRegistry, RegistryTheme } from '../services/vng-registry.js';
import type { GdCalloutInput } from '../types/api.js';

const THEME: RegistryTheme = { slug: 'energietransitie', title: 'Energietransitie', priorLabels: [] };

const GEMEENTE_NAMES: Record<string, string> = {
  groningen: 'gemeente-groningen',
  utrecht: 'gemeente-utrecht',
};

const registry: VngRegistry = {
  isGemeenteNameId: (id) => id === 'gemeente-groningen' || id === 'gemeente-utrecht',
  resolveGemeenteByTag: (tag) => GEMEENTE_NAMES[tag.trim().toLowerCase()] ?? null,
  resolveThemeByTag: (tag) => (tag.trim().toLowerCase() === 'energietransitie' ? THEME : null),
  // Gemeentes are named in the description (anchored on "Deelnemende gemeente:").
  findGemeentesInText: (text) => {
    if (!text) return [];
    const anchor = text.match(/deelnemende\s+gemeente[n]?\s*:\s*([^\n\r]*)/i);
    const hay = (anchor ? anchor[1] : text).toLowerCase();
    return Object.entries(GEMEENTE_NAMES)
      .filter(([name]) => new RegExp(`(^|[^a-z])${name}([^a-z]|$)`).test(hay))
      .map(([name, nameId]) => ({ nameId, title: name[0].toUpperCase() + name.slice(1) }));
  },
  gemeenteNameIds: () => ['gemeente-groningen', 'gemeente-utrecht'],
  provinces: () => [{ code: 'PV20', slug: 'groningen', name: 'Groningen' }],
  municipalityInfoByNameId: (nameId) =>
    nameId === 'gemeente-groningen'
      ? { cbsCode: 'GM0014', country: 'NL', provinceCode: 'PV20', provinceName: 'Groningen', population: 1 }
      : null,
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
        description: 'Een mooi project. Deelnemende gemeente: Groningen',
        tags: ['Energietransitie', 'gd-2024', 'sdg-08', 'winner'],
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
      { id: 'cal-2', nameId: 'utrecht-case', displayName: 'Utrecht', description: 'Deelnemende gemeente: Utrecht', tags: [] },
    ];
    const layer = buildInitiativeLayer(callouts, registry, resolveGemeenteNodeId);
    expect(layer.unresolvedGemeenteNameIds).toEqual(['gemeente-utrecht']);
    expect(layer.edges).toHaveLength(0);
  });

  it('resolves the INITIATIVE_GEMEENTE edge on a second pass once the resolver gains the nameId (no duplicate edges)', () => {
    const callouts: GdCalloutInput[] = [
      { id: 'cal-3', nameId: 'utrecht-case', displayName: 'Utrecht', description: 'Deelnemende gemeente: Utrecht', tags: [] },
      { id: 'cal-4', nameId: 'utrecht-case-2', displayName: 'Utrecht 2', description: 'Deelnemende gemeente: Utrecht', tags: [] },
    ];

    // First pass: Utrecht is unresolvable → recorded once (dedup), no edges.
    const first = buildInitiativeLayer(callouts, registry, resolveGemeenteNodeId);
    expect(first.unresolvedGemeenteNameIds).toEqual(['gemeente-utrecht']);
    expect(first.edges.filter((e) => e.type === EdgeType.INITIATIVE_GEMEENTE)).toHaveLength(0);

    // Caller resolves the missing org once, then re-runs with an enriched resolver.
    const enriched = (nameId: string): string | null =>
      nameId === 'gemeente-utrecht' ? 'org-utrecht' : resolveGemeenteNodeId(nameId);
    const second = buildInitiativeLayer(callouts, registry, enriched);

    const gemeenteEdges = second.edges.filter((e) => e.type === EdgeType.INITIATIVE_GEMEENTE);
    expect(second.unresolvedGemeenteNameIds).toEqual([]);
    expect(gemeenteEdges).toHaveLength(2); // one per initiative, both to the single org node
    expect(gemeenteEdges.every((e) => e.targetId === 'org-utrecht')).toBe(true);
  });

  it('flags Common Ground initiatives from a tag (any spelling) and leaves others unset', () => {
    const callouts: GdCalloutInput[] = [
      { id: 'cg-1', nameId: 'cg-1', displayName: 'CG one', description: '', tags: ['Common Ground'] },
      { id: 'cg-2', nameId: 'cg-2', displayName: 'CG two', description: '', tags: ['commonground'] },
      { id: 'plain', nameId: 'plain', displayName: 'Plain', description: '', tags: ['Energietransitie'] },
    ];
    const layer = buildInitiativeLayer(callouts, registry, resolveGemeenteNodeId);
    const byId = new Map(layer.nodes.map((n) => [n.id, n]));
    expect(byId.get('cg-1')?.commonGround).toBe(true);
    expect(byId.get('cg-2')?.commonGround).toBe(true);
    expect(byId.get('plain')?.commonGround).toBeUndefined();
  });

  it('hasCommonGroundTag is case/space-insensitive and ignores unrelated tags', () => {
    expect(hasCommonGroundTag(['Common  Ground'])).toBe(true);
    expect(hasCommonGroundTag(['common-ground'])).toBe(true);
    expect(hasCommonGroundTag(['winner', 'gd-2024'])).toBe(false);
    expect(hasCommonGroundTag([])).toBe(false);
  });

  it('canonicalises a shared theme to one node across initiatives (no duplicates)', () => {
    const callouts: GdCalloutInput[] = [
      { id: 'a', nameId: 'a', displayName: 'A', description: '', tags: ['Energietransitie'] },
      { id: 'b', nameId: 'b', displayName: 'B', description: '', tags: ['Energietransitie'] },
    ];
    const layer = buildInitiativeLayer(callouts, registry, resolveGemeenteNodeId);
    const themeNodes = layer.nodes.filter((n) => n.type === NodeType.THEME);
    expect(themeNodes).toHaveLength(1);
    const themeEdges = layer.edges.filter((e) => e.type === EdgeType.INITIATIVE_THEME);
    expect(themeEdges).toHaveLength(2);
  });
});

/**
 * Feature 025 — the dashboard counts, computed from the SAME data the graph is built
 * from and delivered with it (spec FR-015, research R4).
 *
 * Before this module, `/api/<app>/dashboard` re-queried every selected Space's
 * classifications from Alkemio on each request (and the GemeenteDelers callouts twice
 * when the GD checkbox was on) even though every SPACE node in the dataset already
 * carried its `classificationEntries`. Now `buildGraph` hands those entries over here
 * while they are still in hand, and the result rides along in the generate response as
 * a {@link DashboardCountsBundle} — both GD variants when the GD layer is loaded, so
 * the Dashboard/Funnel toggles become a browser-side choice, not a request.
 *
 * Everything in this file is pure: no SDK, no cache, no clock.
 */
import type { VngConfig } from '../config.js';
import { NodeType, type GraphDataset } from '../types/graph.js';
import type {
  DashboardCountable,
  DashboardCountsBundle,
  VngDashboardResponse,
} from '../types/api.js';
import type { ClassificationEntryInput } from '../transform/classifications.js';
import type { RegistryMunicipalityEntry } from './vng-registry.js';
import {
  bucketGemeenteDistribution,
  buildCityPopulationSeries,
  countDashboard,
  countSpaceGemeentes,
  readSpaceClassifications,
  warnOnUnmatchedDesignations,
  type DashboardVocabularies,
  type InitiativeGemeenteCount,
} from './vng-dashboard-service.js';
import { resolveByLabel, unionVocabularies } from '../transform/classifications.js';
import {
  collectVocabularyDrift,
  stripNoClassificationValues,
} from '../transform/expected-vocabularies.js';
import { getLogger } from '../logging/logger.js';

/** What the counting needs from one selected L0 Space — taken off the node before the
 *  raw entries are stripped for the browser. */
export interface SpaceClassificationSnapshot {
  id: string;
  label: string;
  /** Flat free-text tags (provenance only; the counting never places a Space by tag). */
  tags: string[];
  entries: ClassificationEntryInput[] | undefined;
}

/** What the counting needs from one GemeenteDelers callout — kept in the GD cache row. */
export interface GdCountableCallout {
  id: string;
  displayName: string;
  tags: string[];
  /** Distinct gemeenten named in the callout description (the distribution's GD side). */
  gemeenteCount: number;
}

/**
 * The category counts (NDS / VNG-2030 / phase / matrix) for the selection, with or
 * without the GD segment. Pure twin of the old `assembleDashboard`.
 */
export function countFromSnapshots(
  spaces: SpaceClassificationSnapshot[],
  gdCallouts: GdCountableCallout[] | null,
  /** Selected nameIds that resolved to no Space at all (diagnostics only). */
  unresolvedCount: number,
  profile: VngConfig,
): VngDashboardResponse {
  const designations = profile.classifications;
  const perSpace = spaces.map((s) => {
    const read = readSpaceClassifications(s.entries, designations);
    return {
      presentLabels: (s.entries ?? []).map((e) => e.displayLabel),
      countable: {
        id: s.id,
        label: s.label,
        tags: s.tags,
        selections: read.selections,
        hasClassifications: (s.entries?.length ?? 0) > 0,
        source: 'spaces' as const,
      } satisfies DashboardCountable,
      vocabularies: read.vocabularies,
      phaseVocabulary: read.phaseVocabulary,
    };
  });

  const vocabularies: DashboardVocabularies = {
    nds: stripNoClassificationValues(unionVocabularies(perSpace.map((p) => p.vocabularies.nds))),
    vng2030: stripNoClassificationValues(
      unionVocabularies(perSpace.map((p) => p.vocabularies.vng2030)),
    ),
  };
  const phaseVocabulary = stripNoClassificationValues(
    unionVocabularies(perSpace.map((p) => p.phaseVocabulary)),
  );

  warnOnUnmatchedDesignations(designations, vocabularies, phaseVocabulary, [
    ...perSpace.map((p) => ({ resolved: true, presentLabels: p.presentLabels })),
    ...Array.from({ length: unresolvedCount }, () => ({ resolved: false, presentLabels: [] })),
  ]);

  const entities: DashboardCountable[] = perSpace.map((p) => p.countable);
  if (gdCallouts) {
    entities.push(
      ...gdCallouts.map((c) => ({
        id: c.id,
        label: c.displayName,
        tags: c.tags,
        selections: {
          nds: resolveByLabel(c.tags, vocabularies.nds),
          vng2030: resolveByLabel(c.tags, vocabularies.vng2030),
          phase: [], // GD is a completed programme with no growth phase.
        },
        hasClassifications: false,
        source: 'gd' as const,
      })),
    );
  }

  const vocabularyDrift = collectVocabularyDrift({
    nds: vocabularies.nds,
    vng2030: vocabularies.vng2030,
    phase: phaseVocabulary,
  });
  for (const drift of vocabularyDrift) {
    const parts: string[] = [];
    if (drift.unexpected.length)
      parts.push(`not expected by this build: ${drift.unexpected.map((l) => `'${l}'`).join(', ')}`);
    if (drift.missing.length)
      parts.push(`expected but absent: ${drift.missing.map((l) => `'${l}'`).join(', ')}`);
    getLogger().warn(
      `The '${drift.dimension}' vocabulary differs from EXPECTED_VOCABULARIES — ${parts.join('; ')}. ` +
        `Counts are unaffected; reconcile transform/expected-vocabularies.ts with Alkemio.`,
      { context: 'Dashboard' },
    );
  }

  const response = countDashboard(entities, vocabularies, phaseVocabulary);
  return vocabularyDrift.length ? { ...response, vocabularyDrift } : response;
}

/** The dataset without the GemeenteDelers layer — the `base` variant's view of it. */
export function stripGdLayer(dataset: GraphDataset): GraphDataset {
  const gdNodeIds = new Set(
    dataset.nodes
      .filter((n) => n.type === NodeType.INITIATIVE || n.type === NodeType.THEME)
      .map((n) => n.id),
  );
  if (gdNodeIds.size === 0) return dataset;
  return {
    ...dataset,
    nodes: dataset.nodes.filter((n) => !gdNodeIds.has(n.id)),
    edges: dataset.edges.filter((e) => !gdNodeIds.has(e.sourceId) && !gdNodeIds.has(e.targetId)),
  };
}

export interface BuildBundleInput {
  dataset: GraphDataset;
  snapshots: SpaceClassificationSnapshot[];
  unresolvedCount: number;
  /** Present iff the GD layer was loaded into `dataset`. */
  gdCallouts: GdCountableCallout[] | null;
  municipalities: RegistryMunicipalityEntry[];
  profile: VngConfig;
}

/** Assemble both variants of every dashboard panel from one dataset. */
export function buildDashboardBundle(input: BuildBundleInput): DashboardCountsBundle {
  const { dataset, snapshots, unresolvedCount, gdCallouts, municipalities, profile } = input;
  const base = stripGdLayer(dataset);
  const groeiCounts: InitiativeGemeenteCount[] = countSpaceGemeentes(base);

  const bundle: DashboardCountsBundle = {
    categories: { base: countFromSnapshots(snapshots, null, unresolvedCount, profile) },
    distribution: {
      base: {
        gemeenteDistribution: bucketGemeenteDistribution(groeiCounts, [], false),
        cityPopulation: buildCityPopulationSeries(base, municipalities, false),
      },
    },
  };
  if (gdCallouts) {
    bundle.categories.withGd = countFromSnapshots(snapshots, gdCallouts, unresolvedCount, profile);
    bundle.distribution.withGd = {
      gemeenteDistribution: bucketGemeenteDistribution(
        groeiCounts,
        gdCallouts.map((c) => ({ label: c.displayName, count: c.gemeenteCount })),
        true,
      ),
      cityPopulation: buildCityPopulationSeries(dataset, municipalities, true),
    };
  }
  return bundle;
}

/**
 * Alkemio Classifications → dashboard vocabularies and selections (feature 020).
 *
 * Pure module: no I/O, no config, no logging. Given the `classifications` array a
 * Space carries on its About, it answers three questions the dashboards need:
 *
 *   • which classification drives this panel?          → resolveDesignated()
 *   • what categories should the chart show?           → vocabularyOf() / unionVocabularies()
 *   • what is this Space classified as?                → selectionOf()
 *
 * Two rules from the Alkemio schema shape everything here:
 *
 *   `ClassificationValue.id` — "Stable identifier — aggregation key. Copied verbatim
 *   into every snapshot; never re-derived on rename." So ids (never labels) key every
 *   count, and ids are comparable ACROSS Spaces. `ClassificationEntry.id`, by contrast,
 *   is the per-Space instance and is NOT comparable across Spaces.
 *
 *   `ClassificationEntry.values` — "The snapshot vocabulary, in authored order. Never
 *   re-sorted." So authored order IS display order, and each Space holds its own
 *   snapshot — two Spaces in one selection may legitimately differ.
 *
 * Every function degrades rather than throws: absent, empty, or self-inconsistent
 * classification data yields an empty vocabulary or an empty selection, never an
 * error (FR-018, spec Constitution V). See
 * specs/020-space-classifications/contracts/classification-model.md §4 for the full
 * degradation matrix this module implements.
 */

/** One value of a classification's vocabulary, as read from Alkemio. */
export interface ClassificationValueInput {
  id: string;
  label: string;
}

/**
 * One classification group on a Space, as read from Alkemio. Structural (not the
 * codegen type) so this module stays pure and its tests need no GraphQL fixtures;
 * every field bar `displayLabel` is optional so a partial read degrades instead of
 * throwing.
 */
export interface ClassificationEntryInput {
  displayLabel: string;
  cardinality?: string;
  display?: boolean;
  sortOrder?: number;
  values?: readonly ClassificationValueInput[] | null;
  selectedValues?: readonly ClassificationValueInput[] | null;
}

/** A chart category: the stable value id plus the label to render for it. */
export interface VocabularyItem {
  /** `ClassificationValue.id` — the aggregation key. Opaque; never parsed or displayed. */
  key: string;
  /** `ClassificationValue.label` — display only, server-authored, never re-translated. */
  label: string;
}

/** An ordered, de-duplicated category list for one dashboard dimension. */
export type Vocabulary = VocabularyItem[];

/**
 * Match key for a designation or a tag: trimmed, internal whitespace collapsed,
 * lower-cased. Used ONLY for matching human-authored text (a designation against a
 * `displayLabel`, a GD tag against a value label) — never for aggregation.
 */
export function normaliseLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * The classification a dashboard has designated for one panel, or null.
 *
 * Matched on `displayLabel` because `ClassificationEntry` exposes no source-template
 * id and its own `id` is per-Space — the label is the only cross-Space handle on a
 * group (research R-002). Alkemio itself concedes duplicates are possible
 * ("overridable to resolve a conflict"), so ties go to the lowest `sortOrder`, i.e.
 * the one added first, which is the stable and predictable reading.
 *
 * Returns null for an empty designation, an empty entry list, or no match — every
 * caller treats null as "this Space contributes nothing to this panel".
 */
export function resolveDesignated(
  entries: readonly ClassificationEntryInput[] | null | undefined,
  designation: string | null | undefined,
): ClassificationEntryInput | null {
  if (!designation) return null;
  const wanted = normaliseLabel(designation);
  if (!wanted || !entries?.length) return null;

  let best: ClassificationEntryInput | null = null;
  for (const entry of entries) {
    if (normaliseLabel(entry.displayLabel ?? '') !== wanted) continue;
    if (best === null || (entry.sortOrder ?? 0) < (best.sortOrder ?? 0)) best = entry;
  }
  return best;
}

/**
 * The entry's snapshot vocabulary, in authored order, as chart categories.
 * Values with a blank id are dropped (they could not be aggregated); a value with a
 * blank LABEL is kept — it still counts, and the client renders an unnamed bar rather
 * than silently losing the entities in it.
 */
export function vocabularyOf(entry: ClassificationEntryInput | null | undefined): Vocabulary {
  if (!entry?.values?.length) return [];
  const out: Vocabulary = [];
  const seen = new Set<string>();
  for (const value of entry.values) {
    if (!value?.id || seen.has(value.id)) continue;
    seen.add(value.id);
    out.push({ key: value.id, label: value.label ?? '' });
  }
  return out;
}

/**
 * The value ids this Space has selected in the entry, INTERSECTED with the entry's own
 * snapshot vocabulary.
 *
 * The intersection is what makes invariant I-4 hold: a selected id that is absent from
 * its own `values` cannot be rendered as a category, so counting it would break the
 * "counts sum to the number of counted entities" identity (I-5). Such an id is dropped
 * silently — it is a platform-side inconsistency, not something a dashboard user can act on.
 *
 * Cardinality is deliberately NOT enforced: if a SINGLE_SELECT group somehow carries two
 * selections, both are returned and both counted. Truncating would hide real data.
 */
export function selectionOf(entry: ClassificationEntryInput | null | undefined): string[] {
  if (!entry?.selectedValues?.length) return [];
  const allowed = new Set((entry.values ?? []).map((v) => v?.id).filter(Boolean));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of entry.selectedValues) {
    const id = value?.id;
    if (!id || seen.has(id) || !allowed.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Merge per-Space vocabularies into the category list for one chart.
 *
 * Vocabularies are per-Space SNAPSHOTS, so a selection can straddle template versions.
 * The union means a value present in only some snapshots still renders (counted only for
 * the Spaces whose snapshot holds it) — no Space is dropped and no phantom category
 * appears for a value nobody has (research R-003).
 *
 * Order is first appearance, walking the Spaces in selection order and each vocabulary in
 * its authored order. Where a value's label differs between snapshots the first wins,
 * which is the same "first appearance" rule and keeps the output deterministic.
 */
export function unionVocabularies(vocabularies: readonly Vocabulary[]): Vocabulary {
  const out: Vocabulary = [];
  const seen = new Set<string>();
  for (const vocabulary of vocabularies) {
    for (const item of vocabulary) {
      if (seen.has(item.key)) continue;
      seen.add(item.key);
      out.push(item);
    }
  }
  return out;
}

/**
 * Resolve free-text tags against a vocabulary's LABELS, returning matched value ids in
 * vocabulary order.
 *
 * Used ONLY for the GemeenteDelers layer. GD initiatives are Callouts, which carry no
 * `SpaceAbout.classifications` at all, so the spec keeps them tag-derived and separately
 * attributed (FR-020). Matching their tags against the same vocabulary the Spaces use is
 * very nearly the identity function the retired `tag_category_mapping` encoded — GD keeps
 * its behaviour with no keyword list anywhere (research R-006).
 *
 * This is label matching, with all the fragility that implies. It is applied to the layer
 * the spec declares tag-derived, and NEVER to a Space.
 */
export function resolveByLabel(
  tags: readonly string[] | null | undefined,
  vocabulary: Vocabulary,
): string[] {
  if (!tags?.length || !vocabulary.length) return [];
  const wanted = new Set(tags.map((t) => normaliseLabel(t ?? '')).filter(Boolean));
  if (!wanted.size) return [];
  return vocabulary.filter((item) => item.label && wanted.has(normaliseLabel(item.label))).map((i) => i.key);
}

/** A classification group as presented to a user (details view). */
export interface PresentedClassification {
  label: string;
  values: ClassificationValueInput[];
}

/**
 * The classifications to SHOW for one Space: those with `display !== false`, in
 * `sortOrder`, each carrying its selected values.
 *
 * `display` is honoured here and nowhere else. The schema is explicit that it is
 * "Render-only… NOT an access control", so it must never reach the counting path: a
 * hidden group still drives its chart exactly as before (FR-023, invariant I-7).
 * Groups with nothing selected are omitted — an empty group is noise in a details panel.
 */
export function presentClassifications(
  entries: readonly ClassificationEntryInput[] | null | undefined,
): PresentedClassification[] {
  if (!entries?.length) return [];
  return entries
    .filter((entry) => entry.display !== false)
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((entry) => ({
      label: entry.displayLabel ?? '',
      values: selectionOf(entry).map((id) => {
        const hit = (entry.values ?? []).find((v) => v?.id === id);
        return { id, label: hit?.label ?? '' };
      }),
    }))
    .filter((group) => group.values.length > 0);
}

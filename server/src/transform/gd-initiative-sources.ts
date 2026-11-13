/**
 * GemeenteDelers initiative sources — which initiatives to report, from subspaces and posts.
 *
 * The GD corpus is being migrated, in place, from Knowledge-Base posts (callouts on the
 * GD space) to one L1 subspace per initiative. Subspaces are the canonical form; posts
 * are still read, because most initiatives exist only as a post until the migration
 * finishes. The migration COPIES rather than moves, so a migrated initiative exists
 * twice — and must be reported once, from its subspace.
 *
 * Pure: no SDK, no logging, no clock. The service logs what `mergeGdSources` reports.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────────┐
 * │ ⚠ LEGACY-GD-POSTS — the posts path is TEMPORARY and MUST BE REMOVED              │
 * │                                                                                  │
 * │ Reading posts exists only to bridge the subspace migration. Once every GD        │
 * │ initiative is a subspace (the server warns "posts path is now dead code" when    │
 * │ none comes from a post), delete everything tagged LEGACY-GD-POSTS:               │
 * │                                                                                  │
 * │   grep -rn LEGACY-GD-POSTS server/src CLAUDE.md                                  │
 * │                                                                                  │
 * │  1. graphql/queries/gemeentedelersInitiatives.graphql — the `collaboration`      │
 * │     (callouts) selection; then `pnpm run codegen`.                               │
 * │  2. services/gd-initiatives-service.ts — the posts mapping, the merge call and   │
 * │     the legacy-posts warnings (return the initiative subspaces directly).        │
 * │  3. this file — `isPostInitiative`, `mergeGdSources` and the matching helpers;   │
 * │     keep `submissionYearOf` / `isSubspaceInitiative`.                            │
 * │  4. transform/initiatives.ts — the tag-LABEL branch of                           │
 * │     `resolveInitiativeCategories` (every initiative then has classifications).   │
 * │  5. services/dashboard-bundle.ts — the tag-LABEL branch in `countFromSnapshots`. │
 * │  6. services/graph-service.ts — the "matched no classification value label"      │
 * │     warning, which only describes posts.                                         │
 * │  7. index.ts — the startup reminder; CLAUDE.md — the architecture note.          │
 * │  8. `GdInitiativeInput.source` — drop it once only subspaces remain.             │
 * │  9. Bump CACHE_MAINTENANCE_VERSION with a GD-row step, as v5 did.                │
 * └──────────────────────────────────────────────────────────────────────────────────┘
 */
import type { GdInitiativeInput } from '../types/api.js';

/**
 * The reminder logged at startup and on every GD rebuild while posts are still read.
 * LEGACY-GD-POSTS: delete with the posts path.
 */
export const LEGACY_GD_POSTS_NOTICE =
  'LEGACY-GD-POSTS: GemeenteDelers initiatives are still also read from the legacy POSTS on ' +
  'the GD space. Subspaces are the canonical source; the posts path is a temporary migration ' +
  'bridge that MUST be removed once the migration completes — see the checklist in ' +
  'server/src/transform/gd-initiative-sources.ts (grep -rn LEGACY-GD-POSTS).';

/** A submission-year tag. Production writes plain `2021`; the older form was `gd-2021`. */
const SUBMISSION_YEAR_RE = /^(?:gd-)?(\d{4})$/i;

/**
 * Shortest normalised title the prefix rule may act on. Below this a title is too
 * generic to identify one initiative ("data", "jeugd") — and the rule exists for one
 * case only: a subspace whose title was shortened from its post's ("Privacyvriendelijke
 * authenticatie" ← "Privacyvriendelijke authenticatie door regie op eigen BRP-gegevens").
 */
const MIN_PREFIX_TITLE_LENGTH = 12;

/** The initiative's GemeenteDelers submission year, read off its tags. */
export function submissionYearOf(tags: readonly string[]): number | undefined {
  for (const tag of tags) {
    const match = tag.trim().match(SUBMISSION_YEAR_RE);
    if (match) return Number(match[1]);
  }
  return undefined;
}

/**
 * Whether a GD subspace is an initiative. Every GD initiative was a submission to a
 * programme year, and carries that year as a tag; the subspaces that are NOT
 * initiatives (the `template`, the Alkemio platform training) carry none.
 */
export function isSubspaceInitiative(subspace: GdInitiativeInput): boolean {
  return submissionYearOf(subspace.tags) !== undefined;
}

/**
 * LEGACY-GD-POSTS: delete with the posts path.
 *
 * Whether a GD post is an initiative. Every initiative post is tagged; the intro / FAQ /
 * "share your own example" posts carry no tags.
 */
export function isPostInitiative(post: GdInitiativeInput): boolean {
  return post.tags.length > 0;
}

/** Lower-case, diacritics stripped, letters and digits only — "Iédereen doet mee!" → "iedereendoetmee". */
export function normaliseForMatch(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** How a subspace was matched to the post it supersedes. */
export type SupersessionRule = 'nameId' | 'title' | 'title-prefix';

export interface GdSupersession {
  subspaceNameId: string;
  postNameId: string;
  rule: SupersessionRule;
}

export interface GdSourceMerge {
  /** What to report: every initiative subspace, then every post no subspace supersedes. */
  initiatives: GdInitiativeInput[];
  /** Each post dropped because a subspace supersedes it. */
  superseded: GdSupersession[];
  /** Subspaces skipped as not-an-initiative (template, training). */
  skippedSubspaceNameIds: string[];
  /**
   * Subspaces whose title matched several same-year posts. Nothing is dropped for them —
   * a double count is visible on the chart, a wrongly dropped initiative is not.
   */
  ambiguous: { subspaceNameId: string; candidatePostNameIds: string[] }[];
}

/**
 * LEGACY-GD-POSTS: delete with the posts path — once only subspaces remain, the
 * initiatives are simply `subspaces.filter(isSubspaceInitiative)`.
 *
 * Report each GD initiative once: from its subspace when it has one, else from its post.
 *
 * A subspace supersedes AT MOST ONE post, and each post is superseded at most once. The
 * rules are tried strongest-first, and the nameID rule runs for EVERY subspace before
 * any title rule — so a title match can never take a post that another subspace names
 * exactly:
 *
 *  1. `nameId` — the same nameID (ignoring hyphens). How the migration normally copies.
 *  2. `title` — the same title AND the same submission year, unique. The year guard is
 *     not optional: two different initiatives are both titled "Antwoord op maat"
 *     (2021 and 2023), and only the 2021 one has been migrated.
 *  3. `title-prefix` — one title is a prefix of the other (≥ 12 normalised characters),
 *     same submission year, unique. Covers a subspace whose title was shortened.
 */
export function mergeGdSources(
  subspaces: readonly GdInitiativeInput[],
  posts: readonly GdInitiativeInput[],
): GdSourceMerge {
  const initiativeSubspaces = subspaces.filter(isSubspaceInitiative);
  const skippedSubspaceNameIds = subspaces
    .filter((s) => !isSubspaceInitiative(s))
    .map((s) => s.nameId);
  const initiativePosts = posts.filter(isPostInitiative);

  const claimedPostIds = new Set<string>();
  const superseded: GdSupersession[] = [];
  const ambiguous: GdSourceMerge['ambiguous'] = [];
  const claim = (subspace: GdInitiativeInput, post: GdInitiativeInput, rule: SupersessionRule) => {
    claimedPostIds.add(post.id);
    superseded.push({ subspaceNameId: subspace.nameId, postNameId: post.nameId, rule });
  };
  const unclaimed = () => initiativePosts.filter((p) => !claimedPostIds.has(p.id));

  // Rule 1, for every subspace first.
  const needTitleMatch: GdInitiativeInput[] = [];
  for (const subspace of initiativeSubspaces) {
    const key = normaliseForMatch(subspace.nameId);
    const post = unclaimed().find((p) => normaliseForMatch(p.nameId) === key);
    if (post) claim(subspace, post, 'nameId');
    else needTitleMatch.push(subspace);
  }

  // Rules 2 and 3, only among same-year posts nothing has claimed yet.
  for (const subspace of needTitleMatch) {
    const year = submissionYearOf(subspace.tags);
    const title = normaliseForMatch(subspace.displayName);
    const sameYear = unclaimed().filter((p) => submissionYearOf(p.tags) === year);

    const exact = sameYear.filter((p) => normaliseForMatch(p.displayName) === title);
    const prefix = exact.length
      ? []
      : sameYear.filter((p) => isTitlePrefixMatch(title, normaliseForMatch(p.displayName)));
    const [candidates, rule]: [GdInitiativeInput[], SupersessionRule] = exact.length
      ? [exact, 'title']
      : [prefix, 'title-prefix'];

    if (candidates.length === 1) claim(subspace, candidates[0], rule);
    else if (candidates.length > 1) {
      ambiguous.push({
        subspaceNameId: subspace.nameId,
        candidatePostNameIds: candidates.map((p) => p.nameId),
      });
    }
  }

  return {
    initiatives: [
      ...initiativeSubspaces,
      ...initiativePosts.filter((p) => !claimedPostIds.has(p.id)),
    ],
    superseded,
    skippedSubspaceNameIds,
    ambiguous,
  };
}

function isTitlePrefixMatch(a: string, b: string): boolean {
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.length >= MIN_PREFIX_TITLE_LENGTH && longer.startsWith(shorter);
}

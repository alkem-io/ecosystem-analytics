/**
 * GemeenteDelers initiative fetching (feature 016, US10).
 *
 * The GD corpus lives in two places while it is migrated: one L1 subspace per
 * initiative (canonical) and the original Knowledge-Base posts on the GD space. Both
 * are read in one query; `mergeGdSources` reports each initiative once — from its
 * subspace when it has one. The gemeentedelers space nameID comes from config (FR-045).
 */
import { createAlkemioSdk } from '../graphql/client.js';
import type { Sdk } from '../graphql/generated/graphql.js';
import type { AuthContext } from '../auth/middleware.js';
import type { GdInitiativeInput } from '../types/api.js';
import type { GraphNode } from '../types/graph.js';
import { buildOrgNode } from '../transform/transformer.js';
import { LEGACY_GD_POSTS_NOTICE, mergeGdSources } from '../transform/gd-initiative-sources.js';
import { getLogger } from '../logging/logger.js';
import { loadConfig } from '../config.js';
import { loadVngRegistry } from './vng-registry.js';

const logger = getLogger();

type TagsetLike = { tags: string[] } | null | undefined;
const flatTags = (tagsets: readonly TagsetLike[] | null | undefined): string[] =>
  (tagsets ?? []).flatMap((ts) => ts?.tags ?? []).filter((t) => t.trim());

/**
 * Fetch the GemeenteDelers initiatives: every initiative subspace, plus every post that
 * no subspace supersedes.
 *
 * Throws `GD_SPACE_UNREADABLE` when the space resolves to null (the user lacks READ, or
 * it is absent) so the caller can fall back to gdLayer.available=false (FR-044).
 */
export async function fetchGemeentedelersInitiatives(
  auth: AuthContext,
  sdk?: Sdk,
): Promise<GdInitiativeInput[]> {
  const config = loadConfig();
  const client = sdk ?? (await createAlkemioSdk(auth));
  const res = await client.GemeentedelersInitiatives({
    nameId: config.vng.gemeentedelersSpaceNameId,
  });
  const space = res.data.lookupByName.space;
  if (!space) {
    throw new Error('GD_SPACE_UNREADABLE');
  }

  const subspaces: GdInitiativeInput[] = (space.subspaces ?? []).map((s) => ({
    id: s.id,
    nameId: s.nameID,
    source: 'subspace',
    displayName: s.about.profile.displayName,
    description: s.about.profile.description ?? '',
    tags: flatTags(s.about.profile.tagsets),
    sourceUrl: null,
    url: s.about.profile.url ?? null,
    classificationEntries: (s.about.classifications ?? []).map((c) => ({
      id: c.id,
      displayLabel: c.displayLabel,
      cardinality: c.cardinality,
      display: c.display,
      sortOrder: c.sortOrder,
      values: c.values ?? [],
      selectedValues: c.selectedValues ?? [],
    })),
  }));

  // LEGACY-GD-POSTS: from here to the end of this function is the temporary posts bridge.
  // Once every initiative is a subspace, return `subspaces.filter(isSubspaceInitiative)`.
  const posts: GdInitiativeInput[] = (space.collaboration.calloutsSet.callouts ?? []).map((c) => ({
    id: c.id,
    nameId: c.nameID,
    source: 'post',
    displayName: c.framing.profile.displayName,
    description: c.framing.profile.description ?? '',
    tags: flatTags(c.framing.profile.tagsets),
    sourceUrl: null,
  }));

  const merge = mergeGdSources(subspaces, posts);

  // Counts and nameIDs only — never descriptions or tags (Constitution IV).
  const fromSubspaces = merge.initiatives.filter((i) => i.source === 'subspace').length;
  logger.info(
    `GD initiatives: ${merge.initiatives.length} = ${fromSubspaces} from subspaces + ` +
      `${merge.initiatives.length - fromSubspaces} from posts ` +
      `(${merge.superseded.length} posts superseded by a subspace; ` +
      `${merge.skippedSubspaceNameIds.length} non-initiative subspaces skipped: ` +
      `${merge.skippedSubspaceNameIds.join(', ') || 'none'})`,
    { context: 'GD' },
  );
  const byTitle = merge.superseded.filter((s) => s.rule !== 'nameId');
  if (byTitle.length) {
    logger.info(
      `GD posts superseded by title rather than nameID: ` +
        byTitle.map((s) => `${s.postNameId} → ${s.subspaceNameId} (${s.rule})`).join(', '),
      { context: 'GD' },
    );
  }
  // Keep the removal visible to whoever reads the logs. LEGACY-GD-POSTS: delete with it.
  const fromPosts = merge.initiatives.length - fromSubspaces;
  if (fromPosts > 0) {
    logger.warn(
      `${fromPosts} of ${merge.initiatives.length} initiatives still come from posts. ` +
        LEGACY_GD_POSTS_NOTICE,
      { context: 'GD' },
    );
  } else {
    logger.warn(
      'LEGACY-GD-POSTS: every GemeenteDelers initiative now comes from a subspace — the posts ' +
        'path is DEAD CODE and should be removed now. Follow the checklist in ' +
        'server/src/transform/gd-initiative-sources.ts (grep -rn LEGACY-GD-POSTS).',
      { context: 'GD' },
    );
  }
  for (const a of merge.ambiguous) {
    logger.warn(
      `GD subspace '${a.subspaceNameId}' matches several posts (${a.candidatePostNameIds.join(', ')}); ` +
        `none dropped, so this initiative is counted twice until the subspace's nameID matches its post.`,
      { context: 'GD' },
    );
  }
  return merge.initiatives;
}

/**
 * Resolve a gemeente org `nameID` (e.g. "gemeente-groningen") to a fully built
 * ORGANIZATION GraphNode (with `isGemeente=true`), looking up its UUID via
 * `OrganizationByNameId` then fetching its profile via `organizationByID`
 * (FR-043). Returns null (and logs) if the org can't be resolved — non-fatal.
 */
export async function resolveGemeenteOrgNode(
  sdk: Sdk,
  gemeenteNameId: string,
): Promise<GraphNode | null> {
  try {
    const idRes = await sdk.OrganizationByNameId({ nameId: gemeenteNameId });
    const orgId = idRes.data.lookupByName.organization;
    if (!orgId) return null;

    const profileRes = await sdk.organizationByID({ id: orgId });
    const org = profileRes.data.lookup.organization;
    if (!org) return null;

    const node = buildOrgNode(orgId, org, []);
    node.isGemeente = true;
    const info = loadVngRegistry().municipalityInfoByNameId(gemeenteNameId);
    node.provinceCode = info?.provinceCode ?? null;
    node.provinceName = info?.provinceName ?? null;
    node.population = info?.population ?? null;
    return node;
  } catch (err) {
    logger.warn(
      `Failed to resolve missing gemeente org '${gemeenteNameId}': ${conciseGraphqlError(err)}`,
      { context: 'GD' },
    );
    return null;
  }
}

/**
 * A one-line description of a GraphQL failure.
 *
 * `graphql-request` puts the ENTIRE HTTP response into `Error.message` — every error in
 * the payload, each carrying the Alkemio server's own Node stack trace. Logging that
 * verbatim turned a single "organisation not found" into ~40 lines of unrelated frames
 * and made the surrounding log unreadable. Prefer the GraphQL error's own message, name
 * its `code` (ENTITY_NOT_FOUND is the common and benign one here), and cap the length so
 * an unrecognised shape can never flood the log either.
 */
function conciseGraphqlError(err: unknown): string {
  const response = (
    err as { response?: { errors?: { message?: string; extensions?: { code?: string } }[] } }
  )?.response;
  const first = response?.errors?.[0];
  const raw = first?.message ?? (err instanceof Error ? err.message : String(err));
  const oneLine = raw.replace(/\s+/g, ' ').trim();
  const capped = oneLine.length > 200 ? `${oneLine.slice(0, 200)}…` : oneLine;
  const code = first?.extensions?.code;
  return code ? `${code}: ${capped}` : capped;
}

import { getDatabase } from './db.js';

/**
 * Who chose which Space to orchestrate which ecosystem (feature 024, FR-011).
 *
 * NOT a cache. There is no TTL, a force-refresh does not touch it, and a
 * maintenance-version bump leaves it alone — a viewer's correction is theirs until they
 * withdraw it.
 *
 * Every statement is prepared and parameterised (Constitution IV). Reads of another
 * viewer's row are impossible by construction: {@link getOwnChoice} always takes a
 * `userId`, and {@link getCommunityCandidates} returns Space nameIDs and counts only —
 * never an identity.
 */

/** The Space this viewer chose for this hub, or null. */
export function getOwnChoice(userId: string, hubNameId: string): string | null {
  const row = getDatabase()
    .prepare<[string, string], { space_name_id: string }>(
      'SELECT space_name_id FROM orchestrator_choices WHERE user_id = ? AND hub_name_id = ?',
    )
    .get(userId, hubNameId);
  return row?.space_name_id ?? null;
}

export interface CommunityCandidate {
  spaceNameId: string;
  count: number;
}

/**
 * The Spaces viewers most often chose for this hub, most-chosen first, ties broken by
 * the most recent choice.
 *
 * Returns up to THREE rather than a single winner on purpose: the route must hand back
 * only a Space the CALLER can read, and a single winner chosen by someone with wider
 * access would leave every other viewer with no preset at all.
 */
export function getCommunityCandidates(hubNameId: string): CommunityCandidate[] {
  return getDatabase()
    .prepare<[string], { space_name_id: string; n: number }>(
      `SELECT space_name_id, COUNT(*) AS n, MAX(updated_at) AS latest
         FROM orchestrator_choices
        WHERE hub_name_id = ?
        GROUP BY space_name_id
        ORDER BY n DESC, latest DESC
        LIMIT 3`,
    )
    .all(hubNameId)
    .map((row) => ({ spaceNameId: row.space_name_id, count: row.n }));
}

/** Record (or replace) this viewer's choice. */
export function setChoice(
  userId: string,
  hubNameId: string,
  spaceNameId: string,
  now: number = Date.now(),
): void {
  getDatabase()
    .prepare(
      `INSERT INTO orchestrator_choices (user_id, hub_name_id, space_name_id, updated_at)
            VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, hub_name_id)
       DO UPDATE SET space_name_id = excluded.space_name_id, updated_at = excluded.updated_at`,
    )
    .run(userId, hubNameId, spaceNameId, now);
}

/** Withdraw this viewer's choice — from their own view AND from the community count. */
export function clearChoice(userId: string, hubNameId: string): void {
  getDatabase()
    .prepare('DELETE FROM orchestrator_choices WHERE user_id = ? AND hub_name_id = ?')
    .run(userId, hubNameId);
}

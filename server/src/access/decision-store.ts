import { getDatabase } from '../cache/db.js';
import type { AccessLevel, AppId } from './policy.js';

/** A held decision (research R5). "Could not verify" is never one. */
export interface HeldDecision {
  level: AccessLevel;
  decidedAt: number;
}

const STORABLE: readonly AccessLevel[] = ['none', 'read', 'manage'];

/**
 * The held decision for one session and application, or `null` when none is held
 * or it was taken against a different gate (the gate was reconfigured).
 */
export function getDecision(sessionId: string, appId: AppId, gateKey: string): HeldDecision | null {
  const row = getDatabase()
    .prepare(
      'SELECT level, decided_at FROM access_decisions WHERE session_id = ? AND app_id = ? AND gate_key = ?',
    )
    .get(sessionId, appId, gateKey) as { level: AccessLevel; decided_at: number } | undefined;
  return row ? { level: row.level, decidedAt: row.decided_at } : null;
}

/** Hold `level` for the rest of the session, replacing any earlier decision. */
export function putDecision(
  sessionId: string,
  appId: AppId,
  gateKey: string,
  level: AccessLevel,
  decidedAt = Date.now(),
): void {
  // FR-006: an inconclusive check must never be held, or one Alkemio blip would lock
  // a member out for their whole session.
  if (!STORABLE.includes(level))
    throw new Error(`Refusing to hold access level '${String(level)}'`);
  getDatabase()
    .prepare(
      `INSERT INTO access_decisions (session_id, app_id, gate_key, level, decided_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (session_id, app_id)
       DO UPDATE SET gate_key = excluded.gate_key, level = excluded.level, decided_at = excluded.decided_at`,
    )
    .run(sessionId, appId, gateKey, level, decidedAt);
}

/** Drop the held decision for one application ("check again"). */
export function clearDecision(sessionId: string, appId: AppId): void {
  getDatabase()
    .prepare('DELETE FROM access_decisions WHERE session_id = ? AND app_id = ?')
    .run(sessionId, appId);
}

/** Drop every held decision of a session (sign-out, expiry). */
export function clearForSession(sessionId: string): void {
  getDatabase().prepare('DELETE FROM access_decisions WHERE session_id = ?').run(sessionId);
}

/** Remove decisions whose session no longer exists. */
export function purgeOrphanDecisions(): void {
  getDatabase()
    .prepare(
      'DELETE FROM access_decisions WHERE session_id NOT IN (SELECT session_id FROM oidc_sessions)',
    )
    .run();
}

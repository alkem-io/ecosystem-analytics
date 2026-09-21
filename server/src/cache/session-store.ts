import { getDatabase } from './db.js';

/**
 * Parameterized CRUD for the two OIDC tables (`oidc_auth_tx`, `oidc_sessions`).
 * Every statement uses bound parameters (Constitution IV — no string interpolation).
 * Token columns are stored as already-encrypted BLOBs; this layer never
 * encrypts/decrypts or logs token material.
 */

// --- Pre-auth transaction (short-lived CSRF/replay record) -----------------

export interface AuthTxRecord {
  txId: string;
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
  /** Opaque value of the `ea_preauth` cookie in the browser that started this flow. */
  browserKey: string;
  createdAt: number;
  expiresAt: number;
}

interface AuthTxRow {
  tx_id: string;
  state: string;
  nonce: string;
  code_verifier: string;
  return_to: string;
  browser_key: string;
  created_at: number;
  expires_at: number;
}

function toAuthTxRecord(row: AuthTxRow): AuthTxRecord {
  return {
    txId: row.tx_id,
    state: row.state,
    nonce: row.nonce,
    codeVerifier: row.code_verifier,
    returnTo: row.return_to,
    browserKey: row.browser_key,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export function insertAuthTx(rec: AuthTxRecord): void {
  getDatabase()
    .prepare(
      `INSERT INTO oidc_auth_tx
         (tx_id, state, nonce, code_verifier, return_to, browser_key, created_at, expires_at)
       VALUES (@txId, @state, @nonce, @codeVerifier, @returnTo, @browserKey, @createdAt, @expiresAt)`,
    )
    .run(rec);
}

export function getAuthTx(txId: string): AuthTxRecord | null {
  const row = getDatabase()
    .prepare('SELECT * FROM oidc_auth_tx WHERE tx_id = ?')
    .get(txId) as AuthTxRow | undefined;
  return row ? toAuthTxRecord(row) : null;
}

/** The pending sign-ins one browser has started, newest first (all are still unconsumed). */
export function listAuthTxByBrowserKey(browserKey: string): AuthTxRecord[] {
  const rows = getDatabase()
    .prepare('SELECT * FROM oidc_auth_tx WHERE browser_key = ? ORDER BY created_at DESC')
    .all(browserKey) as AuthTxRow[];
  return rows.map(toAuthTxRecord);
}

export function deleteAuthTx(txId: string): void {
  getDatabase().prepare('DELETE FROM oidc_auth_tx WHERE tx_id = ?').run(txId);
}

/**
 * Atomic single-use consume by the `state` the provider echoes back: returns the
 * row and deletes it in one transaction (replay defense). Keyed on `state` rather
 * than the cookie so concurrent flows from one browser never consume each other.
 */
export function consumeAuthTxByState(state: string): AuthTxRecord | null {
  const db = getDatabase();
  const consume = db.transaction((s: string) => {
    const row = db.prepare('SELECT * FROM oidc_auth_tx WHERE state = ?').get(s) as
      | AuthTxRow
      | undefined;
    if (!row) return null;
    deleteAuthTx(row.tx_id);
    return toAuthTxRecord(row);
  });
  return consume(state);
}

// --- EA session (encrypted tokens + identity) ------------------------------

export interface SessionRecord {
  sessionId: string;
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  accessTokenEnc: Buffer;
  refreshTokenEnc: Buffer;
  accessExpiresAt: number;
  refreshExpiresAt: number;
  createdAt: number;
  lastSeenAt: number;
}

interface SessionRow {
  session_id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  access_token_enc: Buffer;
  refresh_token_enc: Buffer;
  access_expires_at: number;
  refresh_expires_at: number;
  created_at: number;
  last_seen_at: number;
}

function mapSessionRow(row: SessionRow): SessionRecord {
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    accessTokenEnc: row.access_token_enc,
    refreshTokenEnc: row.refresh_token_enc,
    accessExpiresAt: row.access_expires_at,
    refreshExpiresAt: row.refresh_expires_at,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  };
}

export function insertSession(rec: SessionRecord): void {
  getDatabase()
    .prepare(
      `INSERT INTO oidc_sessions
         (session_id, user_id, display_name, avatar_url, access_token_enc, refresh_token_enc,
          access_expires_at, refresh_expires_at, created_at, last_seen_at)
       VALUES
         (@sessionId, @userId, @displayName, @avatarUrl, @accessTokenEnc, @refreshTokenEnc,
          @accessExpiresAt, @refreshExpiresAt, @createdAt, @lastSeenAt)`,
    )
    .run(rec);
}

export function getSessionRecord(sessionId: string): SessionRecord | null {
  const row = getDatabase()
    .prepare('SELECT * FROM oidc_sessions WHERE session_id = ?')
    .get(sessionId) as SessionRow | undefined;
  return row ? mapSessionRow(row) : null;
}

/** Update the activity timestamp (drives idle-timeout). */
export function touchSession(sessionId: string, lastSeenAt: number): void {
  getDatabase()
    .prepare('UPDATE oidc_sessions SET last_seen_at = ? WHERE session_id = ?')
    .run(lastSeenAt, sessionId);
}

/** Persist rotated tokens after a successful refresh (always overwrite with the newest). */
export function updateSessionTokens(
  sessionId: string,
  fields: {
    accessTokenEnc: Buffer;
    refreshTokenEnc: Buffer;
    accessExpiresAt: number;
    refreshExpiresAt: number;
  },
): void {
  getDatabase()
    .prepare(
      `UPDATE oidc_sessions
         SET access_token_enc = @accessTokenEnc,
             refresh_token_enc = @refreshTokenEnc,
             access_expires_at = @accessExpiresAt,
             refresh_expires_at = @refreshExpiresAt
       WHERE session_id = @sessionId`,
    )
    .run({ sessionId, ...fields });
}

export function deleteSession(sessionId: string): void {
  getDatabase().prepare('DELETE FROM oidc_sessions WHERE session_id = ?').run(sessionId);
}

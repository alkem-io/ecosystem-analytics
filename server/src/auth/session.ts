import { randomBytes } from 'crypto';
import type { CookieOptions } from 'express';
import { loadConfig } from '../config.js';
import { encrypt } from './oidc/crypto.js';
import {
  insertSession,
  getSessionRecord,
  touchSession as touchSessionStore,
  deleteSession,
  type SessionRecord,
} from '../cache/session-store.js';

/** Browser cookie names (opaque references — never carry tokens). */
export const SESSION_COOKIE = 'ea_session';
export const PREAUTH_COOKIE = 'ea_preauth';

/**
 * Default Hydra refresh-grant lifetime used when the token response does not
 * advertise a refresh expiry. Hydra issues ~14-day rotating refresh tokens.
 */
const DEFAULT_REFRESH_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000;

export interface NewSessionInput {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken: string;
  /** epoch ms when the access token expires */
  accessExpiresAt: number;
  /** epoch ms when the refresh grant expires (defaults to +14d) */
  refreshExpiresAt?: number;
}

/** Generate an opaque, URL-safe CSPRNG identifier (≥128-bit). */
export function generateOpaqueId(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Create EA's own session: encrypt the Hydra tokens at rest, persist the
 * identity, and return the stored record. The caller sets the `ea_session`
 * cookie to `session.sessionId`.
 */
export function createSession(input: NewSessionInput, now = Date.now()): SessionRecord {
  const key = loadConfig().session.encKey;
  const record: SessionRecord = {
    sessionId: generateOpaqueId(),
    userId: input.userId,
    displayName: input.displayName,
    avatarUrl: input.avatarUrl,
    accessTokenEnc: encrypt(input.accessToken, key),
    refreshTokenEnc: encrypt(input.refreshToken, key),
    accessExpiresAt: input.accessExpiresAt,
    refreshExpiresAt: input.refreshExpiresAt ?? now + DEFAULT_REFRESH_LIFETIME_MS,
    createdAt: now,
    lastSeenAt: now,
  };
  insertSession(record);
  return record;
}

/**
 * A session is valid iff the refresh grant has not expired AND it has not been
 * idle beyond the configured timeout (FR-009a).
 */
export function isSessionValid(rec: SessionRecord, now = Date.now()): boolean {
  const idleTimeoutMs = loadConfig().session.idleTimeoutHours * 60 * 60 * 1000;
  return now < rec.refreshExpiresAt && now - rec.lastSeenAt < idleTimeoutMs;
}

/**
 * Load a session by id and enforce validity. An invalid (expired/idle) session
 * is deleted and treated as absent — the caller routes the request as
 * unauthenticated (FR-009).
 */
export function resolveSession(sessionId: string, now = Date.now()): SessionRecord | null {
  const rec = getSessionRecord(sessionId);
  if (!rec) return null;
  if (!isSessionValid(rec, now)) {
    deleteSession(rec.sessionId);
    return null;
  }
  return rec;
}

/** Update `last_seen_at` on authenticated activity (drives the idle timeout). */
export function touchSession(sessionId: string, now = Date.now()): void {
  touchSessionStore(sessionId, now);
}

/** Delete a session record (sign-out / refresh-failure). */
export function destroySession(sessionId: string): void {
  deleteSession(sessionId);
}

/**
 * Cookie attributes derived from config so one build works hosted and locally
 * (FR-006/US2). `Secure` and `Domain` are driven by `session.cookie_domain`:
 * a configured domain (`.alkem.io`) implies an HTTPS deployment (Secure + domain
 * scoped); an empty domain implies a host-only cookie on localhost (not Secure,
 * so it is stored over plain HTTP in dev).
 */
function baseCookieOptions(): CookieOptions {
  const cookieDomain = loadConfig().session.cookieDomain;
  // Hosted (cookieDomain set): EA and the IdP share a registrable domain, so the
  // OIDC callback redirect is SAME-site → `Lax` works and is the safer default.
  // Local-against-production (no cookieDomain): EA is on localhost while the IdP
  // is on another site, so the callback is a CROSS-site redirect; a `Lax` cookie
  // set on that hop is dropped by the browser. `None`+`Secure` is required to
  // store it. http://localhost is a secure context, so `Secure` is honored.
  const crossSite = !cookieDomain;
  return {
    httpOnly: true,
    secure: true,
    sameSite: crossSite ? 'none' : 'lax',
    path: '/',
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  };
}

/** Options for the long-lived session cookie. */
export function sessionCookieOptions(): CookieOptions {
  const idleTimeoutMs = loadConfig().session.idleTimeoutHours * 60 * 60 * 1000;
  return { ...baseCookieOptions(), maxAge: idleTimeoutMs };
}

/** Options for the short-lived pre-auth cookie. */
export function preauthCookieOptions(): CookieOptions {
  const ttlMs = loadConfig().oidc.preauthTtlMinutes * 60 * 1000;
  return { ...baseCookieOptions(), maxAge: ttlMs };
}

/** Options used when clearing a cookie (must match domain/path to delete). */
export function clearCookieOptions(): CookieOptions {
  const { httpOnly, secure, sameSite, path, domain } = baseCookieOptions();
  return { httpOnly, secure, sameSite, path, ...(domain ? { domain } : {}) };
}

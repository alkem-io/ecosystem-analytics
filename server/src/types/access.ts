/**
 * Access-gate types shared with the frontends (feature 026), imported there via
 * `@server/types/access.js`. The logic lives in `server/src/access/`.
 */
export type { AppId, AccessLevel, AccessPolicy } from '../access/policy.js';
import type { AppId, AccessLevel } from '../access/policy.js';

/** Where the person stands with ONE application — what a shell renders from. */
export type AccessStatus = 'admitted' | 'none' | 'unverified';

/** Returned in `GET /api/auth/me` and `POST /api/auth/access/recheck` (contracts/api-access.md). */
export interface AccessReport {
  /** The application of the listener that answered. */
  app: AppId;
  status: AccessStatus;
  /** `null` when the check could not be completed; `'read'` for an ungated app. */
  level: AccessLevel | null;
  /** Whether this application has a gate at all. */
  gated: boolean;
  /** The gate Space as shown on the "no access" page; `null` when ungated. */
  gate: { displayName: string; url: string } | null;
}

/** Body of a 403 from a gated route (contracts/api-access.md §3). */
export interface AccessDeniedBody {
  error: 'ACCESS_DENIED';
  reason: 'none' | 'unverified';
  app: AppId;
  message: string;
}

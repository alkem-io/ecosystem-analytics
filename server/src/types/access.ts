/**
 * Access-gate types shared with the frontends (feature 026), imported there via
 * `@server/types/access.js`. The logic lives in `server/src/access/`.
 *
 * This file MUST NOT import from outside `server/src/types/`: the frontend Docker
 * stage copies only this folder (see Dockerfile), so the dependency runs the other
 * way — `access/policy.ts` imports these types.
 */

/** Every application the BFF serves, one per listener. Add a dashboard here AND in `APP_IDS`. */
export type AppId = 'explorer' | 'vng' | 'govtech';

/** Ordered `none < read < manage` (data-model.md). */
export type AccessLevel = 'none' | 'read' | 'manage';

/**
 * The Alkemio Space whose community roles decide access: nameIDs from the L0 Space down
 * to the gate (1–3 levels). `key` identifies it in a stored decision, so a reconfigured
 * gate invalidates every decision taken against the old one.
 */
export interface GateRef {
  path: string[];
  key: string;
}

/** What one consumer requires: explicitly ungated, or a gate Space plus a minimum level. */
export type AccessPolicy =
  | { app: AppId; gate: null }
  | { app: AppId; gate: GateRef; required: Exclude<AccessLevel, 'none'> };

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

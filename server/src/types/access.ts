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

/**
 * An application's two sets of Spaces (feature 027, research R1): MEMBER of any viewer
 * Space gives Read; ADMIN of any admin Space gives Manage (which includes Read).
 * `setKey` identifies both sets in a held decision, so changing either set invalidates
 * every decision taken against the old ones.
 */
export interface AccessSets {
  viewers: GateRef[];
  /** May be empty: then nobody can manage. */
  admins: GateRef[];
  /** `v:<sorted viewer keys>|a:<sorted admin keys>`. */
  setKey: string;
}

/** What one consumer requires: explicitly ungated, or the app's sets plus a minimum level. */
export type AccessPolicy =
  | { app: AppId; gate: null }
  | { app: AppId; gate: AccessSets; required: Exclude<AccessLevel, 'none'> };

/** A Space as shown to people: on the sign-in, no-access and admin screens (feature 027). */
export interface GateLink {
  /** The gate path, e.g. `programmagroei`. */
  key: string;
  /** Probe name, else the configured fallback, else the last path segment. */
  displayName: string;
  url: string;
  /** From the anonymous start-up probe. */
  exists: 'yes' | 'no' | 'unknown';
}

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
  /**
   * The viewer Spaces as shown on the "no access" page (feature 027); empty when ungated.
   * Admin Spaces are never listed here — only the admin API returns them.
   */
  viewerSpaces: GateLink[];
}

/** Body of a 403 from a gated route (contracts/api-access.md §3). */
export interface AccessDeniedBody {
  error: 'ACCESS_DENIED';
  reason: 'none' | 'unverified';
  app: AppId;
  message: string;
}

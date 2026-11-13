/**
 * The pure core of the access gate (feature 026). No I/O, no config, no Alkemio.
 *
 * Every consumer — each application today, the forthcoming management area, any
 * future dashboard or individual route — expresses what it needs as an
 * {@link AccessPolicy} and asks this module whether a person's {@link AccessLevel}
 * satisfies it (FR-018a–c). Nothing else in the codebase decides access.
 */

import type { AccessLevel, AccessPolicy, AppId, GateRef } from '../types/access.js';

export type { AccessLevel, AccessPolicy, AppId, GateRef };

/** Every application the BFF serves, one per listener (Explorer :4000, VNG :4001, GovTech :4002). */
export const APP_IDS = ['explorer', 'vng', 'govtech'] as const satisfies readonly AppId[];

// Compile-time guard: APP_IDS must list every AppId (the type lives in types/access.ts).
type MissingAppId = Exclude<AppId, (typeof APP_IDS)[number]>;
const appIdsAreExhaustive: [MissingAppId] extends [never] ? true : never = true;
void appIdsAreExhaustive;

export function isAppId(value: unknown): value is AppId {
  return typeof value === 'string' && (APP_IDS as readonly string[]).includes(value);
}

const RANK: Record<AccessLevel, number> = { none: 0, read: 1, manage: 2 };

/** An Alkemio nameID segment (lowercased): letters, digits and hyphens. */
const NAME_ID = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** URL markers Alkemio puts between levels: `/<l0>/challenges/<l1>/opportunities/<l2>`. */
const LEVEL_MARKERS = ['challenges', 'opportunities'] as const;

/**
 * Parse an `access.<app>` configuration value (contracts/config-access.md).
 *
 * - `none` → `null` (explicitly ungated)
 * - `space`, `space/sub`, `space/sub/subsub` → a {@link GateRef}
 * - `https://<host>/space[/challenges/sub[/opportunities/subsub]]` → the same
 *
 * Throws on anything else — the caller turns that into a start-up failure (FR-003),
 * so a typo can never silently open an application.
 */
export function parseGateRef(value: string): GateRef | null {
  if (typeof value !== 'string') throw new Error('expected a string');
  const trimmed = value.trim();
  if (!trimmed) throw new Error('empty — use `none` to ungate explicitly');
  if (trimmed.toLowerCase() === 'none') return null;

  const path = /^https?:\/\//i.test(trimmed) ? pathFromUrl(trimmed) : pathFromSlashes(trimmed);

  if (path.length < 1 || path.length > 3) {
    throw new Error(`expected 1–3 Space levels, got ${path.length}`);
  }
  for (const segment of path) {
    if (!NAME_ID.test(segment)) throw new Error(`'${segment}' is not a valid Alkemio nameID`);
  }
  return { path, key: path.join('/') };
}

function pathFromSlashes(value: string): string[] {
  // One leading/trailing slash is tolerated; anything more is a typo worth failing on.
  const segments = value.replace(/^\/|\/$/g, '').split('/');
  if (segments.some((s) => s === '')) throw new Error('empty path segment');
  return segments.map((s) => s.toLowerCase());
}

function pathFromUrl(value: string): string[] {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('not a valid URL');
  }
  const segments = url.pathname
    .split('/')
    .filter(Boolean)
    .map((s) => decodeURIComponent(s).toLowerCase());
  if (segments.length === 0) throw new Error('URL has no Space path');

  // Expected shape: l0 [marker l1 [marker l2]] — markers at odd positions, in order.
  const path = [segments[0]];
  for (let i = 1; i < segments.length; i += 2) {
    const marker = segments[i];
    const next = segments[i + 1];
    if (marker !== LEVEL_MARKERS[(i - 1) / 2] || !next) {
      throw new Error(`unexpected URL segment '${marker}'`);
    }
    path.push(next);
  }
  return path;
}

/** The Alkemio URL path of a gate, e.g. `/programmagroei/challenges/landelijkinnovatiemonitor`. */
export function gateUrlPath(gate: GateRef): string {
  return gate.path
    .map((segment, i) => (i === 0 ? `/${segment}` : `/${LEVEL_MARKERS[i - 1]}/${segment}`))
    .join('');
}

/**
 * A person's level from their ROLES in the gate Space's community (FR-004): MEMBER →
 * Read, MEMBER + ADMIN → Manage. Manage requires Read — ADMIN without MEMBER is no
 * access — and no other role (LEAD, …) admits on its own.
 *
 * Roles, not privileges: Alkemio grants the READ privilege on a public Space to
 * everyone, so a privilege check would admit every signed-in person; a role is held
 * only by the people actually given it, whatever the Space's visibility.
 */
export function levelFromRoles(roles: readonly string[] | null | undefined): AccessLevel {
  const set = new Set(roles ?? []);
  if (!set.has('MEMBER')) return 'none';
  return set.has('ADMIN') ? 'manage' : 'read';
}

/** Whether `level` satisfies `policy`. An ungated policy admits every signed-in person. */
export function admits(policy: AccessPolicy, level: AccessLevel): boolean {
  if (policy.gate === null) return true;
  return RANK[level] >= RANK[policy.required];
}

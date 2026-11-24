import type { AccessReport } from '@server/types/access.js';

/** What a signed-in shell renders (feature 026). */
export type AccessScreen = 'app' | 'no-access' | 'unverified';

/**
 * Pick the screen for a signed-in person from the access report `/api/auth/me` returns.
 *
 * A report without `access` (a BFF older than feature 026) renders the app: the server
 * is the authority and refuses every gated request itself (FR-009), so the shell never
 * needs to fail closed on its own.
 */
export function accessScreenFor(access: AccessReport | null | undefined): AccessScreen {
  switch (access?.status) {
    case 'none':
      return 'no-access';
    case 'unverified':
      return 'unverified';
    default:
      return 'app';
  }
}

import { useCallback, useEffect, useState } from 'react';
import type { AccessReport } from '@server/types/access.js';
import { fetchMe, recheckAccess, type MeResponse } from '../services/auth.js';
import { accessScreenFor, type AccessScreen } from './access-screen.js';
import { onAccessDenied, resetAccessSignal } from './access-signal.js';

export interface AccessControl {
  screen: AccessScreen;
  access: AccessReport | undefined;
  /** A "check again" is in flight. */
  checking: boolean;
  /** "Check again" / "Try again": re-decide from Alkemio and switch screens. */
  recheck: () => Promise<void>;
}

/**
 * The access-gate state of a signed-in shell (feature 026), shared by every SPA so
 * the behaviour is identical everywhere:
 * - starts from `me.access`;
 * - when any request comes back 403 ACCESS_DENIED, re-reads `/api/auth/me` and
 *   switches screen (FR-015) — no toast, no redirect;
 * - `recheck()` asks the BFF to decide again and, once admitted, re-arms the signal.
 */
export function useAccessControl(me: MeResponse | null): AccessControl {
  const [access, setAccess] = useState<AccessReport | undefined>(me?.access);
  const [checking, setChecking] = useState(false);

  useEffect(() => setAccess(me?.access), [me]);

  useEffect(
    () =>
      onAccessDenied((reason) => {
        void fetchMe().then((fresh) => {
          const next = fresh?.access;
          if (next && next.status !== 'admitted') {
            setAccess(next);
          } else if (next) {
            // The app itself admits the person — the refusal came from another
            // application's feature. Stay put and re-arm for the next one.
            resetAccessSignal();
          } else {
            setAccess((prev) =>
              prev ? { ...prev, status: reason === 'unverified' ? 'unverified' : 'none' } : prev,
            );
          }
        });
      }),
    [],
  );

  const recheck = useCallback(async () => {
    setChecking(true);
    try {
      const next = await recheckAccess();
      setAccess(next);
      if (next.status === 'admitted') resetAccessSignal();
    } catch {
      // Network trouble: stay on the current screen; the person can try again.
    } finally {
      setChecking(false);
    }
  }, []);

  return { screen: accessScreenFor(access), access, checking, recheck };
}

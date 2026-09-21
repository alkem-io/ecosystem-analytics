import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../services/api.js';

/**
 * The orchestrator choice for one hub (feature 024, FR-009/011/012).
 *
 * `GET` answers everything the resolution order needs in one round trip: the viewer's
 * own saved choice, the community preset (already filtered server-side to Spaces this
 * viewer can read), and the built-in default. `choose()` and `reset()` write it.
 *
 * Two things this hook is careful about:
 *
 *  • A failure must never blank the tab (Constitution V). The map still draws; it just
 *    falls through to the profile-based guess.
 *  • A viewer the server will not remember — a guest (feature 023) — still gets their
 *    choice honoured for the visit, via the caller-supplied `onLocalChoice`. Their
 *    choice deliberately does NOT feed the community preset: guests are anonymous and
 *    could not be de-duplicated.
 */
export interface OrchestratorChoiceResponse {
  hubNameId: string;
  own: string | null;
  community: { spaceNameId: string; count: number } | null;
  builtIn: string | null;
}

export interface UseOrchestratorChoiceOptions {
  /** Where to keep a choice the server refused to store (guest). */
  localChoice?: string | null;
  onLocalChoice?: (spaceNameId: string | null) => void;
}

export interface UseOrchestratorChoiceResult {
  own: string | null;
  community: string | null;
  builtIn: string | null;
  /** True when `own` is held locally because the server would not store it. */
  ownIsLocal: boolean;
  loading: boolean;
  error: string | null;
  choose: (spaceNameId: string) => Promise<void>;
  reset: () => Promise<void>;
  reload: () => void;
}

/** The server declined to remember this viewer — not an error, just a guest. */
function isRefusal(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /\b(401|403)\b|forbidden|unauthori[sz]ed|guest/i.test(message);
}

export function useOrchestratorChoice(
  hubNameId: string | null,
  { localChoice = null, onLocalChoice }: UseOrchestratorChoiceOptions = {},
): UseOrchestratorChoiceResult {
  const [data, setData] = useState<OrchestratorChoiceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // Out-of-order responses must not clobber a newer hub's answer.
  const requestRef = useRef(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const path = hubNameId ? `/api/ecosystem/orchestrator/${encodeURIComponent(hubNameId)}` : null;

  useEffect(() => {
    if (!path) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    const requestId = ++requestRef.current;
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .get<OrchestratorChoiceResponse>(path)
      .then((res) => {
        if (cancelled || requestId !== requestRef.current) return;
        setData(res);
      })
      .catch((err: unknown) => {
        if (cancelled || requestId !== requestRef.current) return;
        setData(null);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled && requestId === requestRef.current) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [path, nonce]);

  const choose = useCallback(
    async (spaceNameId: string) => {
      if (!path) return;
      // Optimistic: the map re-centres on the click, not on the round trip (SC-004).
      setData((prev) => (prev ? { ...prev, own: spaceNameId } : prev));
      try {
        const res = await api.put<OrchestratorChoiceResponse>(path, { spaceNameId });
        setData(res);
        onLocalChoice?.(null);
      } catch (err) {
        if (isRefusal(err)) {
          onLocalChoice?.(spaceNameId); // guest: remembered for the visit only
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
        reload();
      }
    },
    [path, onLocalChoice, reload],
  );

  const reset = useCallback(async () => {
    if (!path) return;
    setData((prev) => (prev ? { ...prev, own: null } : prev));
    onLocalChoice?.(null);
    try {
      setData(await api.delete<OrchestratorChoiceResponse>(path));
    } catch (err) {
      if (isRefusal(err)) return;
      setError(err instanceof Error ? err.message : String(err));
      reload();
    }
  }, [path, onLocalChoice, reload]);

  const serverOwn = data?.own ?? null;
  return {
    own: serverOwn ?? localChoice,
    community: data?.community?.spaceNameId ?? null,
    builtIn: data?.builtIn ?? null,
    ownIsLocal: !serverOwn && Boolean(localChoice),
    loading,
    error,
    choose,
    reset,
    reload,
  };
}

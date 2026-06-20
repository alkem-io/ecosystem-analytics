import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@ea/shared';
import type { GraphDataset } from '@server/types/graph.js';

/**
 * VNG graph data hook (US1/US10). Generates a {@link GraphDataset} for the given
 * effective space set by POSTing to the shared BFF `/api/graph/generate`,
 * optionally folding in the GemeenteDelers initiative layer.
 *
 * The browser talks only to the BFF and authenticates via the httpOnly
 * `ea_session` cookie (shared with the Explorer). The request body matches the
 * server `GraphGenerationRequest` (`spaceIds`, `forceRefresh?`, `includeInitiatives?`).
 */
export interface UseVngGraphResult {
  dataset: GraphDataset | null;
  loading: boolean;
  error: string | null;
  warnings: string[];
  reload: () => void;
}

export function useVngGraph(
  spaceIds: string[],
  options: { includeInitiatives?: boolean } = {},
): UseVngGraphResult {
  const { includeInitiatives = false } = options;
  const [dataset, setDataset] = useState<GraphDataset | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [nonce, setNonce] = useState(0);

  // Track the latest request so out-of-order responses don't clobber state.
  const requestRef = useRef(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // Stable signature so the effect only re-runs when the set actually changes.
  const signature = `${[...spaceIds].sort().join(',')}|${includeInitiatives ? 1 : 0}`;

  useEffect(() => {
    if (spaceIds.length === 0) {
      setDataset(null);
      setError(null);
      setWarnings([]);
      setLoading(false);
      return;
    }

    const requestId = ++requestRef.current;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setWarnings([]);

    api
      .post<GraphDataset>('/api/graph/generate', {
        spaceIds,
        includeInitiatives,
      })
      .then((result) => {
        if (cancelled || requestId !== requestRef.current) return;
        setDataset(result);
        if (result.errors && result.errors.length > 0) {
          setWarnings(result.errors);
          for (const message of result.errors) {
            console.warn(`[vng-graph] ${message}`);
          }
        }
      })
      .catch((err: unknown) => {
        if (cancelled || requestId !== requestRef.current) return;
        console.error('[vng-graph] Failed to generate graph:', err);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled && requestId === requestRef.current) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // `signature` captures spaceIds + includeInitiatives; `nonce` forces reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, nonce]);

  return { dataset, loading, error, warnings, reload };
}

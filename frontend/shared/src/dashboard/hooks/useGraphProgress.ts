import { useEffect, useState } from 'react';
import { api } from '@ea/shared';
import type { GraphProgress } from '@server/types/api.js';

/**
 * Poll the BFF graph-generation progress while `active` (i.e. a graph is loading),
 * so the loading UI can show the live step + spaces-acquired count instead of a
 * static spinner. Stops and clears when inactive.
 */
export function useGraphProgress(active: boolean): GraphProgress | null {
  const [progress, setProgress] = useState<GraphProgress | null>(null);

  useEffect(() => {
    if (!active) {
      setProgress(null);
      return;
    }
    let cancelled = false;
    const poll = () =>
      api
        .get<GraphProgress>('/api/graph/progress')
        .then((p) => !cancelled && setProgress(p))
        .catch(() => {});
    poll();
    const id = setInterval(poll, 600);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [active]);

  return progress;
}

import { useState, useCallback, useRef } from 'react';
import { api } from '../services/api.js';
import type { GraphDataset } from '@server/types/graph.js';
import type { GraphProgress } from '@server/types/api.js';

export function useGraph() {
  const [dataset, setDataset] = useState<GraphDataset | null>(null);
  const [progress, setProgress] = useState<GraphProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval>>(null);

  const generate = useCallback(async (spaceIds: string[], forceRefresh = false) => {
    setLoading(true);
    setError(null);
    setWarnings([]);
    setProgress({ step: 'acquiring', spacesTotal: spaceIds.length, spacesCompleted: 0 });

    // Poll for progress updates
    pollRef.current = setInterval(async () => {
      try {
        const p = await api.get<GraphProgress>('/api/graph/progress');
        setProgress(p);
      } catch {
        // Ignore poll errors
      }
    }, 1000);

    try {
      const result = await api.post<GraphDataset>('/api/graph/generate', {
        spaceIds,
        forceRefresh,
      });
      setDataset(result);
      if (result.errors && result.errors.length > 0) {
        setWarnings(result.errors);
      }
      setProgress({ step: 'ready', spacesTotal: spaceIds.length, spacesCompleted: spaceIds.length });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }, []);

  return { dataset, progress, loading, error, warnings, generate };
}

import { useEffect, useState } from 'react';
import { api } from '@ea/shared';

export interface GdInitiative {
  id: string;
  nameId: string;
  displayName: string;
  /** Gemeentes this initiative is associated with (parsed from its description). */
  gemeentes: string[];
  /** VNG themes this initiative is tagged with. */
  themes: string[];
}

interface Result {
  initiatives: GdInitiative[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetch the full list of GemeenteDelers initiatives (id + name) from the BFF, used
 * by the selection panel's "Include GD initiatives → show all" list. Only fetched
 * when `enabled` (i.e. the section is expanded), so it costs nothing otherwise.
 */
export function useGdInitiatives(enabled: boolean): Result {
  const [initiatives, setInitiatives] = useState<GdInitiative[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || initiatives.length > 0) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<GdInitiative[]>('/api/vng/initiatives')
      .then((res) => !cancelled && setInitiatives(res ?? []))
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [enabled, initiatives.length]);

  return { initiatives, loading, error };
}

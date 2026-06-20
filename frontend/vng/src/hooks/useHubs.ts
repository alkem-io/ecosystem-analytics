import { useCallback, useEffect, useState } from 'react';
import { api } from '@ea/shared';

/** An innovation hub the platform exposes to the signed-in user. */
export interface HubSummary {
  nameId: string;
  displayName: string;
  /** Size of the hub's space list filter, if known. */
  spaceCount: number;
}

/** Response of GET /api/hubs (contracts/api-hubs.md). */
export interface HubsResponse {
  defaultHubNameId: string | null;
  hubs: HubSummary[];
}

/** A space listed by an innovation hub. */
export interface HubSpace {
  nameId: string;
  displayName: string;
  visibility: string;
}

/** Response of GET /api/hubs/:nameId/spaces (contracts/api-hubs.md). */
export interface HubSpacesResponse {
  nameId: string;
  spaces: HubSpace[];
}

interface UseHubsResult {
  hubs: HubSummary[];
  defaultHubNameId: string | null;
  loading: boolean;
  error: string | null;
  /** Resolve a hub's listed spaces (used when the active hub changes). */
  fetchHubSpaces: (nameId: string) => Promise<HubSpace[]>;
  reload: () => void;
}

/**
 * Fetch the innovation hubs available to the signed-in user (US1, FR-009/010).
 * Exposes the configured default so the selection state can preselect it.
 */
export function useHubs(): UseHubsResult {
  const [hubs, setHubs] = useState<HubSummary[]>([]);
  const [defaultHubNameId, setDefaultHubNameId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<HubsResponse>('/api/hubs')
      .then((res) => {
        if (cancelled) return;
        setHubs(res.hubs ?? []);
        setDefaultHubNameId(res.defaultHubNameId ?? null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const fetchHubSpaces = useCallback(async (nameId: string): Promise<HubSpace[]> => {
    const res = await api.get<HubSpacesResponse>(`/api/hubs/${encodeURIComponent(nameId)}/spaces`);
    return res.spaces ?? [];
  }, []);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { hubs, defaultHubNameId, loading, error, fetchHubSpaces, reload };
}

import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api.js';
import type { SpaceSelectionItem } from '@server/types/api.js';

const CACHE_KEY = 'alkemio_spaces';

function loadCached(): SpaceSelectionItem[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function useSpaces() {
  const [spaces, setSpaces] = useState<SpaceSelectionItem[]>(loadCached);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSpaces = useCallback((refresh = false) => {
    setLoading(true);
    setError(null);
    const url = refresh ? '/api/spaces?refresh=true' : '/api/spaces';
    api
      .get<SpaceSelectionItem[]>(url)
      .then((data) => {
        setSpaces(data);
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchSpaces();
  }, [fetchSpaces]);

  const reload = useCallback(() => {
    localStorage.removeItem(CACHE_KEY);
    fetchSpaces(true);
  }, [fetchSpaces]);

  return { spaces, loading, error, reload };
}

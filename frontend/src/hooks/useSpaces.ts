import { useState, useEffect } from 'react';
import { api } from '../services/api.js';
import type { SpaceSelectionItem } from '@server/types/api.js';

export function useSpaces() {
  const [spaces, setSpaces] = useState<SpaceSelectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<SpaceSelectionItem[]>('/api/spaces')
      .then(setSpaces)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return { spaces, loading, error };
}

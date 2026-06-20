import { useState, useEffect } from 'react';
import { api } from '../services/api.js';

interface Features {
  aiQueryEnabled: boolean;
}

const DEFAULT_FEATURES: Features = { aiQueryEnabled: false };

export function useFeatures(): Features {
  const [features, setFeatures] = useState<Features>(DEFAULT_FEATURES);

  useEffect(() => {
    api
      .get<Features>('/api/features')
      .then(setFeatures)
      .catch(() => setFeatures(DEFAULT_FEATURES));
  }, []);

  return features;
}

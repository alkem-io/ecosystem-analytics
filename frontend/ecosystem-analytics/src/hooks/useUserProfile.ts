import { useState, useEffect } from 'react';
import { api } from '../services/api.js';
import type { UserProfile } from '@server/types/api.js';

export function useUserProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    api
      .get<UserProfile>('/api/auth/me')
      .then(setProfile)
      .catch(() => setProfile(null));
  }, []);

  return profile;
}

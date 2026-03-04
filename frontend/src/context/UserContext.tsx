import { createContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { getToken } from '../services/auth.js';
import { api } from '../services/api.js';
import type { UserProfile } from '@server/types/api.js';

export interface UserContextState {
  displayName: string;
  avatarUrl: string | null;
  loading: boolean;
  refresh: () => void;
}

const defaultState: UserContextState = {
  displayName: '',
  avatarUrl: null,
  loading: true,
  refresh: () => {},
};

export const UserContext = createContext<UserContextState>(defaultState);

export function UserProvider({ children }: { children: ReactNode }) {
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const profile = await api.get<UserProfile>('/api/auth/me');
      setDisplayName(profile.displayName);
      setAvatarUrl(profile.avatarUrl);
    } catch {
      // Token may be invalid — profile will remain empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return (
    <UserContext.Provider value={{ displayName, avatarUrl, loading, refresh: fetchProfile }}>
      {children}
    </UserContext.Provider>
  );
}

import { createContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { fetchMe } from '../services/auth.js';

export interface UserContextState {
  displayName: string;
  avatarUrl: string | null;
  /** Base URL of the Alkemio server the BFF is connected to (empty until loaded). */
  alkemioServerUrl: string;
  loading: boolean;
  refresh: () => void;
}

const defaultState: UserContextState = {
  displayName: '',
  avatarUrl: null,
  alkemioServerUrl: '',
  loading: true,
  refresh: () => {},
};

export const UserContext = createContext<UserContextState>(defaultState);

export function UserProvider({ children }: { children: ReactNode }) {
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [alkemioServerUrl, setAlkemioServerUrl] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    const me = await fetchMe();
    if (me) {
      setDisplayName(me.displayName);
      setAvatarUrl(me.avatarUrl);
      setAlkemioServerUrl(me.alkemioServerUrl);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return (
    <UserContext.Provider
      value={{ displayName, avatarUrl, alkemioServerUrl, loading, refresh: fetchProfile }}
    >
      {children}
    </UserContext.Provider>
  );
}

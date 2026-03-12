import { useContext } from 'react';
import { UserContext, type UserContextState } from '../context/UserContext.js';

export function useUser(): UserContextState {
  return useContext(UserContext);
}

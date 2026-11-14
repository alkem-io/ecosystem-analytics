import { createContext, useContext } from 'react';
import type { AccessLevel } from '@server/types/access.js';

/**
 * Feature 027 — the signed-in person's level for this application, as the shell last
 * heard it (`me.access.level`). Only used to SHOW things (the settings entry); the BFF
 * enforces every admin request itself.
 */
export const AccessLevelContext = createContext<AccessLevel | null>(null);

export const useAccessLevel = (): AccessLevel | null => useContext(AccessLevelContext);

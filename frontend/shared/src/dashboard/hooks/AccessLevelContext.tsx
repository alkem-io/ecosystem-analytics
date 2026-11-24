import { createContext, useContext } from 'react';
import type { AccessLevel, AccessReport } from '@server/types/access.js';

/**
 * Feature 027 — where the signed-in person stands with this application, as the shell last
 * heard it (`me.access`). Only used to SHOW things — the settings entry, where access comes
 * from; the BFF enforces every request itself.
 */
export const AccessReportContext = createContext<AccessReport | null>(null);

export const useAccessReport = (): AccessReport | null => useContext(AccessReportContext);

export const useAccessLevel = (): AccessLevel | null => useAccessReport()?.level ?? null;

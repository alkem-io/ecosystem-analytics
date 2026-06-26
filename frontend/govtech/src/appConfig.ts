import type { AppConfig } from '@ea/shared';
import { GovtechLogo } from './components/GovtechLogo.js';

/**
 * GovTech-specific parameters for the shared dashboard implementation
 * (@ea/shared). Everything else (the app shell, pages, charts, hooks) lives in
 * @ea/shared and reads these values via `useAppConfig()`.
 */
export const appConfig: AppConfig = {
  appId: 'govtech',
  apiNamespace: 'govtech',
  storagePrefix: 'govtech',
  eventPrefix: 'govtech',
  Logo: GovtechLogo,
  exportCreator: 'GovTech Nederland',
  exportFilenameStem: 'govtech-dashboard',
};

import type { AppConfig } from '@ea/shared';
import { VngLogo } from './components/VngLogo.js';

/**
 * VNG-specific parameters for the shared dashboard implementation (@ea/shared).
 * Everything else (the app shell, pages, charts, hooks) lives in @ea/shared and
 * reads these values via `useAppConfig()`.
 */
export const appConfig: AppConfig = {
  appId: 'vng',
  apiNamespace: 'vng',
  storagePrefix: 'vng',
  eventPrefix: 'vng',
  Logo: VngLogo,
  exportCreator: 'VNG Kenniscentrum Innovatie',
  exportFilenameStem: 'vng-dashboard',
};

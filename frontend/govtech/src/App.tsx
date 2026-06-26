import { AppConfigProvider, DashboardApp } from '@ea/shared';
import { appConfig } from './appConfig.js';

/**
 * GovTech frontend entry: supply the GovTech {@link appConfig} to the shared
 * dashboard application. All UI/behaviour lives in @ea/shared and is
 * parameterised by this config (API namespace, storage/event prefixes, logo,
 * export labels).
 */
export default function App() {
  return (
    <AppConfigProvider value={appConfig}>
      <DashboardApp />
    </AppConfigProvider>
  );
}

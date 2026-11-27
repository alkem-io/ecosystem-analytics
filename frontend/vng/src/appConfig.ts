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
  // Feature 019 — VNG-only for now (FR-003).
  usageExplorer: true,
  // Feature 022 — the innovation funnel. VNG-only for now.
  funnel: true,
  // Feature 024 — the ecosystem map. VNG-only for now.
  ecosystem: true,
  // Feature 027 — the monitor's own Spaces (no hub picker) and the /admin area.
  flags: { managedScope: true },
  // The monitor is a prototype for wider feedback; more information on this Space.
  prototypeInfoUrl: 'https://alkem.io/innovatiemonitor',
  // Layout A — the sidebar shell. VNG-only for now; GovTech keeps the tab strip.
  layout: 'sidebar',
  // Layout A shows Groei and GemeenteDelers together by default (the agreed design).
  gemeenteDelersDefault: true,
};

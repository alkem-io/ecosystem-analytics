import { createContext, useContext, type ReactNode } from 'react';

/**
 * Per-app configuration that parameterises the otherwise-identical dashboard
 * implementation shared by the VNG and GovTech frontends. Each wrapper app
 * supplies one of these literals at its root via {@link AppConfigProvider}; the
 * shared components/hooks read it through {@link useAppConfig}.
 */
export interface AppConfig {
  /** Stable app identifier, also used as the `?app=` hubs query value. */
  appId: string;
  /** API path namespace, e.g. `vng` → `/api/vng/dashboard`. */
  apiNamespace: string;
  /** localStorage key prefix, e.g. `vng` → `vng_selection`, `vng_lang`. */
  storagePrefix: string;
  /** Custom DOM event prefix, e.g. `vng` → `vng:openSpace`, `vng:selection`. */
  eventPrefix: string;
  /** Brand logo component rendered in the header and loading screen. */
  Logo: React.ComponentType<{ className?: string; title?: string }>;
  /** XLSX workbook creator/author string. */
  exportCreator: string;
  /** XLSX download filename stem, e.g. `vng-dashboard`. */
  exportFilenameStem: string;
  /**
   * Show the Usage Explorer tab (feature 019, FR-003). VNG-only today; other
   * dashboards opt in by setting this rather than by forking the shared shell.
   */
  usageExplorer?: boolean;
  /**
   * Show the Funnel tab (feature 022). Opt-in per dashboard, exactly like
   * `usageExplorer` — a dashboard whose spaces do not use growth phases would see an
   * explanatory empty state, so it simply leaves this off.
   */
  funnel?: boolean;
  /**
   * Show the Ecosystem map tab (feature 024). Opt-in like the two above — the map
   * draws the selected innovation hub as orchestrator + initiatives + the organisations
   * around them, so a dashboard whose hubs have no orchestrator would see only the
   * guess, and simply leaves this off.
   */
  ecosystem?: boolean;
  /**
   * Feature 027 — dashboard-level behaviour switches. VNG turns these on; GovTech does not.
   */
  flags?: {
    /**
     * The dashboard reports on the Spaces its managers chose (`GET /api/vng/scope`, the
     * monitor's own settings store) instead of an innovation hub. No Space selection
     * at all for viewers. Also enables the `/admin` area for Monitor Managers.
     */
    managedScope?: boolean;
  };
  /**
   * Shell layout. `tabs` (default) is the header + horizontal tab strip; `sidebar` is
   * layout A — a persistent left navigation column at `lg`+, and a bottom bar with a
   * "Meer" sheet below it. Opt-in per dashboard, like the tabs above: VNG uses it,
   * GovTech keeps the tab strip until it opts in.
   */
  layout?: 'tabs' | 'sidebar';
  /**
   * The dashboard is a prototype shared for feedback: the notice under the header says
   * so and links here for more information. Absent: no prototype line.
   */
  prototypeInfoUrl?: string;
}

const AppConfigContext = createContext<AppConfig | null>(null);

export function AppConfigProvider({
  value,
  children,
}: {
  value: AppConfig;
  children: ReactNode;
}) {
  return <AppConfigContext.Provider value={value}>{children}</AppConfigContext.Provider>;
}

/** Read the active app configuration. Throws if no provider is mounted. */
export function useAppConfig(): AppConfig {
  const cfg = useContext(AppConfigContext);
  if (!cfg) {
    throw new Error('useAppConfig must be used within an <AppConfigProvider>');
  }
  return cfg;
}

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

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn, fetchMe, type MeResponse, BrokenVisualsPanel, useAppConfig } from '@ea/shared';
import { LoginScreen } from './components/LoginScreen.js';
import { LoadingScreen } from './components/LoadingScreen.js';
import { BrandingHeader } from './components/BrandingHeader.js';
import { AuthorizationWarning } from './components/AuthorizationWarning.js';
import { SelectedSpacesPanel } from './components/SelectedSpacesPanel.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { SelectionProvider, useSelectionContext } from './hooks/SelectionContext.js';
import { GraphTab } from './pages/GraphTab.js';
import { SpaceDetailsTab } from './pages/SpaceDetailsTab.js';
import { DashboardTab } from './pages/DashboardTab.js';
import { InitiativesTab } from './pages/InitiativesTab.js';

type TabKey = 'dashboard' | 'details' | 'initiatives' | 'graph';
const TABS: TabKey[] = ['dashboard', 'details', 'initiatives', 'graph'];

/**
 * VNG app shell (FR-006/007): persistent branding header, authorisation warning,
 * a persistent data-selection panel (hub + toggles + selected initiatives, on the
 * left and shared by every tab), and a four-tab layout
 * (Dashboard / Initiative information / Initiatives / Graph).
 *
 * Lives inside <SelectionProvider> so it can feed the shared selection straight
 * into GraphTab as props (rather than relying on the localStorage fallback), and
 * bridge graph→details cross-tab navigation (T042/FR-015).
 */
function AppShell() {
  const { t } = useTranslation();
  const cfg = useAppConfig();
  const [active, setActive] = useState<TabKey>('dashboard');
  const { effectiveSpaceIds, state, refreshNonce, setShowGemeentes } = useSelectionContext();

  // The space whose details should be shown when the Space details tab opens
  // via a graph node click. Bumped together with `requestSeq` so re-clicking the
  // same space still re-selects it after the user navigated away.
  const [openSpaceId, setOpenSpaceId] = useState<string | null>(null);
  const [openSpaceSeq, setOpenSpaceSeq] = useState(0);

  // T042 — clicking a space node in GraphTab broadcasts `<app>:openSpace`; switch
  // to the Space details tab and request that space.
  useEffect(() => {
    const onOpenSpace = (e: Event) => {
      const detail = (e as CustomEvent<{ spaceId?: string }>).detail;
      const spaceId = detail?.spaceId;
      if (!spaceId) return;
      setOpenSpaceId(spaceId);
      setOpenSpaceSeq((n) => n + 1);
      setActive('details');
    };
    const evt = `${cfg.eventPrefix}:openSpace`;
    window.addEventListener(evt, onOpenSpace as EventListener);
    return () => window.removeEventListener(evt, onOpenSpace as EventListener);
  }, [cfg.eventPrefix]);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <BrandingHeader />
      <AuthorizationWarning />

      <div className="flex min-h-0 flex-1">
        <ErrorBoundary label="Selectie">
          <SelectedSpacesPanel />
        </ErrorBoundary>

        {/* Right-hand area: the tab bar sits over the content, not the selection panel. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <nav className="border-b border-border px-6 py-2.5" role="tablist" aria-label={t('tabs.label')}>
            <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={active === tab}
                  onClick={() => setActive(tab)}
                  className={cn(
                    'rounded-md px-3.5 py-1.5 text-sm font-medium transition-all',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    active === tab
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t(`tabs.${tab}`)}
                </button>
              ))}
            </div>
          </nav>

          <main className="min-h-0 min-w-0 flex-1">
            <ErrorBoundary key={active} label={t(`tabs.${active}`)}>
              {active === 'graph' && (
                <GraphTab
                  spaceIds={effectiveSpaceIds}
                  includeInitiatives={state.includeInitiatives}
                  showGemeentes={state.showGemeentes}
                  onShowGemeentesChange={setShowGemeentes}
                  refreshNonce={refreshNonce}
                />
              )}
              {active === 'details' && (
                <SpaceDetailsTab openSpaceId={openSpaceId} openSpaceSeq={openSpaceSeq} />
              )}
              {active === 'initiatives' && <InitiativesTab />}
              {active === 'dashboard' && <DashboardTab />}
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </div>
  );
}

/**
 * Auth gate (US5/FR-004): resolve the shared `ea_session` identity. While loading,
 * show a branded loading screen (so the app never looks frozen); if unauthenticated,
 * show the login screen (which displays the environment); otherwise render the app.
 */
export default function App() {
  const { t } = useTranslation();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');

  useEffect(() => {
    let active = true;
    fetchMe()
      .then((result) => {
        if (active) {
          setMe(result);
          setStatus('ready');
        }
      })
      .catch(() => active && setStatus('ready'));
    return () => {
      active = false;
    };
  }, []);

  if (status === 'loading') return <LoadingScreen message={t('states.connecting')} />;
  if (!me) return <LoginScreen />;

  return (
    <SelectionProvider>
      <AppShell />
      <BrokenVisualsPanel />
    </SelectionProvider>
  );
}

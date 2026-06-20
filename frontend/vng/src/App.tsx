import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BrandingHeader } from './components/BrandingHeader.js';
import { AuthorizationWarning } from './components/AuthorizationWarning.js';
import { HubSelector } from './components/HubSelector.js';
import { GemeenteToggle } from './components/GemeenteToggle.js';
import { InitiativesToggle } from './components/InitiativesToggle.js';
import { SelectedSpacesPanel } from './components/SelectedSpacesPanel.js';
import { SelectionProvider, useSelectionContext } from './hooks/SelectionContext.js';
import { GraphTab } from './pages/GraphTab.js';
import { SpaceDetailsTab } from './pages/SpaceDetailsTab.js';
import { DashboardTab } from './pages/DashboardTab.js';

type TabKey = 'graph' | 'details' | 'dashboard';
const TABS: TabKey[] = ['graph', 'details', 'dashboard'];

/** Controls bar: hub selection + the gemeente/initiatives toggles (US1/US6/US8/US10). */
function ControlsBar() {
  const {
    hubs,
    hubsLoading,
    state,
    setActiveHub,
    setShowGemeentes,
    setIncludeInitiatives,
  } = useSelectionContext();

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-border px-6 py-3">
      <HubSelector
        hubs={hubs}
        activeHubNameId={state.activeHubNameId}
        onChange={setActiveHub}
        loading={hubsLoading}
      />
      <GemeenteToggle checked={state.showGemeentes} onChange={setShowGemeentes} />
      <InitiativesToggle
        checked={state.includeInitiatives}
        onChange={setIncludeInitiatives}
      />
    </div>
  );
}

/**
 * VNG app shell (FR-006/007): persistent branding header, authorisation warning,
 * a controls bar (hub + toggles), a persistent selected-space panel, and a simple
 * three-tab layout (Graph / Space details / Dashboard).
 *
 * Lives inside <SelectionProvider> so it can feed the shared selection straight
 * into GraphTab as props (rather than relying on the localStorage fallback), and
 * bridge graph→details cross-tab navigation (T042/FR-015).
 */
function AppShell() {
  const { t } = useTranslation();
  const [active, setActive] = useState<TabKey>('graph');
  const { effectiveSpaceIds, state } = useSelectionContext();

  // The space whose details should be shown when the Space details tab opens
  // via a graph node click. Bumped together with `requestSeq` so re-clicking the
  // same space still re-selects it after the user navigated away.
  const [openSpaceId, setOpenSpaceId] = useState<string | null>(null);
  const [openSpaceSeq, setOpenSpaceSeq] = useState(0);

  // T042 — clicking a space node in GraphTab broadcasts `vng:openSpace`; switch
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
    window.addEventListener('vng:openSpace', onOpenSpace as EventListener);
    return () => window.removeEventListener('vng:openSpace', onOpenSpace as EventListener);
  }, []);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <BrandingHeader />
      <AuthorizationWarning />
      <ControlsBar />

      <nav className="flex gap-1 border-b border-border px-6" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={active === tab}
            onClick={() => setActive(tab)}
            className={
              'border-b-2 px-4 py-2 text-sm font-medium transition-colors ' +
              (active === tab
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground')
            }
          >
            {t(`tabs.${tab}`)}
          </button>
        ))}
      </nav>

      <div className="flex min-h-0 flex-1">
        <SelectedSpacesPanel />
        <main className="min-h-0 min-w-0 flex-1">
          {active === 'graph' && (
            <GraphTab
              spaceIds={effectiveSpaceIds}
              includeInitiatives={state.includeInitiatives}
              showGemeentes={state.showGemeentes}
            />
          )}
          {active === 'details' && (
            <SpaceDetailsTab openSpaceId={openSpaceId} openSpaceSeq={openSpaceSeq} />
          )}
          {active === 'dashboard' && <DashboardTab />}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <SelectionProvider>
      <AppShell />
    </SelectionProvider>
  );
}

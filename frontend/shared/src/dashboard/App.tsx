import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  cn,
  fetchMe,
  type MeResponse,
  BrokenVisualsPanel,
  useAppConfig,
  useIsCompact,
} from '@ea/shared';
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
import { CitiesTab } from './pages/CitiesTab.js';
import { CityDetailsTab } from './pages/CityDetailsTab.js';
import { UsageExplorerTab } from './pages/UsageExplorerTab.js';
import { FunnelTab } from './pages/FunnelTab.js';
import { IntakeTab } from './pages/IntakeTab.js';
import { EcosystemTab } from './pages/EcosystemTab.js';

type TabKey =
  | 'dashboard'
  | 'details'
  | 'initiatives'
  | 'cityDetails'
  | 'cities'
  | 'usage'
  | 'funnel'
  | 'intake'
  | 'ecosystem'
  | 'graph';
const BASE_TABS: TabKey[] = ['dashboard', 'details', 'initiatives', 'cityDetails', 'cities'];

/**
 * VNG app shell (FR-006/007): persistent branding header, authorisation warning,
 * a persistent data-selection panel (hub + toggles + selected initiatives, on the
 * left and shared by every tab), and a tabbed layout — the initiative pair
 * (Initiative information / Initiatives) followed by the city pair
 * (City information / Cities), with Dashboard leading and Graph last.
 *
 * Lives inside <SelectionProvider> so it can feed the shared selection straight
 * into GraphTab as props (rather than relying on the localStorage fallback), and
 * bridge graph→details cross-tab navigation (T042/FR-015).
 *
 * ── Responsive scheme ──────────────────────────────────────────────────────
 * Below Tailwind's `lg` (1024px) the two pieces of persistent chrome cannot both
 * stay on screen — an 18rem selection column and eight tabs laid side by side
 * leave a phone with a ~100px content sliver and tabs that scroll off the right
 * edge with nothing to scroll them. So on a compact viewport:
 *
 *  • the selection panel becomes an off-canvas drawer behind a header button,
 *    dismissed by the backdrop, Escape, or picking a tab;
 *  • the tab row becomes a horizontally scrollable strip that keeps the active
 *    tab scrolled into view, so every destination stays one gesture away.
 *
 * At `lg` and up the layout is byte-for-byte what it was: a static column plus a
 * single inline row of tabs.
 */
function AppShell() {
  const { t } = useTranslation();
  const cfg = useAppConfig();
  const compact = useIsCompact();
  const [active, setActive] = useState<TabKey>('dashboard');
  const [navOpen, setNavOpen] = useState(false);

  // The Usage Explorer is VNG-only for now (feature 019, FR-003). Dashboards opt in via
  // their AppConfig rather than by forking this shell — Graph stays last either way.
  // Optional tabs are opt-in per dashboard via AppConfig rather than by forking this
  // shell; Graph stays last whatever is enabled.
  const TABS: TabKey[] = [
    ...BASE_TABS,
    ...(cfg.usageExplorer ? (['usage'] as TabKey[]) : []),
    ...(cfg.funnel ? (['funnel'] as TabKey[]) : []),
    ...(cfg.intake ? (['intake'] as TabKey[]) : []),
    ...(cfg.ecosystem ? (['ecosystem'] as TabKey[]) : []),
    'graph',
  ];
  const { effectiveSpaceIds, state, refreshNonce, setShowGemeentes } = useSelectionContext();

  // The space whose details should be shown when the Space details tab opens
  // via a graph node click. Bumped together with `requestSeq` so re-clicking the
  // same space still re-selects it after the user navigated away.
  const [openSpaceId, setOpenSpaceId] = useState<string | null>(null);
  const [openSpaceSeq, setOpenSpaceSeq] = useState(0);

  // Same bridge, city side (feature 018, FR-018/019): the Cities table and an
  // initiative's gemeente grid broadcast `<app>:openCity`.
  const [openCityId, setOpenCityId] = useState<string | null>(null);
  const [openCitySeq, setOpenCitySeq] = useState(0);

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
      setNavOpen(false);
    };
    const evt = `${cfg.eventPrefix}:openSpace`;
    window.addEventListener(evt, onOpenSpace as EventListener);
    return () => window.removeEventListener(evt, onOpenSpace as EventListener);
  }, [cfg.eventPrefix]);

  // Choosing a city (in the Cities table, or on an initiative's gemeente grid)
  // broadcasts `<app>:openCity`; switch to the City information tab.
  useEffect(() => {
    const onOpenCity = (e: Event) => {
      const cityId = (e as CustomEvent<{ cityId?: string }>).detail?.cityId;
      if (!cityId) return;
      setOpenCityId(cityId);
      setOpenCitySeq((n) => n + 1);
      setActive('cityDetails');
      setNavOpen(false);
    };
    const evt = `${cfg.eventPrefix}:openCity`;
    window.addEventListener(evt, onOpenCity as EventListener);
    return () => window.removeEventListener(evt, onOpenCity as EventListener);
  }, [cfg.eventPrefix]);

  // Growing past `lg` turns the drawer back into a static column; leaving it
  // "open" would then also leave the backdrop armed over a perfectly good layout.
  useEffect(() => {
    if (!compact) setNavOpen(false);
  }, [compact]);

  // Escape closes the drawer, and while it is open the page behind it must not
  // scroll under the finger (iOS will happily scroll the body through a fixed overlay).
  useEffect(() => {
    if (!navOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [navOpen]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <BrandingHeader
        onMenuClick={compact ? () => setNavOpen(true) : undefined}
        menuOpen={navOpen}
      />
      <AuthorizationWarning />

      <div className="flex min-h-0 min-w-0 flex-1">
        {/* Selection panel. One instance, two presentations: a static column at
            `lg`+, an off-canvas drawer below it. Rendered in both cases (never
            unmounted) so the drawer does not lose scroll position or in-flight
            hub state each time it is dismissed. */}
        {compact && navOpen && (
          <div
            role="presentation"
            onClick={() => setNavOpen(false)}
            className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-[1px] lg:hidden"
          />
        )}
        <div
          className={cn(
            'shrink-0',
            compact
              ? cn(
                  'fixed inset-y-0 left-0 z-50 flex w-[85vw] max-w-80 transition-transform duration-200 ease-out',
                  navOpen ? 'translate-x-0' : 'pointer-events-none -translate-x-full',
                )
              : 'flex',
          )}
          // Hidden from assistive tech (and from Playwright's `getByRole`) while
          // it is parked off-screen, so a closed drawer is genuinely absent.
          aria-hidden={compact && !navOpen}
          inert={compact && !navOpen}
        >
          <ErrorBoundary label="Selectie">
            <SelectedSpacesPanel onClose={compact ? () => setNavOpen(false) : undefined} />
          </ErrorBoundary>
        </div>

        {/* Right-hand area: the tab bar sits over the content, not the selection panel. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <TabBar
            tabs={TABS}
            active={active}
            onSelect={(tab) => {
              setActive(tab);
              setNavOpen(false);
            }}
          />

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
              {active === 'cityDetails' && (
                <CityDetailsTab openCityId={openCityId} openCitySeq={openCitySeq} />
              )}
              {active === 'cities' && <CitiesTab />}
              {active === 'usage' && <UsageExplorerTab />}
              {active === 'funnel' && <FunnelTab />}
              {active === 'intake' && <IntakeTab />}
              {active === 'ecosystem' && <EcosystemTab />}
              {active === 'dashboard' && <DashboardTab />}
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </div>
  );
}

/**
 * The tab row. One markup for every width; the responsiveness is in the scroll
 * container rather than in a second mobile-only component, so the tabs a test (or
 * a screen reader) enumerates are the same eight everywhere.
 *
 * The strip is always horizontally scrollable and always keeps the selected tab
 * in view — which is what makes eight tabs usable at 390px, where roughly two fit.
 * At `lg`+ the content is narrower than the strip, so nothing scrolls and it reads
 * exactly like the original inline row.
 */
function TabBar<T extends string>({
  tabs,
  active,
  onSelect,
}: {
  tabs: T[];
  active: T;
  onSelect: (tab: T) => void;
}) {
  const { t } = useTranslation();
  const stripRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Keep the selected tab visible. This matters most when the tab was chosen for
  // the user — the graph→details and cities→city-details bridges both switch tabs
  // from elsewhere, and on a phone the destination is usually off-screen.
  useEffect(() => {
    const btn = activeRef.current;
    const strip = stripRef.current;
    if (!btn || !strip || strip.scrollWidth <= strip.clientWidth) return;
    const b = btn.getBoundingClientRect();
    const s = strip.getBoundingClientRect();
    if (b.left < s.left || b.right > s.right) {
      strip.scrollTo({
        left: strip.scrollLeft + (b.left - s.left) - (s.width - b.width) / 2,
        behavior: 'smooth',
      });
    }
  }, [active]);

  return (
    <nav
      className="relative border-b border-border"
      role="tablist"
      aria-label={t('tabs.label')}
    >
      <div
        ref={stripRef}
        className="no-scrollbar snap-x snap-mandatory overflow-x-auto overscroll-x-contain px-3 py-2 sm:px-6 sm:py-2.5"
      >
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              ref={active === tab ? activeRef : undefined}
              type="button"
              role="tab"
              aria-selected={active === tab}
              onClick={() => onSelect(tab)}
              data-touch-target
              className={cn(
                'snap-start whitespace-nowrap rounded-md px-3.5 py-1.5 text-sm font-medium transition-all',
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
      </div>
      {/* A hint that the strip continues past the right edge. Purely decorative,
          and inert so it can never swallow a tap meant for the last tab. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent lg:hidden"
      />
    </nav>
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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { useAppConfig } from '../../app/AppConfig.js';
import { EcosystemFilterBar } from '../components/EcosystemFilterBar.js';
import { EcosystemMap } from '../components/EcosystemMap.js';
import { OrchestratorControl } from '../components/OrchestratorControl.js';
import { useSelectionContext } from '../hooks/SelectionContext.js';
import { useEcosystemViewState } from '../hooks/useEcosystemViewState.js';
import { useOrchestratorChoice } from '../hooks/useOrchestratorChoice.js';
import { useCoreLoadState, useWidenedDataset } from '../data/derive/index.js';
import { useDashboardData } from '../data/DashboardDataProvider.js';
import {
  applyFilters,
  buildEcosystemModel,
  candidateSpaces,
  guessOrchestrator,
  resolveOrchestrator,
  type EcoOrganisation,
} from '../utils/ecosystem.js';
import { layoutEcosystems } from '../utils/ecosystem-layout.js';

const MIN_HEIGHT = 480;

/**
 * The ecosystem map (feature 024).
 *
 * Composes what the dashboard already has: the hub selection, the cached `GraphDataset`,
 * and one small endpoint for the orchestrator choice. It adds no data request of its own
 * beyond widening the graph request to cover the orchestrator — which, for VIH, is NOT
 * one of the hub's listed Spaces and would otherwise never be fetched.
 */
export function EcosystemTab() {
  const { t } = useTranslation();
  const { eventPrefix } = useAppConfig();
  const { state, hubs, effectiveSpaceIds } = useSelectionContext();
  const hubNameId = state.activeHubNameId;

  const { filters, transform, guestChoice, setFilters, setTransform, setGuestChoice } =
    useEcosystemViewState(hubNameId);
  const { own, community, builtIn, choose, reset } = useOrchestratorChoice(hubNameId, {
    localChoice: guestChoice,
    onLocalChoice: setGuestChoice,
  });

  // Every explicit candidate is part of the ONE dataset the provider loads (feature 025,
  // research R7): it widens the selection with the same candidates, so the resolution
  // order can be applied against "what the dataset actually holds" without a second
  // load, and choosing an orchestrator never re-fetches.
  const spaceIds = useMemo(() => {
    const ids = new Set(effectiveSpaceIds);
    for (const candidate of [own, community, builtIn]) if (candidate) ids.add(candidate);
    return [...ids];
  }, [effectiveSpaceIds, own, community, builtIn]);

  const dataset = useWidenedDataset();
  const { loading, error } = useCoreLoadState();
  const { retry } = useDashboardData();
  const reload = useCallback(() => retry('spaces'), [retry]);

  const resolution = useMemo(() => {
    if (!dataset) return { nameId: null, source: null, builtInMissing: false };
    const present = new Set(
      dataset.nodes.filter((n) => n.type === 'SPACE_L0' && n.nameId).map((n) => n.nameId as string),
    );
    return resolveOrchestrator({
      candidatesInDataset: present,
      own,
      community,
      builtIn,
      guess: () => guessOrchestrator(dataset, [...present]),
    });
  }, [dataset, own, community, builtIn]);

  const model = useMemo(() => {
    if (!dataset || !hubNameId) return null;
    const hub = hubs.find((h) => h.nameId === hubNameId);
    return buildEcosystemModel(dataset, [
      {
        hubNameId,
        hubDisplayName: hub?.displayName ?? hubNameId,
        listedSpaceNameIds: state.hubSpaceIds,
        // `spaceIds`, not `effectiveSpaceIds`: a Space fetched only because it is an
        // orchestrator CANDIDATE stays in the picture when it is not the one chosen —
        // otherwise switching the orchestrator would make the previous one disappear
        // from the map altogether instead of taking its place among the initiatives
        // (spec US2 scenario 3). `EcoSpace.listed` still says which ones the hub lists.
        selectedSpaceNameIds: spaceIds,
        orchestratorNameId: resolution.nameId,
        orchestratorSource: resolution.source,
      },
    ]);
  }, [dataset, hubNameId, hubs, state.hubSpaceIds, effectiveSpaceIds, resolution]);

  const filtered = useMemo(
    () => (model ? applyFilters(model, filters) : null),
    [model, filters],
  );

  // Measure the host so the layout is computed against real pixels. A callback ref,
  // not a mount effect: the host div appears only once data is there (the spinner
  // renders first), so the observer must attach whenever the element does.
  const [size, setSize] = useState({ width: 0, height: 0 });
  const observerRef = useRef<ResizeObserver | null>(null);
  const hostRef = useCallback((el: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!el) return;
    observerRef.current = new ResizeObserver(([entry]) => {
      setSize({
        width: Math.max(1, Math.floor(entry.contentRect.width)),
        height: Math.max(MIN_HEIGHT, Math.floor(entry.contentRect.height)),
      });
    });
    observerRef.current.observe(el);
  }, []);

  const layout = useMemo(
    () => (filtered && size.width > 0 ? layoutEcosystems(filtered.model, size) : null),
    [filtered, size],
  );

  const [hoverId, setHoverId] = useState<string | null>(null);
  const [fitNonce, setFitNonce] = useState(0);

  const openSpace = useCallback(
    (nameId: string) => {
      window.dispatchEvent(
        new CustomEvent(`${eventPrefix}:openSpace`, { detail: { spaceId: nameId } }),
      );
    },
    [eventPrefix],
  );

  const openOrg = useCallback(
    (org: EcoOrganisation) => {
      // Only gemeentes have a home elsewhere in the dashboard; any other organisation
      // simply stays highlighted.
      if (!org.isGemeente) return;
      window.dispatchEvent(new CustomEvent(`${eventPrefix}:openCity`, { detail: { cityId: org.id } }));
    },
    [eventPrefix],
  );

  if (!hubNameId) return <Empty message={t('ecosystem.empty.noHub')} />;

  if (error) {
    return (
      <div data-testid="ecosystem-error" className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-[var(--foreground)]">{t('ecosystem.error')}</p>
        <p className="max-w-lg text-xs text-[var(--text-secondary)]">{error}</p>
        <button
          type="button"
          onClick={reload}
          className="rounded bg-[var(--primary)] px-3 py-1.5 text-sm text-[var(--primary-foreground)]"
        >
          {t('ecosystem.retry')}
        </button>
      </div>
    );
  }

  if (loading && !model) {
    return (
      <div className="flex h-full items-center justify-center gap-2 p-8 text-sm text-[var(--text-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        {t('ecosystem.title')}
      </div>
    );
  }

  const eco = filtered?.model.ecosystems[0];
  const hasSpaces = Boolean(eco && (eco.orchestrator || eco.initiatives.length > 0));

  return (
    <div className="flex h-full min-h-0 flex-col">
      {model && (
        <OrchestratorControl
          candidates={candidateSpaces(model)}
          value={resolution.nameId}
          source={resolution.source}
          canReset={Boolean(own)}
          onChoose={(nameId) => void choose(nameId)}
          onReset={() => void reset()}
        />
      )}

      {resolution.builtInMissing && (
        <p
          data-testid="ecosystem-orchestrator-notice"
          className="border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-xs text-[var(--text-secondary)]"
        >
          {t('ecosystem.notice.builtInMissing')}
        </p>
      )}

      <EcosystemFilterBar
        filters={filters}
        onChange={setFilters}
        hiddenCount={filtered?.hiddenCount ?? 0}
        onFit={() => setFitNonce((n) => n + 1)}
      />

      <div ref={hostRef} className="relative min-h-0 flex-1" style={{ minHeight: MIN_HEIGHT }}>
        {!hasSpaces && <Empty message={t('ecosystem.empty.noSpaces')} />}

        {hasSpaces && !resolution.nameId && (
          <p
            data-testid="ecosystem-empty"
            className="absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded bg-[var(--surface)] px-3 py-1 text-xs text-[var(--text-secondary)]"
          >
            {t('ecosystem.empty.noOrchestrator')}
          </p>
        )}

        {hasSpaces && filtered && layout && filtered.model.organisations.length === 0 && (
          <p
            data-testid="ecosystem-empty-orgs"
            className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded bg-[var(--surface)] px-3 py-1 text-xs text-[var(--text-secondary)]"
          >
            {t('ecosystem.empty.noOrgs')}
          </p>
        )}

        {hasSpaces && filtered && layout && (
          <EcosystemMap
            model={filtered.model}
            layout={layout}
            hoverId={hoverId}
            onHover={setHoverId}
            onActivateSpace={openSpace}
            onActivateOrg={openOrg}
            transform={transform}
            onTransformChange={setTransform}
            fitNonce={fitNonce}
            labels={{
              lead: t('ecosystem.legend.lead'),
              member: t('ecosystem.legend.member'),
              direct: t('ecosystem.legend.direct'),
              viaSubspace: t('ecosystem.legend.viaSubspace'),
              partOf: t('ecosystem.legend.partOf'),
              connector: t('ecosystem.legend.connector'),
            }}
          />
        )}
      </div>
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <div
      data-testid="ecosystem-empty"
      className="flex h-full items-center justify-center p-8 text-center text-sm text-[var(--text-secondary)]"
    >
      {message}
    </div>
  );
}

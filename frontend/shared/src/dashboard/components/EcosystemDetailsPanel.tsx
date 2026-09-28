import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, X } from 'lucide-react';
import { proxyImageUrl } from '../../lib/imageProxy.js';
import { initials } from '../../lib/initials.js';
import type { EcoOrganisation, EcoSpace, EcosystemModel } from '../utils/ecosystem.js';

export interface EcosystemDetailsPanelProps {
  model: EcosystemModel;
  selectedId: string | null;
  onClose: () => void;
  onOpenSpace: (nameId: string) => void;
  onOpenOrg: (org: EcoOrganisation) => void;
  /** Lets a row in the panel light its counterpart on the map. */
  onHighlight: (id: string | null) => void;
}

/**
 * Details of whatever is selected on the map.
 *
 * This panel is what makes the map's progressive disclosure honest: the picture may show
 * only a node and its immediate edges, because the full, untruncated, screen-reader
 * accessible account of that node lives here in text. It is also the ONLY place that
 * navigates away — a click on the map selects, it no longer jumps to another tab.
 */
export function EcosystemDetailsPanel({
  model,
  selectedId,
  onClose,
  onOpenSpace,
  onOpenOrg,
  onHighlight,
}: EcosystemDetailsPanelProps) {
  const { t } = useTranslation();

  const selection = useMemo(() => {
    if (!selectedId) return null;
    const org = model.organisations.find((o) => o.id === selectedId);
    if (org) return { kind: 'org' as const, org };
    for (const eco of model.ecosystems) {
      if (eco.orchestrator?.id === selectedId) {
        return { kind: 'space' as const, space: eco.orchestrator, orchestrator: true };
      }
      const initiative = eco.initiatives.find((i) => i.id === selectedId);
      if (initiative) return { kind: 'space' as const, space: initiative, orchestrator: false };
    }
    return null;
  }, [model, selectedId]);

  if (!selection) return null;

  return (
    <aside
      data-testid="ecosystem-details"
      aria-label={t('ecosystem.details.title')}
      className="absolute right-3 top-3 bottom-3 z-20 flex w-80 max-w-[calc(100%-1.5rem)] flex-col rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] shadow-lg"
    >
      <header className="flex items-start gap-2 border-b border-[var(--border)] px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">
            {selection.kind === 'org'
              ? t('ecosystem.details.organisation')
              : selection.orchestrator
                ? t('ecosystem.orchestrator')
                : t('ecosystem.details.initiative')}
          </p>
          <h2 className="break-words text-sm font-semibold text-[var(--foreground)]">
            {selection.kind === 'org' ? selection.org.name : selection.space.name}
          </h2>
        </div>
        <button
          type="button"
          data-testid="ecosystem-details-close"
          onClick={onClose}
          aria-label={t('ecosystem.details.close')}
          className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--surface)]"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </header>

      {selection.kind === 'space' ? (
        <SpaceBody
          model={model}
          space={selection.space}
          onOpenSpace={onOpenSpace}
          onHighlight={onHighlight}
        />
      ) : (
        <OrgBody
          model={model}
          org={selection.org}
          onOpenOrg={onOpenOrg}
          onHighlight={onHighlight}
        />
      )}
    </aside>
  );
}

function SpaceBody({
  model,
  space,
  onOpenSpace,
  onHighlight,
}: {
  model: EcosystemModel;
  space: EcoSpace;
  onOpenSpace: (nameId: string) => void;
  onHighlight: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  const connected = model.organisations
    .map((org) => ({ org, connection: org.connections.find((c) => c.spaceId === space.id) }))
    .filter((row): row is { org: EcoOrganisation; connection: NonNullable<typeof row.connection> } =>
      Boolean(row.connection),
    )
    .sort((a, b) => {
      if (a.connection.strength !== b.connection.strength) {
        return a.connection.strength === 'lead' ? -1 : 1;
      }
      return a.org.name.localeCompare(b.org.name);
    });

  const leads = connected.filter((r) => r.connection.strength === 'lead').length;

  return (
    <>
      <div className="flex flex-wrap gap-1.5 border-b border-[var(--border)] px-3 py-2 text-xs">
        <Stat label={t('ecosystem.legend.lead')} value={leads} />
        <Stat label={t('ecosystem.legend.member')} value={connected.length - leads} />
        <Stat label={t('ecosystem.details.organisations')} value={space.orgCount} />
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
        {connected.map(({ org, connection }) => (
          <li key={org.id}>
            <button
              type="button"
              onMouseEnter={() => onHighlight(org.id)}
              onMouseLeave={() => onHighlight(null)}
              onFocus={() => onHighlight(org.id)}
              onBlur={() => onHighlight(null)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--surface)]"
            >
              <Avatar name={org.name} logoUrl={org.logoUrl} />
              <span className="min-w-0 flex-1 truncate text-xs text-[var(--foreground)]">
                {org.name}
              </span>
              <RoleTag strength={connection.strength} provenance={connection.provenance} />
            </button>
          </li>
        ))}
      </ul>

      <footer className="border-t border-[var(--border)] p-2">
        <button
          type="button"
          data-testid="ecosystem-details-open"
          onClick={() => onOpenSpace(space.nameId)}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-[var(--primary-foreground)]"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          {t('ecosystem.details.openSpace')}
        </button>
      </footer>
    </>
  );
}

function OrgBody({
  model,
  org,
  onOpenOrg,
  onHighlight,
}: {
  model: EcosystemModel;
  org: EcoOrganisation;
  onOpenOrg: (org: EcoOrganisation) => void;
  onHighlight: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  const spaceName = (id: string) => {
    for (const eco of model.ecosystems) {
      if (eco.orchestrator?.id === id) return eco.orchestrator.name;
      const initiative = eco.initiatives.find((i) => i.id === id);
      if (initiative) return initiative.name;
    }
    return id;
  };

  return (
    <>
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <Avatar name={org.name} logoUrl={org.logoUrl} size={32} />
        <div className="flex flex-wrap gap-1.5 text-xs">
          {org.isConnector && <Badge>{t('ecosystem.legend.connector')}</Badge>}
          {org.isGemeente && <Badge>{t('ecosystem.details.gemeente')}</Badge>}
          <Badge>{t('ecosystem.details.connectionCount', { count: org.connections.length })}</Badge>
        </div>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
        {[...org.connections]
          .sort((a, b) => (a.strength === b.strength ? 0 : a.strength === 'lead' ? -1 : 1))
          .map((c) => (
            <li key={c.spaceId}>
              <button
                type="button"
                onMouseEnter={() => onHighlight(c.spaceId)}
                onMouseLeave={() => onHighlight(null)}
                onFocus={() => onHighlight(c.spaceId)}
                onBlur={() => onHighlight(null)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--surface)]"
              >
                <span className="min-w-0 flex-1 truncate text-xs text-[var(--foreground)]">
                  {spaceName(c.spaceId)}
                </span>
                <RoleTag strength={c.strength} provenance={c.provenance} />
              </button>
            </li>
          ))}
      </ul>

      {org.isGemeente && (
        <footer className="border-t border-[var(--border)] p-2">
          <button
            type="button"
            data-testid="ecosystem-details-open"
            onClick={() => onOpenOrg(org)}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-[var(--primary-foreground)]"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            {t('ecosystem.details.openCity')}
          </button>
        </footer>
      )}
    </>
  );
}

/** Role and provenance as words, not as a line style — the map's colours are not enough. */
function RoleTag({
  strength,
  provenance,
}: {
  strength: 'lead' | 'member';
  provenance: 'direct' | 'viaSubspace';
}) {
  const { t } = useTranslation();
  return (
    <span className="shrink-0 text-[10px] text-[var(--text-secondary)]">
      {t(strength === 'lead' ? 'ecosystem.legend.lead' : 'ecosystem.legend.member')}
      {provenance === 'viaSubspace' && ` · ${t('ecosystem.legend.viaSubspace')}`}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded bg-[var(--surface)] px-2 py-1 text-[var(--text-secondary)]">
      {label} <strong className="text-[var(--foreground)]">{value}</strong>
    </span>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-[var(--surface)] px-2 py-0.5 text-[var(--text-secondary)]">
      {children}
    </span>
  );
}

function Avatar({
  name,
  logoUrl,
  size = 20,
}: {
  name: string;
  logoUrl: string | null;
  size?: number;
}) {
  const src = proxyImageUrl(logoUrl);
  if (!src) {
    return (
      <span
        aria-hidden
        style={{ width: size, height: size }}
        className="flex shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-[9px] font-semibold text-[var(--text-secondary)]"
      >
        {initials(name)}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-full object-cover"
    />
  );
}

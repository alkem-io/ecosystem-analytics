import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { History, Inbox, Lightbulb, Lock, ScrollText, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { useAppConfig } from '../../app/AppConfig.js';
import { useIsCompact } from '../../hooks/useMediaQuery.js';
import { BrandingHeader } from '../../dashboard/components/BrandingHeader.js';
import { BottomNav, SideNav } from '../../dashboard/components/SideNav.js';
import { UserMenu } from '../../dashboard/components/UserMenu.js';
import { leaveAdminTo } from '../navigation.js';
import { GdA } from './GdA.js';
import { IntakeSection } from '../sections/IntakeSection.js';
import { AccessSection } from '../sections/AccessSection.js';
import { AuditLogSection } from '../sections/AuditLogSection.js';
import { GroeiA } from './GroeiA.js';

/**
 * Layout A — Beheer inside the same sidebar shell as the dashboard: the dashboard's own
 * navigation (Beheer current), a page head, and the five admin sections in a vertical
 * menu. The sections, their hash routing and their test ids are the ones the tab strip
 * uses; only the Groei table is drawn anew (GroeiA).
 */

const SECTIONS = ['included', 'gd', 'intake', 'access', 'audit'] as const;
type AdminTab = (typeof SECTIONS)[number];
const ICONS: Record<AdminTab, LucideIcon> = {
  included: Lightbulb,
  gd: History,
  intake: Inbox,
  access: Lock,
  audit: ScrollText,
};

const fromHash = (): AdminTab => {
  const h = window.location.hash.replace('#', '');
  return (SECTIONS as readonly string[]).includes(h) ? (h as AdminTab) : 'included';
};

export function AdminA({ canManage, noAccess }: { canManage: boolean; noAccess: ReactNode }) {
  const { t } = useTranslation();
  const cfg = useAppConfig();
  const compact = useIsCompact();
  const [tab, setTab] = useState<AdminTab>(fromHash);

  useEffect(() => {
    const onHash = () => setTab(fromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // The dashboard's own views, in its order.
  const views = [
    'dashboard',
    'details',
    'initiatives',
    'cityDetails',
    'cities',
    ...(cfg.usageExplorer ? ['usage'] : []),
    ...(cfg.funnel ? ['funnel'] : []),
    ...(cfg.ecosystem ? ['ecosystem'] : []),
    'graph',
  ];
  const goToView = (view: string) => {
    window.dispatchEvent(new CustomEvent(`${cfg.eventPrefix}:openTab`, { detail: { tab: view } }));
    leaveAdminTo(view);
  };

  const select = (next: AdminTab) => {
    setTab(next);
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}#${next}`);
  };

  const label: Record<AdminTab, string> = {
    included: t('admin.a.tabIncluded', { defaultValue: 'Groei-initiatieven' }),
    gd: t('admin.tabs.gd', { defaultValue: 'GemeenteDelers' }),
    intake: t('admin.tabs.intake', { defaultValue: 'Intake' }),
    access: t('admin.tabs.access', { defaultValue: 'Access' }),
    audit: t('admin.tabs.audit', { defaultValue: 'Change log' }),
  };

  const body = canManage ? (
    <div className="lg:grid lg:grid-cols-[210px_minmax(0,1fr)] lg:items-start lg:gap-5">
      <div
        role="tablist"
        aria-label={t('nav.manage', { defaultValue: 'Beheer' })}
        aria-orientation={compact ? 'horizontal' : 'vertical'}
        data-testid="admin-tabs"
        className={cn(
          'flex gap-0.5',
          compact
            ? 'no-scrollbar -mx-4 mb-3 overflow-x-auto px-4 py-1'
            : 'sticky top-0 flex-col',
        )}
      >
        {SECTIONS.map((id) => {
          const Icon = ICONS[id];
          const on = id === tab;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`admin-tab-${id}`}
              aria-selected={on}
              aria-controls={on ? `admin-panel-${id}` : undefined}
              onClick={() => select(id)}
              data-testid={`admin-tab-${id}`}
              className={cn(
                'flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 text-left text-sm font-medium transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                compact ? 'min-h-[42px]' : 'w-full py-2',
                on
                  ? 'bg-card text-foreground shadow-[inset_0_0_0_1px_var(--border)]'
                  : 'text-muted-foreground hover:bg-card/70 hover:text-foreground',
              )}
            >
              <Icon className={cn('h-4 w-4 shrink-0', on && 'text-[#009BDC]')} aria-hidden />
              {label[id]}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`admin-panel-${tab}`} aria-labelledby={`admin-tab-${tab}`} className="flex min-w-0 flex-col gap-4">
        {tab === 'included' && <GroeiA />}
        {tab === 'gd' && <GdA />}
        {tab === 'intake' && <IntakeSection />}
        {tab === 'access' && <AccessSection />}
        {tab === 'audit' && <AuditLogSection />}
      </div>
    </div>
  ) : (
    noAccess
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground" data-layout="sidebar">
      {!compact && <SideNav tabs={views} active={null} onSelect={goToView} admin />}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {compact ? (
          <BrandingHeader area="admin" />
        ) : (
          <div className="flex h-[57px] shrink-0 items-center gap-2 border-b border-border bg-card px-7">
            <span className="flex-1" />
            <UserMenu />
          </div>
        )}
        <main className="min-h-0 flex-1 overflow-auto px-4 pt-4 pb-28 lg:px-7 lg:pt-[22px]">
          <div className="mx-auto max-w-[1240px]">
            <div className="mb-[18px]">
              <h1 className="text-2xl font-semibold tracking-[-0.015em] text-foreground">
                {t('nav.manage', { defaultValue: 'Beheer' })}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('admin.a.sub', { defaultValue: 'Wat de monitor toont en hoe initiatieven zijn ingedeeld' })}
              </p>
            </div>
            {body}
          </div>
        </main>
        {compact && <BottomNav tabs={views} active={null} onSelect={goToView} admin />}
      </div>
    </div>
  );
}

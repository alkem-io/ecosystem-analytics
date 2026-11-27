import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Building2,
  Filter,
  Landmark,
  LayoutDashboard,
  Lightbulb,
  List,
  Map as MapIcon,
  MoreHorizontal,
  Orbit,
  Share2,
  SlidersHorizontal,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn, useAppConfig } from '@ea/shared';
import { AlkemioSymbol } from './AlkemioSymbol.js';
import { useAccessLevel } from '../hooks/AccessLevelContext.js';
import { openAdmin } from '../../admin/navigation.js';

/**
 * Layout A ("sidebar") navigation — opt-in per dashboard via `AppConfig.layout`.
 *
 * The same tab keys, labels and `role="tab"` semantics as the tab strip, so every
 * view, bridge (graph→details, cities→city) and test that addresses a tab by its
 * accessible name keeps working. Only the presentation changes:
 *
 *  • `SideNav`   — the persistent left column at `lg` and up;
 *  • `BottomNav` — below `lg`, four primary views in a bottom bar plus "Meer",
 *                  which opens a sheet with the remaining views (and Beheer).
 */

export const NAV_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  details: Lightbulb,
  initiatives: List,
  cityDetails: Landmark,
  cities: Building2,
  usage: MapIcon,
  funnel: Filter,
  ecosystem: Orbit,
  graph: Share2,
};

function useCanManage() {
  const { flags } = useAppConfig();
  const level = useAccessLevel();
  return flags?.managedScope === true && level === 'manage';
}

export function SideNav<T extends string>({
  tabs,
  active,
  onSelect,
  admin = false,
}: {
  tabs: T[];
  active: T | null;
  onSelect: (tab: T) => void;
  /** The admin area is open: no view is current, Beheer is. */
  admin?: boolean;
}) {
  const { t } = useTranslation();
  const { Logo } = useAppConfig();
  const canManage = useCanManage();
  return (
    <aside
      className="flex h-full w-[232px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-border bg-card px-3 pt-[max(1.1rem,var(--safe-top))] pb-3"
      data-testid="side-nav"
    >
      <div className="flex flex-col items-start gap-3 px-2">
        <Logo className="h-7 w-auto" />
        <span className="text-[0.95rem] font-semibold leading-snug text-foreground">
          {t('app.title')}
        </span>
      </div>
      <nav
        className="flex flex-col gap-0.5"
        role="tablist"
        aria-orientation="vertical"
        aria-label={t('tabs.label')}
      >
        {tabs.map((tab) => {
          const Icon = NAV_ICONS[tab] ?? List;
          const on = active === tab;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onSelect(tab)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                on
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon
                className={cn('h-[18px] w-[18px] shrink-0', on ? 'text-[#8fd3f2]' : 'opacity-80')}
                aria-hidden
              />
              {t(`tabs.${tab}`)}
            </button>
          );
        })}
      </nav>
      <div className="flex-1" />
      {canManage && (
        <div className="flex flex-col gap-2">
          <hr className="mx-2 border-border" />
          <button
            type="button"
            onClick={() => !admin && openAdmin()}
            aria-current={admin ? 'page' : undefined}
            data-testid="admin-entry"
            className={cn(
              'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              admin
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <SlidersHorizontal
              className={cn('h-[18px] w-[18px] shrink-0', admin ? 'text-[#8fd3f2]' : 'opacity-80')}
              aria-hidden
            />
            {t('nav.manage', { defaultValue: 'Beheer' })}
          </button>
        </div>
      )}
      <PoweredBy />
    </aside>
  );
}

export function PoweredBy({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <a
      href="https://alkem.io"
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground',
        className,
      )}
    >
      <AlkemioSymbol className="h-auto w-7 shrink-0" />
      <span className="leading-snug">
        {t('nav.poweredBy', { defaultValue: 'Mogelijk gemaakt door' })} Alkemio
      </span>
    </a>
  );
}

/** The four views that get their own slot in the phone bar; everything else lives in "Meer". */
const PRIMARY = ['dashboard', 'initiatives', 'cities', 'funnel'];
/** A detail view lights up its list view's slot. */
const SLOT_OF: Record<string, string> = { details: 'initiatives', cityDetails: 'cities' };

export function BottomNav<T extends string>({
  tabs,
  active,
  onSelect,
  admin = false,
}: {
  tabs: T[];
  active: T | null;
  onSelect: (tab: T) => void;
  /** The admin area is open: "Meer" (where Beheer lives) is current. */
  admin?: boolean;
}) {
  const { t } = useTranslation();
  const canManage = useCanManage();
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = tabs.filter((tab) => PRIMARY.includes(tab));
  const rest = tabs.filter((tab) => !PRIMARY.includes(tab));
  const slot = active ? (SLOT_OF[active] ?? active) : '';
  const moreOn = admin || !PRIMARY.includes(slot);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMoreOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  const pick = (tab: T) => {
    setMoreOpen(false);
    onSelect(tab);
  };

  return (
    <>
      <nav
        className="grid shrink-0 grid-cols-5 border-t border-border bg-card px-1.5 pt-1.5 pb-[max(0.5rem,var(--safe-bottom))]"
        role="tablist"
        aria-label={t('tabs.label')}
        data-testid="bottom-nav"
      >
        {primary.map((tab) => {
          const Icon = NAV_ICONS[tab] ?? List;
          const on = slot === tab;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={active === tab}
              onClick={() => pick(tab)}
              data-touch-target
              className={cn(
                'flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md text-[11px] font-medium',
                on ? 'font-semibold text-primary' : 'text-muted-foreground',
              )}
            >
              <Icon className={cn('h-[21px] w-[21px]', on && 'text-[#007fb8]')} aria-hidden />
              <span className="max-w-full truncate px-0.5">{t(`tabs.${tab}`)}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          data-touch-target
          className={cn(
            'flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md text-[11px] font-medium',
            moreOn ? 'font-semibold text-primary' : 'text-muted-foreground',
          )}
        >
          <MoreHorizontal className={cn('h-[21px] w-[21px]', moreOn && 'text-[#007fb8]')} aria-hidden />
          <span>{t('nav.more', { defaultValue: 'Meer' })}</span>
        </button>
      </nav>
      {moreOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-foreground/40"
          role="presentation"
          onClick={() => setMoreOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('nav.more', { defaultValue: 'Meer' })}
            className="w-full rounded-t-2xl bg-card pb-[max(1.25rem,var(--safe-bottom))] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <span className="text-base font-semibold text-foreground">
                {t('nav.more', { defaultValue: 'Meer' })}
              </span>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label={t('nav.close', { defaultValue: 'Sluiten' })}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="flex flex-col px-2">
              {rest.map((tab) => {
                const Icon = NAV_ICONS[tab] ?? List;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => pick(tab)}
                    className={cn(
                      'flex min-h-12 items-center gap-3 rounded-md px-3 text-[15px] font-medium',
                      active === tab ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted',
                    )}
                  >
                    <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
                    {t(`tabs.${tab}`)}
                  </button>
                );
              })}
              {canManage && (
                <>
                  <hr className="mx-3 my-1 border-border" />
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      if (!admin) openAdmin();
                    }}
                    className="flex min-h-12 items-center gap-3 rounded-md px-3 text-[15px] font-medium text-foreground hover:bg-muted"
                  >
                    <SlidersHorizontal className="h-5 w-5 text-muted-foreground" aria-hidden />
                    {t('nav.manage', { defaultValue: 'Beheer' })}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

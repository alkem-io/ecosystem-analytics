import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, History, KeyRound, Layers, ScrollText, ShieldX } from 'lucide-react';
import { cn } from '../lib/cn.js';
import { BrandingHeader } from '../dashboard/components/BrandingHeader.js';
import { leaveAdmin } from './navigation.js';
import { AccessSection } from './sections/AccessSection.js';
import { IncludedSpacesSection } from './sections/IncludedSpacesSection.js';
import { GdSourceSection } from './sections/GdSourceSection.js';
import { AuditLogSection } from './sections/AuditLogSection.js';
import { smallButton } from './Section.js';

const TABS = ['included', 'gd', 'access', 'audit'] as const;
type AdminTab = (typeof TABS)[number];

/** The tab named in the URL hash (`#gd`), so a reload or a shared link keeps it. */
const tabFromHash = (): AdminTab => {
  const h = window.location.hash.replace('#', '');
  return (TABS as readonly string[]).includes(h) ? (h as AdminTab) : 'included';
};

/**
 * The settings in four tabs: the Groei initiatives in the monitor, GemeenteDelers, access,
 * and the change log — every edit of the other three, in one list.
 */
function AdminTabs() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<AdminTab>(tabFromHash);
  const refs = useRef<Record<AdminTab, HTMLButtonElement | null>>({ included: null, gd: null, access: null, audit: null });
  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const select = (next: AdminTab, focus = false) => {
    setTab(next);
    // replaceState: switching tabs is not a navigation the Back button should replay.
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}#${next}`);
    if (focus) refs.current[next]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const i = TABS.indexOf(tab);
    if (e.key === 'ArrowRight') select(TABS[(i + 1) % TABS.length], true);
    else if (e.key === 'ArrowLeft') select(TABS[(i + TABS.length - 1) % TABS.length], true);
    else if (e.key === 'Home') select(TABS[0], true);
    else if (e.key === 'End') select(TABS[TABS.length - 1], true);
    else return;
    e.preventDefault();
  };
  const label: Record<AdminTab, string> = {
    included: t('admin.tabs.included', { defaultValue: 'Initiatives in the monitor' }),
    gd: t('admin.tabs.gd', { defaultValue: 'GemeenteDelers' }),
    access: t('admin.tabs.access', { defaultValue: 'Access' }),
    audit: t('admin.tabs.audit', { defaultValue: 'Change log' }),
  };
  const icon = { included: Layers, gd: History, access: KeyRound, audit: ScrollText } as const;

  return (
    <>
      <div
        role="tablist"
        aria-label={t('admin.tabs.label', { defaultValue: 'Settings' })}
        className="no-scrollbar flex gap-1 overflow-x-auto border-b border-border"
        onKeyDown={onKeyDown}
        data-testid="admin-tabs"
      >
        {TABS.map((id) => {
          const Icon = icon[id];
          const active = id === tab;
          return (
            <button
              key={id}
              ref={(el) => {
                refs.current[id] = el;
              }}
              type="button"
              role="tab"
              id={`admin-tab-${id}`}
              aria-selected={active}
              aria-controls={`admin-panel-${id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => select(id)}
              data-testid={`admin-tab-${id}`}
              className={cn(
                '-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                active
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label[id]}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`admin-panel-${tab}`} aria-labelledby={`admin-tab-${tab}`} className="min-w-0">
        {tab === 'included' && <IncludedSpacesSection />}
        {tab === 'gd' && <GdSourceSection />}
        {tab === 'access' && <AccessSection />}
        {tab === 'audit' && <AuditLogSection />}
      </div>
    </>
  );
}

/**
 * The monitor's administration area at `/admin` (feature 027), for Monitor Managers only.
 * Lazy-loaded by the dashboard shell, so viewers never download it. Each section loads and
 * fails on its own (FR-033); a person who is not a manager sees "no access" and nothing is
 * fetched from the admin API (the server refuses it anyway, SC-004).
 */
export default function AdminApp({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation();

  const back = (
    <button type="button" className={smallButton} onClick={leaveAdmin}>
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      {t('admin.back', { defaultValue: 'Back to the monitor' })}
    </button>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* The same header as the dashboard (logo, title, user menu), naming this area and
          leading back. */}
      <BrandingHeader area="admin" />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6 lg:gap-6">
        {canManage ? (
          <AdminTabs />
        ) : (
          <section
            className="mx-auto mt-10 max-w-lg rounded-xl border border-border bg-card p-6 text-center"
            data-testid="admin-no-access"
          >
            <ShieldX className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
            <h2 className="mt-3 text-lg font-semibold text-foreground">
              {t('admin.noAccess.title', { defaultValue: 'No access to the settings' })}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('admin.noAccess.body', {
                defaultValue: 'Only admins of the monitor’s admin Spaces on Alkemio can change its settings.',
              })}
            </p>
            <div className="mt-4 flex justify-center">{back}</div>
          </section>
        )}
      </main>
    </div>
  );
}

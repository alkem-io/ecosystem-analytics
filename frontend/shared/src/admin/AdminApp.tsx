import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ShieldX } from 'lucide-react';
import { useAppConfig } from '../app/AppConfig.js';
import { leaveAdmin } from './navigation.js';
import { AccessSection } from './sections/AccessSection.js';
import { IncludedSpacesSection } from './sections/IncludedSpacesSection.js';
import { ClassificationsSection } from './sections/ClassificationsSection.js';
import { GdSourceSection } from './sections/GdSourceSection.js';
import { smallButton } from './Section.js';

/**
 * The monitor's administration area at `/admin` (feature 027), for Monitor Managers only.
 * Lazy-loaded by the dashboard shell, so viewers never download it. Each section loads and
 * fails on its own (FR-033); a person who is not a manager sees "no access" and nothing is
 * fetched from the admin API (the server refuses it anyway, SC-004).
 */
export default function AdminApp({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation();
  const { Logo } = useAppConfig();
  const [initiative, setInitiative] = useState<string | null>(null);

  const back = (
    <button type="button" className={smallButton} onClick={leaveAdmin} data-testid="admin-back">
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      {t('admin.back', { defaultValue: 'Back to the monitor' })}
    </button>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 sm:px-6 pt-[max(0.75rem,var(--safe-top))]">
        <div className="flex min-w-0 items-center gap-3">
          <Logo className="h-7 w-auto shrink-0" />
          <h1 className="truncate border-l border-border pl-3 text-sm font-semibold text-foreground sm:text-base">
            {t('admin.title', { defaultValue: 'Monitor settings' })}
          </h1>
        </div>
        {back}
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6 lg:gap-6">
        {canManage ? (
          <>
            <AccessSection />
            <IncludedSpacesSection
              onOpenClassifications={(nameId) => {
                // The editor scrolls itself into view once it has loaded.
                setInitiative(nameId);
              }}
            />
            <ClassificationsSection selected={initiative} onSelect={setInitiative} />
            <GdSourceSection />
          </>
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

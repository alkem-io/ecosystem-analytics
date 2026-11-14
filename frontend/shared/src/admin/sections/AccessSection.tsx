import { useTranslation } from 'react-i18next';
import { CheckCircle2, ExternalLink, MinusCircle } from 'lucide-react';
import type { GateLink } from '@server/types/access.js';
import { adminApi } from '../api.js';
import { Section, useSectionData } from '../Section.js';

function SpaceLinks({ spaces, testId }: { spaces: GateLink[]; testId: string }) {
  const { t } = useTranslation();
  if (spaces.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('admin.access.none', { defaultValue: 'No Spaces configured.' })}
      </p>
    );
  }
  return (
    <ul className="space-y-1.5" data-testid={testId}>
      {spaces.map((space) => (
        <li key={space.key} className="min-w-0 text-sm">
          {space.exists === 'no' ? (
            <span className="text-destructive">
              {t('admin.access.notFound', { defaultValue: 'Not found on Alkemio' })}:{' '}
              <code className="break-all">{space.key}</code>
            </span>
          ) : (
            <a
              href={space.url}
              target="_blank"
              rel="noopener noreferrer"
              className="break-words font-medium text-primary underline-offset-4 hover:underline"
            >
              {space.displayName}
              <ExternalLink className="ml-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Who may view and who may manage the monitor (FR-005, FR-010). Read-only: both sets are
 * deployment configuration.
 */
export function AccessSection() {
  const { t } = useTranslation();
  const { data, error, loading, retry } = useSectionData(() => adminApi.access());
  const standing = (ok: boolean, yes: string, no: string) => (
    <li className="flex items-center gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
      ) : (
        <MinusCircle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      )}
      {ok ? yes : no}
    </li>
  );
  return (
    <Section
      id="access"
      title={t('admin.access.title', { defaultValue: 'Who can use the monitor' })}
      description={t('admin.access.description', {
        defaultValue: 'Set in the deployment configuration. Membership itself is managed on Alkemio.',
      })}
      loading={loading}
      error={error}
      onRetry={retry}
    >
      {data && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">
              {t('admin.access.viewers', { defaultValue: 'Members of these Spaces can view the monitor' })}
            </h3>
            <div className="mt-2">
              <SpaceLinks spaces={data.viewers} testId="admin-viewer-spaces" />
            </div>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">
              {t('admin.access.admins', { defaultValue: 'Admins of these Spaces can manage the monitor' })}
            </h3>
            <div className="mt-2">
              <SpaceLinks spaces={data.admins} testId="admin-admin-spaces" />
            </div>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">
              {t('admin.access.you', { defaultValue: 'You ({{name}})', name: data.me.displayName })}
            </h3>
            <ul className="mt-2 space-y-1.5">
              {standing(
                data.me.viewer,
                t('admin.access.youView', { defaultValue: 'can view the monitor' }),
                t('admin.access.youNoView', { defaultValue: 'cannot view the monitor' }),
              )}
              {standing(
                data.me.manager,
                t('admin.access.youManage', { defaultValue: 'can manage the monitor' }),
                t('admin.access.youNoManage', { defaultValue: 'cannot manage the monitor' }),
              )}
            </ul>
          </div>
        </div>
      )}
    </Section>
  );
}

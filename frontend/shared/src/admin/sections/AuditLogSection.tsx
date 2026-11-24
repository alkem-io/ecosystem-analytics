import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Layers, Loader2, Tags } from 'lucide-react';
import type { AccessSpaceRef, AuditEntry } from '@server/types/admin.js';
import { cn } from '../../lib/cn.js';
import { adminApi } from '../api.js';
import { useAdminChangeCount } from '../changes.js';
import { Section, formatWhen, smallButton } from '../Section.js';

type T = ReturnType<typeof useTranslation>['t'];

/** What a change did to one access set: "added A; removed B". */
function setDiff(t: T, from: AccessSpaceRef[], to: AccessSpaceRef[]): string {
  const before = new Set(from.map((s) => s.key));
  const after = new Set(to.map((s) => s.key));
  const added = to.filter((s) => !before.has(s.key)).map((s) => s.displayName);
  const removed = from.filter((s) => !after.has(s.key)).map((s) => s.displayName);
  return [
    added.length ? `${t('admin.included.added', { defaultValue: 'added' })}: ${added.join(', ')}` : '',
    removed.length ? `${t('admin.included.removed', { defaultValue: 'removed' })}: ${removed.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** One audit-log line: what changed, in words, plus the detail beneath it. */
function describe(
  t: T,
  e: AuditEntry,
  name: (nameId: string) => string,
): { icon: typeof Layers; what: string; detail: string } {
  const who = e.actorName ?? t('admin.audit.system', { defaultValue: 'the system' });
  if (e.type === 'spaces') {
    if (e.kind === 'seed') {
      return {
        icon: Layers,
        what: t('admin.audit.seed', { defaultValue: 'Initiatives in the monitor: the starting set' }),
        detail: '',
      };
    }
    if (e.kind === 'rename') {
      return {
        icon: Layers,
        what: t('admin.audit.rename', { defaultValue: 'Renamed on Alkemio: {{note}}', note: e.note ?? '' }),
        detail: '',
      };
    }
    return {
      icon: Layers,
      what: t('admin.audit.spaces', { defaultValue: '{{who}} changed the initiatives in the monitor', who }),
      detail: [
        e.added.length ? `${t('admin.included.added', { defaultValue: 'added' })}: ${e.added.map(name).join(', ')}` : '',
        e.removed.length
          ? `${t('admin.included.removed', { defaultValue: 'removed' })}: ${e.removed.map(name).join(', ')}`
          : '',
      ]
        .filter(Boolean)
        .join(' · '),
    };
  }
  if (e.type === 'classification') {
    const none = t('admin.audit.none', { defaultValue: '(none)' });
    return {
      icon: Tags,
      what: t('admin.audit.classification', {
        defaultValue: '{{who}} changed {{label}} of {{space}}',
        who,
        label: e.entryLabel,
        space: name(e.spaceNameId),
      }),
      detail: `${e.from.join(', ') || none} → ${e.to.join(', ') || none}`,
    };
  }
  const viewers = setDiff(t, e.from.viewers, e.to.viewers);
  const admins = setDiff(t, e.from.admins, e.to.admins);
  return {
    icon: KeyRound,
    what: t('admin.audit.access', { defaultValue: '{{who}} changed who has access', who }),
    detail: [
      viewers ? `${t('admin.access.viewersLabel', { defaultValue: 'View' })} — ${viewers}` : '',
      admins ? `${t('admin.access.adminsLabel', { defaultValue: 'Manage' })} — ${admins}` : '',
    ]
      .filter(Boolean)
      .join(' | '),
  };
}

/**
 * ONE log of every edit to the monitor (feature 027): the initiatives in it, their
 * classifications, and who has access — newest first, by name. Its own tab, the last one;
 * it reloads after any save (`notifyAdminChange`).
 */
export function AuditLogSection() {
  const { t, i18n } = useTranslation();
  const refreshKey = useAdminChangeCount();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [nonce, setNonce] = useState(0);

  const load = (before?: string) => {
    setLoading(true);
    setError(null);
    return adminApi
      .history(before)
      .then((page) => {
        setEntries((prev) => (before ? [...prev, ...page.entries] : page.entries));
        setNames((prev) => ({ ...prev, ...page.names }));
        setNext(page.next);
      })
      .catch((e: unknown) => setError(e))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, nonce]);

  const name = (nameId: string) => names[nameId] ?? nameId;

  return (
    <Section
      id="audit"
      title={t('admin.audit.title', { defaultValue: 'Change log' })}
      description={t('admin.audit.description', {
        defaultValue: 'Every change made to the monitor’s settings, newest first.',
      })}
      loading={loading && entries.length === 0}
      error={entries.length === 0 ? error : null}
      onRetry={() => setNonce((n) => n + 1)}
    >
      {entries.length === 0 && !loading ? (
        <p className="text-sm text-muted-foreground">{t('admin.audit.empty', { defaultValue: 'No changes yet.' })}</p>
      ) : (
        <ol className="divide-y divide-border" data-testid="audit-log">
          {entries.map((e, i) => {
            const { icon: Icon, what, detail } = describe(t, e, name);
            return (
              <li key={`${e.type}-${e.at}-${i}`} className="flex gap-3 py-2.5 text-sm" data-testid="audit-entry" data-type={e.type}>
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-foreground">{what}</p>
                  {detail && <p className="mt-0.5 break-words text-xs text-muted-foreground">{detail}</p>}
                </div>
                <time dateTime={e.at} className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                  {formatWhen(e.at, i18n.language)}
                </time>
              </li>
            );
          })}
        </ol>
      )}
      {error && entries.length > 0 ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {t('admin.sectionError', { defaultValue: 'This section could not be loaded.' })}
        </p>
      ) : null}
      {next && (
        <button type="button" className={cn(smallButton, 'mt-3')} disabled={loading} onClick={() => void load(next)}>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          {t('admin.included.olderChanges', { defaultValue: 'Older changes' })}
        </button>
      )}
    </Section>
  );
}

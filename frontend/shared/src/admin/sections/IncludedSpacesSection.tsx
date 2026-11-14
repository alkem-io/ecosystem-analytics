import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Loader2, Pencil, Plus, Tags, Undo2, X } from 'lucide-react';
import type {
  IncludedSpaceView,
  IncludedSpacesView,
  SettingsChangeView,
  SpaceCandidate,
} from '@server/types/admin.js';
import { cn } from '../../lib/cn.js';
import { useIsCompact } from '../../hooks/useMediaQuery.js';
import { markMonitorScopeStale } from '../../dashboard/hooks/useMonitorScope.js';
import { AdminApiError, adminApi } from '../api.js';
import {
  Section,
  formatWhen,
  primarySmallButton,
  smallButton,
  textInput,
  useSectionData,
} from '../Section.js';

type T = ReturnType<typeof useTranslation>['t'];

function changeLine(t: T, lang: string, change: SettingsChangeView | null): string {
  if (!change) return '';
  if (change.kind === 'seed') {
    return t('admin.included.fromStartingSet', {
      defaultValue: 'From the starting set ({{when}})',
      when: formatWhen(change.at, lang),
    });
  }
  if (change.kind === 'rename') {
    return t('admin.included.renamed', {
      defaultValue: '{{note}} on Alkemio ({{when}})',
      note: change.note ?? '',
      when: formatWhen(change.at, lang),
    });
  }
  return t('admin.included.changedBy', {
    defaultValue: 'Last changed by {{name}} on {{when}}',
    name: change.actorName ?? '?',
    when: formatWhen(change.at, lang),
  });
}

function SpaceName({ space }: { space: IncludedSpaceView }) {
  const { t } = useTranslation();
  if (!space.readable) {
    return (
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        <code className="break-all text-sm">{space.nameId}</code>
        <span
          className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
          data-testid="included-unreadable"
        >
          {space.found
            ? t('admin.included.unreadable', { defaultValue: 'You cannot read this Space' })
            : t('admin.included.notFound', { defaultValue: 'Not found on Alkemio' })}
        </span>
      </span>
    );
  }
  return (
    <a
      href={space.url ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      className="break-words text-sm font-medium text-primary underline-offset-4 hover:underline"
    >
      {space.displayName}
      <ExternalLink className="ml-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
    </a>
  );
}

function Status({ space }: { space: IncludedSpaceView }) {
  const { t } = useTranslation();
  const s = space.classificationStatus;
  if (!s) return <span className="text-xs text-muted-foreground">—</span>;
  const complete = s.set === s.designated;
  return (
    <span
      className={cn(
        'whitespace-nowrap rounded-full px-2 py-0.5 text-xs',
        complete ? 'bg-success/15 text-foreground' : 'bg-warning/15 text-foreground',
      )}
    >
      {t('admin.included.status', {
        defaultValue: '{{set}} of {{designated}} classifications set',
        set: s.set,
        designated: s.designated,
      })}
    </span>
  );
}

function History() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [changes, setChanges] = useState<SettingsChangeView[]>([]);
  const [next, setNext] = useState<number | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = (before?: number) => {
    setLoading(true);
    setFailed(false);
    adminApi
      .history(before)
      .then((page) => {
        setChanges((prev) => (before === undefined ? page.changes : [...prev, ...page.changes]));
        setNext(page.next);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  };

  return (
    <details
      className="mt-4 rounded-lg border border-border px-3 py-2"
      onToggle={(e) => {
        const isOpen = (e.target as HTMLDetailsElement).open;
        setOpen(isOpen);
        if (isOpen && next === undefined) load();
      }}
    >
      <summary className="cursor-pointer text-sm font-medium text-foreground">
        {t('admin.included.history', { defaultValue: 'History of changes' })}
      </summary>
      {open && (
        <div className="mt-2">
          <ul className="divide-y divide-border" data-testid="included-history">
            {changes.map((c) => (
              <li key={`${c.revision}-${c.kind}`} className="py-2 text-sm">
                <p className="text-foreground">
                  <span className="font-medium">#{c.revision}</span> · {changeLine(t, i18n.language, c)}
                </p>
                {(c.added.length > 0 || c.removed.length > 0) && c.kind !== 'seed' && (
                  <p className="mt-0.5 break-words text-xs text-muted-foreground">
                    {c.added.length > 0 && `+ ${c.added.join(', ')}`}
                    {c.added.length > 0 && c.removed.length > 0 && ' · '}
                    {c.removed.length > 0 && `− ${c.removed.join(', ')}`}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {failed && (
            <p role="alert" className="text-sm text-destructive">
              {t('admin.sectionError', { defaultValue: 'This section could not be loaded.' })}
            </p>
          )}
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}
          {next != null && !loading && (
            <button type="button" className={cn(smallButton, 'mt-2')} onClick={() => load(next)}>
              {t('admin.included.olderChanges', { defaultValue: 'Older changes' })}
            </button>
          )}
        </div>
      )}
    </details>
  );
}

const problemText = (t: T, problem: string) =>
  ({
    NOT_READABLE: t('admin.included.edit.notReadable', {
      defaultValue: 'You can only add Spaces you can see on Alkemio',
    }),
    NOT_TOP_LEVEL: t('admin.included.edit.notTopLevel', {
      defaultValue: 'Only top-level Spaces can be added',
    }),
    DUPLICATE: t('admin.included.edit.duplicate', { defaultValue: 'Listed twice' }),
    TOO_MANY: t('admin.included.edit.tooMany', { defaultValue: 'Too many Spaces' }),
    UNPARSEABLE: t('admin.included.edit.unparseable', {
      defaultValue: 'That is not an Alkemio Space link or name',
    }),
  })[problem] ?? problem;

/** Editing: pending additions and removals, shown before anything is saved (FR-016–FR-019). */
function Editor({
  data,
  onSaved,
  onCancel,
}: {
  data: IncludedSpacesView;
  onSaved: (next: IncludedSpacesView) => void;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [base, setBase] = useState(data);
  const original = useMemo(() => base.spaces.map((s) => s.nameId), [base]);
  const [list, setList] = useState<string[]>(original);
  const [names, setNames] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SpaceCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [problems, setProblems] = useState<Array<{ nameId: string; problem: string }>>([]);
  const [saveError, setSaveError] = useState(false);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [conflict, setConflict] = useState<IncludedSpacesView | null>(null);

  const added = list.filter((n) => !original.includes(n));
  const removed = original.filter((n) => !list.includes(n));
  const dirty = added.length > 0 || removed.length > 0;
  const nameOf = (nameId: string) =>
    names[nameId] ?? base.spaces.find((s) => s.nameId === nameId)?.displayName ?? nameId;

  // Debounced search (≥ 2 characters).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      adminApi
        .searchSpaces(q)
        .then((r) => !cancelled && setResults(r.results))
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setSearching(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const add = (space: SpaceCandidate) => {
    setNames((prev) => ({ ...prev, [space.nameId]: space.displayName }));
    setList((prev) => (prev.includes(space.nameId) ? prev : [...prev, space.nameId]));
  };

  const addLink = () => {
    setLinkError(null);
    adminApi
      .resolveSpace(link.trim())
      .then(({ space }) => {
        add(space);
        setLink('');
      })
      .catch((err: unknown) =>
        setLinkError(problemText(t, err instanceof AdminApiError ? String(err.body.error) : 'UNPARSEABLE')),
      );
  };

  const save = (confirmed = false) => {
    if (list.length === 0 && !confirmed) {
      setConfirmEmpty(true);
      return;
    }
    setConfirmEmpty(false);
    setSaving(true);
    setProblems([]);
    setSaveError(false);
    adminApi
      .saveIncludedSpaces({ baseRevision: base.revision, spaceNameIds: list, confirmEmpty: confirmed })
      .then((next) => {
        markMonitorScopeStale();
        onSaved(next);
      })
      .catch((err: unknown) => {
        if (err instanceof AdminApiError && err.status === 409) {
          setConflict(err.body.current as IncludedSpacesView);
        } else if (err instanceof AdminApiError && err.body.error === 'INVALID_SPACES') {
          setProblems(err.body.problems as Array<{ nameId: string; problem: string }>);
        } else {
          setSaveError(true);
        }
      })
      .finally(() => setSaving(false));
  };

  return (
    <div className="space-y-5" data-testid="included-editor">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0">
          <label className="text-sm font-medium text-foreground" htmlFor="included-search">
            {t('admin.included.edit.search', { defaultValue: 'Find a Space by name' })}
          </label>
          <input
            id="included-search"
            className={cn(textInput, 'mt-1')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('admin.included.edit.searchPlaceholder', { defaultValue: 'At least 2 letters' })}
          />
          {searching && <Loader2 className="mt-2 h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}
          {results && !searching && (
            <ul className="mt-2 max-h-56 space-y-1 overflow-auto" data-testid="included-search-results">
              {results.length === 0 && (
                <li className="text-sm text-muted-foreground">
                  {t('admin.included.edit.noResults', { defaultValue: 'No Spaces found' })}
                </li>
              )}
              {results.map((r) => {
                const inList = list.includes(r.nameId);
                return (
                  <li key={r.nameId} className="flex min-w-0 items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{r.displayName}</span>
                    <button
                      type="button"
                      className={smallButton}
                      disabled={inList}
                      onClick={() => add(r)}
                      aria-label={t('admin.included.edit.addNamed', { defaultValue: 'Add {{name}}', name: r.displayName })}
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden />
                      {inList
                        ? t('admin.included.edit.inList', { defaultValue: 'In the list' })
                        : t('admin.included.edit.add', { defaultValue: 'Add' })}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="min-w-0">
          <label className="text-sm font-medium text-foreground" htmlFor="included-link">
            {t('admin.included.edit.link', { defaultValue: 'Or paste a Space link' })}
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="included-link"
              className={textInput}
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://alkem.io/…"
            />
            <button type="button" className={smallButton} disabled={!link.trim()} onClick={addLink}>
              {t('admin.included.edit.add', { defaultValue: 'Add' })}
            </button>
          </div>
          {linkError && (
            <p role="alert" className="mt-1 text-sm text-destructive" data-testid="included-link-error">
              {linkError}
            </p>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground">
          {t('admin.included.edit.list', { defaultValue: 'Spaces in the monitor ({{count}})', count: list.length })}
        </h3>
        <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
          {list.map((nameId) => (
            <li key={nameId} className="flex min-w-0 items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 truncate">
                {nameOf(nameId)}
                {added.includes(nameId) && (
                  <span className="ml-2 rounded-full bg-success/15 px-2 py-0.5 text-xs text-foreground">
                    {t('admin.included.edit.new', { defaultValue: 'new' })}
                  </span>
                )}
              </span>
              <button
                type="button"
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t('admin.included.edit.removeNamed', { defaultValue: 'Remove {{name}}', name: nameOf(nameId) })}
                onClick={() => setList((prev) => prev.filter((n) => n !== nameId))}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
          {list.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              {t('admin.included.edit.emptyList', { defaultValue: 'No Spaces — the monitor would show nothing.' })}
            </li>
          )}
        </ul>
      </div>

      {dirty && (
        <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm" data-testid="included-pending">
          <p className="font-medium text-foreground">
            {t('admin.included.edit.pending', { defaultValue: 'Not saved yet' })}
          </p>
          {added.length > 0 && (
            <p className="mt-1 break-words text-foreground">
              + {added.map(nameOf).join(', ')}
            </p>
          )}
          {removed.length > 0 && (
            <p className="mt-1 flex flex-wrap items-center gap-2 break-words text-destructive">
              − {removed.map(nameOf).join(', ')}
              <button
                type="button"
                className={smallButton}
                onClick={() => setList((prev) => [...prev, ...removed])}
              >
                <Undo2 className="h-3.5 w-3.5" aria-hidden />
                {t('admin.included.edit.undoRemovals', { defaultValue: 'Put back' })}
              </button>
            </p>
          )}
        </div>
      )}

      {problems.length > 0 && (
        <ul role="alert" className="space-y-1 text-sm text-destructive" data-testid="included-problems">
          {problems.map((p) => (
            <li key={`${p.nameId}-${p.problem}`}>
              <code>{p.nameId}</code>: {problemText(t, p.problem)}
            </li>
          ))}
        </ul>
      )}
      {saveError && (
        <p role="alert" className="text-sm text-destructive">
          {t('admin.included.edit.saveFailed', { defaultValue: 'Saving failed. Your changes are kept — try again.' })}
        </p>
      )}

      {confirmEmpty && (
        <div role="alertdialog" aria-labelledby="included-confirm-empty-text" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm" data-testid="included-confirm-empty">
          <p id="included-confirm-empty-text" className="text-foreground">
            {t('admin.included.edit.confirmEmpty', {
              defaultValue: 'Remove every Space? The monitor will show no initiatives to anyone.',
            })}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" autoFocus className={primarySmallButton} onClick={() => save(true)}>
              {t('admin.included.edit.confirmEmptyYes', { defaultValue: 'Yes, remove all' })}
            </button>
            <button type="button" className={smallButton} onClick={() => setConfirmEmpty(false)}>
              {t('admin.included.edit.keepEditing', { defaultValue: 'Keep editing' })}
            </button>
          </div>
        </div>
      )}

      {conflict && (
        <div role="alertdialog" aria-labelledby="included-conflict-title" className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm" data-testid="included-conflict">
          <p id="included-conflict-title" className="font-medium text-foreground">
            {t('admin.included.edit.conflictTitle', { defaultValue: 'Someone else changed the list' })}
          </p>
          <p className="mt-1 text-muted-foreground">
            {changeLine(t, i18n.language, conflict.lastChange)}.{' '}
            {t('admin.included.edit.conflictBody', {
              defaultValue: 'It now holds {{count}} Spaces. Load it to start again from the current list.',
              count: conflict.spaces.length,
            })}
          </p>
          <p className="mt-2 break-words text-xs text-muted-foreground">
            {conflict.spaces.map((s) => s.displayName ?? s.nameId).join(', ')}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              autoFocus
              className={primarySmallButton}
              onClick={() => {
                setBase(conflict);
                setList(conflict.spaces.map((s) => s.nameId));
                setConflict(null);
              }}
            >
              {t('admin.included.edit.loadCurrent', { defaultValue: 'Load the current list' })}
            </button>
            <button type="button" className={smallButton} onClick={() => setConflict(null)}>
              {t('admin.included.edit.close', { defaultValue: 'Close' })}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={primarySmallButton}
          disabled={!dirty || saving}
          onClick={() => save()}
          data-testid="included-save"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          {t('admin.included.edit.save', { defaultValue: 'Save changes' })}
        </button>
        <button type="button" className={smallButton} onClick={onCancel} disabled={saving}>
          {dirty
            ? t('admin.included.edit.discard', { defaultValue: 'Discard changes' })
            : t('admin.included.edit.close', { defaultValue: 'Close' })}
        </button>
      </div>
    </div>
  );
}

/**
 * The Spaces the monitor reports on (US3: view; US4: edit). Each one is resolved with the
 * manager's own token; one they cannot read shows its nameID only (FR-013).
 */
export function IncludedSpacesSection({
  onOpenClassifications,
}: {
  onOpenClassifications?: (nameId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const compact = useIsCompact();
  const { data, setData, error, loading, retry } = useSectionData(() => adminApi.includedSpaces());
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(false);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!data) return [];
    return f
      ? data.spaces.filter(
          (s) => s.nameId.toLowerCase().includes(f) || (s.displayName ?? '').toLowerCase().includes(f),
        )
      : data.spaces;
  }, [data, filter]);

  const classificationsButton = (s: IncludedSpaceView) =>
    onOpenClassifications && s.readable ? (
      <button
        type="button"
        className={smallButton}
        onClick={() => onOpenClassifications(s.nameId)}
        aria-label={t('admin.included.openClassificationsNamed', {
          defaultValue: 'Classifications of {{name}}',
          name: s.displayName ?? s.nameId,
        })}
      >
        <Tags className="h-3.5 w-3.5" aria-hidden />
        {t('admin.included.openClassifications', { defaultValue: 'Classifications' })}
      </button>
    ) : null;

  return (
    <Section
      id="included"
      title={t('admin.included.title', { defaultValue: 'Spaces in the monitor' })}
      description={t('admin.included.description', {
        defaultValue: 'The monitor reports on exactly these Spaces, for every viewer.',
      })}
      loading={loading}
      error={error}
      onRetry={retry}
      actions={
        data && !editing ? (
          <button type="button" className={smallButton} onClick={() => setEditing(true)} data-testid="included-edit">
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            {t('admin.included.edit.start', { defaultValue: 'Change the list' })}
          </button>
        ) : undefined
      }
    >
      {data &&
        (editing ? (
          <Editor
            data={data}
            onSaved={(next) => {
              setData(next);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground" data-testid="included-last-change">
                {changeLine(t, i18n.language, data.lastChange)}
              </p>
              {data.spaces.length > 8 && (
                <input
                  className={cn(textInput, 'max-w-xs')}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder={t('admin.included.filter', { defaultValue: 'Filter' })}
                  aria-label={t('admin.included.filter', { defaultValue: 'Filter' })}
                />
              )}
            </div>
            {data.spaces.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {t('admin.included.empty', { defaultValue: 'The monitor reports on no Spaces.' })}
              </p>
            ) : compact ? (
              <ul className="mt-3 space-y-2" data-testid="included-cards">
                {shown.map((s) => (
                  <li key={s.nameId} className="space-y-2 rounded-lg border border-border p-3" data-testid="included-row">
                    <SpaceName space={s} />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Status space={s} />
                      {classificationsButton(s)}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm" data-testid="included-table">
                  <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3 font-medium">#</th>
                      <th className="py-2 pr-3 font-medium">{t('admin.included.colSpace', { defaultValue: 'Space' })}</th>
                      <th className="py-2 pr-3 font-medium">
                        {t('admin.included.colStatus', { defaultValue: 'Classifications' })}
                      </th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {shown.map((s) => (
                      <tr key={s.nameId} data-testid="included-row">
                        <td className="py-2 pr-3 text-muted-foreground">{s.position + 1}</td>
                        <td className="py-2 pr-3">
                          <SpaceName space={s} />
                        </td>
                        <td className="py-2 pr-3">
                          <Status space={s} />
                        </td>
                        <td className="py-2 text-right">{classificationsButton(s)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <History />
          </>
        ))}
    </Section>
  );
}

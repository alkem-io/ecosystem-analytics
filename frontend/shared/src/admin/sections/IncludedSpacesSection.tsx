import { Fragment, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Globe, Loader2, Lock, Pencil, Plus, Search, Undo2, X } from 'lucide-react';
import type {
  DesignatedKey,
  DesignatedValues,
  Designation,
  IncludedSpaceView,
  IncludedSpacesView,
  SettingsChangeView,
  SpaceCandidate,
} from '@server/types/admin.js';
import { cn } from '../../lib/cn.js';
import { useIsCompact } from '../../hooks/useMediaQuery.js';
import { markMonitorScopeStale } from '../../dashboard/hooks/useMonitorScope.js';
import { AdminApiError, adminApi } from '../api.js';
import { ClassificationDialog, toDesignatedValues } from '../ClassificationDialog.js';
import { notifyAdminChange } from '../changes.js';
import { RecordSortControl } from '../../dashboard/components/RecordCards.js';
import { SortableTh } from '../SortableTh.js';
import {
  classificationSortValue,
  nextSort,
  sortRows,
  visibilitySortValue,
  type SortValue,
  type TableSort,
} from '../tableSort.js';
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

/** One designated classification on one Space: its selected values, or why there are none. */
function ValuesCell({ value }: { value: DesignatedValues | undefined }) {
  const { t } = useTranslation();
  if (!value || !value.present) {
    return (
      <span className="text-xs italic text-muted-foreground">
        {t('admin.included.missing', { defaultValue: 'missing' })}
      </span>
    );
  }
  if (value.values.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {value.values.map((v) => (
        <span key={v} className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">
          {v}
        </span>
      ))}
    </span>
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
  const [searchFailed, setSearchFailed] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
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

  // One box for both: a pasted link (or anything with a slash) is resolved on "Add";
  // anything else is searched as you type (≥ 2 characters).
  const isLink = /[/.]/.test(query.trim());
  useEffect(() => {
    const q = query.trim();
    setLinkError(null);
    if (q.length < 2 || /[/.]/.test(q)) {
      setResults(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      setSearchFailed(false);
      adminApi
        .searchSpaces(q)
        .then((r) => !cancelled && setResults(r.results))
        // A failed search is NOT "nothing found" — say so.
        .catch(() => {
          if (cancelled) return;
          setResults(null);
          setSearchFailed(true);
        })
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
    setLinkBusy(true);
    adminApi
      .resolveSpace(query.trim())
      .then(({ space }) => {
        add(space);
        setQuery('');
      })
      .catch((err: unknown) =>
        setLinkError(problemText(t, err instanceof AdminApiError ? String(err.body.error) : 'UNPARSEABLE')),
      )
      .finally(() => setLinkBusy(false));
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
        notifyAdminChange();
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
      <div className="rounded-lg border border-border bg-muted/30 p-4" data-testid="included-add">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Plus className="h-4 w-4" aria-hidden />
          {t('admin.included.edit.addTitle', { defaultValue: 'Add a Space' })}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('admin.included.edit.addHelp', {
            defaultValue:
              'Your own Spaces are found on any part of their name. Other Spaces you can see on Alkemio are found on a whole word from their name, or on their exact short name. Or paste the link of the Space.',
          })}
        </p>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (isLink) addLink();
          }}
        >
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <input
              id="included-search"
              className={cn(textInput, 'pl-8')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t('admin.included.edit.addTitle', { defaultValue: 'Add a Space' })}
              placeholder={t('admin.included.edit.searchPlaceholder', {
                defaultValue: 'Name of a Space, or https://alkem.io/…',
              })}
            />
          </div>
          {isLink && (
            <button type="submit" className={primarySmallButton} disabled={linkBusy} data-testid="included-add-link">
              {linkBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              {t('admin.included.edit.add', { defaultValue: 'Add' })}
            </button>
          )}
        </form>
        {linkError && (
          <p role="alert" className="mt-2 text-sm text-destructive" data-testid="included-link-error">
            {linkError}
          </p>
        )}
        {searching && <Loader2 className="mt-2 h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}
        {searchFailed && !searching && (
          <p role="alert" className="mt-2 text-sm text-destructive" data-testid="included-search-error">
            {t('admin.included.edit.searchFailed', {
              defaultValue: 'Searching Alkemio failed just now. Try again, or paste the link of the Space.',
            })}
          </p>
        )}
        {results && !searching && (
          <ul className="mt-2 max-h-56 divide-y divide-border overflow-auto rounded-md border border-border bg-card" data-testid="included-search-results">
            {results.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                {t('admin.included.edit.noResults', {
                  defaultValue:
                    'No Spaces found. Try a whole word from the name — or paste the link of the Space.',
                })}
              </li>
            )}
            {results.map((r) => {
              const inList = list.includes(r.nameId);
              return (
                <li key={r.nameId} className="flex min-w-0 items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">{r.displayName}</span>
                    <span className="block truncate text-xs text-muted-foreground">{r.nameId}</span>
                  </span>
                  <button
                    type="button"
                    className={smallButton}
                    disabled={inList}
                    onClick={() => add(r)}
                    aria-label={t('admin.included.edit.addNamed', { defaultValue: 'Add {{name}}', name: r.displayName })}
                  >
                    {!inList && <Plus className="h-3.5 w-3.5" aria-hidden />}
                    {inList
                      ? t('admin.included.edit.inList', { defaultValue: 'In the monitor' })
                      : t('admin.included.edit.add', { defaultValue: 'Add' })}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
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

/** How visible the Space is on Alkemio: public / private, plus its status when not active. */
function VisibilityCell({ space }: { space: IncludedSpaceView }) {
  const { t } = useTranslation();
  const v = space.visibility;
  if (!v) return <span className="text-muted-foreground">—</span>;
  const status =
    v.status && v.status !== 'ACTIVE'
      ? t(`admin.included.status${v.status.charAt(0)}${v.status.slice(1).toLowerCase()}`, {
          defaultValue: v.status.toLowerCase(),
        })
      : null;
  return (
    <span className="flex flex-wrap items-center gap-1" data-testid="included-visibility">
      {v.contentPublic === null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <span
          className={cn(
            'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs',
            v.contentPublic ? 'bg-success/15 text-foreground' : 'bg-muted text-foreground',
          )}
        >
          {v.contentPublic ? (
            <Globe className="h-3 w-3" aria-hidden />
          ) : (
            <Lock className="h-3 w-3" aria-hidden />
          )}
          {v.contentPublic
            ? t('admin.included.public', { defaultValue: 'Public' })
            : t('admin.included.private', { defaultValue: 'Private' })}
        </span>
      )}
      {status && (
        <span className="whitespace-nowrap rounded-full bg-warning/15 px-2 py-0.5 text-xs text-foreground">{status}</span>
      )}
    </span>
  );
}

/** The Space column: its name linked to Alkemio, or why it cannot be shown. */
function NameCell({ space }: { space: IncludedSpaceView }) {
  return <SpaceName space={space} />;
}

/** The columns: one per classification the monitor reads, in the configured order. */
function headers(designations: Designation[]) {
  return designations.map((d) => ({ key: d.key, label: d.label }));
}

type SortColumn = 'space' | 'visibility' | DesignatedKey;

/** What a column sorts on. A Space you cannot read has nothing to sort on: it stays last. */
function sortValue(space: IncludedSpaceView, column: SortColumn): SortValue {
  if (!space.readable) return null;
  if (column === 'space') return space.displayName ?? space.nameId;
  if (column === 'visibility') return visibilitySortValue(space);
  return classificationSortValue(space.classifications?.find((c) => c.key === column));
}

/**
 * The Groei initiatives: the Spaces the monitor reports on (US3: view; US4: edit), each
 * resolved with the manager's own token (FR-013), with the values of every classification
 * the monitor reads. A row's "Edit" opens its classifications on Alkemio.
 */
export function IncludedSpacesSection() {
  const { t, i18n } = useTranslation();
  const compact = useIsCompact();
  const { data, setData, error, loading, retry } = useSectionData(() => adminApi.includedSpaces());
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState<{ nameId: string; name: string } | null>(null);
  const [sort, setSort] = useState<TableSort<SortColumn>>({ key: 'space', dir: 'asc' });

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!data) return [];
    const rows = f
      ? data.spaces.filter(
          (s) => s.nameId.toLowerCase().includes(f) || (s.displayName ?? '').toLowerCase().includes(f),
        )
      : data.spaces;
    return sortRows(
      rows,
      (s) => sortValue(s, sort.key),
      (s) => s.displayName ?? s.nameId,
      sort.dir,
      i18n.language,
    );
  }, [data, filter, sort, i18n.language]);

  const cols = headers(data?.designations ?? []);
  const sortColumns: { key: SortColumn; label: string }[] = [
    { key: 'space', label: t('admin.included.colSpace', { defaultValue: 'Space' }) },
    { key: 'visibility', label: t('admin.included.colVisibility', { defaultValue: 'Visibility on Alkemio' }) },
    ...cols,
  ];
  const valueOf = (s: IncludedSpaceView, key: string) => s.classifications?.find((c) => c.key === key);

  const editButton = (s: IncludedSpaceView) =>
    s.readable ? (
      <button
        type="button"
        className={smallButton}
        onClick={() => setOpen({ nameId: s.nameId, name: s.displayName ?? s.nameId })}
        aria-label={t('admin.included.openClassificationsNamed', {
          defaultValue: 'Edit the classifications of {{name}}',
          name: s.displayName ?? s.nameId,
        })}
        data-testid="included-edit-classifications"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden />
        {t('admin.included.openClassifications', { defaultValue: 'Edit' })}
      </button>
    ) : null;

  return (
    <Section
      id="included"
      title={t('admin.included.title', { defaultValue: 'Groei initiatives' })}
      description={t('admin.included.description', {
        defaultValue: 'The Spaces the monitor reports on, for every viewer, with their classifications on Alkemio.',
      })}
      loading={loading}
      error={error}
      onRetry={retry}
      actions={
        data && !editing ? (
          <button type="button" className={smallButton} onClick={() => setEditing(true)} data-testid="included-edit">
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            {t('admin.included.edit.start', { defaultValue: 'Add or remove Spaces' })}
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
              {/* Who changed it and when is in the Wijzigingslog tab. */}
              <p className="text-sm text-muted-foreground" data-testid="included-count">
                {t('admin.included.count', { defaultValue: '{{count}} Spaces', count: data.spaces.length })}
              </p>
              {data.spaces.length > 8 && (
                <input
                  className={cn(textInput, 'max-w-xs')}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder={t('admin.included.filter', { defaultValue: 'Filter this list' })}
                  aria-label={t('admin.included.filter', { defaultValue: 'Filter this list' })}
                />
              )}
            </div>
            {data.spaces.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {t('admin.included.empty', { defaultValue: 'The monitor reports on no Spaces.' })}
              </p>
            ) : compact ? (
              <>
              <div className="mt-3 flex" data-testid="included-sort">
                <RecordSortControl
                  options={sortColumns}
                  sortKey={sort.key}
                  sortDir={sort.dir}
                  onSortKey={(key) => setSort({ key, dir: 'asc' })}
                  onToggleDir={() => setSort((s) => nextSort(s, s.key))}
                />
              </div>
              <ul className="mt-3 space-y-2" data-testid="included-cards">
                {shown.map((s) => (
                  <li key={s.nameId} className="space-y-2 rounded-lg border border-border p-3" data-testid="included-row">
                    <div className="flex items-start justify-between gap-2">
                      <NameCell space={s} />
                      {editButton(s)}
                    </div>
                    {s.readable && (
                      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
                        <dt className="text-xs text-muted-foreground">
                          {t('admin.included.colVisibility', { defaultValue: 'Visibility on Alkemio' })}
                        </dt>
                        <dd className="min-w-0">
                          <VisibilityCell space={s} />
                        </dd>
                        {cols.map((c) => (
                          <Fragment key={c.key}>
                            <dt className="text-xs text-muted-foreground">{c.label}</dt>
                            <dd className="min-w-0">
                              <ValuesCell value={valueOf(s, c.key)} />
                            </dd>
                          </Fragment>
                        ))}
                      </dl>
                    )}
                  </li>
                ))}
              </ul>
              </>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm" data-testid="included-table">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b border-border">
                      {sortColumns.map((c) => (
                        <SortableTh key={c.key} column={c.key} label={c.label} sort={sort} onSort={setSort} className="pr-3" />
                      ))}
                      <th className="py-2">
                        <span className="sr-only">{t('admin.included.colActions', { defaultValue: 'Actions' })}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {shown.map((s) => (
                      <tr key={s.nameId} data-testid="included-row" className="align-top">
                        <td className="max-w-[16rem] py-2.5 pr-3">
                          <NameCell space={s} />
                        </td>
                        <td className="py-2.5 pr-3">
                          <VisibilityCell space={s} />
                        </td>
                        {cols.map((c) => (
                          <td key={c.key} className="py-2.5 pr-3">
                            {s.readable ? <ValuesCell value={valueOf(s, c.key)} /> : <span className="text-muted-foreground">—</span>}
                          </td>
                        ))}
                        <td className="py-2 text-right">{editButton(s)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground" data-testid="included-designations">
              {t('admin.included.designations', {
                defaultValue:
                  'The columns are the classifications the monitor reads ({{list}}), fixed in its configuration. Their values come from Alkemio.',
                list: (data.designations ?? []).map((d) => d.label).join(', '),
              })}
            </p>
          </>
        ))}
      {open && (
        <ClassificationDialog
          nameId={open.nameId}
          name={open.name}
          onClose={() => setOpen(null)}
          onSaved={(view) =>
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    spaces: prev.spaces.map((s) =>
                      s.nameId === open.nameId ? { ...s, classifications: toDesignatedValues(view) } : s,
                    ),
                  }
                : prev,
            )
          }
        />
      )}
    </Section>
  );
}

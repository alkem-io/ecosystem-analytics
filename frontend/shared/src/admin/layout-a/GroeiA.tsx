import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, Pencil, Plus, Search, Trash2, Undo2, X } from 'lucide-react';
import type {
  DesignatedValues,
  IncludedSpaceView,
  IncludedSpacesView,
  InitiativeClassificationsView,
  SpaceCandidate,
} from '@server/types/admin.js';
import { cn } from '../../lib/cn.js';
import { useIsCompact } from '../../hooks/useMediaQuery.js';
import { containTab } from '../../lib/focus.js';
import { markMonitorScopeStale } from '../../dashboard/hooks/useMonitorScope.js';
import { AdminApiError, adminApi } from '../api.js';
import { ClassificationDialog, toDesignatedValues } from '../ClassificationDialog.js';
import { notifyAdminChange } from '../changes.js';
import { VisibilityCell, problemText } from '../sections/IncludedSpacesSection.js';
import { useSectionData } from '../Section.js';
import { SectionState } from './SectionState.js';

/**
 * Layout A — the Groei initiatives in the monitor.
 *
 * Nothing is written while the manager works the table: the switch and the edit window
 * only STAGE a change (the row shows it, tinted), and the Opslaan bar writes them all at
 * once — the visibility switches to the monitor's own settings, the classifications to
 * Alkemio. A classification is written with the value the window loaded as its expected
 * value, so a change made on Alkemio meanwhile is refused per entry rather than
 * overwritten, and that entry stays staged with the reason.
 */

type Staged = {
  view: InitiativeClassificationsView;
  edits: Record<string, string[]>;
  /** Why the last save of an entry did not go through, per entryId. */
  errors?: Record<string, string>;
};

const same = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

/** The row's values with the staged edits applied, plus which designations changed. */
function stagedValues(staged: Staged | undefined, base: DesignatedValues[] | null) {
  if (!staged) return { values: base, changed: new Set<string>() };
  const changed = new Set<string>();
  const view: InitiativeClassificationsView = {
    ...staged.view,
    classifications: staged.view.classifications.map((c) => {
      const e = c.entryId ? staged.edits[c.entryId] : undefined;
      if (!e || same(e, c.selectedValueIds)) return c;
      changed.add(c.key);
      return { ...c, selectedValueIds: e };
    }),
  };
  return { values: toDesignatedValues(view), changed };
}

function Initials({ name, muted }: { name: string; muted?: boolean }) {
  const words = name.replace(/[()]/g, '').split(/\s+/).filter(Boolean);
  const text =
    (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase();
  return (
    <span
      aria-hidden
      className={cn(
        'grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-semibold',
        muted ? 'bg-muted text-muted-foreground' : 'bg-[#E7EDF8] text-[#23478F]',
      )}
    >
      {text}
    </span>
  );
}

function NewTag() {
  const { t } = useTranslation();
  return (
    <span className="rounded-full bg-[#D9E6F7] px-2 py-0.5 text-[11px] font-semibold text-[#23478F]">
      {t('admin.included.edit.new', { defaultValue: 'new' })}
    </span>
  );
}

function RemoveTag() {
  const { t } = useTranslation();
  return (
    <span className="block text-xs font-medium text-[#9A3B2E]">
      {t('admin.a.willRemove', { defaultValue: 'Wordt verwijderd bij Opslaan' })}
    </span>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      data-testid="included-shown"
      className="inline-flex h-10 items-center rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span
        className={cn(
          'relative h-[18px] w-8 rounded-full transition-colors',
          on ? 'bg-primary' : 'bg-[#c3ccd6]',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-[left]',
            on ? 'left-4' : 'left-0.5',
          )}
        />
      </span>
    </button>
  );
}

/** One classification cell: its labels, "Nog leeg" when empty, tinted when staged. */
function ValueChip({ value, changed }: { value: DesignatedValues | undefined; changed: boolean }) {
  const { t } = useTranslation();
  if (!value || !value.present)
    return <span className="text-[13px] text-muted-foreground">—</span>;
  const empty = value.values.length === 0;
  return (
    <span
      className={cn(
        'inline-flex max-w-[132px] items-center rounded-md border px-2 py-1 text-[13px] leading-snug max-lg:max-w-full',
        changed
          ? 'border-[#8FB0DC] bg-[#EEF4FB] text-foreground'
          : empty
            ? 'border-dashed border-[#E3CFA4] bg-[#FFFCF5] text-[#8A6420]'
            : 'border-transparent px-0 text-foreground',
      )}
    >
      <span className="min-w-0 truncate" title={empty ? undefined : value.values.join(', ')}>
        {empty ? t('admin.a.empty', { defaultValue: 'Nog leeg' }) : value.values.join(', ')}
      </span>
    </span>
  );
}

/**
 * "Space toevoegen": search Alkemio (or paste a link) and pick Spaces. Picking only stages
 * the addition — it lands in the table as a new row and is written with Opslaan.
 */
function AddDialog({
  isIn,
  onAdd,
  onClose,
}: {
  /** Already in the monitor, or already picked. */
  isIn: (nameId: string) => boolean;
  onAdd: (space: SpaceCandidate) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SpaceCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.querySelector('input')?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      containTab(e, ref.current);
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      opener?.focus?.();
    };
  }, []);

  // A pasted link (anything with a slash or dot) is resolved on Enter; text is searched.
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
      setFailed(false);
      adminApi
        .searchSpaces(q)
        .then((r) => !cancelled && setResults(r.results))
        .catch(() => {
          if (cancelled) return;
          setResults(null);
          setFailed(true);
        })
        .finally(() => !cancelled && setSearching(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const addLink = () => {
    setLinkBusy(true);
    setLinkError(null);
    adminApi
      .resolveSpace(query.trim())
      .then(({ space }) => {
        if (!isIn(space.nameId)) onAdd(space);
        setResults([space]);
      })
      .catch((err: unknown) =>
        setLinkError(problemText(t, err instanceof AdminApiError ? String(err.body.error) : 'UNPARSEABLE')),
      )
      .finally(() => setLinkBusy(false));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div role="presentation" className="absolute inset-0 bg-foreground/40 backdrop-blur-[1px]" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-space-title"
        data-testid="add-space-dialog"
        className="relative flex max-h-[90dvh] w-full flex-col rounded-t-xl border border-border bg-card shadow-xl sm:max-w-[560px] sm:rounded-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id="add-space-title" className="text-base font-semibold text-foreground">
              {t('admin.a.addTitle', { defaultValue: 'Space toevoegen' })}
            </h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {t('admin.included.edit.addHelp', {
                defaultValue:
                  'Your own Spaces are found on any part of their name. Other Spaces you can see on Alkemio are found on a whole word from their name, or on their exact short name. Or paste the link of the Space.',
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('admin.included.edit.close', { defaultValue: 'Close' })}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (isLink) addLink();
            }}
            className="relative"
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t('admin.a.addTitle', { defaultValue: 'Space toevoegen' })}
              placeholder={t('admin.included.edit.searchPlaceholder', { defaultValue: 'Name of a Space, or https://alkem.io/…' })}
              className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            {(searching || linkBusy) && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />
            )}
          </form>
          {isLink && !linkBusy && !linkError && (
            <p className="mt-2 text-xs text-muted-foreground">{t('admin.a.pressEnter', { defaultValue: 'Druk op Enter om deze link toe te voegen.' })}</p>
          )}
          {linkError && <p role="alert" className="mt-2 text-sm text-destructive">{linkError}</p>}
          {failed && !searching && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {t('admin.included.edit.searchFailed', { defaultValue: 'Searching Alkemio failed just now. Try again, or paste the link of the Space.' })}
            </p>
          )}
          {results && !searching && (
            <ul className="mt-3 max-h-[300px] divide-y divide-border overflow-auto rounded-lg border border-border" data-testid="add-space-results">
              {results.length === 0 && (
                <li className="px-3 py-3 text-sm text-muted-foreground">
                  {t('admin.included.edit.noResults', { defaultValue: 'No Spaces found.' })}
                </li>
              )}
              {results.map((r) => {
                const inn = r.included || isIn(r.nameId);
                return (
                  <li key={r.nameId} className="flex items-center gap-2.5 px-3 py-2">
                    <Initials name={r.displayName} />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-sm font-semibold text-foreground">{r.displayName}</b>
                      <span className="block truncate text-xs text-muted-foreground">{r.url.replace(/^https?:\/\//, '')}</span>
                    </span>
                    {inn ? (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
                        <Check className="h-3.5 w-3.5" aria-hidden />
                        {t('admin.included.edit.inList', { defaultValue: 'In the monitor' })}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onAdd(r)}
                        aria-label={t('admin.included.edit.addNamed', { defaultValue: 'Add {{name}}', name: r.displayName })}
                        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[13px] font-medium text-foreground hover:bg-muted max-lg:h-10"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden />
                        {t('admin.included.edit.add', { defaultValue: 'Add' })}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
          <p className="min-w-0 text-xs text-muted-foreground">
            {t('admin.a.addHint', { defaultValue: 'Toegevoegde Spaces komen in de tabel; Opslaan zet ze in de monitor.' })}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 shrink-0 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            {t('admin.a.done', { defaultValue: 'Klaar' })}
          </button>
        </div>
      </div>
    </div>
  );
}

export function GroeiA() {
  const { t, i18n } = useTranslation();
  const compact = useIsCompact();
  const { data, setData, error, loading, retry } = useSectionData(() => adminApi.includedSpaces());
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<IncludedSpaceView | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  /** Staged additions (nameId → name) and removals; written with Opslaan. */
  const [added, setAdded] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<Record<string, true>>({});
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [staged, setStaged] = useState<Record<string, Staged>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isHidden = (s: IncludedSpaceView) => hidden[s.nameId] ?? s.hidden;
  const hiddenEdits = data ? data.spaces.filter((s) => s.nameId in hidden && hidden[s.nameId] !== s.hidden) : [];
  const classEdits = Object.values(staged).reduce(
    (n, s) =>
      n +
      s.view.classifications.filter(
        (c) => c.entryId && s.edits[c.entryId] && !same(s.edits[c.entryId], c.selectedValueIds),
      ).length,
    0,
  );
  const listEdits = Object.keys(added).length + Object.keys(removed).length;
  const pending = hiddenEdits.length + classEdits + listEdits;

  // Leaving with staged changes would lose them silently.
  useEffect(() => {
    if (!pending) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [pending]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.spaces
      .filter((s) => !q || (s.displayName ?? s.nameId).toLowerCase().includes(q) || s.nameId.includes(q))
      .sort((a, b) =>
        (a.displayName ?? a.nameId).localeCompare(b.displayName ?? b.nameId, i18n.language),
      );
  }, [data, query, i18n.language]);

  const undo = () => {
    setHidden({});
    setStaged({});
    setAdded({});
    setRemoved({});
    setSaveError(null);
  };

  const save = async () => {
    if (!data) return;
    setSaving(true);
    setSaveError(null);
    let next = data;
    let failed = false;
    try {
      if (hiddenEdits.length || listEdits) {
        const keep = data.spaces.filter((s) => !removed[s.nameId]);
        const list = [...keep.map((s) => s.nameId), ...Object.keys(added)];
        if (list.length === 0) {
          setSaveError(t('admin.a.notEmpty', { defaultValue: 'De monitor moet minstens één Space houden.' }));
          return;
        }
        try {
          next = await adminApi.saveIncludedSpaces({
            baseRevision: data.revision,
            spaceNameIds: list,
            hiddenNameIds: keep.filter(isHidden).map((s) => s.nameId),
          });
          setHidden({});
          setAdded({});
          setRemoved({});
          markMonitorScopeStale();
          notifyAdminChange();
        } catch (err) {
          failed = true;
          setSaveError(
            err instanceof AdminApiError && err.body.error === 'INVALID_SPACES'
              ? (err.body.problems as Array<{ nameId: string; problem: string }>)
                  .map((x) => `${added[x.nameId] ?? x.nameId}: ${problemText(t, x.problem)}`)
                  .join(' · ')
              : err instanceof AdminApiError && err.status === 409
              ? t('admin.a.conflict', {
                  defaultValue:
                    'Iemand anders heeft de lijst intussen gewijzigd. Laad de pagina opnieuw en zet de schakelaars nog eens.',
                })
              : t('admin.included.edit.saveFailed', {
                  defaultValue: 'Saving failed. Your changes are kept — try again.',
                }),
          );
        }
      }
      const left: Record<string, Staged> = {};
      for (const [nameId, s] of Object.entries(staged)) {
        const changes = s.view.classifications.filter(
          (c) => c.entryId && s.edits[c.entryId] && !same(s.edits[c.entryId], c.selectedValueIds),
        );
        if (!changes.length) continue;
        try {
          const res = await adminApi.saveClassifications(
            nameId,
            changes.map((c) => ({
              entryId: c.entryId as string,
              expectedSelectedValueIds: c.selectedValueIds,
              selectedValueIds: s.edits[c.entryId as string],
            })),
          );
          const bad = res.results.filter((r) => r.outcome !== 'SAVED');
          if (res.results.some((r) => r.outcome === 'SAVED')) {
            const values = toDesignatedValues(res.classifications);
            next = {
              ...next,
              spaces: next.spaces.map((sp) => (sp.nameId === nameId ? { ...sp, classifications: values } : sp)),
            };
            notifyAdminChange();
          }
          if (bad.length) {
            failed = true;
            left[nameId] = {
              view: res.classifications,
              edits: Object.fromEntries(bad.map((r) => [r.entryId, s.edits[r.entryId]])),
              errors: Object.fromEntries(bad.map((r) => [r.entryId, r.outcome])),
            };
          }
        } catch {
          failed = true;
          left[nameId] = s;
        }
      }
      setStaged(left);
      setData(next);
      if (failed && !hiddenEdits.length && !listEdits)
        setSaveError(
          t('admin.a.partlySaved', {
            defaultValue: 'Niet alles kon worden opgeslagen. Wat overblijft staat nog klaar — bekijk de gemarkeerde rijen.',
          }),
        );
    } finally {
      setSaving(false);
    }
  };

  const subtitle = data
    ? t('admin.a.groeiSub', {
        defaultValue: '{{shown}} van {{total}} zichtbaar, {{open}} met een lege indeling',
        shown: data.spaces.filter((s) => !isHidden(s)).length,
        total: data.spaces.length,
        open: data.spaces.filter((s) => s.classifications?.some((c) => c.present && c.values.length === 0)).length,
      })
    : undefined;

  const cols = data?.designations ?? [];
  const nameOf = (s: IncludedSpaceView) => s.displayName ?? s.nameId;
  const editLabel = (s: IncludedSpaceView) =>
    t('admin.included.openClassificationsNamed', { defaultValue: 'Edit the classifications of {{name}}', name: nameOf(s) });

  const addedRows = Object.entries(added);
  const showLabel = (s: IncludedSpaceView) =>
    t('admin.a.showNamed', { defaultValue: '{{name}} tonen in de monitor', name: nameOf(s) });
  const toggle = (s: IncludedSpaceView) => setHidden((h) => ({ ...h, [s.nameId]: !isHidden(s) }));
  const unAdd = (id: string) =>
    setAdded((x) => {
      const n = { ...x };
      delete n[id];
      return n;
    });
  const iconBtn = (icon: ReactNode, label: string, onClick: () => void, testId?: string, danger = false) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      title={label}
      data-testid={testId}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary max-lg:h-10 max-lg:w-10',
        danger ? 'hover:bg-[#FBEDEA] hover:text-[#9A3B2E]' : 'hover:bg-muted hover:text-foreground',
      )}
    >
      {icon}
    </button>
  );
  const actions = (s: IncludedSpaceView) =>
    removed[s.nameId] ? (
      iconBtn(<Undo2 className="h-4 w-4" aria-hidden />, t('admin.a.keepNamed', { defaultValue: '{{name}} toch houden', name: nameOf(s) }), () =>
        setRemoved((r) => {
          const n = { ...r };
          delete n[s.nameId];
          return n;
        }),
      )
    ) : (
      <>
        {s.readable &&
          iconBtn(<Pencil className="h-4 w-4" aria-hidden />, editLabel(s), () => setOpen(s), 'included-edit-classifications')}
        {iconBtn(
          <Trash2 className="h-4 w-4" aria-hidden />,
          t('admin.included.edit.removeNamed', { defaultValue: 'Remove {{name}}', name: nameOf(s) }),
          () => setRemoved((r) => ({ ...r, [s.nameId]: true })),
          'included-remove',
          true,
        )}
      </>
    );

  return (
    <SectionState
      id="included"
      title={t('admin.a.groeiTitle', { defaultValue: 'Groei-initiatieven in de monitor' })}
      subtitle={subtitle}
      loading={loading}
      error={error}
      onRetry={retry}
      tools={
        data && (
          <>
            <label className="relative block w-full min-w-0 sm:w-[240px] lg:w-[300px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('admin.a.search', { defaultValue: 'Zoek initiatief' })}
                aria-label={t('admin.a.search', { defaultValue: 'Zoek initiatief' })}
                className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary max-lg:h-11"
              />
            </label>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              data-testid="included-add"
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 sm:w-auto max-lg:h-11"
            >
              <Plus className="h-4 w-4" aria-hidden />
              {t('admin.a.addTitle', { defaultValue: 'Space toevoegen' })}
            </button>
          </>
        )
      }
    >
      {data &&
        (data.spaces.length === 0 && !addedRows.length ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">
            {t('admin.included.empty', { defaultValue: 'The monitor reports on no Spaces.' })}
          </p>
        ) : compact ? (
          <ul className="flex flex-col gap-2.5 px-4 pb-4" data-testid="included-cards">
            {addedRows.map(([id, name]) => (
              <li key={id} className="flex items-center gap-2.5 rounded-[10px] border border-[#8FB0DC] bg-[#EEF4FB] p-3" data-testid="included-row-new">
                <Initials name={name} />
                <span className="min-w-0 flex-1">
                  <b className="block font-semibold text-foreground">{name}</b>
                  <NewTag />
                </span>
                {iconBtn(<Undo2 className="h-4 w-4" aria-hidden />, t('admin.a.undoAddNamed', { defaultValue: '{{name}} niet toevoegen', name }), () => unAdd(id))}
              </li>
            ))}
            {rows.map((s) => {
              const { values, changed } = stagedValues(staged[s.nameId], s.classifications);
              const gone = !!removed[s.nameId];
              return (
                <li key={s.nameId} className={cn('rounded-[10px] border border-border bg-background p-3', gone && 'opacity-60')} data-testid="included-row">
                  <div className="flex items-center gap-2.5">
                    <Initials name={nameOf(s)} muted={isHidden(s) || gone} />
                    <span className="min-w-0 flex-1">
                      <b className={cn('block font-semibold', isHidden(s) ? 'text-muted-foreground' : 'text-foreground', gone && 'line-through')}>{nameOf(s)}</b>
                      {gone ? <RemoveTag /> : <span className="text-xs"><VisibilityCell space={s} /></span>}
                    </span>
                    {!gone && <Switch on={!isHidden(s)} onChange={() => toggle(s)} label={showLabel(s)} />}
                  </div>
                  {s.readable && !gone && (
                    <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2">
                      {cols.map((c) => (
                        <div key={c.key} className="min-w-0">
                          <dt className="text-xs text-muted-foreground">{c.label}</dt>
                          <dd><ValueChip value={values?.find((v) => v.key === c.key)} changed={changed.has(c.key)} /></dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  <div className="mt-2 flex justify-end gap-1 border-t border-border pt-2">{actions(s)}</div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm" data-testid="included-table">
              <thead>
                <tr className="border-b border-border text-left text-[12.5px] font-medium text-muted-foreground">
                  <th className="py-2 pl-5 pr-2 font-medium">{t('admin.a.colShown', { defaultValue: 'Zichtbaar' })}</th>
                  <th className="px-2 py-2 font-medium">{t('admin.a.colInitiative', { defaultValue: 'Initiatief' })}</th>
                  <th className="px-2 py-2 font-medium">{t('admin.a.colAlkemio', { defaultValue: 'Alkemio' })}</th>
                  {cols.map((c) => (
                    <th key={c.key} className="px-1.5 py-2 font-medium">{c.label}</th>
                  ))}
                  <th className="py-2 pl-2 pr-5"><span className="sr-only">{t('admin.a.colActions', { defaultValue: 'Acties' })}</span></th>
                </tr>
              </thead>
              <tbody>
                {addedRows.map(([id, name]) => (
                  <tr key={id} className="border-b border-border bg-[#EEF4FB]" data-testid="included-row-new">
                    <td className="py-2 pl-5 pr-2" />
                    <td className="px-2 py-2.5">
                      <span className="flex items-center gap-2.5">
                        <Initials name={name} />
                        <b className="font-semibold text-foreground">{name}</b>
                        <NewTag />
                      </span>
                    </td>
                    <td colSpan={cols.length + 1} className="px-2 py-2 text-[13px] text-muted-foreground">
                      {t('admin.a.newHint', { defaultValue: 'Indeling verschijnt na Opslaan' })}
                    </td>
                    <td className="py-2 pl-2 pr-5 text-right">
                      {iconBtn(<Undo2 className="h-4 w-4" aria-hidden />, t('admin.a.undoAddNamed', { defaultValue: '{{name}} niet toevoegen', name }), () => unAdd(id))}
                    </td>
                  </tr>
                ))}
                {rows.map((s) => {
                  const { values, changed } = stagedValues(staged[s.nameId], s.classifications);
                  const err = staged[s.nameId]?.errors;
                  const off = isHidden(s);
                  const gone = !!removed[s.nameId];
                  return (
                    <tr
                      key={s.nameId}
                      data-testid="included-row"
                      onClick={() => s.readable && !gone && setOpen(s)}
                      className={cn(
                        'border-b border-border last:border-b-0',
                        s.readable && !gone && 'cursor-pointer hover:bg-muted/40',
                        err && 'bg-[#FFF8EC]',
                        gone && 'bg-[#FBF3F1]',
                      )}
                    >
                      <td className="py-2 pl-5 pr-2 align-middle">
                        {!gone && <Switch on={!off} onChange={() => toggle(s)} label={showLabel(s)} />}
                      </td>
                      <td className="min-w-[150px] px-2 py-2.5">
                        <span className="flex items-center gap-2.5">
                          <Initials name={nameOf(s)} muted={off || gone} />
                          <span className="min-w-0">
                            <b className={cn('font-semibold', off || gone ? 'text-muted-foreground' : 'text-foreground', gone && 'line-through', !(s.nameId in hidden) || hidden[s.nameId] === s.hidden ? '' : 'underline decoration-[#8FB0DC] decoration-2 underline-offset-4')}>
                              {nameOf(s)}
                            </b>
                            {gone && <RemoveTag />}
                            {!s.found && <span className="block text-xs text-destructive">{t('admin.included.notFound', { defaultValue: 'Not found on Alkemio' })}</span>}
                            {err && <span className="block text-xs text-[#8A6420]">{t('admin.a.notSaved', { defaultValue: 'Niet opgeslagen — open om te bekijken' })}</span>}
                          </span>
                        </span>
                      </td>
                      <td className={cn('px-2 py-2 text-xs [&_span]:text-[11.5px]', gone && 'opacity-50')}><VisibilityCell space={s} /></td>
                      {cols.map((c) => (
                        <td key={c.key} className={cn('px-1.5 py-2', gone && 'opacity-50')}>
                          <ValueChip value={values?.find((v) => v.key === c.key)} changed={changed.has(c.key)} />
                        </td>
                      ))}
                      <td className="whitespace-nowrap py-2 pl-1 pr-4 text-right">{actions(s)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

      {open && (
        <ClassificationDialog
          key={open.nameId}
          nameId={open.nameId}
          name={nameOf(open)}
          onClose={() => setOpen(null)}
          stage={{
            edits: staged[open.nameId]?.edits ?? {},
            onApply: (view, edits) =>
              setStaged((prev) => {
                const next = { ...prev };
                // Keep the view first loaded: its values are what Opslaan expects to find.
                const base = prev[open.nameId]?.view ?? view;
                if (Object.keys(edits).length) next[open.nameId] = { view: base, edits };
                else delete next[open.nameId];
                return next;
              }),
          }}
        />
      )}
      {addOpen && data && (
        <AddDialog
          isIn={(id) => id in added || data.spaces.some((sp) => sp.nameId === id && !removed[id])}
          onAdd={(sp) => {
            if (removed[sp.nameId])
              setRemoved((r) => {
                const n = { ...r };
                delete n[sp.nameId];
                return n;
              });
            else setAdded((x) => ({ ...x, [sp.nameId]: sp.displayName }));
          }}
          onClose={() => setAddOpen(false)}
        />
      )}

      {(pending > 0 || saveError) && (
        <div
          role="status"
          data-testid="save-bar"
          className="fixed bottom-[max(1.25rem,calc(var(--safe-bottom)+0.75rem))] left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl bg-primary py-2 pl-[18px] pr-2.5 text-sm text-primary-foreground shadow-[0_12px_32px_rgba(29,56,74,0.3)] max-lg:bottom-[calc(76px+var(--safe-bottom))] lg:ml-[116px]"
        >
          <span className="min-w-0 truncate">
            {saveError ??
              t('admin.a.pending', {
                defaultValue: '{{count}} wijzigingen nog niet opgeslagen',
                count: pending,
              })}
          </span>
          {pending > 0 && (
            <>
              <button type="button" onClick={undo} disabled={saving} className="h-9 shrink-0 rounded-lg px-3 font-medium text-[#cfe0ea] hover:bg-white/10">
                {t('admin.a.undo', { defaultValue: 'Maak ongedaan' })}
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                data-testid="save-all"
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-white px-4 font-semibold text-primary hover:bg-white/90"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {t('admin.a.save', { defaultValue: 'Opslaan' })}
              </button>
            </>
          )}
          {!pending && saveError && (
            <button type="button" onClick={() => setSaveError(null)} aria-label={t('admin.included.edit.close', { defaultValue: 'Close' })} className="h-9 w-9 shrink-0 rounded-lg hover:bg-white/10">
              <X className="mx-auto h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      )}
    </SectionState>
  );
}

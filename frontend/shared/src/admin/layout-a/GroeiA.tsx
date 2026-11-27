import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import type { DesignatedValues, IncludedSpaceView, IncludedSpacesView, SpaceCandidate } from '@server/types/admin.js';
import { cn } from '../../lib/cn.js';
import { useIsCompact } from '../../hooks/useMediaQuery.js';
import { markMonitorScopeStale } from '../../dashboard/hooks/useMonitorScope.js';
import { AdminApiError, adminApi } from '../api.js';
import { ClassificationDialog, toDesignatedValues } from '../ClassificationDialog.js';
import { notifyAdminChange } from '../changes.js';
import { VisibilityCell, problemText } from '../sections/IncludedSpacesSection.js';
import { useSectionData } from '../Section.js';
import { Modal } from './Modal.js';
import { SectionState } from './SectionState.js';

/**
 * Layout A — the Groei initiatives in the monitor.
 *
 * Every change is made in a window and saved from that window, as production does: the
 * pencil opens the classification window (saved on Alkemio), the trash asks before it
 * takes a Space out, "Space toevoegen" collects Spaces and adds them on its own button.
 * The Zichtbaar switch is the one direct control: it saves as it is flipped. List changes
 * carry the revision they were made on, so an edit made elsewhere meanwhile is refused
 * (409) rather than overwritten.
 */

type T = ReturnType<typeof useTranslation>['t'];

function Initials({ name, muted }: { name: string; muted?: boolean }) {
  const words = name.replace(/[()]/g, '').split(/\s+/).filter(Boolean);
  const text = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase();
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

function Switch({ on, busy, onChange, label }: { on: boolean; busy: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      aria-busy={busy || undefined}
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      data-testid="included-shown"
      className="inline-flex h-10 items-center gap-1.5 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait"
    >
      <span className={cn('relative h-[18px] w-8 rounded-full transition-colors', on ? 'bg-primary' : 'bg-[#c3ccd6]', busy && 'opacity-60')}>
        <span className={cn('absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-[left]', on ? 'left-4' : 'left-0.5')} />
      </span>
    </button>
  );
}

/** One classification cell: its labels, or an amber "Nog leeg" when nothing is chosen. */
function ValueChip({ value }: { value: DesignatedValues | undefined }) {
  const { t } = useTranslation();
  if (!value || !value.present) return <span className="text-[13px] text-muted-foreground">—</span>;
  const empty = value.values.length === 0;
  return (
    <span
      className={cn(
        'inline-flex max-w-[132px] items-center rounded-md border py-1 text-[13px] leading-snug max-lg:max-w-full',
        empty ? 'border-dashed border-[#E3CFA4] bg-[#FFFCF5] px-2 text-[#8A6420]' : 'border-transparent text-foreground',
      )}
    >
      <span className="min-w-0 truncate" title={empty ? undefined : value.values.join(', ')}>
        {empty ? t('admin.a.empty', { defaultValue: 'Nog leeg' }) : value.values.join(', ')}
      </span>
    </span>
  );
}

/** What a refused list save means, in words. */
function saveErrorText(t: T, err: unknown, nameOf: (id: string) => string): string {
  if (err instanceof AdminApiError && err.body.error === 'INVALID_SPACES')
    return (err.body.problems as Array<{ nameId: string; problem: string }>)
      .map((x) => `${nameOf(x.nameId)}: ${problemText(t, x.problem)}`)
      .join(' · ');
  if (err instanceof AdminApiError && err.body.error === 'ALL_HIDDEN')
    return t('admin.a.keepOneVisible', { defaultValue: 'Er moet minstens één initiatief zichtbaar blijven.' });
  if (err instanceof AdminApiError && err.status === 409)
    return t('admin.a.conflict', {
      defaultValue: 'Iemand anders heeft de lijst intussen gewijzigd. De huidige lijst staat er nu; probeer het opnieuw.',
    });
  return t('admin.included.edit.saveFailed', { defaultValue: 'Saving failed. Your changes are kept — try again.' });
}

const ghostBtn =
  'inline-flex h-9 items-center rounded-lg border border-border bg-card px-3.5 text-sm font-medium text-foreground hover:bg-muted';

/**
 * "Space toevoegen": search Alkemio (or paste a link), pick one or more Spaces, and add
 * them with the window's own button.
 */
function AddDialog({
  data,
  onSaved,
  onStale,
  onClose,
}: {
  data: IncludedSpacesView;
  onSaved: (next: IncludedSpacesView) => void;
  /** The list changed elsewhere (409): reload it so a retry is made on the current one. */
  onStale: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SpaceCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [picked, setPicked] = useState<SpaceCandidate[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inMonitor = (id: string) => data.spaces.some((s) => s.nameId === id);
  const isPicked = (id: string) => picked.some((p) => p.nameId === id);
  const pick = (c: SpaceCandidate) => setPicked((p) => (p.some((x) => x.nameId === c.nameId) ? p : [...p, c]));
  const unpick = (id: string) => setPicked((p) => p.filter((x) => x.nameId !== id));

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
        if (!inMonitor(space.nameId)) pick(space);
        setResults([space]);
      })
      .catch((err: unknown) =>
        setLinkError(problemText(t, err instanceof AdminApiError ? String(err.body.error) : 'UNPARSEABLE')),
      )
      .finally(() => setLinkBusy(false));
  };

  const save = () => {
    setSaving(true);
    setError(null);
    adminApi
      .saveIncludedSpaces({
        baseRevision: data.revision,
        spaceNameIds: [...data.spaces.map((s) => s.nameId), ...picked.map((p) => p.nameId)],
      })
      .then(onSaved)
      .catch((err: unknown) => {
        setError(saveErrorText(t, err, (id) => picked.find((p) => p.nameId === id)?.displayName ?? id));
        if (err instanceof AdminApiError && err.status === 409) onStale();
      })
      .finally(() => setSaving(false));
  };

  return (
    <Modal
      title={t('admin.a.addTitle', { defaultValue: 'Space toevoegen' })}
      subtitle={t('admin.included.edit.addHelp', {
        defaultValue:
          'Your own Spaces are found on any part of their name. Other Spaces you can see on Alkemio are found on a whole word from their name, or on their exact short name. Or paste the link of the Space.',
      })}
      onClose={onClose}
      busy={saving}
      testId="add-space-dialog"
      footer={
        <>
          <p className="min-w-0 flex-1 basis-[200px] text-xs">
            {error ? (
              <span role="alert" className="text-destructive">{error}</span>
            ) : (
              <span className="text-muted-foreground">
                {t('admin.a.addNote', { defaultValue: 'Komt direct in de monitor, voor iedereen die hem bekijkt.' })}
              </span>
            )}
          </p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={onClose} disabled={saving} className={ghostBtn}>
              {t('admin.classifications.cancel', { defaultValue: 'Cancel' })}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!picked.length || saving || linkBusy}
              data-testid="add-space-save"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {picked.length
                ? t('admin.a.addCount', { defaultValue: '{{count}} toevoegen', count: picked.length })
                : t('admin.included.edit.add', { defaultValue: 'Add' })}
            </button>
          </div>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (isLink) addLink();
        }}
        className="relative"
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t('admin.a.addTitle', { defaultValue: 'Space toevoegen' })}
          placeholder={t('admin.included.edit.searchPlaceholder', { defaultValue: 'Name of a Space, or https://alkem.io/…' })}
          className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        {(searching || linkBusy) && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />
        )}
      </form>
      {isLink && !linkBusy && !linkError && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t('admin.a.pressEnter', { defaultValue: 'Druk op Enter om deze link op te zoeken.' })}
        </p>
      )}
      {linkError && <p role="alert" className="mt-2 text-sm text-destructive">{linkError}</p>}
      {failed && !searching && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {t('admin.included.edit.searchFailed', { defaultValue: 'Searching Alkemio failed just now. Try again, or paste the link of the Space.' })}
        </p>
      )}
      {results && !searching && (
        <ul className="mt-3 max-h-[280px] divide-y divide-border overflow-auto rounded-lg border border-border" data-testid="add-space-results">
          {results.length === 0 && (
            <li className="px-3 py-3 text-sm text-muted-foreground">
              {t('admin.included.edit.noResults', { defaultValue: 'No Spaces found.' })}
            </li>
          )}
          {results.map((r) => {
            const inn = r.included || inMonitor(r.nameId);
            const on = isPicked(r.nameId);
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
                    aria-pressed={on}
                    onClick={() => (on ? unpick(r.nameId) : pick(r))}
                    aria-label={t('admin.included.edit.addNamed', { defaultValue: 'Add {{name}}', name: r.displayName })}
                    className={cn(
                      'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium max-lg:h-10',
                      on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-muted',
                    )}
                  >
                    {on ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
                    {on ? t('admin.a.picked', { defaultValue: 'Gekozen' }) : t('admin.included.edit.add', { defaultValue: 'Add' })}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {picked.length > 0 && (
        <div className="mt-4">
          <p className="text-[13px] font-semibold text-foreground">{t('admin.a.toAdd', { defaultValue: 'Toe te voegen' })}</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {picked.map((p) => (
              <li key={p.nameId} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 py-0.5 pl-2.5 pr-1 text-sm">
                <span className="truncate text-foreground">{p.displayName}</span>
                <button
                  type="button"
                  onClick={() => unpick(p.nameId)}
                  aria-label={t('admin.included.edit.removeNamed', { defaultValue: 'Remove {{name}}', name: p.displayName })}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}

/** The trash: asks first, then takes the Space out of the monitor. */
function RemoveDialog({
  data,
  space,
  onSaved,
  onStale,
  onClose,
}: {
  data: IncludedSpacesView;
  space: IncludedSpaceView;
  onSaved: (next: IncludedSpacesView) => void;
  onStale: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = space.displayName ?? space.nameId;
  const last = data.spaces.length === 1;
  const remove = () => {
    setSaving(true);
    setError(null);
    adminApi
      .saveIncludedSpaces({
        baseRevision: data.revision,
        spaceNameIds: data.spaces.filter((s) => s.nameId !== space.nameId).map((s) => s.nameId),
      })
      .then(onSaved)
      .catch((err: unknown) => {
        setError(saveErrorText(t, err, () => name));
        if (err instanceof AdminApiError && err.status === 409) onStale();
      })
      .finally(() => setSaving(false));
  };
  return (
    <Modal
      title={t('admin.a.removeTitle', { defaultValue: '{{name}} uit de monitor halen?', name })}
      onClose={onClose}
      busy={saving}
      testId="remove-space-dialog"
      footer={
        <>
          <p className="min-w-0 flex-1 basis-[200px] text-xs">
            {error && <span role="alert" className="text-destructive">{error}</span>}
          </p>
          <div className="flex shrink-0 gap-2">
            <button type="button" autoFocus onClick={onClose} disabled={saving} className={ghostBtn}>
              {t('admin.classifications.cancel', { defaultValue: 'Cancel' })}
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={saving || last}
              data-testid="remove-space-confirm"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#9A3B2E] px-4 text-sm font-semibold text-white hover:bg-[#843226] disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {t('admin.a.removeYes', { defaultValue: 'Verwijderen' })}
            </button>
          </div>
        </>
      }
    >
      <p className="text-sm text-foreground">
        {last
          ? t('admin.a.notEmpty', { defaultValue: 'De monitor moet minstens één Space houden.' })
          : t('admin.a.removeBody', {
              defaultValue:
                'Het initiatief verdwijnt direct uit de monitor, voor iedereen. Op Alkemio blijft de Space gewoon bestaan, en je kunt hem later opnieuw toevoegen. Wil je hem alleen even niet tonen? Zet dan de schakelaar Zichtbaar uit.',
            })}
      </p>
    </Modal>
  );
}

export function GroeiA() {
  const { t, i18n } = useTranslation();
  const compact = useIsCompact();
  const { data, setData, error, loading, retry } = useSectionData(() => adminApi.includedSpaces());
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<IncludedSpaceView | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [removing, setRemoving] = useState<IncludedSpaceView | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const nameOf = (s: IncludedSpaceView) => s.displayName ?? s.nameId;

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const name = (s: IncludedSpaceView) => s.displayName ?? s.nameId;
    return data.spaces
      .filter((s) => !q || name(s).toLowerCase().includes(q) || s.nameId.includes(q))
      .sort((a, b) => name(a).localeCompare(name(b), i18n.language));
  }, [data, query, i18n.language]);

  /** A list save went through: the table, the dashboard behind it and the log follow. */
  const listSaved = (next: IncludedSpacesView) => {
    setData(next);
    markMonitorScopeStale();
    notifyAdminChange();
  };

  // The switch saves as it is flipped.
  const toggle = (s: IncludedSpaceView) => {
    if (!data || switching) return;
    const hide = !s.hidden;
    // Hiding every Space would leave viewers an empty monitor that reads as "nothing chosen yet".
    if (hide && data.spaces.filter((x) => !x.hidden).length <= 1) {
      setNotice(t('admin.a.keepOneVisible', { defaultValue: 'Er moet minstens één initiatief zichtbaar blijven.' }));
      return;
    }
    setSwitching(s.nameId);
    setNotice(null);
    adminApi
      .saveIncludedSpaces({
        baseRevision: data.revision,
        spaceNameIds: data.spaces.map((x) => x.nameId),
        hiddenNameIds: data.spaces.filter((x) => (x.nameId === s.nameId ? hide : x.hidden)).map((x) => x.nameId),
      })
      .then(listSaved)
      .catch((err: unknown) => {
        setNotice(saveErrorText(t, err, () => nameOf(s)));
        if (err instanceof AdminApiError && err.status === 409) retry();
      })
      .finally(() => setSwitching(null));
  };

  const subtitle = data
    ? t('admin.a.groeiSub', {
        defaultValue: '{{shown}} van {{total}} zichtbaar, {{open}} met een lege indeling',
        shown: data.spaces.filter((s) => !s.hidden).length,
        total: data.spaces.length,
        open: data.spaces.filter((s) => s.classifications?.some((c) => c.present && c.values.length === 0)).length,
      })
    : undefined;

  const cols = data?.designations ?? [];
  const valueOf = (s: IncludedSpaceView, key: string) => s.classifications?.find((v) => v.key === key);
  const showLabel = (s: IncludedSpaceView) =>
    t('admin.a.showNamed', { defaultValue: '{{name}} tonen in de monitor', name: nameOf(s) });
  const iconBtn = (icon: ReactNode, label: string, onClick: () => void, testId: string, danger = false) => (
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
  const actions = (s: IncludedSpaceView) => (
    <>
      {s.readable &&
        iconBtn(
          <Pencil className="h-4 w-4" aria-hidden />,
          t('admin.included.openClassificationsNamed', { defaultValue: 'Edit the classifications of {{name}}', name: nameOf(s) }),
          () => setOpen(s),
          'included-edit-classifications',
        )}
      {iconBtn(
        <Trash2 className="h-4 w-4" aria-hidden />,
        t('admin.included.edit.removeNamed', { defaultValue: 'Remove {{name}}', name: nameOf(s) }),
        () => setRemoving(s),
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
      // A reload (after a 409) keeps the table and any open window on screen.
      loading={loading && !data}
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
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3.5 text-sm font-medium text-foreground hover:bg-muted sm:w-auto max-lg:h-11"
            >
              <Plus className="h-4 w-4" aria-hidden />
              {t('admin.a.addTitle', { defaultValue: 'Space toevoegen' })}
            </button>
          </>
        )
      }
    >
      {notice && (
        <p role="alert" className="mx-5 mb-3 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive max-lg:mx-4">
          <span className="min-w-0 flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label={t('admin.included.edit.close', { defaultValue: 'Close' })} className="shrink-0 rounded p-0.5 hover:bg-destructive/10">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </p>
      )}
      {data &&
        (data.spaces.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">
            {t('admin.included.empty', { defaultValue: 'The monitor reports on no Spaces.' })}
          </p>
        ) : compact ? (
          <ul className="flex flex-col gap-2.5 px-4 pb-4" data-testid="included-cards">
            {rows.map((s) => (
              <li key={s.nameId} className="rounded-[10px] border border-border bg-background p-3" data-testid="included-row">
                <div className="flex items-center gap-2.5">
                  <Initials name={nameOf(s)} muted={s.hidden} />
                  <span className="min-w-0 flex-1">
                    <b className={cn('block font-semibold', s.hidden ? 'text-muted-foreground' : 'text-foreground')}>{nameOf(s)}</b>
                    <span className="text-xs"><VisibilityCell space={s} /></span>
                  </span>
                  <Switch on={!s.hidden} busy={switching === s.nameId} onChange={() => toggle(s)} label={showLabel(s)} />
                </div>
                {s.readable && (
                  <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2">
                    {cols.map((c) => (
                      <div key={c.key} className="min-w-0">
                        <dt className="text-xs text-muted-foreground">{c.label}</dt>
                        <dd><ValueChip value={valueOf(s, c.key)} /></dd>
                      </div>
                    ))}
                  </dl>
                )}
                <div className="mt-2 flex justify-end gap-1 border-t border-border pt-2">{actions(s)}</div>
              </li>
            ))}
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
                {rows.map((s) => (
                  <tr
                    key={s.nameId}
                    data-testid="included-row"
                    onClick={() => s.readable && setOpen(s)}
                    className={cn('border-b border-border last:border-b-0', s.readable && 'cursor-pointer hover:bg-muted/40')}
                  >
                    <td className="py-2 pl-5 pr-2 align-middle">
                      <Switch on={!s.hidden} busy={switching === s.nameId} onChange={() => toggle(s)} label={showLabel(s)} />
                    </td>
                    <td className="min-w-[150px] px-2 py-2.5">
                      <span className="flex items-center gap-2.5">
                        <Initials name={nameOf(s)} muted={s.hidden} />
                        <span className="min-w-0">
                          <b className={cn('font-semibold', s.hidden ? 'text-muted-foreground' : 'text-foreground')}>{nameOf(s)}</b>
                          {!s.found && (
                            <span className="block text-xs text-destructive">
                              {t('admin.included.notFound', { defaultValue: 'Not found on Alkemio' })}
                            </span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="px-2 py-2 text-xs [&_span]:text-[11.5px]"><VisibilityCell space={s} /></td>
                    {cols.map((c) => (
                      <td key={c.key} className="px-1.5 py-2"><ValueChip value={valueOf(s, c.key)} /></td>
                    ))}
                    <td className="whitespace-nowrap py-2 pl-1 pr-4 text-right">{actions(s)}</td>
                  </tr>
                ))}
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
          onSaved={(view) => {
            const values = toDesignatedValues(view);
            setData((prev) =>
              prev
                ? { ...prev, spaces: prev.spaces.map((sp) => (sp.nameId === open.nameId ? { ...sp, classifications: values } : sp)) }
                : prev,
            );
          }}
        />
      )}
      {addOpen && data && (
        <AddDialog
          data={data}
          onClose={() => setAddOpen(false)}
          onStale={retry}
          onSaved={(next) => {
            listSaved(next);
            setAddOpen(false);
          }}
        />
      )}
      {removing && data && (
        <RemoveDialog
          data={data}
          space={removing}
          onClose={() => setRemoving(null)}
          onStale={retry}
          onSaved={(next) => {
            listSaved(next);
            setRemoving(null);
          }}
        />
      )}
    </SectionState>
  );
}

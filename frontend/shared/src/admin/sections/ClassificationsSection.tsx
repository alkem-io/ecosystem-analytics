import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Loader2, Lock } from 'lucide-react';
import type {
  ClassificationChangeResult,
  DesignatedClassificationView,
  InitiativeClassificationsView,
  InitiativeRef,
} from '@server/types/admin.js';
import { cn } from '../../lib/cn.js';
import { adminApi } from '../api.js';
import { Section, primarySmallButton, smallButton, textInput, useSectionData } from '../Section.js';

type T = ReturnType<typeof useTranslation>['t'];

const kindLabel = (t: T, kind: InitiativeRef['kind']) =>
  ({
    included: t('admin.classifications.kindIncluded', { defaultValue: 'Space in the monitor' }),
    'gd-subspace': t('admin.classifications.kindGdSubspace', { defaultValue: 'GemeenteDelers subspace' }),
    'gd-post': t('admin.classifications.kindGdPost', { defaultValue: 'GemeenteDelers post' }),
  })[kind];

const reasonText = (t: T, reason: InitiativeClassificationsView['reason']) =>
  ({
    NO_UPDATE_RIGHT: t('admin.classifications.noUpdateRight', {
      defaultValue: 'You may not change this Space on Alkemio, so its classifications are shown read-only.',
    }),
    GD_POST: t('admin.classifications.gdPost', {
      defaultValue: 'This initiative is a GemeenteDelers post. Posts have no classifications of their own.',
    }),
    NOT_READABLE: t('admin.classifications.notReadable', { defaultValue: 'You cannot read this Space.' }),
  })[reason ?? 'NOT_READABLE'];

const outcomeText = (t: T, r: ClassificationChangeResult) =>
  ({
    SAVED: t('admin.classifications.saved', { defaultValue: 'Saved' }),
    CHANGED_ON_ALKEMIO: t('admin.classifications.changedOnAlkemio', {
      defaultValue: 'Changed on Alkemio meanwhile — not saved. The current value is shown; check and save again.',
    }),
    VALUE_REMOVED: t('admin.classifications.valueRemoved', {
      defaultValue: 'A chosen value no longer exists — not saved.',
    }),
    NOT_PERMITTED: t('admin.classifications.notPermitted', {
      defaultValue: 'Alkemio did not allow this change — not saved.',
    }),
    FAILED: t('admin.classifications.failed', { defaultValue: 'Could not be saved — try again.' }),
  })[r.outcome];

const same = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

function Picker({ onPick, current }: { onPick: (nameId: string) => void; current: string | null }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<InitiativeRef[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      adminApi
        .initiatives(q.trim())
        .then((r) => {
          if (cancelled) return;
          setItems(r.initiatives);
          setFailed(false);
        })
        .catch(() => !cancelled && setFailed(true));
    }, q ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);
  return (
    <div className="min-w-0">
      <label className="text-sm font-medium text-foreground" htmlFor="classification-picker">
        {t('admin.classifications.pick', { defaultValue: 'Choose an initiative' })}
      </label>
      <input
        id="classification-picker"
        className={cn(textInput, 'mt-1')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('admin.classifications.pickPlaceholder', { defaultValue: 'Search by name' })}
      />
      {failed && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {t('admin.sectionError', { defaultValue: 'This section could not be loaded.' })}
        </p>
      )}
      <ul className="mt-2 max-h-72 space-y-1 overflow-auto" data-testid="classification-picker-list">
        {(items ?? []).map((i) => (
          <li key={i.nameId}>
            <button
              type="button"
              onClick={() => onPick(i.nameId)}
              className={cn(
                'flex w-full min-w-0 flex-col items-start rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                current === i.nameId && 'bg-primary/10',
              )}
            >
              <span className="w-full truncate font-medium text-foreground">{i.displayName}</span>
              <span className="text-xs text-muted-foreground">{kindLabel(t, i.kind)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EntryEditor({
  entry,
  value,
  readOnly,
  onChange,
  result,
}: {
  entry: DesignatedClassificationView;
  value: string[];
  readOnly: boolean;
  onChange: (ids: string[]) => void;
  result?: ClassificationChangeResult;
}) {
  const { t } = useTranslation();
  const name = `classification-${entry.key}`;
  return (
    <fieldset className="min-w-0 rounded-lg border border-border p-3" data-testid={`classification-${entry.key}`}>
      <legend className="px-1 text-sm font-semibold text-foreground">{entry.label}</legend>
      {!entry.present ? (
        <p className="text-sm text-muted-foreground">
          {t('admin.classifications.notSet', {
            defaultValue: 'Not set on this Space (added by the classification programme on Alkemio).',
          })}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {entry.cardinality === 'SINGLE_SELECT' && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="radio"
                name={name}
                disabled={readOnly}
                checked={value.length === 0}
                onChange={() => onChange([])}
              />
              {t('admin.classifications.none', { defaultValue: 'None' })}
            </label>
          )}
          {entry.values.map((v) => (
            <label key={v.id} className="flex items-center gap-2 text-sm text-foreground">
              <input
                type={entry.cardinality === 'SINGLE_SELECT' ? 'radio' : 'checkbox'}
                name={name}
                disabled={readOnly}
                checked={value.includes(v.id)}
                onChange={(e) =>
                  onChange(
                    entry.cardinality === 'SINGLE_SELECT'
                      ? [v.id]
                      : e.target.checked
                        ? [...value, v.id]
                        : value.filter((id) => id !== v.id),
                  )
                }
              />
              {v.label || v.id}
            </label>
          ))}
        </div>
      )}
      {result && (
        <p
          role={result.outcome === 'SAVED' ? 'status' : 'alert'}
          className={cn('mt-2 text-xs', result.outcome === 'SAVED' ? 'text-emerald-700' : 'text-destructive')}
          data-testid={`classification-${entry.key}-result`}
        >
          {outcomeText(t, result)}
        </p>
      )}
    </fieldset>
  );
}

function Editor({ nameId }: { nameId: string }) {
  const { t } = useTranslation();
  const { data, setData, error, loading, retry } = useSectionData(() => adminApi.classifications(nameId), [nameId]);
  const [edits, setEdits] = useState<Record<string, string[]>>({});
  const [results, setResults] = useState<Record<string, ClassificationChangeResult>>({});
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    setEdits({});
    setResults({});
  }, [nameId]);

  const changed = useMemo(
    () =>
      (data?.classifications ?? []).filter(
        (c) => c.present && c.entryId && edits[c.entryId] && !same(edits[c.entryId], c.selectedValueIds),
      ),
    [data, edits],
  );

  const save = () => {
    if (!data) return;
    setSaving(true);
    setSaveFailed(false);
    adminApi
      .saveClassifications(
        nameId,
        changed.map((c) => ({
          entryId: c.entryId as string,
          expectedSelectedValueIds: c.selectedValueIds,
          selectedValueIds: edits[c.entryId as string],
        })),
      )
      .then(({ results: list, classifications }) => {
        setResults(Object.fromEntries(list.map((r) => [r.entryId, r])));
        // FR-024: keep the person's edits for every entry that was not saved.
        setEdits((prev) => {
          const next = { ...prev };
          for (const r of list) if (r.outcome === 'SAVED') delete next[r.entryId];
          return next;
        });
        setData(classifications);
      })
      .catch(() => setSaveFailed(true))
      .finally(() => setSaving(false));
  };

  if (error) {
    return (
      <div role="alert" className="text-sm text-destructive">
        {t('admin.classifications.loadFailed', { defaultValue: 'This initiative could not be loaded.' })}{' '}
        <button type="button" className={smallButton} onClick={retry}>
          {t('admin.retry', { defaultValue: 'Try again' })}
        </button>
      </div>
    );
  }
  if (loading || !data) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label={t('admin.loading', { defaultValue: 'Loading…' })} />;
  }

  const readOnly = !data.canEdit;
  return (
    <div className="min-w-0 space-y-4" data-testid="classification-editor">
      <div>
        <h3 className="text-base font-semibold text-foreground">
          {data.initiative.url ? (
            <a href={data.initiative.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {data.initiative.displayName}
              <ExternalLink className="ml-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
            </a>
          ) : (
            data.initiative.displayName
          )}
        </h3>
        <p className="text-xs text-muted-foreground">{kindLabel(t, data.initiative.kind)}</p>
      </div>
      {readOnly && (
        <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground" data-testid="classification-readonly">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {reasonText(t, data.reason)}
            {data.initiative.url && data.reason === 'NO_UPDATE_RIGHT' && (
              <>
                {' '}
                <a href={data.initiative.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {t('admin.classifications.openOnAlkemio', { defaultValue: 'Open it on Alkemio' })}
                </a>
              </>
            )}
          </span>
        </p>
      )}
      {data.classifications.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.classifications.map((c) => (
            <EntryEditor
              key={c.key}
              entry={c}
              readOnly={readOnly}
              value={(c.entryId && edits[c.entryId]) || c.selectedValueIds}
              onChange={(ids) => c.entryId && setEdits((prev) => ({ ...prev, [c.entryId as string]: ids }))}
              result={c.entryId ? results[c.entryId] : undefined}
            />
          ))}
        </div>
      )}
      {saveFailed && (
        <p role="alert" className="text-sm text-destructive">
          {t('admin.classifications.saveFailed', { defaultValue: 'Saving failed. Your changes are kept — try again.' })}
        </p>
      )}
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={primarySmallButton}
            disabled={changed.length === 0 || saving}
            onClick={save}
            data-testid="classification-save"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            {t('admin.classifications.save', { defaultValue: 'Save on Alkemio' })}
          </button>
          <button type="button" className={smallButton} disabled={changed.length === 0 || saving} onClick={() => setEdits({})}>
            {t('admin.classifications.discard', { defaultValue: 'Discard changes' })}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * One initiative's designated classifications (US5), edited on Alkemio when the manager
 * may update that Space. `selected` may be set from the Included Spaces list.
 */
export function ClassificationsSection({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (nameId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Section
      id="classifications"
      title={t('admin.classifications.title', { defaultValue: 'Classifications of an initiative' })}
      description={t('admin.classifications.description', {
        defaultValue: 'Changes are saved on Alkemio, as you; every dashboard reads them from there.',
      })}
      loading={false}
      error={null}
      onRetry={() => undefined}
    >
      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Picker onPick={onSelect} current={selected} />
        <div className="min-w-0">
          {selected ? (
            <Editor nameId={selected} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('admin.classifications.choose', { defaultValue: 'Choose an initiative to see its classifications.' })}
            </p>
          )}
        </div>
      </div>
    </Section>
  );
}

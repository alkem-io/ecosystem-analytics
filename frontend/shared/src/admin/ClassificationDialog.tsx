import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ExternalLink, Loader2, Lock, X } from 'lucide-react';
import type {
  ClassificationChangeResult,
  DesignatedClassificationView,
  DesignatedValues,
  InitiativeClassificationsView,
} from '@server/types/admin.js';
import { cn } from '../lib/cn.js';
import { adminApi } from './api.js';
import { containTab } from '../lib/focus.js';
import { notifyAdminChange } from './changes.js';
import { primarySmallButton, smallButton } from './Section.js';

type T = ReturnType<typeof useTranslation>['t'];

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

/** The selected labels per designation, as the tables show them. */
export function toDesignatedValues(view: InitiativeClassificationsView): DesignatedValues[] {
  return view.classifications.map((c) => {
    const at = c.values.findIndex((v) => c.selectedValueIds.includes(v.id));
    return {
      key: c.key,
      present: c.present,
      values: c.selectedValueIds.map((id) => c.values.find((v) => v.id === id)?.label ?? id),
      rank: at === -1 ? null : at,
    };
  });
}

/** One classification: a select for single choice, toggle chips for multiple. */
function EntryRow({
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
  const id = `classification-${entry.key}`;
  const labels = value.map((v) => entry.values.find((x) => x.id === v)?.label ?? v);
  let control;
  if (!entry.present) {
    control = (
      <p className="text-sm italic text-muted-foreground">
        {t('admin.classifications.missingOnSpace', { defaultValue: 'This Space does not have this classification.' })}
      </p>
    );
  } else if (readOnly) {
    control = (
      <p className="text-sm text-foreground">
        {labels.length ? labels.join(', ') : <span className="text-muted-foreground">—</span>}
      </p>
    );
  } else if (entry.cardinality === 'SINGLE_SELECT') {
    control = (
      <select
        id={id}
        value={value[0] ?? ''}
        onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}
        className={cn(
          'h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm text-foreground',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        )}
      >
        <option value="">{t('admin.classifications.empty', { defaultValue: '— not filled in —' })}</option>
        {entry.values.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label || v.id}
          </option>
        ))}
      </select>
    );
  } else {
    control = (
      <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={`${id}-label`}>
        {entry.values.map((v) => {
          const on = value.includes(v.id);
          return (
            <button
              key={v.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((x) => x !== v.id) : [...value, v.id])}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                on
                  ? 'border-primary/50 bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {on && <Check className="h-3 w-3" aria-hidden />}
              {v.label || v.id}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div
      className="grid gap-1.5 border-b border-border py-3 last:border-b-0 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4"
      data-testid={id}
    >
      <label id={`${id}-label`} htmlFor={entry.present && !readOnly && entry.cardinality === 'SINGLE_SELECT' ? id : undefined} className="pt-1.5 text-sm font-medium text-foreground">
        {entry.label}
        {entry.present && entry.cardinality === 'MULTI_SELECT' && !readOnly && (
          <span className="block text-xs font-normal text-muted-foreground">
            {t('admin.classifications.multi', { defaultValue: 'more than one possible' })}
          </span>
        )}
      </label>
      <div className="min-w-0">
        {control}
        {result && (
          <p
            role={result.outcome === 'SAVED' ? 'status' : 'alert'}
            className={cn('mt-1.5 text-xs', result.outcome === 'SAVED' ? 'text-success' : 'text-destructive')}
            data-testid={`${id}-result`}
          >
            {outcomeText(t, result)}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Edit one initiative's designated classifications ON ALKEMIO, as the manager — a modal
 * over the table it was opened from. Read-only (with the reason) when the manager may not
 * update that Space. `onSaved` hands back the fresh view so the table can update its row.
 */
export function ClassificationDialog({
  nameId,
  name,
  onClose,
  onSaved,
  stage,
}: {
  nameId: string;
  name: string;
  onClose: () => void;
  onSaved?: (view: InitiativeClassificationsView) => void;
  /**
   * Layout A: the window does not write to Alkemio itself. "Apply" hands the changed
   * entries back to the page, which keeps them until the manager presses Opslaan.
   */
  stage?: {
    edits: Record<string, string[]>;
    onApply: (view: InitiativeClassificationsView, edits: Record<string, string[]>) => void;
  };
}) {
  const { t } = useTranslation();
  const [data, setData] = useState<InitiativeClassificationsView | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [edits, setEdits] = useState<Record<string, string[]>>(() => stage?.edits ?? {});
  const [results, setResults] = useState<Record<string, ClassificationChangeResult>>({});
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    adminApi
      .classifications(nameId)
      .then((v) => !cancelled && setData(v))
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [nameId, nonce]);

  // Focus moves in, Escape closes (not mid-save), focus returns to the opener on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
      opener?.focus?.();
    };
  }, []);
  // Read through refs: the handler must see the CURRENT state, not the render it was
  // registered in — right after a save the re-render can lag the key press.
  const savingRef = useRef(saving);
  savingRef.current = saving;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      containTab(e, dialogRef.current);
      if (e.key === 'Escape' && !savingRef.current) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

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
        if (list.some((r) => r.outcome === 'SAVED')) {
          notifyAdminChange();
          onSaved?.(classifications);
        }
      })
      .catch(() => setSaveFailed(true))
      .finally(() => setSaving(false));
  };

  const readOnly = !data?.canEdit;
  const title = data?.initiative.displayName ?? name;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div
        role="presentation"
        className="absolute inset-0 bg-foreground/40 backdrop-blur-[1px]"
        onClick={() => !saving && onClose()}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="classification-dialog-title"
        tabIndex={-1}
        data-testid="classification-editor"
        className={cn(
          'relative flex max-h-[90dvh] w-full flex-col rounded-t-xl border border-border bg-card shadow-xl focus:outline-none',
          'sm:max-w-2xl sm:rounded-xl',
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('admin.classifications.title', { defaultValue: 'Classifications' })}
            </p>
            <h2 id="classification-dialog-title" className="mt-0.5 text-base font-semibold text-foreground">
              {data?.initiative.url ? (
                <a href={data.initiative.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {title}
                  <ExternalLink className="ml-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
                </a>
              ) : (
                title
              )}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label={t('admin.included.edit.close', { defaultValue: 'Close' })}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-2">
          {loadError ? (
            <div role="alert" className="py-4 text-sm text-destructive">
              {t('admin.classifications.loadFailed', { defaultValue: 'This initiative could not be loaded.' })}{' '}
              <button type="button" className={smallButton} onClick={() => setNonce((n) => n + 1)}>
                {t('admin.retry', { defaultValue: 'Try again' })}
              </button>
            </div>
          ) : !data ? (
            <p className="inline-flex items-center gap-2 py-4 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t('admin.loading', { defaultValue: 'Loading…' })}
            </p>
          ) : (
            <>
              {readOnly && (
                <p
                  className="my-3 flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground"
                  data-testid="classification-readonly"
                >
                  <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>{reasonText(t, data.reason)}</span>
                </p>
              )}
              {/* No edits while a save is under way: its answer would undo them. */}
              <fieldset disabled={saving} className="min-w-0">
                {data.classifications.map((c) => (
                  <EntryRow
                    key={c.key}
                    entry={c}
                    readOnly={readOnly}
                    value={(c.entryId && edits[c.entryId]) || c.selectedValueIds}
                    onChange={(ids) => c.entryId && setEdits((prev) => ({ ...prev, [c.entryId as string]: ids }))}
                    result={c.entryId ? results[c.entryId] : undefined}
                  />
                ))}
              </fieldset>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3">
          <p className="min-w-0 flex-1 basis-[220px] text-xs text-muted-foreground">
            {saveFailed ? (
              <span role="alert" className="text-destructive">
                {t('admin.classifications.saveFailed', {
                  defaultValue: 'Saving failed. Your changes are kept — try again.',
                })}
              </span>
            ) : (
              !readOnly &&
              (stage
                ? t('admin.classifications.stagedHint', {
                    defaultValue: 'Nothing is saved yet: press Save under the table to write it to Alkemio.',
                  })
                : t('admin.classifications.savesOnAlkemio', {
                    defaultValue: 'Saved on Alkemio, as you. Every dashboard reads them from there.',
                  }))
            )}
          </p>
          <div className="flex shrink-0 gap-2">
            <button type="button" className={smallButton} onClick={onClose} disabled={saving}>
              {readOnly || (changed.length === 0 && !stage)
                ? t('admin.included.edit.close', { defaultValue: 'Close' })
                : t('admin.classifications.cancel', { defaultValue: 'Cancel' })}
            </button>
            {!readOnly && data && stage && (
              <button
                type="button"
                className={primarySmallButton}
                onClick={() => {
                  stage.onApply(
                    data,
                    Object.fromEntries(changed.map((c) => [c.entryId as string, edits[c.entryId as string]])),
                  );
                  onClose();
                }}
                data-testid="classification-apply"
              >
                {t('admin.classifications.apply', { defaultValue: 'Apply' })}
              </button>
            )}
            {!readOnly && data && !stage && (
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

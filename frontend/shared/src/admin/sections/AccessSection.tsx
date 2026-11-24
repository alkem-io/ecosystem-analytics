import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, ExternalLink, Loader2, Pencil, Plus, Search, Settings2, UserRound, X } from 'lucide-react';
import type { GateLink } from '@server/types/access.js';
import type { AdminAccessView, SpaceCandidate } from '@server/types/admin.js';
import { cn } from '../../lib/cn.js';
import { AdminApiError, adminApi } from '../api.js';
import { notifyAdminChange } from '../changes.js';
import { Section, primarySmallButton, smallButton, textInput, useSectionData } from '../Section.js';

type T = ReturnType<typeof useTranslation>['t'];

/**
 * One access set, read-only: what it grants, then its Spaces one per row — name linked
 * to Alkemio, short name beneath, and a warning on a Space Alkemio does not know.
 */
function AccessCard({
  icon: Icon,
  title,
  hint,
  spaces,
  testId,
}: {
  icon: typeof Eye;
  title: string;
  hint: string;
  spaces: GateLink[];
  testId: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="min-w-0 rounded-lg border border-border">
      <div className="flex items-start gap-3 border-b border-border bg-muted/40 px-4 py-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card text-muted-foreground ring-1 ring-border">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
      <ul className="divide-y divide-border" data-testid={testId}>
        {spaces.map((space) => (
          <li key={space.key} className="flex min-w-0 items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              {space.exists === 'no' ? (
                <span className="block truncate text-sm font-medium text-destructive">{space.key}</span>
              ) : (
                <a
                  href={space.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-sm font-medium text-foreground hover:text-primary hover:underline"
                >
                  {space.displayName}
                </a>
              )}
              <span className="block truncate text-xs text-muted-foreground">{space.key}</span>
            </div>
            {space.exists === 'no' ? (
              <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                {t('admin.access.notFound', { defaultValue: 'not found on Alkemio' })}
              </span>
            ) : (
              <a
                href={space.url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t('admin.access.open', { defaultValue: 'Open {{name}} on Alkemio', name: space.displayName })}
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            )}
          </li>
        ))}
        {spaces.length === 0 && (
          <li className="px-4 py-2.5 text-sm text-muted-foreground">
            {t('admin.access.none', { defaultValue: 'no Space configured' })}
          </li>
        )}
      </ul>
    </div>
  );
}

/** One Space in an access set while editing: its key (what is saved) and what to show. */
interface Item {
  key: string;
  displayName: string;
  url: string | null;
}

const fromLinks = (links: GateLink[]): Item[] => links.map((l) => ({ key: l.key, displayName: l.displayName, url: l.url }));

/**
 * A pasted Alkemio link or path → what the server parses (it accepts both). Shown as typed
 * until saved; the server checks it exists and returns its name.
 */
const looksLikeRef = (text: string) => /[/.]/.test(text);

function errorText(t: T, body: { error?: string; role?: string; item?: string }): string {
  const role =
    body.role === 'admins'
      ? t('admin.access.adminsLabel', { defaultValue: 'Manage' })
      : t('admin.access.viewersLabel', { defaultValue: 'View' });
  switch (body.error) {
    case 'WOULD_LOCK_OUT':
      return t('admin.access.error.lockOut', {
        defaultValue:
          'Not saved: you would no longer be able to manage the monitor yourself. Keep a Space among “Manage” of which you are an admin.',
      });
    case 'EMPTY_SET':
      return t('admin.access.error.empty', { defaultValue: '“{{role}}” needs at least one Space.', role });
    case 'NOT_FOUND':
      return t('admin.access.error.notFound', { defaultValue: '{{item}} was not found on Alkemio.', item: body.item });
    case 'DUPLICATE':
      return t('admin.access.error.duplicate', { defaultValue: '{{item}} is listed twice.', item: body.item });
    case 'UNPARSEABLE':
      return t('admin.access.error.unparseable', {
        defaultValue: '“{{item}}” is not an Alkemio Space link or name.',
        item: body.item,
      });
    case 'TOO_MANY':
      return t('admin.access.error.tooMany', { defaultValue: 'Too many Spaces for “{{role}}”.', role });
    case 'CONFLICT':
      return t('admin.access.error.conflict', {
        defaultValue: 'Someone else changed the access meanwhile. Load the current settings and try again.',
      });
    case 'COULD_NOT_VERIFY':
      return t('admin.access.error.unverified', {
        defaultValue: 'Alkemio could not be reached to check this. Try again in a moment.',
      });
    default:
      return t('admin.access.error.generic', { defaultValue: 'The change could not be saved.' });
  }
}

/** Add a Space to a set: search by name, or paste a link (subspaces too). */
function AddSpace({ onAdd, label }: { onAdd: (item: Item) => void; label: string }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [results, setResults] = useState<SpaceCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const trimmed = text.trim();
  const isRef = looksLikeRef(trimmed);

  useEffect(() => {
    if (isRef || trimmed.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      adminApi
        .searchSpaces(trimmed)
        .then((r) => !cancelled && setResults(r.results))
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setSearching(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, isRef]);

  const add = (item: Item) => {
    onAdd(item);
    setText('');
    setResults([]);
  };

  return (
    <div className="mt-2">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (isRef) add({ key: trimmed, displayName: trimmed, url: null });
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            className={cn(textInput, 'w-full pl-8')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('admin.access.addPlaceholder', { defaultValue: 'Search by name, or paste a link' })}
            aria-label={label}
          />
        </div>
        {isRef && (
          <button type="submit" className={smallButton}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {t('admin.access.addLink', { defaultValue: 'Add' })}
          </button>
        )}
      </form>
      {searching && <Loader2 className="mt-2 h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}
      {results.length > 0 && (
        <ul className="mt-1 max-h-56 divide-y divide-border overflow-auto rounded-lg border border-border">
          {results.map((r) => (
            <li key={r.nameId}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => add({ key: r.nameId, displayName: r.displayName, url: r.url })}
              >
                <span className="min-w-0 truncate text-foreground">{r.displayName}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{r.nameId}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SetEditor({
  title,
  hint,
  icon: Icon,
  items,
  onChange,
  testId,
}: {
  title: string;
  hint: string;
  icon: typeof Eye;
  items: Item[];
  onChange: (items: Item[]) => void;
  testId: string;
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="min-w-0 rounded-lg border border-border p-3" data-testid={testId}>
      <legend className="flex items-center gap-2 px-1 text-sm font-medium text-foreground">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
        {title}
      </legend>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li
            key={item.key}
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted/50 py-0.5 pl-2.5 pr-1 text-sm"
          >
            <span className="min-w-0 truncate text-foreground" title={item.key}>
              {item.displayName}
            </span>
            <button
              type="button"
              className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => onChange(items.filter((i) => i.key !== item.key))}
              aria-label={t('admin.access.remove', { defaultValue: 'Remove {{name}}', name: item.displayName })}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-sm text-destructive">{t('admin.access.needOne', { defaultValue: 'At least one Space is needed.' })}</li>
        )}
      </ul>
      <AddSpace
        label={t('admin.access.addTo', { defaultValue: 'Add a Space to “{{set}}”', set: title })}
        onAdd={(item) => !items.some((i) => i.key === item.key) && onChange([...items, item])}
      />
    </fieldset>
  );
}

function Editor({
  data,
  onSaved,
  onCancel,
}: {
  data: AdminAccessView;
  onSaved: (next: AdminAccessView) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [viewers, setViewers] = useState<Item[]>(fromLinks(data.viewers));
  const [admins, setAdmins] = useState<Item[]>(fromLinks(data.admins));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  const save = () => {
    setSaving(true);
    setError(null);
    adminApi
      .saveAccess({ baseRevision: data.revision, viewers: viewers.map((i) => i.key), admins: admins.map((i) => i.key) })
      .then((next) => {
        notifyAdminChange();
        onSaved(next);
      })
      .catch((err: unknown) => {
        const body = err instanceof AdminApiError ? err.body : {};
        setConflict(body.error === 'CONFLICT');
        setError(errorText(t, body as { error?: string }));
      })
      .finally(() => setSaving(false));
  };

  return (
    <div className="space-y-3" data-testid="access-editor">
      <div className="grid gap-3 md:grid-cols-2">
        <SetEditor
          testId="access-edit-viewers"
          icon={Eye}
          title={t('admin.access.viewersLabel', { defaultValue: 'View' })}
          hint={t('admin.access.viewersHint', { defaultValue: 'Members of any of these Spaces can view the monitor.' })}
          items={viewers}
          onChange={setViewers}
        />
        <SetEditor
          testId="access-edit-admins"
          icon={Settings2}
          title={t('admin.access.adminsLabel', { defaultValue: 'Manage' })}
          hint={t('admin.access.adminsHint', {
            defaultValue: 'Admins of any of these Spaces can also change the settings.',
          })}
          items={admins}
          onChange={setAdmins}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {t('admin.access.saveNote', {
          defaultValue:
            'Applies straight away, to everyone. You must remain a manager yourself: a change that would take that away is not saved.',
        })}
      </p>
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="access-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {conflict ? (
          <button type="button" className={primarySmallButton} onClick={onCancel}>
            {t('admin.access.reload', { defaultValue: 'Load the current settings' })}
          </button>
        ) : (
          <button
            type="button"
            className={primarySmallButton}
            disabled={saving || viewers.length === 0 || admins.length === 0}
            onClick={save}
            data-testid="access-save"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            {t('admin.access.save', { defaultValue: 'Save' })}
          </button>
        )}
        <button type="button" className={smallButton} onClick={onCancel} disabled={saving}>
          {t('admin.access.cancel', { defaultValue: 'Cancel' })}
        </button>
      </div>
    </div>
  );
}

/**
 * Who may use the monitor and who may manage it (FR-005, FR-010), where the signed-in
 * manager stands — and, on a gated deployment, the place to change both. The sets start
 * as the deployment configuration; once saved here, the saved sets apply. Membership
 * itself is managed on Alkemio.
 */
export function AccessSection() {
  const { t } = useTranslation();
  const { data, setData, error, loading, retry } = useSectionData(() => adminApi.access());
  const [editing, setEditing] = useState(false);

  const you = data
    ? data.me.manager
      ? t('admin.access.youCanManage', { defaultValue: 'You can view and manage the monitor.' })
      : data.me.viewer
        ? t('admin.access.youCanView', { defaultValue: 'You can view the monitor, but not manage it.' })
        : t('admin.access.youCannot', { defaultValue: 'You cannot view the monitor.' })
    : '';

  return (
    <Section
      id="access"
      title={t('admin.access.title', { defaultValue: 'Access' })}
      loading={loading}
      error={error}
      onRetry={retry}
      actions={
        data?.editable && !editing ? (
          <button type="button" className={smallButton} onClick={() => setEditing(true)} data-testid="access-edit">
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            {t('admin.access.edit', { defaultValue: 'Change' })}
          </button>
        ) : undefined
      }
    >
      {data && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-4 py-3" data-testid="admin-me">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card text-muted-foreground ring-1 ring-border">
              <UserRound className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{data.me.displayName}</p>
              <p className="text-xs text-muted-foreground">{you}</p>
            </div>
            {(data.me.manager || data.me.viewer) && (
              <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                {data.me.manager
                  ? t('admin.access.roleManager', { defaultValue: 'Manager' })
                  : t('admin.access.roleViewer', { defaultValue: 'User' })}
              </span>
            )}
          </div>
          {editing ? (
            <Editor
              data={data}
              onSaved={(next) => {
                setData(next);
                setEditing(false);
              }}
              onCancel={() => {
                setEditing(false);
                retry();
              }}
            />
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <AccessCard
                  icon={Eye}
                  testId="admin-viewer-spaces"
                  title={t('admin.access.viewersLabel', { defaultValue: 'View' })}
                  hint={t('admin.access.viewersHint', { defaultValue: 'Members of any of these Spaces can view the monitor.' })}
                  spaces={data.viewers}
                />
                <AccessCard
                  icon={Settings2}
                  testId="admin-admin-spaces"
                  title={t('admin.access.adminsLabel', { defaultValue: 'Manage' })}
                  hint={t('admin.access.adminsHint', {
                    defaultValue: 'Admins of any of these Spaces can also change the settings.',
                  })}
                  spaces={data.admins}
                />
              </div>
              <p className="text-xs text-muted-foreground" data-testid="access-source">
                {!data.editable
                  ? t('admin.access.notEditable', {
                      defaultValue: 'This deployment leaves the monitor open to everyone; that cannot be changed here.',
                    })
                  : data.source === 'settings'
                    ? t('admin.access.fromSettings', {
                        defaultValue:
                          'Set here in the settings (who and when: see the change log). Who is a member or admin of these Spaces is managed on Alkemio.',
                      })
                    : t('admin.access.fromConfig', {
                        defaultValue:
                          'From the deployment configuration until changed here. Who is a member or admin of these Spaces is managed on Alkemio.',
                      })}
              </p>
            </>
          )}
        </div>
      )}
    </Section>
  );
}

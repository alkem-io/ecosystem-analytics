import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search } from 'lucide-react';
import { api } from '@ea/shared';
import type { SpaceSelectionItem } from '@server/types/api.js';

interface SpacePickerProps {
  /** nameIds already in the effective set, hidden from the add list. */
  excludeNameIds: string[];
  onAdd: (space: { nameId: string; displayName: string }) => void;
}

/**
 * Searchable picker to add individual spaces on top of the hub set (US2, FR-011).
 * Sourced from the existing GET /api/spaces (authorised L0 spaces only).
 */
export function SpacePicker({ excludeNameIds, onAdd }: SpacePickerProps) {
  const { t } = useTranslation();
  const [spaces, setSpaces] = useState<SpaceSelectionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<SpaceSelectionItem[]>('/api/spaces')
      .then((res) => {
        if (!cancelled) setSpaces(res ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Close the result list on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const excluded = useMemo(() => new Set(excludeNameIds), [excludeNameIds]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return spaces
      .filter((s) => !excluded.has(s.nameId))
      .filter((s) => (q ? s.displayName.toLowerCase().includes(q) : true))
      .slice(0, 50);
  }, [spaces, excluded, query]);

  function handleAdd(space: SpaceSelectionItem) {
    onAdd({ nameId: space.nameId, displayName: space.displayName });
    setQuery('');
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5">
        <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={t('picker.placeholder')}
          aria-label={t('picker.placeholder')}
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-card shadow-md">
          {loading && (
            <div className="px-3 py-2 text-sm text-muted-foreground">{t('states.loading')}</div>
          )}
          {error && (
            <div className="px-3 py-2 text-sm text-destructive">{t('states.error')}</div>
          )}
          {!loading && !error && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">{t('picker.noResults')}</div>
          )}
          {!loading &&
            !error &&
            results.map((space) => (
              <button
                key={space.nameId}
                type="button"
                onClick={() => handleAdd(space)}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <span className="truncate">{space.displayName}</span>
                <Plus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

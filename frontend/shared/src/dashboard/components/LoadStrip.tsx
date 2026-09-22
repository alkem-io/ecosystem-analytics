/**
 * Feature 025 — the ONE progress indicator of the dashboard (spec FR-007/FR-007a/FR-008).
 *
 * A persistent, non-blocking strip below the tab row that lists what is loading for
 * the current selection: each item by name, who asked for it, its stage, a
 * done-of-total bar where the BFF reports one, the Space currently being fetched, and
 * a Retry for anything that failed. It reads the shared plan, so it is identical on
 * every tab and survives tab switches; it renders nothing when there is nothing to say.
 */
import { useTranslation } from 'react-i18next';
import { Loader2, AlertTriangle, RotateCcw } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { useSelectionContext } from '../hooks/SelectionContext.js';
import { useDashboardData } from '../data/DashboardDataProvider.js';
import { useLoadPlan } from '../data/hooks.js';
import type { LoadItem } from '../data/store.js';

export function LoadStrip() {
  const { t } = useTranslation();
  const plan = useLoadPlan();
  const { retry } = useDashboardData();
  const { selectedSpaces } = useSelectionContext();

  const visible = plan.items.filter((i) => i.stage !== 'done');
  if (visible.length === 0) return null;

  const spaceName = (nameId: string) =>
    selectedSpaces.find((s) => s.nameId === nameId)?.displayName ?? nameId;

  return (
    <div
      data-testid="load-strip"
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-[var(--border)] bg-[var(--surface-raised)] px-4 py-1.5 text-xs text-[var(--text-secondary)]"
    >
      {visible.map((item) => (
        <LoadStripItem key={item.key} item={item} onRetry={() => retry(item.key)} spaceName={spaceName} t={t} />
      ))}
    </div>
  );
}

function LoadStripItem({
  item,
  onRetry,
  spaceName,
  t,
}: {
  item: LoadItem;
  onRetry: () => void;
  spaceName: (nameId: string) => string;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const failed = item.stage === 'failed';
  const by = item.requester === 'core' ? '' : t(`load.by.${item.requester}`);
  const hasTotal = item.total != null && item.total > 0;
  const pct = hasTotal ? Math.round(((item.done ?? 0) / item.total!) * 100) : null;

  return (
    <div data-testid={`load-item-${item.key}`} data-stage={item.stage} className="flex items-center gap-2">
      {failed ? (
        <AlertTriangle className="h-3.5 w-3.5 text-[var(--error)]" aria-hidden />
      ) : (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--primary)]" aria-hidden />
      )}
      <span className={cn('font-medium', failed && 'text-[var(--error)]')}>
        {t(`load.item.${item.key}`)}
      </span>
      <span>{failed ? t(`load.failed.${item.key}`, { defaultValue: t('load.failed.generic') }) : t(`load.stage.${item.stage}`)}</span>
      {!failed && hasTotal && (
        <span className="flex items-center gap-1.5" data-testid="load-progress">
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--border)]">
            <span className="block h-full rounded-full bg-[var(--primary)] transition-[width]" style={{ width: `${pct}%` }} />
          </span>
          <span className="tabular-nums">{t('load.progress', { done: item.done ?? 0, total: item.total })}</span>
        </span>
      )}
      {!failed && item.current && <span className="truncate">{t('load.current', { name: spaceName(item.current) })}</span>}
      {by && <span className="text-[var(--text-muted)]">{by}</span>}
      {failed && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-1.5 py-0.5 text-[var(--foreground)] hover:bg-[var(--surface)]"
        >
          <RotateCcw className="h-3 w-3" aria-hidden />
          {t('load.retry')}
        </button>
      )}
    </div>
  );
}

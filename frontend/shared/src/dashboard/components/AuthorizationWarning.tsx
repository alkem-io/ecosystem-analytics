import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ChevronDown, ExternalLink, FlaskConical } from 'lucide-react';
import { cn, useAppConfig, useIsCompact } from '@ea/shared';
import { useAccessReport } from '../hooks/AccessLevelContext.js';

const link = 'font-medium text-primary underline-offset-2 hover:underline';

/**
 * Prominent, recognisably "warning"-styled notice under the header (FR-026/027). It makes
 * two points, so nobody mistakes what they see for a data leak or a finished product:
 *
 * 1. You only see what YOU may see on Alkemio — and (feature 027, gated apps) you have
 *    access to this monitor as a member of the named Space(s), linked.
 * 2. (When the app sets `prototypeInfoUrl`) this is a prototype for wider feedback, with
 *    a link to where more information lives.
 *
 * On a phone the full text costs a fifth of the viewport on every tab, so below `lg` it
 * collapses to one line and expands on tap. It stays a `role="note"` with its full text
 * either way — only visually condensed, never hidden from assistive technology.
 */
export function AuthorizationWarning() {
  const { t } = useTranslation();
  const compact = useIsCompact();
  const { prototypeInfoUrl } = useAppConfig();
  const [expanded, setExpanded] = useState(false);
  const collapsed = compact && !expanded;
  const access = useAccessReport();
  const spaces = access?.gated ? access.viewerSpaces : [];

  const accessLine = (
    <p className={cn('min-w-0', collapsed && 'truncate')} data-testid="auth-warning">
      <span className="font-semibold">{t('warning.authTitle')}: </span>
      {t('warning.authBody')}
      {spaces.length > 0 && (
        <span data-testid="auth-access-via">
          {' '}
          {t('warning.accessViaPrefix', { defaultValue: 'You have access to this monitor as a member of' })}{' '}
          {spaces.map((s, i) => (
            <Fragment key={s.key}>
              {i > 0 && (i === spaces.length - 1 ? ` ${t('warning.or', { defaultValue: 'or' })} ` : ', ')}
              <a href={s.url} target="_blank" rel="noopener noreferrer" className={link}>
                {s.displayName}
              </a>
            </Fragment>
          ))}
          .
        </span>
      )}
    </p>
  );

  const prototypeLine = prototypeInfoUrl ? (
    <p className={cn('min-w-0', collapsed && 'hidden')} data-testid="prototype-notice">
      <FlaskConical className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-warning" aria-hidden />
      <span className="font-semibold">{t('warning.prototypeTitle', { defaultValue: 'Prototype' })}: </span>
      {t('warning.prototypeBody', {
        defaultValue: 'this monitor is still a prototype, shared to gather wider feedback. More information:',
      })}{' '}
      <a href={prototypeInfoUrl} target="_blank" rel="noopener noreferrer" className={link}>
        {t('warning.prototypeLink', { defaultValue: 'the Innovation monitor Space' })}
        <ExternalLink className="ml-0.5 inline h-3 w-3 align-[-1px]" aria-hidden />
      </a>
    </p>
  ) : null;

  const shell =
    'flex w-full items-start gap-2 border-b border-warning/40 bg-warning/10 px-3 py-2 text-left text-sm text-foreground sm:px-6';

  if (!compact) {
    return (
      <div role="note" className={shell}>
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 space-y-0.5">
          {accessLine}
          {prototypeLine}
        </div>
      </div>
    );
  }

  // Compact: the toggle is the icon + chevron row, so the links inside stay plain links.
  return (
    <div role="note" className={cn(shell, 'shrink-0 items-start')}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
      <div className="min-w-0 flex-1 space-y-0.5">
        {accessLine}
        {prototypeLine}
      </div>
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={
          expanded
            ? t('warning.collapse', { defaultValue: 'Show less' })
            : t('warning.expand', { defaultValue: 'Show more' })
        }
        onClick={() => setExpanded((v) => !v)}
        className="-my-1 shrink-0 rounded p-1 text-warning hover:bg-warning/15"
      >
        <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} aria-hidden />
      </button>
    </div>
  );
}

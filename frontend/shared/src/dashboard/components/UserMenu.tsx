import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Avatar from '@radix-ui/react-avatar';
import { Info, LogOut } from 'lucide-react';
import { cn, fetchMe, logout, proxyImageUrl, type MeResponse } from '@ea/shared';
import { LanguageSwitcher } from './LanguageSwitcher.js';
import { AboutDialog } from './AboutDialog.js';

/** Derive up-to-two-letter initials from a display name (avatar fallback). */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Header user control: an avatar button that opens a dropdown containing the
 * signed-in user's name, the language switch, and a logout action.
 *
 * The avatar uses the shared `fetchMe`/`MeResponse` identity (falling back to
 * initials when no avatar image is available). The dropdown is a lightweight
 * popover with outside-click + Escape dismissal so it stays buildable without
 * extra dependencies, while remaining keyboard- and screen-reader-friendly.
 */
export function UserMenu() {
  const { t } = useTranslation();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchMe().then((res) => {
      if (!cancelled) setMe(res);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Dismiss on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!me) return null;

  const proxiedAvatar = proxyImageUrl(me.avatarUrl);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('user.menu')}
        title={me.displayName}
        className={cn(
          'flex items-center gap-2 rounded-full border border-border bg-card p-0.5 pr-2.5 transition-colors',
          'hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        )}
      >
        <Avatar.Root className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10">
          {proxiedAvatar && (
            <Avatar.Image
              src={proxiedAvatar}
              alt=""
              className="h-full w-full object-cover"
            />
          )}
          <Avatar.Fallback className="text-xs font-semibold text-primary">
            {initials(me.displayName)}
          </Avatar.Fallback>
        </Avatar.Root>
        <span className="hidden max-w-[12rem] truncate text-sm font-medium text-foreground sm:inline">
          {me.displayName}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t('user.menu')}
          className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-lg border border-border bg-card shadow-lg"
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <Avatar.Root className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10">
              {proxiedAvatar && (
                <Avatar.Image
                  src={proxiedAvatar}
                  alt=""
                  className="h-full w-full object-cover"
                />
              )}
              <Avatar.Fallback className="text-sm font-semibold text-primary">
                {initials(me.displayName)}
              </Avatar.Fallback>
            </Avatar.Root>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">
                {me.displayName}
              </div>
              <div className="truncate text-xs text-muted-foreground">{t('user.signedIn')}</div>
            </div>
          </div>

          <div className="h-px bg-border" role="separator" />

          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-xs font-medium text-muted-foreground">{t('language.label')}</span>
            <LanguageSwitcher />
          </div>

          <div className="h-px bg-border" role="separator" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setAboutOpen(true);
            }}
            className={cn(
              'flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-foreground transition-colors',
              'hover:bg-muted focus:bg-muted focus:outline-none',
            )}
          >
            <Info className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {t('about.title')}
          </button>

          <div className="h-px bg-border" role="separator" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void logout();
            }}
            className={cn(
              'flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-foreground transition-colors',
              'hover:bg-muted focus:bg-muted focus:outline-none',
            )}
          >
            <LogOut className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {t('user.logout')}
          </button>
        </div>
      )}

      {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}
    </div>
  );
}

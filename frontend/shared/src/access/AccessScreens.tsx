import type { ReactNode } from 'react';
import { ExternalLink, Loader2, LogOut, RefreshCw, ShieldAlert, ShieldX } from 'lucide-react';
import { cn } from '../lib/cn.js';

/**
 * The two screens a signed-in person sees when an application's access gate does not
 * admit them (feature 026). Shared by every SPA: the dashboards pass translated
 * strings, the Explorer passes {@link ACCESS_STRINGS_EN}. Same centred card on the
 * brand background as the login screen (FR-016), responsive down to 390 px.
 */

export interface AccessStrings {
  /** "No access" screen */
  noAccessTitle: string;
  /** Explanation; `{{space}}` is replaced with the gate Space's name. */
  noAccessBody: string;
  openSpace: string;
  checkAgain: string;
  checking: string;
  signOut: string;
  /** Prefix before the account name, e.g. "Signed in as". */
  signedInAs: string;
  /** "Could not verify" screen */
  unverifiedTitle: string;
  unverifiedBody: string;
  tryAgain: string;
}

export const ACCESS_STRINGS_EN: AccessStrings = {
  noAccessTitle: 'You do not have access',
  noAccessBody:
    'Access to this application is granted to members of {{space}} on Alkemio. Ask to join it there, then check again.',
  openSpace: 'Open {{space}} on Alkemio',
  checkAgain: 'Check again',
  checking: 'Checking…',
  signOut: 'Sign out',
  signedInAs: 'Signed in as',
  unverifiedTitle: 'We could not verify your access',
  unverifiedBody:
    'Alkemio did not answer in time, so we could not confirm your access. This is usually temporary — please try again.',
  tryAgain: 'Try again',
};

const fill = (text: string, space: string) => text.split('{{space}}').join(space);

function AccessCard({
  icon,
  logo,
  children,
}: {
  icon: ReactNode;
  logo?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-primary px-4 py-12 sm:px-6">
      <main className="relative w-full max-w-lg rounded-2xl bg-card px-6 py-8 text-center shadow-2xl sm:px-12 sm:py-10">
        {logo && <div className="mb-6 flex items-center justify-center">{logo}</div>}
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </div>
        {children}
      </main>
    </div>
  );
}

const primaryButton = cn(
  'inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg px-4',
  'bg-primary text-sm font-semibold text-primary-foreground shadow-md',
  'transition-colors hover:bg-primary-hover active:translate-y-px',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  'disabled:cursor-wait disabled:opacity-80',
);

const secondaryButton = cn(
  'inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-border px-4',
  'text-sm font-medium text-foreground transition-colors hover:bg-muted',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
);

export interface NoAccessScreenProps {
  /** The signed-in account's display name. */
  accountName: string;
  gate: { displayName: string; url: string };
  strings: AccessStrings;
  checking: boolean;
  onCheckAgain: () => void;
  onSignOut: () => void;
  logo?: ReactNode;
}

/** FR-013: who you are, why you are refused, where to ask, check again, sign out. */
export function NoAccessScreen({
  accountName,
  gate,
  strings,
  checking,
  onCheckAgain,
  onSignOut,
  logo,
}: NoAccessScreenProps) {
  return (
    <AccessCard logo={logo} icon={<ShieldX className="h-6 w-6" aria-hidden />}>
      <h1 className="mt-5 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
        {strings.noAccessTitle}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground" data-testid="access-account">
        {strings.signedInAs} <span className="font-medium text-foreground">{accountName}</span>
      </p>
      <p
        className="mt-5 text-sm leading-relaxed text-muted-foreground"
        data-testid="access-explanation"
      >
        {fill(strings.noAccessBody, gate.displayName)}
      </p>
      <p className="mt-4">
        <a
          href={gate.url}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="access-gate-link"
          className="break-words text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          {fill(strings.openSpace, gate.displayName)}
          <ExternalLink className="ml-1.5 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
        </a>
      </p>
      <div className="mt-8 flex flex-col gap-3">
        <button type="button" className={primaryButton} disabled={checking} onClick={onCheckAgain}>
          {checking ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden />
          )}
          {checking ? strings.checking : strings.checkAgain}
        </button>
        <button type="button" className={secondaryButton} onClick={onSignOut}>
          <LogOut className="h-4 w-4" aria-hidden />
          {strings.signOut}
        </button>
      </div>
    </AccessCard>
  );
}

export interface AccessCheckFailedScreenProps {
  strings: AccessStrings;
  checking: boolean;
  onRetry: () => void;
  onSignOut: () => void;
  logo?: ReactNode;
}

/** FR-014: a temporary failure — never tells a member they lack access. */
export function AccessCheckFailedScreen({
  strings,
  checking,
  onRetry,
  onSignOut,
  logo,
}: AccessCheckFailedScreenProps) {
  return (
    <AccessCard logo={logo} icon={<ShieldAlert className="h-6 w-6" aria-hidden />}>
      <h1 className="mt-5 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
        {strings.unverifiedTitle}
      </h1>
      <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{strings.unverifiedBody}</p>
      <div className="mt-8 flex flex-col gap-3">
        <button type="button" className={primaryButton} disabled={checking} onClick={onRetry}>
          {checking ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden />
          )}
          {checking ? strings.checking : strings.tryAgain}
        </button>
        <button type="button" className={secondaryButton} onClick={onSignOut}>
          <LogOut className="h-4 w-4" aria-hidden />
          {strings.signOut}
        </button>
      </div>
    </AccessCard>
  );
}

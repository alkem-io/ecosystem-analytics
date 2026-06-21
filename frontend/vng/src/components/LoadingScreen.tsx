import { Loader2 } from 'lucide-react';
import { VngLogo } from './VngLogo.js';

/**
 * Full-screen branded loading state, shown while the app resolves the shared
 * `ea_session` identity (so the user never sees a blank/frozen screen).
 */
export function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 bg-background text-foreground">
      <VngLogo className="h-10 w-auto" />
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        <span>{message}</span>
      </div>
    </div>
  );
}

import { useSyncExternalStore } from 'react';

/**
 * "Something in the settings was saved" — so the change log under the tabs reloads,
 * whichever tab made the change. A counter, nothing more.
 */
let count = 0;
const listeners = new Set<() => void>();

export function notifyAdminChange(): void {
  count += 1;
  for (const l of listeners) l();
}

export function useAdminChangeCount(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => count,
    () => count,
  );
}

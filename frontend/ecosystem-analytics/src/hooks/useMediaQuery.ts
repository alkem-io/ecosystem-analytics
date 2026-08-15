import { useCallback, useSyncExternalStore } from 'react';

/**
 * Breakpoints — kept in lockstep with the `@media` rules in the CSS modules.
 * Changing one of these means changing the matching CSS breakpoint too.
 */
export const BREAKPOINT_MOBILE = 767;
export const BREAKPOINT_TABLET = 1023;

export const MOBILE_QUERY = `(max-width: ${BREAKPOINT_MOBILE}px)`;
export const COMPACT_QUERY = `(max-width: ${BREAKPOINT_TABLET}px)`;
/** Devices driven by a finger rather than a mouse — no reliable hover. */
export const COARSE_POINTER_QUERY = '(hover: none) and (pointer: coarse)';
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Subscribe to a CSS media query. Uses `useSyncExternalStore` so the value is
 * read during render (no first-paint flash of the wrong layout) and stays in
 * sync across orientation changes and desktop window resizes.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  }, [query]);

  // Server/SSR snapshot — the app is client-rendered, but keep this total.
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** Phone-sized viewport: panels become sheets, the canvas goes full-bleed. */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}

/** Phone *or* tablet: the top bar collapses its secondary actions into a menu. */
export function useIsCompact(): boolean {
  return useMediaQuery(COMPACT_QUERY);
}

/** True on touch-first devices, where hover-only affordances never fire. */
export function useIsTouch(): boolean {
  return useMediaQuery(COARSE_POINTER_QUERY);
}

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery(REDUCED_MOTION_QUERY);
}

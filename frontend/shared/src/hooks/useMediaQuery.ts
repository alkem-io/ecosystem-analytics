import { useCallback, useSyncExternalStore } from 'react';

/**
 * Viewport breakpoints for the shared dashboard shell.
 *
 * These are deliberately the SAME numbers as Tailwind's `md` (768px) and `lg`
 * (1024px) minimums, so a JS branch and its `md:` / `lg:` counterpart in the
 * markup can never disagree about which layout is showing. Changing one of
 * these means auditing the matching utility prefixes.
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

  // Server/SSR snapshot — the apps are client-rendered, but keep this total.
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** Phone-sized viewport: tables become card lists, chrome loses its padding. */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}

/**
 * Phone *or* tablet — i.e. anything below Tailwind's `lg`. This is the line the
 * dashboard shell uses: below it the selection panel is an off-canvas drawer
 * rather than a permanent 18rem column, because 18rem of a 768px viewport is a
 * quarter of the screen spent on chrome.
 */
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

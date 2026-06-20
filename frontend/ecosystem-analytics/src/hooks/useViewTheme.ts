/**
 * useViewTheme — provides theme-aware colors for SVG rendering in view components.
 *
 * Since SVG inline attributes can't consume CSS custom properties directly,
 * this hook reads the current data-theme attribute and returns the right palette.
 */

import { useMemo, useSyncExternalStore } from 'react';

type ThemeMode = 'light' | 'dark';

function subscribe(cb: () => void) {
  const observer = new MutationObserver(cb);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

function getSnapshot(): ThemeMode {
  return (document.documentElement.getAttribute('data-theme') as ThemeMode) || 'light';
}

export interface ViewThemeColors {
  /** Background of the SVG canvas */
  bg: string;
  /** Primary text */
  text: string;
  /** Muted/secondary text */
  textMuted: string;
  /** Border / stroke color */
  border: string;
  /** Cell/arc stroke color */
  stroke: string;
  /** Selection highlight */
  selection: string;
  /** Semi-transparent overlay surface for badges/tooltips */
  badgeBg: string;
  /** Private hatch stroke */
  hatchStroke: string;
  /** Text shadow for labels (CSS text-shadow value) */
  labelShadow: string;
  /** Whether dark mode is active */
  isDark: boolean;
}

const LIGHT_COLORS: ViewThemeColors = {
  bg: '#f8fafc',
  text: '#1e293b',
  textMuted: '#64748b',
  border: '#e2e8f0',
  stroke: '#cbd5e1',
  selection: '#f59e0b',
  badgeBg: 'rgba(255, 255, 255, 0.85)',
  hatchStroke: 'rgba(0, 0, 0, 0.08)',
  labelShadow: '0 1px 2px rgba(255,255,255,0.8)',
  isDark: false,
};

const DARK_COLORS: ViewThemeColors = {
  bg: '#0f172a',
  text: '#e2e8f0',
  textMuted: '#94a3b8',
  border: '#334155',
  stroke: '#0f172a',
  selection: '#f59e0b',
  badgeBg: 'rgba(15, 23, 42, 0.7)',
  hatchStroke: 'rgba(255, 255, 255, 0.15)',
  labelShadow: '0 1px 2px rgba(0,0,0,0.6)',
  isDark: true,
};

export function useViewTheme(): ViewThemeColors {
  const mode = useSyncExternalStore(subscribe, getSnapshot);
  return useMemo(() => (mode === 'dark' ? DARK_COLORS : LIGHT_COLORS), [mode]);
}

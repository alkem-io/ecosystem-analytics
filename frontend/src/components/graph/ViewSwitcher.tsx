/**
 * ViewSwitcher — horizontal tab bar for selecting the active visualization mode.
 * Hides Timeline/Temporal tabs when hasTemporalData is false.
 */

import { useCallback } from 'react';
import { type ViewMode, VIEW_MODE_LABELS } from '../../types/views.js';
import styles from './ViewSwitcher.module.css';

/** Simple SVG icons for each view mode (16×16) */
const VIEW_ICONS: Record<ViewMode, string> = {
  'force-graph': '⊛',     // network
  'treemap': '▦',          // grid
  'sunburst': '◎',         // concentric
  'chord': '◠',            // arc
  'timeline': '▤',         // stacked bars
  'temporal-force': '⏱',   // clock
};

/** Views that require timeline series data (timeSeries[]) */
const TIMELINE_VIEWS: Set<ViewMode> = new Set(['timeline']);

/** Ordered list of view modes for tab rendering */
const VIEW_ORDER: ViewMode[] = [
  'force-graph',
  'treemap',
  'sunburst',
  'chord',
  'timeline',
  'temporal-force',
];

interface ViewSwitcherProps {
  activeView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  /** Whether timeline series data is available (hides Timeline tab if not) */
  hasTimelineData: boolean;
}

export default function ViewSwitcher({ activeView, onViewChange, hasTimelineData }: ViewSwitcherProps) {
  const visibleModes = VIEW_ORDER.filter((mode) => {
    if (TIMELINE_VIEWS.has(mode) && !hasTimelineData) return false;
    return true;
  });

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const idx = visibleModes.indexOf(activeView);
      if (idx === -1) return;

      let nextIdx: number | null = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        nextIdx = (idx + 1) % visibleModes.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        nextIdx = (idx - 1 + visibleModes.length) % visibleModes.length;
      } else if (e.key === 'Home') {
        nextIdx = 0;
      } else if (e.key === 'End') {
        nextIdx = visibleModes.length - 1;
      }

      if (nextIdx !== null) {
        e.preventDefault();
        onViewChange(visibleModes[nextIdx]);
        // Focus the new tab button
        const tablist = (e.currentTarget as HTMLElement);
        const buttons = tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]');
        buttons[nextIdx]?.focus();
      }
    },
    [activeView, visibleModes, onViewChange],
  );

  return (
    <nav className={styles.switcher} role="tablist" aria-label="Visualization view" onKeyDown={handleKeyDown}>
      {visibleModes.map((mode) => {
        const isActive = activeView === mode;
        return (
          <button
            key={mode}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            className={`${styles.tab} ${isActive ? styles.active : ''}`}
            onClick={() => onViewChange(mode)}
            title={VIEW_MODE_LABELS[mode]}
          >
            <span className={styles.icon} aria-hidden="true">{VIEW_ICONS[mode]}</span>
            <span className={styles.label}>{VIEW_MODE_LABELS[mode]}</span>
          </button>
        );
      })}
    </nav>
  );
}

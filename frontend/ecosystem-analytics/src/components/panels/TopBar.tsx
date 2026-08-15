import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  Download,
  MoreVertical,
  Moon,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
} from 'lucide-react';
import type { Theme } from '../../hooks/useTheme.js';
import SearchBar from '../search/SearchBar.js';
import UserProfileMenu from '../UserProfileMenu.js';
import styles from './TopBar.module.css';

export interface AddableSpace {
  nameId: string;
  displayName: string;
}

interface Props {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  lastSync: string | null;
  onRefresh: () => void;
  refreshing: boolean;
  onClearCache?: () => void;
  cacheCleared?: boolean;
  onExport?: () => void;
  onLogout?: () => void;
  theme?: Theme;
  onToggleTheme?: () => void;
  /** L0 spaces the user can add to the current graph. */
  availableSpaces?: AddableSpace[];
  onAddSpace?: (nameId: string) => void;
  /** Opens the AI query overlay. Rendered inline on wide screens only —
   *  on mobile the Explorer surfaces this as a floating action button. */
  onAsk?: () => void;
  /** Mobile only: opens the controls/filters drawer. */
  onOpenControls?: () => void;
}

/**
 * Application top bar.
 *
 * Three layouts share one DOM tree, switched entirely in CSS so there is no
 * resize flicker:
 *
 * - **≥1024px** — full breadcrumb, inline "Add space" + "Ask", and every
 *   secondary action visible on the right.
 * - **768–1023px** — breadcrumb trims to two crumbs; the control panel moves
 *   behind a drawer trigger; clear-cache, export, theme and last-sync move
 *   into the overflow menu.
 * - **≤767px** — a single 56px row: controls drawer, title, search toggle,
 *   overflow menu, avatar. Tapping search expands an inline field over the
 *   row (iOS pattern) so nothing below it shifts.
 */
export default function TopBar({
  searchQuery,
  onSearchChange,
  lastSync,
  onRefresh,
  refreshing,
  onClearCache,
  cacheCleared,
  onExport,
  onLogout,
  theme,
  onToggleTheme,
  availableSpaces = [],
  onAddSpace,
  onAsk,
  onOpenControls,
}: Props) {
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchFieldRef = useRef<HTMLDivElement>(null);

  const syncTime = lastSync
    ? new Date(lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  // Close the overflow menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  // Focus the field when the mobile search expands.
  useEffect(() => {
    if (!searchOpen) return;
    searchFieldRef.current?.querySelector('input')?.focus();
  }, [searchOpen]);

  const runAndClose = (fn?: () => void) => () => {
    setMenuOpen(false);
    fn?.();
  };

  return (
    <header className={`${styles.bar} ${searchOpen ? styles.barSearching : ''}`}>
      {onOpenControls && (
        <button
          className={`${styles.iconBtn} ${styles.compactOnly}`}
          onClick={onOpenControls}
          aria-label="Open filters and legend"
        >
          <SlidersHorizontal size={20} aria-hidden="true" />
        </button>
      )}

      <div className={styles.left}>
        <button
          className={styles.backBtn}
          onClick={() => navigate('/spaces')}
          title="Back to space selector"
        >
          <ChevronLeft
            size={18}
            className={styles.mobileOnly}
            aria-hidden="true"
          />
          {/* The crumb is branding on desktop and the screen title on mobile,
              where there is no room for the rest of the trail. */}
          <span className={styles.wideOnly}>Alkemio</span>
          <span className={styles.mobileOnly}>Ecosystem Analytics</span>
        </button>
        <span className={`${styles.separator} ${styles.wideOnly}`} aria-hidden="true">
          &rsaquo;
        </span>
        <span className={`${styles.breadcrumb} ${styles.wideOnly}`}>Ecosystem Analytics</span>
        <span className={`${styles.separator} ${styles.desktopOnly}`} aria-hidden="true">
          &rsaquo;
        </span>
        <span className={`${styles.breadcrumb} ${styles.desktopOnly}`}>Portfolio Network</span>

        {availableSpaces.length > 0 && onAddSpace && (
          <select
            className={`${styles.addSpaceSelect} ${styles.desktopOnly}`}
            value=""
            aria-label="Add a space to the graph"
            onChange={(e) => {
              if (e.target.value) onAddSpace(e.target.value);
            }}
          >
            <option value="" disabled>
              + Add Space
            </option>
            {availableSpaces.map((s) => (
              <option key={s.nameId} value={s.nameId}>
                {s.displayName}
              </option>
            ))}
          </select>
        )}

        {onAsk && (
          <button className={`${styles.askBtn} ${styles.desktopOnly}`} onClick={onAsk}>
            <Sparkles size={14} aria-hidden="true" />
            Ask the Ecosystem
          </button>
        )}
      </div>

      <div className={styles.right}>
        {/* Search: always-visible field on wide screens, expandable on mobile */}
        <div
          ref={searchFieldRef}
          className={`${styles.searchField} ${searchOpen ? styles.searchFieldOpen : ''}`}
        >
          <SearchBar value={searchQuery} onChange={onSearchChange} />
        </div>
        {searchOpen && (
          <button
            className={`${styles.textBtn} ${styles.mobileOnly}`}
            onClick={() => {
              onSearchChange('');
              setSearchOpen(false);
            }}
          >
            Cancel
          </button>
        )}
        <button
          className={`${styles.iconBtn} ${styles.mobileOnly} ${styles.searchToggle}`}
          onClick={() => setSearchOpen(true)}
          aria-label="Search the graph"
          aria-expanded={searchOpen}
        >
          <Search size={20} aria-hidden="true" />
        </button>

        {/* Inline above the mobile breakpoint; below it the title needs the
            width more than refresh does, so it moves into the overflow menu. */}
        <button
          className={`${styles.iconBtn} ${styles.wideOnly} ${refreshing ? styles.spinning : ''}`}
          onClick={onRefresh}
          aria-label="Refresh data"
          title="Refresh data"
          disabled={refreshing}
        >
          <RefreshCw size={18} aria-hidden="true" />
        </button>

        {onClearCache && (
          <button
            className={`${styles.pillBtn} ${styles.desktopOnly} ${cacheCleared ? styles.pillBtnDone : ''}`}
            onClick={onClearCache}
            title="Clear cached data"
            disabled={refreshing}
          >
            {cacheCleared ? 'Cache cleared!' : 'Clear cache'}
          </button>
        )}

        {onExport && (
          <button
            className={`${styles.pillBtn} ${styles.desktopOnly}`}
            onClick={onExport}
            aria-label="Export dataset"
          >
            <Download size={14} aria-hidden="true" /> Export
          </button>
        )}

        {onToggleTheme && (
          <button
            className={`${styles.iconBtn} ${styles.desktopOnly}`}
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? (
              <Moon size={18} aria-hidden="true" />
            ) : (
              <Sun size={18} aria-hidden="true" />
            )}
          </button>
        )}

        {syncTime && <span className={`${styles.syncTime} ${styles.desktopOnly}`}>Last sync {syncTime}</span>}

        {/* Overflow menu — holds whatever the current breakpoint hides above */}
        <div className={`${styles.menuWrap} ${styles.compactOnly}`} ref={menuRef}>
          <button
            className={styles.iconBtn}
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <MoreVertical size={20} aria-hidden="true" />
          </button>
          {menuOpen && (
            <div className={styles.menu} role="menu">
              <button
                className={`${styles.menuItem} ${styles.mobileOnly}`}
                role="menuitem"
                onClick={runAndClose(onRefresh)}
                disabled={refreshing}
              >
                <RefreshCw size={16} aria-hidden="true" />
                {refreshing ? 'Refreshing…' : 'Refresh data'}
              </button>

              {availableSpaces.length > 0 && onAddSpace && (
                <label className={styles.menuSelectRow}>
                  <span>Add space</span>
                  <select
                    className={styles.menuSelect}
                    value=""
                    aria-label="Add a space to the graph"
                    onChange={(e) => {
                      if (e.target.value) {
                        onAddSpace(e.target.value);
                        setMenuOpen(false);
                      }
                    }}
                  >
                    <option value="" disabled>
                      Choose…
                    </option>
                    {availableSpaces.map((s) => (
                      <option key={s.nameId} value={s.nameId}>
                        {s.displayName}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {onExport && (
                <button className={styles.menuItem} role="menuitem" onClick={runAndClose(onExport)}>
                  <Download size={16} aria-hidden="true" /> Export dataset
                </button>
              )}

              {onToggleTheme && (
                <button
                  className={styles.menuItem}
                  role="menuitem"
                  onClick={runAndClose(onToggleTheme)}
                >
                  {theme === 'light' ? (
                    <Moon size={16} aria-hidden="true" />
                  ) : (
                    <Sun size={16} aria-hidden="true" />
                  )}
                  {theme === 'light' ? 'Dark mode' : 'Light mode'}
                </button>
              )}

              {onClearCache && (
                <button
                  className={styles.menuItem}
                  role="menuitem"
                  onClick={runAndClose(onClearCache)}
                  disabled={refreshing}
                >
                  <Trash2 size={16} aria-hidden="true" />
                  {cacheCleared ? 'Cache cleared!' : 'Clear cached data'}
                </button>
              )}

              {syncTime && (
                <div className={styles.menuNote}>Last synced at {syncTime}</div>
              )}
            </div>
          )}
        </div>

        {onLogout && <UserProfileMenu onLogout={onLogout} />}
      </div>
    </header>
  );
}

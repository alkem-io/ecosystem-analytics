import { useNavigate } from 'react-router-dom';
import type { Theme } from '../../hooks/useTheme.js';
import SearchBar from '../search/SearchBar.js';
import styles from './TopBar.module.css';

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
  children?: React.ReactNode;
}

export default function TopBar({ searchQuery, onSearchChange, lastSync, onRefresh, refreshing, onClearCache, cacheCleared, onExport, onLogout, theme, onToggleTheme, children }: Props) {
  const navigate = useNavigate();

  const syncTime = lastSync
    ? new Date(lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className={styles.bar}>
      <div className={styles.left}>
        <button className={styles.backBtn} onClick={() => navigate('/spaces')}>
          Alkemio
        </button>
        <span className={styles.separator}>&rsaquo;</span>
        <span className={styles.breadcrumb}>Ecosystem Analytics</span>
        <span className={styles.separator}>&rsaquo;</span>
        <span className={styles.breadcrumb}>Portfolio Network</span>
        {children}
      </div>

      <div className={styles.right}>
        <SearchBar value={searchQuery} onChange={onSearchChange} />
        <button
          className={`${styles.refreshBtn} ${refreshing ? styles.spinning : ''}`}
          onClick={onRefresh}
          aria-label="Refresh data"
          disabled={refreshing}
        >
          &#x21bb;
        </button>
        {onClearCache && (
          <button
            className={`${styles.clearCacheBtn} ${cacheCleared ? styles.clearCacheDone : ''}`}
            onClick={onClearCache}
            aria-label="Clear cached data"
            title="Clear cached data"
            disabled={refreshing}
          >
            {cacheCleared ? 'Cache cleared!' : 'Clear cache'}
          </button>
        )}
        {onExport && (
          <button className={styles.exportBtn} onClick={onExport} aria-label="Export dataset">
            &#x2913; Export
          </button>
        )}
        {onToggleTheme && (
          <button
            className={styles.themeBtn}
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        )}
        {syncTime && <span className={styles.syncTime}>Last sync {syncTime}</span>}
        {onLogout && (
          <button className={styles.logoutBtn} onClick={onLogout} aria-label="Log out">
            Logout
          </button>
        )}
      </div>
    </div>
  );
}

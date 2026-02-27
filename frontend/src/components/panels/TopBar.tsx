import { useNavigate } from 'react-router-dom';
import SearchBar from '../search/SearchBar.js';
import styles from './TopBar.module.css';

interface Props {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  lastSync: string | null;
  onRefresh: () => void;
  refreshing: boolean;
  onExport?: () => void;
  onLogout?: () => void;
  children?: React.ReactNode;
}

export default function TopBar({ searchQuery, onSearchChange, lastSync, onRefresh, refreshing, onExport, onLogout, children }: Props) {
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
        {onExport && (
          <button className={styles.exportBtn} onClick={onExport} aria-label="Export dataset">
            &#x2913; Export
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

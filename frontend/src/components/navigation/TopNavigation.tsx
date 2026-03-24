import { NavLink } from 'react-router-dom';
import { useTheme } from '../../hooks/useTheme.js';
import UserProfileMenu from '../UserProfileMenu.js';
import { Moon, Sun } from 'lucide-react';
import styles from './TopNavigation.module.css';

interface TopNavigationProps {
  onLogout: () => void;
}

export default function TopNavigation({ onLogout }: TopNavigationProps) {
  const { theme, toggle: toggleTheme } = useTheme();

  return (
    <nav className={styles.nav}>
      <div className={styles.left}>
        <span className={styles.logo}>Ecosystem Analytics</span>
        <div className={styles.links}>
          <NavLink
            to="/explorer"
            className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
          >
            Network
          </NavLink>
          <NavLink
            to="/dashboard"
            className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
          >
            Dashboard
          </NavLink>
        </div>
      </div>
      <div className={styles.right}>
        <button className={styles.iconBtn} onClick={toggleTheme} title="Toggle theme">
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <UserProfileMenu onLogout={onLogout} />
      </div>
    </nav>
  );
}

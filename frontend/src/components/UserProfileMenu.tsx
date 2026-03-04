import { useState, useRef, useEffect } from 'react';
import { useUser } from '../hooks/useUser.js';
import styles from './UserProfileMenu.module.css';

interface Props {
  onLogout: () => void;
}

export default function UserProfileMenu({ onLogout }: Props) {
  const { displayName, avatarUrl, loading } = useUser();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [imgError, setImgError] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (loading) return null;

  const initial = (displayName || '?')[0].toUpperCase();

  return (
    <div className={styles.wrapper} ref={menuRef}>
      <button
        className={styles.avatarBtn}
        onClick={() => setOpen((prev) => !prev)}
        aria-label="User menu"
        title={displayName}
      >
        {avatarUrl && !imgError ? (
          <img
            className={styles.avatar}
            src={avatarUrl}
            alt=""
            onError={() => setImgError(true)}
          />
        ) : (
          <span className={styles.avatarPlaceholder}>{initial}</span>
        )}
      </button>

      {open && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownHeader}>
            <span className={styles.dropdownName}>{displayName}</span>
          </div>
          <div className={styles.dropdownDivider} />
          <button className={styles.dropdownItem} onClick={onLogout}>
            Logout
          </button>
        </div>
      )}
    </div>
  );
}

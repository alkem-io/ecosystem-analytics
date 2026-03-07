import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSpaces } from '../hooks/useSpaces.js';
import UserProfileMenu from '../components/UserProfileMenu.js';
import styles from './SpaceSelector.module.css';

/**
 * Screen B — Space Selector
 * Design reference: design-brief-figma-make.md Screen B
 */
interface SpaceSelectorProps {
  onLogout: () => void;
}

export default function SpaceSelector({ onLogout }: SpaceSelectorProps) {
  const { spaces, loading, error, reload } = useSpaces();
  const SELECTION_KEY = 'alkemio_selected_spaces';
  const [selected, setSelected] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(SELECTION_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const filteredSpaces = useMemo(() => {
    if (!search) return spaces;
    const q = search.toLowerCase();
    return spaces.filter((s) => s.displayName.toLowerCase().includes(q));
  }, [spaces, search]);

  const updateSelected = (next: Set<string>) => {
    setSelected(next);
    localStorage.setItem(SELECTION_KEY, JSON.stringify([...next]));
  };

  const toggleSpace = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    updateSelected(next);
  };

  const selectAll = () => updateSelected(new Set(filteredSpaces.map((s) => s.nameId)));
  const clearAll = () => updateSelected(new Set());

  const handleGenerate = () => {
    if (selected.size === 0) return;
    // Pass selected space nameIDs to explorer via URL state
    navigate('/explorer', { state: { spaceIds: Array.from(selected) } });
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <p className={styles.loading}>Loading your spaces...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <p className={styles.error}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.headerRow}>
            <h1 className={styles.title}>Select Top-Level Spaces</h1>
            <UserProfileMenu onLogout={onLogout} />
          </div>
          <p className={styles.description}>
            Choose the L0 spaces you want to include in your network graph.
          </p>
        </div>

        <div className={styles.searchRow}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search spaces..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className={styles.actions}>
          <button className={styles.actionBtn} onClick={selectAll}>
            Select All
          </button>
          <button className={styles.actionBtn} onClick={clearAll}>
            Clear
          </button>
          <button className={styles.actionBtn} onClick={reload} title="Refresh spaces list">
            &#x21bb; Refresh
          </button>
          <span className={styles.accessNote}>
            Showing only spaces where you have Member or Lead access.
          </span>
        </div>

        {spaces.length === 0 ? (
          <div className={styles.emptyState}>
            <p>You are not currently a member of any spaces.</p>
            <p className={styles.emptyHint}>
              This tool can only be used if you are a member of at least one space.
              To get started, join the <a href="https://alkem.io/welcome-space" target="_blank" rel="noopener noreferrer">welcome-space</a> on
              Alkemio. You will need to create an Alkemio account if you don't already have one.
            </p>
          </div>
        ) : (
          <div className={styles.list}>
            {filteredSpaces.map((space) => (
              <label key={space.id} className={styles.spaceRow}>
                <input
                  type="checkbox"
                  checked={selected.has(space.nameId)}
                  onChange={() => toggleSpace(space.nameId)}
                />
                <span className={styles.spaceName}>{space.displayName}</span>
                {space.role === 'LEAD' && <span className={styles.badge}>Lead</span>}
                <span className={styles.visibility}>{space.visibility}</span>
              </label>
            ))}
          </div>
        )}

        <div className={styles.footer}>
          {selected.size === 0 && spaces.length > 0 ? (
            <span className={styles.footerNote}>Please select at least one space to generate a graph.</span>
          ) : (
            <span className={styles.footerNote}>We'll reuse cached data when available.</span>
          )}
          <button
            className={styles.generateBtn}
            onClick={handleGenerate}
            disabled={selected.size === 0}
          >
            Generate Graph ({selected.size} selected)
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSpaces } from '../hooks/useSpaces.js';
import styles from './SpaceSelector.module.css';

/**
 * Screen B — Space Selector
 * Design reference: design-brief-figma-make.md Screen B
 */
export default function SpaceSelector() {
  const { spaces, loading, error } = useSpaces();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const filteredSpaces = useMemo(() => {
    if (!search) return spaces;
    const q = search.toLowerCase();
    return spaces.filter((s) => s.displayName.toLowerCase().includes(q));
  }, [spaces, search]);

  const toggleSpace = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(filteredSpaces.map((s) => s.nameId)));
  const clearAll = () => setSelected(new Set());

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
          <h1 className={styles.title}>Select Top-Level Spaces</h1>
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
          <span className={styles.accessNote}>
            Showing only spaces where you have Member or Lead access.
          </span>
        </div>

        {spaces.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No spaces available.</p>
            <p className={styles.emptyHint}>Request access or join a Space to get started.</p>
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
          <span className={styles.footerNote}>We'll reuse cached data when available.</span>
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

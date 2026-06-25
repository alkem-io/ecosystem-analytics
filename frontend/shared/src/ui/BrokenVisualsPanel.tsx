import * as React from 'react';
import {
  getBrokenVisuals,
  subscribeBrokenVisuals,
  type BrokenVisual,
} from '../lib/badImageCache.js';

/**
 * React hook returning the live list of broken visuals recorded this session. Backed by
 * the session-scoped {@link getBrokenVisuals} cache and re-rendering whenever a new
 * failure is recorded.
 */
export function useBrokenVisuals(): BrokenVisual[] {
  return React.useSyncExternalStore(subscribeBrokenVisuals, getBrokenVisuals, getBrokenVisuals);
}

/**
 * Floating, dismissible report listing every visual that failed to load this session,
 * each with a link to the owning Alkemio entity page so its image can be fixed at the
 * source. Renders nothing while there are no failures. Mount once near an app's root.
 */
export function BrokenVisualsPanel() {
  const visuals = useBrokenVisuals();
  const [open, setOpen] = React.useState(false);

  if (visuals.length === 0) return null;

  return (
    <div style={styles.root}>
      <button
        type="button"
        style={styles.toggle}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        ⚠ {visuals.length} broken visual{visuals.length === 1 ? '' : 's'} {open ? '▾' : '▸'}
      </button>
      {open && (
        <div style={styles.list}>
          {visuals.map((v) => (
            <div key={v.imageUrl} style={styles.item}>
              <div style={styles.name}>
                {v.displayName ?? '(unknown entity)'}
                {v.entityType ? <span style={styles.type}> · {v.entityType}</span> : null}
              </div>
              {v.entityUrl ? (
                <a href={v.entityUrl} target="_blank" rel="noreferrer" style={styles.link}>
                  Open on Alkemio ↗
                </a>
              ) : (
                <span style={styles.noLink}>no entity URL</span>
              )}
              <div style={styles.imageUrl} title={v.imageUrl}>
                {v.imageUrl}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'fixed',
    bottom: 12,
    right: 12,
    zIndex: 9999,
    fontFamily: 'system-ui, sans-serif',
    fontSize: 12,
    maxWidth: 420,
  },
  toggle: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '6px 10px',
    background: '#7a1f1f',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
  },
  list: {
    marginTop: 6,
    maxHeight: '40vh',
    overflowY: 'auto',
    background: '#1f1f24',
    border: '1px solid #3a3a42',
    borderRadius: 6,
    padding: 6,
  },
  item: {
    padding: '6px 8px',
    borderBottom: '1px solid #2c2c33',
  },
  name: {
    color: '#fff',
    fontWeight: 600,
  },
  type: {
    color: '#9a9aa5',
    fontWeight: 400,
  },
  link: {
    color: '#6db1ff',
    textDecoration: 'none',
  },
  noLink: {
    color: '#9a9aa5',
    fontStyle: 'italic',
  },
  imageUrl: {
    color: '#7a7a85',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    marginTop: 2,
  },
};

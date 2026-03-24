import { useSpaces } from '../../hooks/useSpaces.js';
import styles from './DashboardSpacePicker.module.css';

interface DashboardSpacePickerProps {
  selectedSpaceId: string | null;
  onSelect: (spaceId: string) => void;
  loading?: boolean;
}

export default function DashboardSpacePicker({ selectedSpaceId, onSelect, loading }: DashboardSpacePickerProps) {
  const { spaces, loading: spacesLoading } = useSpaces();

  return (
    <div className={styles.picker}>
      <label className={styles.label} htmlFor="dashboard-space-select">Space</label>
      <select
        id="dashboard-space-select"
        className={styles.select}
        value={selectedSpaceId ?? ''}
        onChange={(e) => {
          if (e.target.value) onSelect(e.target.value);
        }}
        disabled={spacesLoading || loading}
      >
        <option value="" disabled>
          {spacesLoading ? 'Loading spaces...' : 'Select a space'}
        </option>
        {spaces.map((s) => (
          <option key={s.id} value={s.id}>
            {s.displayName}
          </option>
        ))}
      </select>
    </div>
  );
}

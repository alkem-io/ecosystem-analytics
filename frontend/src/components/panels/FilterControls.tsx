import type { GraphDataset } from '@server/types/graph.js';
import styles from './FilterControls.module.css';

interface Props {
  dataset: GraphDataset;
  showPeople: boolean;
  showOrganizations: boolean;
  showSpaces: boolean;
  onTogglePeople: () => void;
  onToggleOrganizations: () => void;
  onToggleSpaces: () => void;
}

export default function FilterControls({
  dataset,
  showPeople,
  showOrganizations,
  showSpaces,
  onTogglePeople,
  onToggleOrganizations,
  onToggleSpaces,
}: Props) {
  const peopleCount = dataset.nodes.filter((n) => n.type === 'USER').length;
  const orgCount = dataset.nodes.filter((n) => n.type === 'ORGANIZATION').length;
  const spaceCount = dataset.nodes.filter((n) => n.type === 'SPACE_L0' || n.type === 'SPACE_L1' || n.type === 'SPACE_L2').length;

  return (
    <div className={styles.section}>
      <h3 className={styles.heading}>Filters</h3>
      <label className={styles.toggle}>
        <input type="checkbox" checked={showSpaces} onChange={onToggleSpaces} />
        <span>Spaces ({spaceCount})</span>
      </label>
      <label className={styles.toggle}>
        <input type="checkbox" checked={showPeople} onChange={onTogglePeople} />
        <span>People ({peopleCount})</span>
      </label>
      <label className={styles.toggle}>
        <input type="checkbox" checked={showOrganizations} onChange={onToggleOrganizations} />
        <span>Organizations ({orgCount})</span>
      </label>
    </div>
  );
}

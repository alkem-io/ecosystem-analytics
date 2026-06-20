import styles from './SearchBar.module.css';

interface Props {
  value: string;
  onChange: (query: string) => void;
  placeholder?: string;
}

export default function SearchBar({ value, onChange, placeholder = 'Search nodes...' }: Props) {
  return (
    <input
      type="search"
      role="searchbox"
      aria-label="Search graph nodes"
      className={styles.input}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

/**
 * ViewEmptyState — Reusable empty-state fallback for all alternative views.
 */

import viewStyles from './Views.module.css';

interface ViewEmptyStateProps {
  icon?: string;
  title: string;
  message?: string;
}

export default function ViewEmptyState({
  icon = '∅',
  title,
  message,
}: ViewEmptyStateProps) {
  return (
    <div className={viewStyles.emptyState}>
      <span className={viewStyles.emptyIcon}>{icon}</span>
      <span className={viewStyles.emptyTitle}>{title}</span>
      {message && <span className={viewStyles.emptyMessage}>{message}</span>}
    </div>
  );
}

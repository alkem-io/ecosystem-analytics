import { createContext, useContext, type ReactNode } from 'react';
import { useSelectedSpaces, type UseSelectedSpacesResult } from './useSelectedSpaces.js';

const SelectionContext = createContext<UseSelectedSpacesResult | null>(null);

/**
 * Provides a single shared selected-space set to every tab and control, so the
 * persistent SelectedSpacesPanel, the controls bar, the dashboard, and the
 * details picker all stay in sync (FR-008/012).
 */
export function SelectionProvider({ children }: { children: ReactNode }) {
  const value = useSelectedSpaces();
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

/** Access the shared selection state. Must be used within <SelectionProvider>. */
export function useSelectionContext(): UseSelectedSpacesResult {
  const ctx = useContext(SelectionContext);
  if (!ctx) {
    throw new Error('useSelectionContext must be used within a SelectionProvider');
  }
  return ctx;
}

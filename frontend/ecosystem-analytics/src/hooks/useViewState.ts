/**
 * Hook: useViewState
 * Manages the complete ViewState for all 009 alternative visualization views.
 * Returns the current state plus individual setter functions per contracts/view-props.md.
 */

import { useCallback, useState } from 'react';
import {
  type ViewMode,
  type ViewState,
  type HierarchySizeMetric,
  type ChordMode,
  INITIAL_VIEW_STATE,
} from '../types/views.js';

export interface UseViewStateReturn {
  state: ViewState;
  setActiveView: (view: ViewMode) => void;
  setSelectedNode: (nodeId: string | null) => void;
  setFocusedSpace: (spaceId: string | null) => void;
  setSizeMetric: (metric: HierarchySizeMetric) => void;
  setChordMode: (mode: ChordMode) => void;
  setChordGroupLevel: (level: 'L0' | 'L1') => void;
  setShowMembers: (show: boolean) => void;
  setTimelineChartType: (type: 'stacked' | 'stream') => void;
  setTemporalDate: (date: Date | null) => void;
  setTemporalPlaying: (playing: boolean) => void;
  setTemporalSpeed: (speed: number) => void;
  setTimelineBrush: (range: [Date, Date] | null) => void;
}

export function useViewState(): UseViewStateReturn {
  const [state, setState] = useState<ViewState>(INITIAL_VIEW_STATE);

  const setActiveView = useCallback((view: ViewMode) => {
    setState((prev) => ({
      ...prev,
      activeView: view,
      // Preserve selectedNodeId for cross-view highlighting
      // Reset view-specific spatial state when switching views
      focusedSpaceId: null,
    }));
  }, []);

  const setSelectedNode = useCallback((nodeId: string | null) => {
    setState((prev) => ({ ...prev, selectedNodeId: nodeId }));
  }, []);

  const setFocusedSpace = useCallback((spaceId: string | null) => {
    setState((prev) => ({ ...prev, focusedSpaceId: spaceId }));
  }, []);

  const setSizeMetric = useCallback((metric: HierarchySizeMetric) => {
    setState((prev) => ({ ...prev, sizeMetric: metric }));
  }, []);

  const setChordMode = useCallback((mode: ChordMode) => {
    setState((prev) => ({ ...prev, chordMode: mode }));
  }, []);

  const setChordGroupLevel = useCallback((level: 'L0' | 'L1') => {
    setState((prev) => ({ ...prev, chordGroupLevel: level }));
  }, []);

  const setShowMembers = useCallback((show: boolean) => {
    setState((prev) => ({ ...prev, showMembers: show }));
  }, []);

  const setTimelineChartType = useCallback((type: 'stacked' | 'stream') => {
    setState((prev) => ({ ...prev, timelineChartType: type }));
  }, []);

  const setTemporalDate = useCallback((date: Date | null) => {
    setState((prev) => ({ ...prev, temporalDate: date }));
  }, []);

  const setTemporalPlaying = useCallback((playing: boolean) => {
    setState((prev) => ({ ...prev, temporalPlaying: playing }));
  }, []);

  const setTemporalSpeed = useCallback((speed: number) => {
    setState((prev) => ({ ...prev, temporalSpeed: speed }));
  }, []);

  const setTimelineBrush = useCallback((range: [Date, Date] | null) => {
    setState((prev) => ({ ...prev, timelineBrush: range }));
  }, []);

  return {
    state,
    setActiveView,
    setSelectedNode,
    setFocusedSpace,
    setSizeMetric,
    setChordMode,
    setChordGroupLevel,
    setShowMembers,
    setTimelineChartType,
    setTemporalDate,
    setTemporalPlaying,
    setTemporalSpeed,
    setTimelineBrush,
  };
}

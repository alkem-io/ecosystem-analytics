/**
 * TemporalScrubber — Horizontal slider + play/pause + speed selector
 * for temporal force-graph evolution.
 *
 * Renders below the force canvas when temporal mode is active.
 * Uses d3.timer() for auto-advance.
 */

import { useRef, useEffect, useCallback } from 'react';
import * as d3 from 'd3';
import styles from './TemporalScrubber.module.css';

interface TemporalScrubberProps {
  /** Earliest date across all nodes */
  minDate: Date;
  /** Latest date across all nodes */
  maxDate: Date;
  /** Current cursor position */
  currentDate: Date | null;
  /** Whether auto-play is active */
  playing: boolean;
  /** Playback speed multiplier */
  speed: number;
  onDateChange: (date: Date) => void;
  onPlayingChange: (playing: boolean) => void;
  onSpeedChange: (speed: number) => void;
}

const STEP_MS = 86_400_000; // 1 day
const SPEEDS = [1, 2, 5, 10];

export default function TemporalScrubber({
  minDate,
  maxDate,
  currentDate,
  playing,
  speed,
  onDateChange,
  onPlayingChange,
  onSpeedChange,
}: TemporalScrubberProps) {
  const timerRef = useRef<d3.Timer | null>(null);
  const currentDateRef = useRef(currentDate);
  currentDateRef.current = currentDate;

  // Auto-advance via d3.timer
  useEffect(() => {
    if (playing) {
      const baseStep = STEP_MS * speed; // ms per frame ≈ speed days per ~16ms
      timerRef.current = d3.timer((elapsed) => {
        const cur = currentDateRef.current ?? minDate;
        const next = new Date(cur.getTime() + baseStep * (elapsed > 100 ? 0.016 : elapsed / 1000));
        if (next.getTime() >= maxDate.getTime()) {
          onDateChange(maxDate);
          onPlayingChange(false);
          timerRef.current?.stop();
          return;
        }
        onDateChange(next);
      }, 50);
    }
    return () => {
      timerRef.current?.stop();
      timerRef.current = null;
    };
  }, [playing, speed, minDate, maxDate, onDateChange, onPlayingChange]);

  const handleSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const ms = Number(e.target.value);
    onDateChange(new Date(ms));
  }, [onDateChange]);

  const togglePlay = useCallback(() => {
    // If at end, reset to start
    if (!playing && currentDate && currentDate.getTime() >= maxDate.getTime()) {
      onDateChange(minDate);
    }
    onPlayingChange(!playing);
  }, [playing, currentDate, minDate, maxDate, onDateChange, onPlayingChange]);

  const displayDate = currentDate ?? minDate;

  return (
    <div className={styles.scrubber}>
      <button
        className={styles.playBtn}
        onClick={togglePlay}
        aria-label={playing ? 'Pause' : 'Play'}
        title={playing ? 'Pause' : 'Play'}
      >
        {playing ? '⏸' : '▶'}
      </button>

      <input
        type="range"
        className={styles.slider}
        min={minDate.getTime()}
        max={maxDate.getTime()}
        step={STEP_MS}
        value={displayDate.getTime()}
        onChange={handleSlider}
        aria-label="Temporal date scrubber"
      />

      <span className={styles.dateLabel}>
        {d3.timeFormat('%b %d, %Y')(displayDate)}
      </span>

      <select
        className={styles.speedSelect}
        value={speed}
        onChange={(e) => onSpeedChange(Number(e.target.value))}
        aria-label="Playback speed"
      >
        {SPEEDS.map((s) => (
          <option key={s} value={s}>{s}×</option>
        ))}
      </select>
    </div>
  );
}

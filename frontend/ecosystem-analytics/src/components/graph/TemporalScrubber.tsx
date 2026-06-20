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

const STEP_MS = 17_280_000; // ~0.2 days — tuned so 1× feels comfortable
const SPEEDS = [0.5, 1, 2, 3, 5];

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

  // Auto-advance via d3.timer with proper delta-time tracking
  useEffect(() => {
    if (playing) {
      let lastElapsed = 0;
      timerRef.current = d3.timer((elapsed) => {
        const dt = elapsed - lastElapsed;
        lastElapsed = elapsed;
        // At speed=1, advance ~0.2 days per frame (60 fps → traverse ~6 years in ~3 min)
        const advance = STEP_MS * speed * (dt / 16);
        const cur = currentDateRef.current ?? minDate;
        const nextMs = cur.getTime() + advance;
        if (nextMs >= maxDate.getTime()) {
          onDateChange(maxDate);
          onPlayingChange(false);
          timerRef.current?.stop();
          return;
        }
        onDateChange(new Date(nextMs));
      });
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

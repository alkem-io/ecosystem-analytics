/**
 * Hook: useTimeSeries
 * Parses SpaceTimeSeries[] from GraphDataset.timeSeries, computes date extent,
 * and converts ISO week strings to Date objects for d3 time scales.
 */

import { useMemo } from 'react';
import type { GraphDataset, SpaceTimeSeries } from '@server/types/graph.js';

/** A single data point with a Date instead of an ISO week string */
export interface TimeSeriesPoint {
  date: Date;
  count: number;
}

/** Parsed time series for a single space */
export interface ParsedTimeSeries {
  spaceId: string;
  spaceDisplayName: string;
  points: TimeSeriesPoint[];
}

export interface UseTimeSeriesReturn {
  /** Parsed time series array, one per space */
  series: ParsedTimeSeries[];
  /** [earliest date, latest date] across all series */
  dateExtent: [Date, Date] | null;
  /** All unique week dates across all series, sorted */
  allDates: Date[];
  loading: boolean;
}

interface UseTimeSeriesOptions {
  dataset: GraphDataset | null;
}

/**
 * Parse an ISO week string like '2026-W09' into a monday Date.
 */
function parseISOWeek(weekStr: string): Date {
  const match = weekStr.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return new Date(weekStr);
  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);
  // ISO: week 1 contains the first Thursday of the year.
  // Monday of week 1 = Jan 4 minus its day-of-week offset.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7; // Make Sunday = 7
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7);
  return monday;
}

export function useTimeSeries({ dataset }: UseTimeSeriesOptions): UseTimeSeriesReturn {
  return useMemo(() => {
    if (!dataset?.timeSeries || dataset.timeSeries.length === 0) {
      return { series: [], dateExtent: null, allDates: [], loading: false };
    }

    const allDateSet = new Set<number>();
    const series: ParsedTimeSeries[] = dataset.timeSeries.map((ts) => {
      const points: TimeSeriesPoint[] = ts.buckets.map((b) => {
        const date = parseISOWeek(b.week);
        allDateSet.add(date.getTime());
        return { date, count: b.count };
      });
      points.sort((a, b) => a.date.getTime() - b.date.getTime());
      return {
        spaceId: ts.spaceId,
        spaceDisplayName: ts.spaceDisplayName,
        points,
      };
    });

    const allDates = Array.from(allDateSet)
      .sort((a, b) => a - b)
      .map((t) => new Date(t));

    const dateExtent: [Date, Date] | null =
      allDates.length >= 2
        ? [allDates[0], allDates[allDates.length - 1]]
        : allDates.length === 1
          ? [allDates[0], allDates[0]]
          : null;

    return { series, dateExtent, allDates, loading: false };
  }, [dataset]);
}

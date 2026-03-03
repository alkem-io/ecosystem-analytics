/**
 * TimelineView — Stacked area chart / streamgraph of activity over time.
 *
 * Uses d3.stack() + d3.area() for stacked band layout.
 * Features: d3.brushX() for time selection, auto-scaled axes,
 * legend with click-to-toggle, tooltip, stacked/stream toggle.
 */

import { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import * as d3 from 'd3';
import type { GraphDataset } from '@server/types/graph.js';
import { useTimeSeries, type ParsedTimeSeries } from '../../hooks/useTimeSeries.js';
import viewStyles from './Views.module.css';

// ─── Layout Constants ──────────────────────────────────────────
const MARGIN = { top: 20, right: 20, bottom: 30, left: 50 };

interface TimelineViewProps {
  dataset: GraphDataset;
  brushRange: [Date, Date] | null;
  onBrushChange: (range: [Date, Date] | null) => void;
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string | null) => void;
  chartType: 'stacked' | 'stream';
  width: number;
  height: number;
}

export default function TimelineView({
  dataset,
  brushRange,
  onBrushChange,
  selectedNodeId,
  onNodeSelect,
  chartType,
  width,
  height,
}: TimelineViewProps) {
  const { series, dateExtent, allDates } = useTimeSeries({ dataset });
  const svgRef = useRef<SVGSVGElement>(null);
  const brushRef = useRef<SVGGElement>(null);
  const [hiddenSpaces, setHiddenSpaces] = useState<Set<string>>(new Set());
  const [tooltip, setTooltip] = useState<{ x: number; y: number; date: Date; counts: Array<{ name: string; count: number; color: string }> } | null>(null);

  const innerWidth = width - MARGIN.left - MARGIN.right;
  const innerHeight = height - MARGIN.top - MARGIN.bottom;

  // Color scale
  const colorScale = useMemo(() => {
    return d3.scaleOrdinal<string, string>()
      .domain(series.map((s) => s.spaceId))
      .range(d3.schemeTableau10);
  }, [series]);

  // Build stacked data
  const { stackedData, xScale, yScale } = useMemo(() => {
    if (series.length === 0 || !dateExtent || innerWidth <= 0 || innerHeight <= 0) {
      return { stackedData: null, xScale: null, yScale: null };
    }

    const visibleSeries = series.filter((s) => !hiddenSpaces.has(s.spaceId));
    if (visibleSeries.length === 0) {
      return { stackedData: null, xScale: null, yScale: null };
    }

    // Build tabular data: one row per date, one column per space
    const dateMap = new Map<number, Record<string, number>>();
    for (const date of allDates) {
      const row: Record<string, number> = { __time: date.getTime() };
      for (const s of visibleSeries) {
        const pt = s.points.find((p) => p.date.getTime() === date.getTime());
        row[s.spaceId] = pt?.count ?? 0;
      }
      dateMap.set(date.getTime(), row);
    }
    const tableData = Array.from(dateMap.values()).sort((a, b) => a.__time - b.__time);

    // Stack layout
    const keys = visibleSeries.map((s) => s.spaceId);
    const stackGen = d3.stack<Record<string, number>>()
      .keys(keys)
      .order(d3.stackOrderNone)
      .offset(chartType === 'stream' ? d3.stackOffsetWiggle : d3.stackOffsetNone);

    const stacked = stackGen(tableData);

    // Scales
    const xScale = d3.scaleTime()
      .domain(dateExtent)
      .range([0, innerWidth]);

    const yMax = d3.max(stacked, (layer) => d3.max(layer, (d) => d[1])) ?? 0;
    const yMin = chartType === 'stream'
      ? (d3.min(stacked, (layer) => d3.min(layer, (d) => d[0])) ?? 0)
      : 0;

    const yScale = d3.scaleLinear()
      .domain([yMin, yMax])
      .range([innerHeight, 0])
      .nice();

    return { stackedData: stacked, xScale, yScale };
  }, [series, dateExtent, allDates, hiddenSpaces, chartType, innerWidth, innerHeight]);

  // Area generator
  const areaGen = useMemo(() => {
    if (!xScale || !yScale) return null;
    return d3.area<d3.SeriesPoint<Record<string, number>>>()
      .x((d) => xScale(new Date(d.data.__time)))
      .y0((d) => yScale(d[0]))
      .y1((d) => yScale(d[1]))
      .curve(d3.curveMonotoneX);
  }, [xScale, yScale]);

  // D3 Brush
  useEffect(() => {
    if (!brushRef.current || !xScale || innerWidth <= 0 || innerHeight <= 0) return;

    const brush = d3.brushX<unknown>()
      .extent([[0, 0], [innerWidth, innerHeight]])
      .on('end', (event: d3.D3BrushEvent<unknown>) => {
        if (!event.selection) {
          onBrushChange(null);
          return;
        }
        const [x0, x1] = event.selection as [number, number];
        onBrushChange([xScale.invert(x0), xScale.invert(x1)]);
      });

    const g = d3.select(brushRef.current);
    g.call(brush);

    // Set initial brush if range provided
    if (brushRange && xScale) {
      g.call(brush.move, [xScale(brushRange[0]), xScale(brushRange[1])]);
    }

    return () => {
      g.selectAll('.brush').remove();
    };
  }, [xScale, innerWidth, innerHeight]); // Intentionally not reacting to brushRange to avoid loops

  // Toggle legend
  const handleLegendClick = useCallback((spaceId: string) => {
    setHiddenSpaces((prev) => {
      const next = new Set(prev);
      if (next.has(spaceId)) next.delete(spaceId);
      else next.add(spaceId);
      return next;
    });
  }, []);

  // Tooltip on hover
  const handleAreaHover = useCallback((e: React.MouseEvent) => {
    if (!xScale || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - MARGIN.left;
    const date = xScale.invert(mouseX);

    // Find closest date
    const closestDate = allDates.reduce((best, d) =>
      Math.abs(d.getTime() - date.getTime()) < Math.abs(best.getTime() - date.getTime()) ? d : best,
    allDates[0]);

    if (!closestDate) return;

    const counts = series
      .filter((s) => !hiddenSpaces.has(s.spaceId))
      .map((s) => ({
        name: s.spaceDisplayName,
        count: s.points.find((p) => p.date.getTime() === closestDate.getTime())?.count ?? 0,
        color: colorScale(s.spaceId),
      }));

    setTooltip({ x: e.clientX, y: e.clientY, date: closestDate, counts });
  }, [xScale, allDates, series, hiddenSpaces, colorScale]);

  if (series.length === 0 || !dateExtent) {
    return (
      <div className={viewStyles.emptyState}>
        <span className={viewStyles.emptyIcon}>▤</span>
        <span className={viewStyles.emptyTitle}>No temporal data available</span>
        <span className={viewStyles.emptyMessage}>Activity data is needed for the Timeline view</span>
      </div>
    );
  }

  if (!stackedData || !xScale || !yScale || !areaGen) return null;

  return (
    <div className={viewStyles.viewContainer} style={{ width, height, position: 'relative' }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ display: 'block' }}
        onMouseMove={handleAreaHover}
        onMouseLeave={() => setTooltip(null)}
      >
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {/* Stacked areas */}
          {stackedData.map((layer) => (
            <path
              key={layer.key}
              d={areaGen(layer) ?? ''}
              fill={colorScale(layer.key)}
              fillOpacity={0.7}
              stroke={colorScale(layer.key)}
              strokeWidth={0.5}
            />
          ))}

          {/* X-axis */}
          <g transform={`translate(0,${innerHeight})`}>
            {xScale.ticks(Math.min(10, innerWidth / 80)).map((tick) => (
              <g key={tick.getTime()} transform={`translate(${xScale(tick)},0)`}>
                <line y2={6} stroke="#475569" />
                <text y={20} fill="#94a3b8" fontSize={10} textAnchor="middle">
                  {d3.timeFormat('%b %Y')(tick)}
                </text>
              </g>
            ))}
            <line x1={0} x2={innerWidth} stroke="#475569" />
          </g>

          {/* Y-axis */}
          <g>
            {yScale.ticks(5).map((tick) => (
              <g key={tick} transform={`translate(0,${yScale(tick)})`}>
                <line x2={-6} stroke="#475569" />
                <text x={-10} fill="#94a3b8" fontSize={10} textAnchor="end" dy="0.35em">
                  {tick}
                </text>
                <line x2={innerWidth} stroke="#334155" strokeOpacity={0.3} strokeDasharray="2,2" />
              </g>
            ))}
            <line y1={0} y2={innerHeight} stroke="#475569" />
          </g>

          {/* Brush layer */}
          <g ref={brushRef} />
        </g>
      </svg>

      {/* Legend */}
      <div className={viewStyles.legend} style={{ position: 'absolute', top: 8, right: 8 }}>
        {series.map((s) => (
          <div
            key={s.spaceId}
            className={viewStyles.legendItem}
            style={{ cursor: 'pointer', opacity: hiddenSpaces.has(s.spaceId) ? 0.35 : 1 }}
            onClick={() => handleLegendClick(s.spaceId)}
          >
            <span className={viewStyles.legendSwatch} style={{ background: colorScale(s.spaceId) }} />
            <span>{s.spaceDisplayName}</span>
          </div>
        ))}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className={viewStyles.tooltip}
          style={{
            position: 'fixed',
            left: tooltip.x + 12,
            top: tooltip.y - 8,
          }}
        >
          <span className={viewStyles.tooltipTitle}>
            {d3.timeFormat('%b %d, %Y')(tooltip.date)}
          </span>
          {tooltip.counts.map((c) => (
            <span key={c.name} className={viewStyles.tooltipDetail}>
              <span style={{ color: c.color }}>●</span> {c.name}: {c.count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

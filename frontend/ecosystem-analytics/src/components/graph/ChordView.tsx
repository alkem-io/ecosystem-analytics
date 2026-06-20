/**
 * ChordView — D3 chord diagram showing shared members/tags between spaces.
 *
 * - Outer arcs: one per space, sized by total unique members
 * - Ribbons: thickness proportional to shared member count
 * - Hover arc → highlight all connected ribbons, dim others to 0.15 opacity
 * - Hover ribbon → tooltip: "Space A ↔ Space B: N shared members"
 * - Colors from d3.schemeTableau10
 */

import { useMemo, useState, useCallback } from 'react';
import * as d3 from 'd3';
import type { GraphDataset } from '@server/types/graph.js';
import type { EdgeType, ActivityTier } from '@server/types/graph.js';
import type { ChordMode, ChordSpaceMeta } from '../../types/views.js';
import { useChordMatrix } from '../../hooks/useChordMatrix.js';
import { useViewTheme } from '../../hooks/useViewTheme.js';
import viewStyles from './Views.module.css';

/** Rich tooltip data for arcs and ribbons */
interface ChordTooltip {
  x: number;
  y: number;
  // For arc hover — single space info
  name?: string;
  tagline?: string | null;
  memberCount?: number;
  activityTier?: string;
  isPrivate?: boolean;
  // For ribbon hover — two-space connection info
  text?: string;
  sourceName?: string;
  targetName?: string;
  sourceTagline?: string | null;
  targetTagline?: string | null;
  value?: number;
  label?: string;
}

/** Activity-tier glow for arcs */
function getTierGlow(tier?: string, isDark = false): string {
  switch (tier as ActivityTier | undefined) {
    case 'HIGH':   return isDark
      ? 'drop-shadow(0 0 6px rgba(125,211,252,0.7))'
      : 'drop-shadow(0 0 5px rgba(2,132,199,0.4))';
    case 'MEDIUM': return isDark
      ? 'drop-shadow(0 0 4px rgba(56,189,248,0.5))'
      : 'drop-shadow(0 0 3px rgba(56,189,248,0.3))';
    default:       return '';
  }
}

interface ChordViewProps {
  dataset: GraphDataset;
  chordMode: ChordMode;
  roleFilter: EdgeType[];
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string | null) => void;
  groupLevel: 'L0' | 'L1';
  width: number;
  height: number;
}

export default function ChordView({
  dataset,
  chordMode,
  roleFilter,
  selectedNodeId,
  onNodeSelect,
  groupLevel,
  width,
  height,
}: ChordViewProps) {
  const { result } = useChordMatrix({
    dataset,
    chordMode,
    groupLevel,
    roleFilter: roleFilter.length > 0 ? roleFilter : undefined,
  });

  const theme = useViewTheme();
  const [hoveredGroup, setHoveredGroup] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<ChordTooltip | null>(null);

  const radius = Math.min(width, height) / 2 - 40;
  const innerRadius = radius - 30;
  const outerRadius = radius;

  // Compute chord layout
  const chordLayout = useMemo(() => {
    if (!result || result.matrix.length === 0) return null;
    return d3.chord()
      .padAngle(0.05)
      .sortSubgroups(d3.descending)(result.matrix);
  }, [result]);

  // Arc and ribbon generators
  const arcGen = useMemo(
    () => d3.arc<d3.ChordGroup>().innerRadius(innerRadius).outerRadius(outerRadius),
    [innerRadius, outerRadius],
  );

  const ribbonGen = useMemo(
    () => d3.ribbon<d3.Chord, d3.ChordSubgroup>().radius(innerRadius),
    [innerRadius],
  );

  // Color scale
  const colorScale = useMemo(() => {
    if (!result) return d3.scaleOrdinal<number, string>();
    return d3.scaleOrdinal<number, string>()
      .domain(result.spaceIds.map((_, i) => i))
      .range(d3.schemeTableau10);
  }, [result]);

  const handleArcClick = useCallback((idx: number) => {
    if (!result) return;
    const spaceId = result.spaceIds[idx];
    onNodeSelect(spaceId === selectedNodeId ? null : spaceId);
  }, [result, selectedNodeId, onNodeSelect]);

  const handleArcHover = useCallback((e: React.MouseEvent, idx: number) => {
    if (!result) return;
    const meta: ChordSpaceMeta | undefined = result.spaceMeta[idx];
    setTooltip({
      x: e.clientX,
      y: e.clientY,
      name: result.spaceNames[idx],
      tagline: meta?.tagline,
      memberCount: meta?.memberCount ?? 0,
      activityTier: meta?.activityTier,
      isPrivate: meta?.privacyMode === 'PRIVATE',
    });
  }, [result]);

  const handleRibbonHover = useCallback((e: React.MouseEvent, source: number, target: number, value: number) => {
    if (!result) return;
    const label = chordMode === 'shared-members' ? 'shared members' : 'shared tags';
    const sMeta = result.spaceMeta[source];
    const tMeta = result.spaceMeta[target];
    setTooltip({
      x: e.clientX,
      y: e.clientY,
      text: `${result.spaceNames[source]} ↔ ${result.spaceNames[target]}: ${value} ${label}`,
      sourceName: result.spaceNames[source],
      targetName: result.spaceNames[target],
      sourceTagline: sMeta?.tagline,
      targetTagline: tMeta?.tagline,
      value,
      label,
    });
  }, [result, chordMode]);

  if (!result || result.matrix.length === 0 || radius <= 0) {
    return (
      <div className={viewStyles.emptyState}>
        <span className={viewStyles.emptyIcon}>◠</span>
        <span className={viewStyles.emptyTitle}>No data for Chord Diagram</span>
        <span className={viewStyles.emptyMessage}>
          {chordMode === 'shared-tags' ? 'No tag data available — try "Shared Members" mode' : 'Select spaces to visualize'}
        </span>
      </div>
    );
  }

  if (!chordLayout) return null;

  return (
    <div className={viewStyles.viewContainer} style={{ width, height }}>
      <svg width={width} height={height} style={{ display: 'block' }}>
        <g transform={`translate(${width / 2},${height / 2})`}>
          {/* Hatch pattern for private spaces */}
          <defs>
            <pattern id="chord-hatch" patternUnits="userSpaceOnUse" width="6" height="6">
              <path d="M0,6 l6,-6" stroke={theme.hatchStroke} strokeWidth="1" />
            </pattern>
          </defs>

          {/* Outer arcs */}
          {chordLayout.groups.map((group) => {
            const isSelected = result.spaceIds[group.index] === selectedNodeId;
            const dimmed = hoveredGroup !== null && hoveredGroup !== group.index;
            const meta = result.spaceMeta[group.index];
            const glow = getTierGlow(meta?.activityTier, theme.isDark);
            const isPrivate = meta?.privacyMode === 'PRIVATE';
            const imgUrl = meta?.avatarUrl ?? meta?.bannerUrl;
            const angularExtent = group.endAngle - group.startAngle;
            const midAngle = (group.startAngle + group.endAngle) / 2;
            const labelX = Math.sin(midAngle) * (outerRadius + 16);
            const labelY = -Math.cos(midAngle) * (outerRadius + 16);
            const avatarX = Math.sin(midAngle) * ((innerRadius + outerRadius) / 2);
            const avatarY = -Math.cos(midAngle) * ((innerRadius + outerRadius) / 2);
            const clipId = `chord-clip-${group.index}`;

            return (
              <g key={`group-${group.index}`}>
                <path
                  d={arcGen(group) ?? ''}
                  fill={colorScale(group.index)}
                  stroke={isSelected ? theme.selection : theme.stroke}
                  strokeWidth={isSelected ? 2.5 : 0.5}
                  opacity={dimmed ? 0.15 : 1}
                  style={{ cursor: 'pointer', transition: 'opacity 0.2s ease', filter: glow }}
                  onClick={() => handleArcClick(group.index)}
                  onMouseEnter={(e) => {
                    setHoveredGroup(group.index);
                    handleArcHover(e, group.index);
                  }}
                  onMouseMove={(e) => setTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)}
                  onMouseLeave={() => {
                    setHoveredGroup(null);
                    setTooltip(null);
                  }}
                />

                {/* Hatch overlay for private spaces */}
                {isPrivate && (
                  <path
                    d={arcGen(group) ?? ''}
                    fill="url(#chord-hatch)"
                    opacity={dimmed ? 0.08 : 0.5}
                    style={{ pointerEvents: 'none' }}
                  />
                )}

                {/* Circular avatar at arc midpoint for arcs with enough angular extent */}
                {imgUrl && angularExtent > 0.25 && !dimmed && (
                  <>
                    <defs>
                      <clipPath id={clipId}>
                        <circle cx={avatarX} cy={avatarY} r={10} />
                      </clipPath>
                    </defs>
                    <image
                      href={imgUrl}
                      x={avatarX - 10}
                      y={avatarY - 10}
                      width={20}
                      height={20}
                      clipPath={`url(#${clipId})`}
                      preserveAspectRatio="xMidYMid slice"
                      style={{ pointerEvents: 'none' }}
                    />
                  </>
                )}

                {/* Arc label */}
                {angularExtent > 0.15 && (
                  <text
                    transform={`translate(${labelX},${labelY})`}
                    textAnchor="middle"
                    dy="0.35em"
                    fill={theme.text}
                    fontSize={11}
                    fontWeight={500}
                    fontFamily="var(--font-family, system-ui)"
                    style={{ pointerEvents: 'none', textShadow: theme.labelShadow }}
                  >
                    {isPrivate ? '🔒 ' : ''}
                    {result.spaceNames[group.index].length > 15
                      ? result.spaceNames[group.index].slice(0, 14) + '…'
                      : result.spaceNames[group.index]}
                  </text>
                )}
              </g>
            );
          })}

          {/* Ribbons */}
          {chordLayout.map((chord, i) => {
            const dimmed = hoveredGroup !== null &&
              hoveredGroup !== chord.source.index &&
              hoveredGroup !== chord.target.index;
            const value = result.matrix[chord.source.index][chord.target.index];

            return (
              <path
                key={`ribbon-${i}`}
                d={ribbonGen(chord) ?? ''}
                fill={colorScale(chord.source.index)}
                fillOpacity={dimmed ? 0.03 : 0.6}
                stroke="none"
                style={{ transition: 'fill-opacity 0.2s ease', cursor: 'pointer' }}
                onMouseEnter={(e) => {
                  setHoveredGroup(chord.source.index);
                  handleRibbonHover(e, chord.source.index, chord.target.index, value);
                }}
                onMouseMove={(e) => setTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)}
                onMouseLeave={() => {
                  setHoveredGroup(null);
                  setTooltip(null);
                }}
              />
            );
          })}
        </g>
      </svg>

      {/* Legend */}
      <div className={viewStyles.legend} style={{ position: 'absolute', top: 8, right: 8 }}>
        {result.spaceNames.map((name, i) => (
          <div key={result.spaceIds[i]} className={viewStyles.legendItem}>
            <span className={viewStyles.legendSwatch} style={{ background: colorScale(i) }} />
            <span>{name}</span>
          </div>
        ))}
      </div>

      {/* Rich tooltip */}
      {tooltip && (
        <div
          className={viewStyles.tooltip}
          style={{
            position: 'fixed',
            left: tooltip.x + 12,
            top: tooltip.y - 8,
          }}
        >
          {/* Arc hover — single space */}
          {tooltip.name && !tooltip.text && (
            <>
              <span className={viewStyles.tooltipTitle}>
                {tooltip.name}{tooltip.isPrivate ? ' 🔒' : ''}
              </span>
              {tooltip.tagline && (
                <span className={viewStyles.tooltipDetail} style={{ display: 'block', fontStyle: 'italic', marginBottom: 2 }}>
                  {tooltip.tagline}
                </span>
              )}
              {(tooltip.memberCount ?? 0) > 0 && (
                <span className={viewStyles.tooltipDetail} style={{ display: 'block' }}>Members: {tooltip.memberCount}</span>
              )}
              {tooltip.activityTier && (
                <span className={viewStyles.tooltipDetail} style={{ display: 'block' }}>Tier: {tooltip.activityTier}</span>
              )}
            </>
          )}
          {/* Ribbon hover — two-space connection */}
          {tooltip.text && (
            <>
              <span className={viewStyles.tooltipTitle}>{tooltip.text}</span>
              {tooltip.sourceTagline && (
                <span className={viewStyles.tooltipDetail} style={{ display: 'block', fontStyle: 'italic', marginTop: 2 }}>
                  {tooltip.sourceName}: {tooltip.sourceTagline}
                </span>
              )}
              {tooltip.targetTagline && (
                <span className={viewStyles.tooltipDetail} style={{ display: 'block', fontStyle: 'italic' }}>
                  {tooltip.targetName}: {tooltip.targetTagline}
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

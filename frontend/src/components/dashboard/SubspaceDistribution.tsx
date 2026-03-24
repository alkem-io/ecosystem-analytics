import { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import type { SubspaceMetrics } from '@server/types/dashboard.js';
import styles from './SubspaceDistribution.module.css';

interface SubspaceDistributionProps {
  subspaces: SubspaceMetrics[];
}

const MARGIN = 4;

export default function SubspaceDistribution({ subspaces }: SubspaceDistributionProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: 220 });

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      if (width > 0) setDimensions({ width, height: 220 });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || subspaces.length === 0) return;

    const { width, height } = dimensions;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', height);

    // Build hierarchy
    const root = d3
      .hierarchy<{ name: string; value?: number; children?: typeof subspaces }>({
        name: 'root',
        children: subspaces.map((s) => ({
          ...s,
          name: s.displayName,
          value: Math.max(s.totalContributions, 1),
        })),
      })
      .sum((d) => d.value ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    d3.treemap<{ name: string; value?: number }>()
      .size([width, height])
      .paddingInner(MARGIN)
      .paddingOuter(MARGIN)
      .round(true)(root);

    const maxVal = d3.max(subspaces, (s) => s.totalContributions) ?? 1;
    const colorScale = d3
      .scaleSequential(d3.interpolateBlues)
      .domain([0, maxVal]);

    const cells = svg
      .selectAll('g')
      .data(root.leaves())
      .join('g')
      .attr('transform', (d: any) => `translate(${d.x0},${d.y0})`);

    cells
      .append('rect')
      .attr('width', (d: any) => d.x1 - d.x0)
      .attr('height', (d: any) => d.y1 - d.y0)
      .attr('rx', 4)
      .attr('fill', (d: any) => colorScale(d.data.value ?? 0))
      .attr('fill-opacity', 0.85);

    // Labels
    cells
      .append('text')
      .attr('x', 6)
      .attr('y', 18)
      .attr('fill', '#fff')
      .style('font-size', '12px')
      .style('font-weight', '600')
      .text((d: any) => {
        const w = d.x1 - d.x0;
        const name = d.data.name;
        return w > 60 ? (name.length > w / 7 ? name.slice(0, Math.floor(w / 7)) + '...' : name) : '';
      });

    cells
      .append('text')
      .attr('x', 6)
      .attr('y', 34)
      .attr('fill', 'rgba(255,255,255,0.8)')
      .style('font-size', '11px')
      .text((d: any) => {
        const w = d.x1 - d.x0;
        return w > 60 ? `${d.data.value}` : '';
      });
  }, [subspaces, dimensions]);

  if (subspaces.length === 0) {
    return <div className={styles.empty}>This space has no subspaces</div>;
  }

  return (
    <div ref={containerRef} className={styles.container}>
      <svg ref={svgRef} />
    </div>
  );
}

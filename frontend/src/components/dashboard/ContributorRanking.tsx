import { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import type { ContributorDetail } from '@server/types/dashboard.js';
import styles from './ContributorRanking.module.css';

interface ContributorRankingProps {
  contributors: ContributorDetail[];
}

const MAX_DISPLAY = 15;
const MARGIN = { top: 8, right: 16, bottom: 24, left: 120 };
const BAR_HEIGHT = 24;
const BAR_GAP = 4;

export default function ContributorRanking({ contributors }: ContributorRankingProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(400);

  const top = contributors
    .filter((c) => c.totalContributions > 0)
    .slice(0, MAX_DISPLAY);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || top.length === 0) return;

    const h = MARGIN.top + top.length * (BAR_HEIGHT + BAR_GAP) + MARGIN.bottom;
    const w = width - MARGIN.left - MARGIN.right;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', h);

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    const x = d3
      .scaleLinear()
      .domain([0, d3.max(top, (d) => d.totalContributions) ?? 1])
      .nice()
      .range([0, w]);

    const y = d3
      .scaleBand<number>()
      .domain(top.map((_, i) => i))
      .range([0, top.length * (BAR_HEIGHT + BAR_GAP)])
      .padding(0.15);

    // Bars
    g.selectAll('.bar')
      .data(top)
      .join('rect')
      .attr('class', 'bar')
      .attr('x', 0)
      .attr('y', (_, i) => y(i)!)
      .attr('width', (d) => x(d.totalContributions))
      .attr('height', y.bandwidth())
      .attr('rx', 3)
      .attr('fill', 'var(--primary)')
      .attr('fill-opacity', 0.7);

    // Count labels
    g.selectAll('.count')
      .data(top)
      .join('text')
      .attr('class', 'count')
      .attr('x', (d) => x(d.totalContributions) + 6)
      .attr('y', (_, i) => y(i)! + y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('fill', 'var(--text-secondary)')
      .style('font-size', '11px')
      .text((d) => d.totalContributions);

    // Name labels (left side)
    g.selectAll('.name')
      .data(top)
      .join('text')
      .attr('class', 'name')
      .attr('x', -8)
      .attr('y', (_, i) => y(i)! + y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .attr('fill', 'var(--text-primary)')
      .style('font-size', '12px')
      .text((d) => truncate(d.displayName, 16));
  }, [top, width]);

  if (top.length === 0) {
    return <div className={styles.empty}>No contributor data</div>;
  }

  return (
    <div ref={containerRef} className={styles.container}>
      <svg ref={svgRef} />
    </div>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

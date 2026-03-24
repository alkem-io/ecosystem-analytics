import { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import type { HeadlineMetrics } from '@server/types/dashboard.js';
import styles from './ContentTypeMix.module.css';

interface ContentTypeMixProps {
  headline: HeadlineMetrics;
}

const TYPE_COLORS: Record<string, string> = {
  post: '#2563eb',
  memo: '#ec4899',
  link: '#16a34a',
  whiteboard: '#eab308',
};

const TYPE_LABELS: Record<string, string> = {
  post: 'Posts',
  memo: 'Memos',
  link: 'Links',
  whiteboard: 'Whiteboards',
};

export default function ContentTypeMix({ headline }: ContentTypeMixProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  const total =
    headline.contributionsByType.post +
    headline.contributionsByType.memo +
    headline.contributionsByType.link +
    headline.contributionsByType.whiteboard;

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      if (w > 0) setWidth(w);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || total === 0 || width === 0) return;

    const size = Math.min(width, 240);
    const radius = size / 2 - 8;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', size).attr('height', size);

    const g = svg.append('g').attr('transform', `translate(${size / 2},${size / 2})`);

    const data = Object.entries(headline.contributionsByType)
      .filter(([, v]) => v > 0)
      .map(([key, value]) => ({ type: key, value }));

    const pie = d3
      .pie<{ type: string; value: number }>()
      .value((d) => d.value)
      .sort(null);

    const arc = d3
      .arc<d3.PieArcDatum<{ type: string; value: number }>>()
      .innerRadius(radius * 0.55)
      .outerRadius(radius);

    const arcs = g.selectAll('.arc').data(pie(data)).enter().append('g').attr('class', 'arc');

    arcs
      .append('path')
      .attr('d', arc)
      .attr('fill', (d) => TYPE_COLORS[d.data.type] ?? '#94a3b8')
      .attr('stroke', 'var(--surface-raised, #fff)')
      .attr('stroke-width', 2)
      .style('cursor', 'help')
      .append('title')
      .text((d) => `${TYPE_LABELS[d.data.type] ?? d.data.type}: ${d.data.value} (${((d.data.value / total) * 100).toFixed(0)}%)`);

    // Center total with tooltip
    const centerGroup = g.append('g').style('cursor', 'help');
    centerGroup.append('title').text('Total responses across all types in this space (filtered by current selection).');

    centerGroup.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-0.2em')
      .attr('fill', 'var(--text-primary)')
      .attr('font-size', '1.5rem')
      .attr('font-weight', '700')
      .text(total);

    centerGroup.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '1.2em')
      .attr('fill', 'var(--text-muted)')
      .attr('font-size', '0.75rem')
      .text('responses');
  }, [headline, total, width]);

  if (total === 0) {
    return <div className={styles.empty}>No responses to display</div>;
  }

  return (
    <div className={styles.container} ref={containerRef}>
      <svg ref={svgRef} />
      <div className={styles.legend}>
        {Object.entries(headline.contributionsByType)
          .filter(([, v]) => v > 0)
          .map(([type, count]) => (
            <div key={type} className={styles.legendItem}>
              <span className={styles.swatch} style={{ backgroundColor: TYPE_COLORS[type] }} />
              <span className={styles.legendLabel}>{TYPE_LABELS[type] ?? type}</span>
              <span className={styles.legendValue}>
                {count} ({((count / total) * 100).toFixed(0)}%)
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

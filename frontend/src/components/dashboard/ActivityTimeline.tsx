import { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import type { TimelineBucket, CalloutDetail } from '@server/types/dashboard.js';
import styles from './ActivityTimeline.module.css';

interface ActivityTimelineProps {
  timeline: TimelineBucket[];
  callouts: CalloutDetail[];
}

type ViewMode = 'posts' | 'responses' | 'both';

// Post type colors (what kind of post it is)
const POST_TYPE_COLORS: Record<string, string> = {
  text: '#6366f1',           // indigo
  memo: '#ec4899',           // pink
  whiteboard: '#eab308',     // amber
  link: '#16a34a',           // green
  media_gallery: '#f97316',  // orange
};
const POST_TYPE_LABELS: Record<string, string> = {
  text: 'Text',
  memo: 'Memo',
  whiteboard: 'Whiteboard',
  link: 'Link',
  media_gallery: 'Media Gallery',
};

// Response type colors
const RESPONSE_TYPE_COLORS: Record<string, string> = {
  post: '#2563eb',       // blue
  memo: '#f472b6',       // light pink
  link: '#34d399',       // light green
  whiteboard: '#fbbf24', // light amber
};
const RESPONSE_TYPE_LABELS: Record<string, string> = {
  post: 'Posts',
  memo: 'Memos',
  link: 'Links',
  whiteboard: 'Whiteboards',
};

const MARGIN = { top: 20, right: 24, bottom: 40, left: 48 };

export default function ActivityTimeline({ timeline, callouts }: ActivityTimelineProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 280 });
  const [viewMode, setViewMode] = useState<ViewMode>('posts');

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      setDimensions({ width, height: 280 });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current) return;

    // --- Build post-type data per month ---
    const postsByMonth = new Map<string, Record<string, number>>();
    for (const c of callouts) {
      const month = c.createdDate.slice(0, 7);
      let rec = postsByMonth.get(month);
      if (!rec) { rec = { text: 0, memo: 0, whiteboard: 0, link: 0, media_gallery: 0 }; postsByMonth.set(month, rec); }
      rec[c.postType] = (rec[c.postType] ?? 0) + 1;
    }

    // --- Build response-type data per month from timeline ---
    const responsesByMonth = new Map<string, Record<string, number>>();
    for (const t of timeline) {
      responsesByMonth.set(t.period, { post: t.byType.post, memo: t.byType.memo, link: t.byType.link, whiteboard: t.byType.whiteboard });
    }

    // Merge all months
    const allMonths = new Set<string>();
    for (const m of postsByMonth.keys()) allMonths.add(m);
    for (const m of responsesByMonth.keys()) allMonths.add(m);
    const months = Array.from(allMonths).sort();

    if (months.length === 0) return;

    const { width, height } = dimensions;
    const w = width - MARGIN.left - MARGIN.right;
    const h = height - MARGIN.top - MARGIN.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    if (viewMode === 'both') {
      // Grouped: two stacked bars per month (left = posts, right = responses)
      drawGroupedStacked(g, months, postsByMonth, responsesByMonth, w, h);
    } else if (viewMode === 'posts') {
      drawStacked(g, months, postsByMonth, Object.keys(POST_TYPE_COLORS), POST_TYPE_COLORS, POST_TYPE_LABELS, w, h);
    } else {
      drawStacked(g, months, responsesByMonth, Object.keys(RESPONSE_TYPE_COLORS), RESPONSE_TYPE_COLORS, RESPONSE_TYPE_LABELS, w, h);
    }
  }, [timeline, callouts, dimensions, viewMode]);

  if (timeline.length === 0 && callouts.length === 0) {
    return <div className={styles.empty}>No timeline data available</div>;
  }

  return (
    <div ref={containerRef} className={styles.container}>
      <div className={styles.toggle}>
        {(['posts', 'responses', 'both'] as const).map((mode) => (
          <button
            key={mode}
            className={styles.toggleBtn}
            data-active={viewMode === mode}
            onClick={() => setViewMode(mode)}
          >
            {mode === 'posts' ? 'Posts' : mode === 'responses' ? 'Responses' : 'Both'}
          </button>
        ))}
      </div>
      <svg ref={svgRef} />
    </div>
  );
}

/** Draw a single stacked bar chart */
function drawStacked(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  months: string[],
  dataByMonth: Map<string, Record<string, number>>,
  allKeys: string[],
  colors: Record<string, string>,
  labels: Record<string, string>,
  w: number,
  h: number,
) {
  const data = months.map((m) => {
    const rec = dataByMonth.get(m) ?? {};
    const row: Record<string, number | string> = { month: m };
    for (const k of allKeys) row[k] = rec[k] ?? 0;
    return row;
  });

  // Filter to keys with data
  const activeKeys = allKeys.filter((k) => data.some((d) => (d[k] as number) > 0));

  const x = d3.scaleBand().domain(months).range([0, w]).padding(months.length === 1 ? 0.5 : 0.25);

  const stack = d3.stack<Record<string, number | string>>().keys(activeKeys).order(d3.stackOrderNone).offset(d3.stackOffsetNone);
  const series = stack(data);

  const yMax = d3.max(series, (s) => d3.max(s, (d) => d[1])) ?? 1;
  const y = d3.scaleLinear().domain([0, Math.max(yMax, 1)]).nice().range([h, 0]);

  g.selectAll('g.series')
    .data(series)
    .join('g')
    .attr('class', 'series')
    .attr('fill', (d) => colors[d.key] ?? '#94a3b8')
    .attr('fill-opacity', 0.8)
    .selectAll('rect')
    .data((d) => d.map((v) => ({ ...v, key: d.key })))
    .join('rect')
    .attr('x', (d) => x(d.data.month as string)!)
    .attr('y', (d) => y(d[1]))
    .attr('width', x.bandwidth())
    .attr('height', (d) => Math.max(0, y(d[0]) - y(d[1])))
    .attr('rx', 2)
    .style('cursor', 'help')
    .append('title')
    .text((d) => {
      const val = d.data[d.key] as number;
      const label = labels[d.key] ?? d.key;
      const monthLabel = new Date(`${d.data.month}-01`).toLocaleDateString('en', { month: 'short', year: 'numeric' });
      return `${label}: ${val} (${monthLabel})`;
    });

  drawAxes(g, x, y, yMax, w, h);
  drawLegend(g, activeKeys, colors, labels, w);
}

/** Draw grouped stacked bars (posts + responses side by side) */
function drawGroupedStacked(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  months: string[],
  postsByMonth: Map<string, Record<string, number>>,
  responsesByMonth: Map<string, Record<string, number>>,
  w: number,
  h: number,
) {
  const postKeys = Object.keys(POST_TYPE_COLORS);
  const respKeys = Object.keys(RESPONSE_TYPE_COLORS);

  const postData = months.map((m) => {
    const rec = postsByMonth.get(m) ?? {};
    const row: Record<string, number | string> = { month: m };
    for (const k of postKeys) row[k] = rec[k] ?? 0;
    return row;
  });
  const respData = months.map((m) => {
    const rec = responsesByMonth.get(m) ?? {};
    const row: Record<string, number | string> = { month: m };
    for (const k of respKeys) row[k] = rec[k] ?? 0;
    return row;
  });

  const activePostKeys = postKeys.filter((k) => postData.some((d) => (d[k] as number) > 0));
  const activeRespKeys = respKeys.filter((k) => respData.some((d) => (d[k] as number) > 0));

  const x0 = d3.scaleBand().domain(months).range([0, w]).padding(months.length === 1 ? 0.5 : 0.2);
  const x1 = d3.scaleBand().domain(['posts', 'responses']).range([0, x0.bandwidth()]).padding(0.08);

  const postStack = d3.stack<Record<string, number | string>>().keys(activePostKeys).order(d3.stackOrderNone).offset(d3.stackOffsetNone);
  const respStack = d3.stack<Record<string, number | string>>().keys(activeRespKeys).order(d3.stackOrderNone).offset(d3.stackOffsetNone);

  const postSeries = postStack(postData);
  const respSeries = respStack(respData);

  const yMax = Math.max(
    d3.max(postSeries, (s) => d3.max(s, (d) => d[1])) ?? 0,
    d3.max(respSeries, (s) => d3.max(s, (d) => d[1])) ?? 0,
    1,
  );
  const y = d3.scaleLinear().domain([0, yMax]).nice().range([h, 0]);

  // Post bars (left group)
  const postOffset = x1('posts')!;
  const barW = x1.bandwidth();
  g.selectAll('g.post-series')
    .data(postSeries)
    .join('g')
    .attr('class', 'post-series')
    .attr('fill', (d) => POST_TYPE_COLORS[d.key] ?? '#94a3b8')
    .attr('fill-opacity', 0.8)
    .selectAll('rect')
    .data((d) => d.map((v) => ({ ...v, key: d.key })))
    .join('rect')
    .attr('x', (d) => x0(d.data.month as string)! + postOffset)
    .attr('y', (d) => y(d[1]))
    .attr('width', barW)
    .attr('height', (d) => Math.max(0, y(d[0]) - y(d[1])))
    .attr('rx', 2)
    .style('cursor', 'help')
    .append('title')
    .text((d) => {
      const val = d.data[d.key] as number;
      return `Post: ${POST_TYPE_LABELS[d.key]}: ${val}`;
    });

  // Response bars (right group)
  const respOffset = x1('responses')!;
  g.selectAll('g.resp-series')
    .data(respSeries)
    .join('g')
    .attr('class', 'resp-series')
    .attr('fill', (d) => RESPONSE_TYPE_COLORS[d.key] ?? '#94a3b8')
    .attr('fill-opacity', 0.8)
    .selectAll('rect')
    .data((d) => d.map((v) => ({ ...v, key: d.key })))
    .join('rect')
    .attr('x', (d) => x0(d.data.month as string)! + respOffset)
    .attr('y', (d) => y(d[1]))
    .attr('width', barW)
    .attr('height', (d) => Math.max(0, y(d[0]) - y(d[1])))
    .attr('rx', 2)
    .style('cursor', 'help')
    .append('title')
    .text((d) => {
      const val = d.data[d.key] as number;
      return `Response: ${RESPONSE_TYPE_LABELS[d.key]}: ${val}`;
    });

  drawAxes(g, x0, y, yMax, w, h);

  // Combined legend
  const allItems = [
    ...activePostKeys.map((k) => ({ label: `P: ${POST_TYPE_LABELS[k]}`, color: POST_TYPE_COLORS[k] })),
    ...activeRespKeys.map((k) => ({ label: `R: ${RESPONSE_TYPE_LABELS[k]}`, color: RESPONSE_TYPE_COLORS[k] })),
  ];
  const legend = g.append('g').attr('transform', `translate(${w - allItems.length * 75}, -10)`);
  allItems.forEach(({ label, color }, i) => {
    const lg = legend.append('g').attr('transform', `translate(${i * 75}, 0)`);
    lg.append('rect').attr('width', 10).attr('height', 10).attr('rx', 2).attr('fill', color).attr('fill-opacity', 0.8);
    lg.append('text').attr('x', 14).attr('y', 9).attr('fill', 'var(--text-muted)').style('font-size', '9px').text(label);
  });
}

function drawAxes(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  x: d3.ScaleBand<string>,
  y: d3.ScaleLinear<number, number>,
  yMax: number,
  w: number,
  h: number,
) {
  g.append('g')
    .attr('transform', `translate(0,${h})`)
    .call(
      d3.axisBottom(x).tickFormat((period) => {
        const d = new Date(`${period}-01`);
        return d3.timeFormat('%b %y')(d);
      }),
    )
    .selectAll('text')
    .attr('fill', 'var(--text-muted)')
    .style('font-size', '11px');

  const yAxis = d3
    .axisLeft(y)
    .ticks(Math.min(5, yMax))
    .tickFormat((d) => (Number.isInteger(d.valueOf()) ? String(d) : ''));
  g.append('g').call(yAxis).selectAll('text').attr('fill', 'var(--text-muted)').style('font-size', '11px');

  g.selectAll('.grid-line')
    .data(y.ticks(Math.min(5, yMax)))
    .join('line')
    .attr('class', 'grid-line')
    .attr('x1', 0)
    .attr('x2', w)
    .attr('y1', (d) => y(d))
    .attr('y2', (d) => y(d))
    .attr('stroke', 'var(--border)')
    .attr('stroke-opacity', 0.3);
}

function drawLegend(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  keys: string[],
  colors: Record<string, string>,
  labels: Record<string, string>,
  w: number,
) {
  const items = keys.map((k) => ({ label: labels[k] ?? k, color: colors[k] }));
  const legend = g.append('g').attr('transform', `translate(${w - items.length * 80}, -10)`);
  items.forEach(({ label, color }, i) => {
    const lg = legend.append('g').attr('transform', `translate(${i * 80}, 0)`);
    lg.append('rect').attr('width', 10).attr('height', 10).attr('rx', 2).attr('fill', color).attr('fill-opacity', 0.8);
    lg.append('text').attr('x', 14).attr('y', 9).attr('fill', 'var(--text-muted)').style('font-size', '10px').text(label);
  });
}

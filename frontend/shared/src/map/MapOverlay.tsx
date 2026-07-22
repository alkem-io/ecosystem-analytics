import { useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { geoMercator, geoPath } from 'd3-geo';
import styles from './MapOverlay.module.css';
import { resolveMapConfig, type GraphMapRegion, type MapRegion } from './mapConfig.js';

export type { MapRegion };

interface Props {
  region: GraphMapRegion;
  width: number;
  height: number;
  visible: boolean;
}

export default function MapOverlay({ region, width, height, visible }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!visible || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const cfg = resolveMapConfig(region);
    const projection = geoMercator()
      .center(cfg.center)
      .scale(cfg.scale)
      .translate([width / 2, height / 2]);

    const path = geoPath().projection(projection);

    // Load GeoJSON and render
    fetch(cfg.url)
      .then((res) => {
        if (!res.ok) throw new Error('Map not found');
        return res.json();
      })
      .then((geojson) => {
        svg
          .append('g')
          .selectAll('path')
          .data(geojson.features || [geojson])
          .join('path')
          .attr('d', path as any)
          .attr('fill', '#e8ecf0')
          .attr('stroke', '#c8cdd3')
          .attr('stroke-width', 0.5);
      })
      .catch(() => {
        // Graceful degradation when map assets fail to load
        svg
          .append('text')
          .attr('x', width / 2)
          .attr('y', height / 2)
          .attr('text-anchor', 'middle')
          .attr('fill', 'var(--text-muted)')
          .attr('font-size', 14)
          .text('Map unavailable');
      });
  }, [region, width, height, visible]);

  if (!visible) return null;

  return <svg ref={svgRef} className={styles.map} width={width} height={height} />;
}

import { useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { geoMercator, geoPath } from 'd3-geo';
import styles from './MapOverlay.module.css';

export type MapRegion = 'world' | 'europe' | 'netherlands';

interface Props {
  region: MapRegion;
  width: number;
  height: number;
  visible: boolean;
}

// GeoJSON basemap paths — v1 ships with 3 static files (Natural Earth, public domain).
// Future step: migrate to dynamic tile-based provider (MapLibre GL).
const MAP_URLS: Record<MapRegion, string> = {
  world: '/maps/world.geojson',
  europe: '/maps/europe.geojson',
  netherlands: '/maps/netherlands.geojson',
};

const MAP_CENTERS: Record<MapRegion, [number, number]> = {
  world: [0, 20],
  europe: [15, 50],
  netherlands: [5.3, 52.2],
};

const MAP_SCALES: Record<MapRegion, number> = {
  world: 120,
  europe: 600,
  netherlands: 5000,
};

export default function MapOverlay({ region, width, height, visible }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!visible || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const projection = geoMercator()
      .center(MAP_CENTERS[region])
      .scale(MAP_SCALES[region])
      .translate([width / 2, height / 2]);

    const path = geoPath().projection(projection);

    // Load GeoJSON and render
    fetch(MAP_URLS[region])
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
        // NFR-005: graceful degradation when map assets fail to load
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

  return (
    <svg
      ref={svgRef}
      className={styles.map}
      width={width}
      height={height}
    />
  );
}

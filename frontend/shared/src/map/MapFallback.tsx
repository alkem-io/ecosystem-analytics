/**
 * "Map detail unavailable" notice (feature 021, FR-021/FR-022a).
 *
 * Shown when the basemap cannot draw — the service is unreachable, the style fails, or the
 * browser has no WebGL. The region outline and every marker are still drawn by the SVG
 * above, and every marker interaction still works (FR-022b): what is lost is the street
 * detail, not the information the map carries.
 *
 * The notice is what stops a degraded map being mistaken for a finished one. An outline
 * with pins and no explanation reads as a design choice.
 *
 * Rendered BELOW the map alongside the attribution, not over it: §VII requires everything
 * outside the region to be plain background, and a floating notice box would be drawn on
 * exactly that area.
 */
export function MapFallback({ className = '' }: { className?: string }) {
  return (
    <div
      className={`px-1 pt-1 text-[11px] leading-tight text-muted-foreground ${className}`}
      role="status"
      data-testid="map-fallback"
    >
      Map detail unavailable — showing outlines only
    </div>
  );
}

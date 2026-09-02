/**
 * Map data credit (feature 021, FR-018/FR-019).
 *
 * OpenFreeMap's licence requires "OpenFreeMap © OpenMapTiles Data from OpenStreetMap" to
 * stay on every map — it is what the free tier is granted in exchange for. The product
 * rendered no credit at all before this, under CARTO's equivalent requirement too.
 *
 * Deliberately rendered BELOW the map rather than in MapLibre's in-canvas control (which
 * is what client-web uses): constitution §VII requires everything outside the Dutch border
 * to be plain background, so nothing may be drawn over the map area. Sitting beneath it
 * satisfies both rules without either needing reinterpretation, and it is always visible
 * rather than collapsed behind an "ⓘ" the user has to find.
 */
export function MapAttribution({ className = '' }: { className?: string }) {
  return (
    <p
      className={`px-1 pt-1 text-[10px] leading-tight text-muted-foreground ${className}`}
      data-testid="map-attribution"
    >
      <a
        href="https://openfreemap.org/"
        target="_blank"
        rel="noreferrer noopener"
        className="hover:underline"
      >
        OpenFreeMap
      </a>{' '}
      ©{' '}
      <a
        href="https://openmaptiles.org/"
        target="_blank"
        rel="noreferrer noopener"
        className="hover:underline"
      >
        OpenMapTiles
      </a>{' '}
      Data from{' '}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer noopener"
        className="hover:underline"
      >
        OpenStreetMap
      </a>
    </p>
  );
}

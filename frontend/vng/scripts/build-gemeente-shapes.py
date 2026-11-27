"""Build public/maps/gemeenten.json — every Dutch gemeente's outline, compact.

Source: the 12 province basemaps already in public/maps/provinces (CBS 2023
generalised gemeente polygons, `statcode` GM####). Rings are simplified (Douglas–Peucker,
~100 m) and rounded to 3 decimals — both below a pixel at national zoom — which brings the 3.3 MB of province files to a single small file that the
flat gemeente maps (layout A) load once.

Run from frontend/vng:  python3 scripts/build-gemeente-shapes.py
"""
import json, pathlib

here = pathlib.Path(__file__).resolve().parent.parent
src = here / 'public' / 'maps' / 'provinces'
out = here / 'public' / 'maps' / 'gemeenten.json'
prov_names = json.loads((here / 'public' / 'maps' / 'netherlands.geojson').read_text())


TOL = 0.0012  # degrees, ~100 m: Douglas–Peucker tolerance, below a pixel nationally


def simplify(pts):
    """Douglas–Peucker, iterative, keeping the ring closed."""
    if len(pts) < 5:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = pts[a], pts[b]
        dx, dy = bx - ax, by - ay
        n = (dx * dx + dy * dy) ** 0.5 or 1e-12
        best, idx = 0.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            d = abs(dy * px - dx * py + bx * ay - by * ax) / n if (dx or dy) else ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
            if d > best:
                best, idx = d, i
        if best > TOL and idx > 0:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(pts, keep) if k]


def area(r):
    return sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(r, r[1:]))


def wind(r, exterior):
    """d3-geo reads rings spherically: exteriors must run clockwise (negative planar
    area in lon/lat), holes counter-clockwise — otherwise a gemeente becomes
    "the whole world except this gemeente"."""
    cw = area(r) < 0
    return r if cw == exterior else r[::-1]


def ring(r, exterior=True):
    r = wind(simplify(r), exterior)
    pts, last = [], None
    for x, y in r:
        p = [round(x, 3), round(y, 3)]
        if p != last:
            pts.append(p)
            last = p
    return pts if len(pts) >= 4 else None


feats = []
for f in sorted(src.glob('*.geojson')):
    prov = None
    data = json.loads(f.read_text())
    for ft in data['features']:
        g = ft['geometry']
        polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        polys = [[r for r in (ring(x, i == 0) for i, x in enumerate(poly)) if r] for poly in polys]
        polys = [p for p in polys if p]
        feats.append({
            'type': 'Feature',
            'properties': {'code': ft['properties']['statcode'], 'name': ft['properties']['statnaam'], 'province': f.stem},
            'geometry': {'type': 'MultiPolygon', 'coordinates': polys},
        })
out.write_text(json.dumps({'type': 'FeatureCollection', 'features': feats}, separators=(',', ':')))
print(len(feats), 'gemeenten,', out.stat().st_size // 1024, 'KB')

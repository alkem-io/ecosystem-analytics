# Research: Node Avatar Display

**Feature**: 002-node-avatar-display
**Date**: 2026-02-23

## Research Questions

### RQ-1: What is the best SVG technique for displaying images inside circles in a D3 force graph?

**Decision**: Use `<clipPath>` with `<circle>` applied to `<image>` elements.

**Rationale**:
- Three main approaches exist: (a) SVG `<pattern>` fill on circles, (b) `<clipPath>` on `<image>`, (c) `<foreignObject>` with HTML `<img>`.
- `<clipPath>` is the most straightforward: define a circular clip region, apply it to an `<image>`. The image is clipped to the circle shape naturally.
- `<pattern>` fill requires complex `patternUnits`/`patternContentUnits` configuration and each pattern must be individually sized to the node. Scaling issues are common.
- `<foreignObject>` has inconsistent cross-browser support for interactive SVG elements and doesn't integrate cleanly with D3's SVG manipulation.
- `<clipPath>` integrates naturally with D3's `.append()` chain and supports `onerror` handling on the `<image>` element.

**Alternatives Considered**:
- `<pattern>` fill: More complex, harder to handle errors (no `onerror` on `<pattern>`), requires unique `<pattern>` per node size.
- `<foreignObject>` with `<img>`: Cross-browser inconsistencies, CSS `border-radius` needed, doesn't integrate with SVG transforms cleanly.
- Canvas rendering: Would require rewriting the entire rendering pipeline from SVG to Canvas.

### RQ-2: How should `<clipPath>` IDs be scoped to avoid collisions?

**Decision**: Use node ID-based clip path IDs: `clip-avatar-{nodeId}`.

**Rationale**:
- Each node has a unique `id` from the Alkemio API.
- The `<defs>` block is cleared on every re-render (`svg.selectAll('*').remove()`), so stale IDs are not a concern.
- ID format: `clip-avatar-{nodeId}` ensures no collision with any other SVG element IDs.

**Alternatives Considered**:
- Index-based IDs (`clip-0`, `clip-1`): Fragile if node order changes.
- Single shared `<clipPath>`: Won't work because nodes have different radii (based on weight).

### RQ-3: How to handle avatar image load failures?

**Decision**: Attach `onerror` handler on each `<image>` that removes the element on failure. The background `<circle>` (always rendered with the original color fill) shows through as the fallback.

**Rationale**:
- SVG `<image>` supports the standard `onerror` event.
- By always rendering the colored `<circle>` first and overlaying the `<image>` on top, any load failure just reveals the original node appearance.
- This matches the spec requirement FR-004 (graceful fallback).
- No placeholder/spinner needed — the colored circle is already visible while the image loads.

**Alternatives Considered**:
- Show a loading spinner: Over-engineered for tiny node circles (~5-13px radius).
- Show initials as fallback: Would require additional text rendering logic; not requested in spec.
- Pre-validate URLs before rendering: Would delay rendering and add unnecessary complexity.

### RQ-4: Does the existing highlight/selection logic need changes?

**Decision**: No changes needed to highlight logic.

**Rationale**:
- The existing highlight logic operates on `nodeSelection` (the `<g>` groups), changing:
  - `opacity` on the group (affects all children equally including `<image>`)
  - `circle` `stroke` and `stroke-width` (the background circle is still there)
- Since the `<image>` is inside the same `<g>` group, opacity changes apply automatically.
- Stroke changes on the `<circle>` still work as the circle is rendered underneath.

### RQ-5: Are avatar URLs from Alkemio publicly accessible from the browser?

**Decision**: Assumed yes — Alkemio avatar URLs are typically public CDN URLs.

**Rationale**:
- The Alkemio platform serves avatar images via public URIs (the `visual(type: AVATAR) { uri }` field).
- These URLs are designed to be embeddable in web pages and don't require authentication headers.
- If any URLs require auth, the `onerror` handler will gracefully fall back to the color fill.

## Summary

No NEEDS CLARIFICATION items remain. The implementation approach is well-defined:
- Use `<clipPath>` + `<image>` technique
- Node-ID-based clip path IDs
- `onerror` fallback to colored circle
- No changes to highlight logic
- Frontend-only, single-file change

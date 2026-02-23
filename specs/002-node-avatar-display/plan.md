# Implementation Plan: Node Avatar Display

**Branch**: `002-node-avatar-display` | **Date**: 2026-02-23 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/002-node-avatar-display/spec.md`

## Summary

Replace the solid color fills on user (and optionally organization) nodes in the force graph with their profile images (avatars), clipped to the existing circular shape. Avatar URLs are already available end-to-end in the data pipeline (`GraphNode.avatarUrl`). The change is frontend-only: adding SVG `<defs>` with circular `<clipPath>` elements and `<image>` elements inside each node's `<g>` group, with a graceful fallback to the current color fill when no avatar is available or the image fails to load.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), React 19.2.4
**Primary Dependencies**: D3 v7.9 (d3-selection, d3-force), Vite 7.3.1
**Storage**: N/A (no backend changes required)
**Testing**: Manual visual testing (no existing unit test framework for the graph component)
**Target Platform**: Modern browsers (Chrome, Firefox, Safari, Edge)
**Project Type**: Web application (frontend-only change)
**Performance Goals**: Graph with 100+ avatar nodes renders without noticeable frame drops; avatar images load within 2 seconds
**Constraints**: User node circles are ~5.2px radius (weight=3) — avatars at this size are small but still display
**Scale/Scope**: Single component change in `ForceGraph.tsx` (~305 lines currently)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Alkemio Identity Auth | ✅ Pass | No auth changes. Avatar URLs already fetched server-side and served via BFF. |
| II. Typed GraphQL Contract | ✅ Pass | No GraphQL changes. `avatarUrl` already exists on `GraphNode`. |
| III. BFF Boundary | ⚠️ Note | Avatar image URLs point to Alkemio's CDN/storage, fetched directly by browser as `<image>` src. This is standard browser behavior for loading images — not an API call. The BFF boundary applies to data/auth API calls, not static asset loading. |
| IV. Data Sensitivity | ✅ Pass | Avatar URLs already exposed to frontend via dataset. No new data exposure. |
| V. Graceful Degradation | ✅ Pass | Spec explicitly requires fallback to color fill for missing/broken avatars (FR-003, FR-004). |
| VI. Design Fidelity | ✅ Pass | New feature not covered by original design brief. Enhances visual identity without conflicting with existing design. |

**Post-Design Re-check**: All gates still pass. The implementation adds only SVG elements to the existing render pipeline — no new API calls, no new data flows, no auth changes.

## Project Structure

### Documentation (this feature)

```text
specs/002-node-avatar-display/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (empty — no API changes)
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
frontend/
└── src/
    └── components/
        └── graph/
            └── ForceGraph.tsx    # PRIMARY CHANGE — avatar rendering
```

**Structure Decision**: Frontend-only change, single file (`ForceGraph.tsx`). No new files needed. The SVG `<defs>`, `<clipPath>`, and `<image>` elements are added programmatically within the existing D3 render pipeline.

## Technical Approach

### Current Rendering Pipeline (ForceGraph.tsx)

```
svg.selectAll('*').remove()       // Clear everything
  → g = svg.append('g')          // Root group (zoom target)
  → [map overlay if geo mode]    // Map paths
  → linkSelection                // Edge lines
  → nodeSelection                // Node groups:
      → <g> per node             //   Group (translates on tick)
        → <circle>               //   Solid color fill
        → <text>                 //   Label (non-USER only)
  → simulation.on('tick', ...)   // Position updates
  → [highlight logic]            // Opacity/stroke changes
```

### Proposed Change

Insert avatar rendering between the `<circle>` and `<text>` steps:

```
→ nodeSelection
    → <g> per node
      → <circle>                 // Keep as border/fallback (always rendered)
      → <clipPath> (in <defs>)   // Circular clip matching node radius
      → <image>                  // Avatar image, clipped to circle (only if avatarUrl)
      → <text>                   // Label (non-USER only, unchanged)
```

**Technique**: SVG `<clipPath>` with `<circle>` inside, applied to an `<image>` element. Each node with an avatar gets a unique `clipPath` ID. The background `<circle>` is always rendered (serves as border + fallback).

### Why `<clipPath>` over `<pattern>` fill?

1. **Simpler error handling**: `<image>` has `onerror` — if load fails, just hide the image and the background circle shows through
2. **No scaling math**: `<pattern>` requires `patternUnits`/`patternContentUnits` math to avoid tiling; `<image>` with `clipPath` is straightforward
3. **Better performance**: One `<image>` per node vs. one `<pattern>` definition + fill reference per node
4. **D3 convention**: More commonly used in D3 force graph examples

### Error Handling Strategy

1. Always render the `<circle>` with the original color fill
2. Only append `<image>` if `avatarUrl` is truthy
3. Attach an `onerror` handler on each `<image>` that removes it on failure
4. Result: failed/missing avatars naturally show the colored circle underneath

### Performance Considerations

- Images are loaded by the browser natively — D3/JS only creates the `<image>` elements
- Each avatar is loaded once per render (browser caches subsequent requests)
- ClipPath definitions are lightweight SVG — no measurable overhead for 100+ nodes
- The `svg.selectAll('*').remove()` on re-render cleans up all defs automatically

## Phases Summary

| Phase | Output | Purpose |
|-------|--------|---------|
| Phase 0 | research.md | SVG image clipping technique validation |
| Phase 1 | data-model.md, quickstart.md | Data flow documentation, dev setup |
| Phase 2 | tasks.md | Actionable implementation tasks |

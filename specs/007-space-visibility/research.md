# Research: Space Visibility Indicators

**Feature**: 007-space-visibility  
**Date**: 2026-02-26

## RQ-1: Data Source — `isContentPublic` vs `settings.privacy.mode`

### Decision: Use `SpaceAbout.isContentPublic` (Boolean)

### Rationale

The Alkemio API provides two paths to determine space privacy:

| Path | Type | Location |
|------|------|----------|
| `SpaceAbout.isContentPublic` | `Boolean` (non-nullable) | On `SpaceAbout`, already queried via `spaceAboutFragment` |
| `Space.settings.privacy.mode` | `SpacePrivacyMode` enum (`PUBLIC` \| `PRIVATE`) | On `Space.settings`, requires new nested query block |

`isContentPublic` is a **convenience boolean** derived from the privacy mode setting. Its JSDoc reads: *"Is the content of this Space visible to non-Members?"* — this is semantically identical to checking `settings.privacy.mode === 'PUBLIC'`.

**Advantages of `isContentPublic`**:
1. **Minimal fragment change**: Add 1 line to `spaceAboutFragment.graphql` (already queries `SpaceAbout`)
2. **No new nested types**: Boolean vs nested `settings { privacy { mode } }` object
3. **Simpler mapping**: `isContentPublic ? 'PUBLIC' : 'PRIVATE'` vs importing and comparing an enum
4. **Smaller codegen diff**: One field added to existing fragment type vs new nested object type

### Alternatives Considered

- **`Space.settings.privacy.mode`**: More explicit enum value but requires modifying `SpaceGraphInfoFragment` (which queries `Space`), adding 3+ lines for nested `settings { privacy { mode } }`, and carrying unused `allowPlatformSupportAsAdmin` field. Rejected as unnecessarily complex.
- **`SpaceVisibility` enum**: This is `ACTIVE | ARCHIVED | DEMO` — controls lifecycle state, NOT privacy. Not suitable.

---

## RQ-2: Subspace Privacy Independence

### Decision: Each subspace has independent privacy settings

### Rationale

The Alkemio API schema defines `settings` (and by proxy `isContentPublic`) on the `Space` type itself. Since subspaces (L1, L2) are also `Space` entities queried through the `subspaces` field (which uses the same `SpaceGraphInfoFragment`), each subspace independently reports its own `isContentPublic` value. There is no inheritance mechanism in the API — a private L0 space can have public L1 subspaces and vice versa.

The existing `spaceAboutFragment` is already spread into the recursive subspace queries in the transformer, so adding `isContentPublic` to it will automatically propagate to L1 and L2 levels.

### Alternatives Considered

- **Inherit from parent**: Would reduce API calls but contradicts the API's per-space model and could misrepresent visibility. Rejected.

---

## RQ-3: SVG Icon Rendering Approach for D3 Nodes

### Decision: Use SVG `<text>` elements with Unicode lock characters, positioned relative to node radius

### Rationale

The ForceGraph component renders nodes as SVG `<circle>` elements with optional `<image>` (avatar) and `<text>` (label) children. The existing badge system (proximity clusters) demonstrates the pattern for adding visual overlays.

**Lock icon options evaluated**:

| Approach | Pros | Cons |
|----------|------|------|
| Unicode text (`🔒` / `🔓`) | Zero dependencies, works in SVG `<text>`, consistent across browsers | Emoji styling varies slightly across OSs |
| SVG `<path>` (hand-drawn) | Pixel-perfect, themeable | Manual path data, more code |
| External SVG icon library | Consistent design | New dependency, async loading |
| CSS background on foreignObject | Familiar CSS | `foreignObject` performance issues in D3 force layouts |

**Chosen: Unicode text** — simplest, zero-dependency approach. Use `🔒` (U+1F512) for private and `🔓` (U+1F513) for public. Rendered as SVG `<text>` elements positioned at bottom-right of the node circle, with a white circle background for contrast.

**Fallback**: If emoji rendering proves inconsistent across target browsers, switch to inline SVG `<path>` data for a lock icon. This can be done in a follow-up without changing the data model.

### Positioning Strategy

- **Anchor**: Bottom-right quadrant of the space node circle
- **Offset**: `(nodeRadius * 0.6, nodeRadius * 0.6)` from center — places icon at ~45° in the SE quadrant
- **Badge size**: Small circle background (r=7 for L0, r=5 for L1/L2) with icon text centered inside
- **Scale**: Icon scales with node radius to maintain legibility at all zoom levels
- **Z-order**: Rendered after avatar images but before labels, so icon appears on top of the node but under text

### Alternatives Considered

- **Top-left position**: Conflicts with avatar rendering on user/org nodes (not applicable here since only spaces get icons, but bottom-right is a cleaner semantic position)
- **Separate icon layer**: Would require managing a parallel D3 selection; positioning becomes complex with force simulation. Rejected in favor of per-node child elements.

---

## RQ-4: Filter Composition Strategy

### Decision: Independent visibility state (`showPublic` / `showPrivate`) composed with existing entity and role filters

### Rationale

The current filtering architecture in Explorer.tsx uses independent boolean state variables:
- **Entity filters**: `showPeople`, `showOrganizations`, `showSpaces`
- **Role filters**: `showMembers`, `showLeads`, `showAdmins`

These are passed as props through `ControlPanel` → `FilterControls` → `ForceGraph`. The ForceGraph applies all filters during the tick/update cycle by setting `display: none` on hidden nodes and edges.

**Visibility filter integration**:
1. Add `showPublic` and `showPrivate` state to Explorer.tsx (both default `true`)
2. Pass through ControlPanel → FilterControls and ForceGraph
3. In ForceGraph, a space node is visible if:
   - `showSpaces === true` AND
   - (`node.privacyMode === 'PUBLIC' && showPublic`) OR (`node.privacyMode === 'PRIVATE' && showPrivate`)
4. When a space is hidden by visibility filter, its CHILD edges are hidden. Users/orgs connected ONLY to hidden spaces become orphaned and are also hidden (same orphan-removal logic used by entity filters).

### Filter Interaction Matrix

| showSpaces | showPublic | showPrivate | Result |
|-----------|-----------|------------|--------|
| true | true | true | All spaces visible |
| true | true | false | Only public spaces |
| true | false | true | Only private spaces |
| true | false | false | No spaces (edge case — allowed) |
| false | any | any | No spaces (entity filter overrides) |

### Alternatives Considered

- **Single dropdown** (Public / Private / All): Less flexible than independent checkboxes; doesn't match the established pattern of toggle checkboxes. Rejected.
- **Integrated with entity filter**: Combining visibility into the "Spaces" checkbox would lose filtering granularity. Rejected.

---

## RQ-5: Mapping `isContentPublic` to `GraphNode.privacyMode`

### Decision: Map in `transformer.ts` at the BFF layer; store as `'PUBLIC' | 'PRIVATE'` string literal on GraphNode

### Rationale

The BFF transformer (`server/src/transform/transformer.ts`) is the established location for mapping API data to `GraphNode` properties. The `addSpaceNode()` function (line ~122) constructs each `GraphNode` from the `SpaceLike` interface.

**Mapping logic**:
```typescript
privacyMode: space.about.isContentPublic !== false ? 'PUBLIC' : 'PRIVATE'
```

Using `!== false` (rather than `=== true`) ensures graceful degradation per FR-010: if `isContentPublic` is `undefined` or `null` (shouldn't happen per schema, but defensive), defaults to `'PUBLIC'`.

**Why string literal instead of boolean on GraphNode**:
- The spec defines `privacyMode: 'PUBLIC' | 'PRIVATE'` — a semantic value more readable than a boolean in UI logic
- Extensible if future privacy modes are added
- Aligns with the `NodeType` and `EdgeType` string union pattern used throughout the codebase

### Alternatives Considered

- **Pass boolean directly**: `isPublic: boolean` on GraphNode. Simpler but less semantic, harder to extend, doesn't match existing enum-style patterns. Rejected.
- **Map in frontend**: Violates BFF boundary principle (C-III) — transformation logic belongs server-side. Rejected.

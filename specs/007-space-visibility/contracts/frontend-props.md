# Frontend Props Contract: Space Visibility

**Feature**: 007-space-visibility  
**Date**: 2026-02-26

## New Props Flow

```
Explorer.tsx (state owner)
  ├── showPublic: boolean (default: true)
  ├── showPrivate: boolean (default: true)
  │
  ├──▶ ControlPanel (pass-through + legend)
  │     ├──▶ FilterControls (visibility checkboxes)
  │     └── Legend section (visibility icons)
  │
  └──▶ ForceGraph (filtering + icon rendering)
```

---

## FilterControls — New Props

**File**: `frontend/src/components/panels/FilterControls.tsx`

### Additions to Props Interface

```typescript
interface Props {
  // ... existing props ...

  /** Whether public space nodes are shown */
  showPublic?: boolean;
  /** Whether private space nodes are shown */
  showPrivate?: boolean;
  /** Toggle public space visibility */
  onTogglePublic?: () => void;
  /** Toggle private space visibility */
  onTogglePrivate?: () => void;
}
```

### UI Rendering Contract

When `onTogglePublic` and `onTogglePrivate` are provided, render a "Visibility" section after the existing entity/role filters:

```
┌─────────────────────────┐
│ Visibility              │
│ ☑ Public (12)           │
│ ☑ Private (5)           │
└─────────────────────────┘
```

- Counts derived from `dataset.nodes` filtered by `privacyMode`
- Section disabled when `showSpaces === false` (similar to role filters when `showPeople === false`)
- Checkboxes follow existing `styles.toggle` CSS class

---

## ControlPanel — New Props

**File**: `frontend/src/components/panels/ControlPanel.tsx`

### Additions to Props Interface

```typescript
interface Props {
  // ... existing props ...

  showPublic?: boolean;
  showPrivate?: boolean;
  onTogglePublic?: () => void;
  onTogglePrivate?: () => void;
}
```

### Pass-through to FilterControls

All four new props are forwarded directly to `FilterControls`.

### Legend Addition

Add a "Visibility" legend group after the existing "Connections" group:

```tsx
<div className={styles.legendGroup}>
  <span className={styles.legendGroupLabel}>Visibility</span>
  <div className={styles.legendItem}>
    <span className={styles.legendIcon}>🔓</span> Public
  </div>
  <div className={styles.legendItem}>
    <span className={styles.legendIcon}>🔒</span> Private
  </div>
</div>
```

---

## ForceGraph — New Props

**File**: `frontend/src/components/graph/ForceGraph.tsx`

### Additions to Props Interface

```typescript
interface Props {
  // ... existing props ...

  /** Whether public space nodes are visible (default: true) */
  showPublic?: boolean;
  /** Whether private space nodes are visible (default: true) */
  showPrivate?: boolean;
}
```

### Rendering Contract

1. **Icon overlay**: For each space node (SPACE_L0, SPACE_L1, SPACE_L2), append a `<text>` SVG element:
   - Private: `🔒` (U+1F512)
   - Public: `🔓` (U+1F513)
   - Position: bottom-right of node circle, offset `(r * 0.6, r * 0.6)`
   - White circle background (r=6) for contrast
   - Font size scales with node radius

2. **Visibility filtering**: In the node display update:
   ```typescript
   // Space node visibility check (composes with entity filter)
   const isSpaceVisible = (node: GraphNode) => {
     if (node.privacyMode === 'PUBLIC') return showPublic !== false;
     if (node.privacyMode === 'PRIVATE') return showPrivate !== false;
     return true; // non-space nodes or null privacyMode
   };
   ```

3. **Edge filtering**: CHILD edges to hidden space nodes are hidden. Orphaned users/orgs (no remaining visible edges) are hidden.

---

## Explorer.tsx — State Additions

**File**: `frontend/src/pages/Explorer.tsx`

```typescript
const [showPublic, setShowPublic] = useState(true);
const [showPrivate, setShowPrivate] = useState(true);
```

Passed to both `ControlPanel` and `ForceGraph`:

```tsx
<ControlPanel
  // ... existing props ...
  showPublic={showPublic}
  showPrivate={showPrivate}
  onTogglePublic={() => setShowPublic((p) => !p)}
  onTogglePrivate={() => setShowPrivate((p) => !p)}
/>

<ForceGraph
  // ... existing props ...
  showPublic={showPublic}
  showPrivate={showPrivate}
/>
```

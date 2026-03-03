# Data Model: Role-Based Filters & Connection Colors

**Feature**: 006-role-filters
**Date**: 2026-02-26

## Entity Changes

### 1. EdgeType Enum (server/src/types/graph.ts)

**Change**: Add `ADMIN` variant.

```typescript
export enum EdgeType {
  CHILD = 'CHILD',
  MEMBER = 'MEMBER',
  LEAD = 'LEAD',
  ADMIN = 'ADMIN',   // NEW — admin authorization role
}
```

### 2. EDGE_WEIGHT Record (server/src/types/graph.ts)

**Change**: Add weight for ADMIN edges.

```typescript
export const EDGE_WEIGHT: Record<EdgeType, number> = {
  [EdgeType.CHILD]: 3,
  [EdgeType.LEAD]: 2,
  [EdgeType.ADMIN]: 2,   // NEW — same visual weight as LEAD
  [EdgeType.MEMBER]: 1,
};
```

### 3. SpaceLike Interface (server/src/transform/transformer.ts)

**Change**: Add `adminUsers` to the `roleSet` shape.

```typescript
interface SpaceLike {
  // ... existing fields ...
  community?: {
    roleSet: {
      memberUsers: Array<{ id: string }>;
      memberOrganizations: Array<{ id: string }>;
      leadOrganizations: Array<{ id: string }>;
      leadUsers: Array<{ id: string }>;
      adminUsers: Array<{ id: string }>;   // NEW
    };
  } | null;
  subspaces?: SpaceLike[];
}
```

### 4. EDGE_COLORS Record (frontend/src/components/graph/ForceGraph.tsx)

**Change**: Add ADMIN color, replace LEAD color.

```typescript
const EDGE_COLORS: Record<string, string> = {
  CHILD: 'rgba(67,56,202,0.60)',     // indigo-700 — refined saturation
  LEAD: 'rgba(234,88,12,0.60)',      // orange-600 — replaces brown
  ADMIN: 'rgba(13,148,136,0.60)',    // teal-600 — new
  MEMBER: 'rgba(148,163,184,0.35)',  // slate-400 — subtle
};
```

## New State

### 5. Role Filter State (frontend/src/pages/Explorer.tsx)

Three boolean state variables, all defaulting to `true`:

```typescript
const [showMembers, setShowMembers] = useState(true);
const [showLeads, setShowLeads] = useState(true);
const [showAdmins, setShowAdmins] = useState(true);
```

### 6. ForceGraph Props Extension

New optional props for role filter state:

```typescript
interface Props {
  // ... existing props ...
  showMembers?: boolean;    // NEW — default true
  showLeads?: boolean;      // NEW — default true
  showAdmins?: boolean;     // NEW — default true
}
```

### 7. FilterControls Props Extension

New props for role sub-toggles:

```typescript
interface Props {
  // ... existing props ...
  showMembers: boolean;
  showLeads: boolean;
  showAdmins: boolean;
  onToggleMembers: () => void;
  onToggleLeads: () => void;
  onToggleAdmins: () => void;
  showPeople: boolean;  // needed to disable role toggles when People is OFF
}
```

### 8. ControlPanel Props Extension

Pass-through for role filter props (same additions as FilterControls).

## Relationships

```
Explorer (state owner)
  ├── showMembers ──→ ControlPanel → FilterControls (UI)
  ├── showLeads   ──→ ControlPanel → FilterControls (UI)
  ├── showAdmins  ──→ ControlPanel → FilterControls (UI)
  └── showMembers/showLeads/showAdmins ──→ ForceGraph (visual filtering)

GraphDataset (from BFF)
  └── edges[]
      └── edge.type ∈ { CHILD, MEMBER, LEAD, ADMIN }
          └── ADMIN edges created from usersInRole(role: ADMIN)
```

## State Transitions

| Current State | Action | Next State | Side Effect |
|---------------|--------|------------|-------------|
| All role filters ON | Uncheck "Members" | showMembers=false | MEMBER user edges hidden; orphaned users hidden |
| showMembers OFF | Check "Members" | showMembers=true | MEMBER edges + users restored |
| Any role filter state | Toggle People OFF | People OFF | All user edges/nodes hidden (takes precedence) |
| People OFF | Toggle People ON | People ON | Users restored; role filters re-applied |
| Role filter changes | Node selected | Same filter state | Selection highlighting re-applied on visible edges |

## Validation Rules

- All three role filters default to ON (checked) on page load.
- Role filter toggles are disabled (grayed out) when People toggle is OFF.
- A user node remains visible as long as it has ≥1 visible edge (any role type still toggled ON).
- Organization edges are NOT affected by role filters — only user→space edges.
- Edge counts in filter labels count unique users (not edges) per role type.

# Contract: Frontend Role Filter Props

**Feature**: 006-role-filters
**Date**: 2026-02-26

## New Props Flow

```
Explorer.tsx (state owner)
    │
    ├── ControlPanel
    │   ├── showMembers, showLeads, showAdmins
    │   ├── onToggleMembers, onToggleLeads, onToggleAdmins
    │   └── showPeople (for disabling role toggles)
    │       │
    │       └── FilterControls
    │           ├── showMembers, showLeads, showAdmins
    │           ├── onToggleMembers, onToggleLeads, onToggleAdmins
    │           └── showPeople
    │
    └── ForceGraph
        ├── showMembers (default: true)
        ├── showLeads (default: true)
        └── showAdmins (default: true)
```

## ForceGraph Props Interface Diff

```diff
 interface Props {
   dataset: GraphDataset;
   showPeople: boolean;
   showOrganizations: boolean;
   showSpaces: boolean;
   searchQuery: string;
   onNodeClick: (node: GraphNode) => void;
   onNodeHover?: (node: GraphNode | null, position?: { x: number; y: number }) => void;
   selectedNodeId: string | null;
   highlightedNodeIds?: string[];
   showMap?: boolean;
   mapRegion?: MapRegion;
   activityPulseEnabled?: boolean;
+  showMembers?: boolean;
+  showLeads?: boolean;
+  showAdmins?: boolean;
 }
```

## FilterControls Props Interface Diff

```diff
 interface Props {
   dataset: GraphDataset;
   showPeople: boolean;
   showOrganizations: boolean;
   showSpaces: boolean;
   onTogglePeople: () => void;
   onToggleOrganizations: () => void;
   onToggleSpaces: () => void;
+  showMembers: boolean;
+  showLeads: boolean;
+  showAdmins: boolean;
+  onToggleMembers: () => void;
+  onToggleLeads: () => void;
+  onToggleAdmins: () => void;
 }
```

## ControlPanel Props Interface Diff

```diff
 interface Props {
   dataset: GraphDataset;
   showPeople: boolean;
   showOrganizations: boolean;
   showSpaces: boolean;
   onTogglePeople: () => void;
   onToggleOrganizations: () => void;
   onToggleSpaces: () => void;
+  showMembers: boolean;
+  showLeads: boolean;
+  showAdmins: boolean;
+  onToggleMembers: () => void;
+  onToggleLeads: () => void;
+  onToggleAdmins: () => void;
   showMap: boolean;
   onToggleMap: () => void;
   mapRegion: MapRegion;
   onMapRegionChange: (region: MapRegion) => void;
   onRemoveSpace?: (spaceId: string) => void;
   activityPulseEnabled: boolean;
   onToggleActivityPulse: () => void;
   hasActivityData: boolean;
 }
```

## FilterControls UI Structure

```html
<div class="section">
  <h3>Filters</h3>
  <!-- Existing toggles -->
  <label><input checkbox /> Spaces (N)</label>
  <label><input checkbox /> People (N)</label>
  <!-- NEW: Role sub-toggles, indented, disabled when People is OFF -->
  <div class="roleFilters" style="margin-left: 1.2rem">
    <label disabled={!showPeople}><input checkbox /> Members (N)</label>
    <label disabled={!showPeople}><input checkbox /> Leads (N)</label>
    <label disabled={!showPeople}><input checkbox /> Admins (N)</label>
  </div>
  <label><input checkbox /> Organizations (N)</label>
</div>
```

## Legend Update (ControlPanel.tsx)

The Connections section of the legend must be updated:

```diff
 <div className={styles.legendGroup}>
   <span className={styles.legendGroupLabel}>Connections</span>
   <div className={styles.legendItem}>
-    <span className={styles.line} style={{ background: 'rgba(99,102,241,0.5)' }} /> Parent–Child
+    <span className={styles.line} style={{ background: 'rgba(67,56,202,0.60)' }} /> Parent–Child
   </div>
   <div className={styles.legendItem}>
-    <span className={styles.line} style={{ background: 'rgba(180,140,60,0.6)' }} /> Lead
+    <span className={styles.line} style={{ background: 'rgba(234,88,12,0.60)' }} /> Lead
+  </div>
+  <div className={styles.legendItem}>
+    <span className={styles.line} style={{ background: 'rgba(13,148,136,0.60)' }} /> Admin
   </div>
   <div className={styles.legendItem}>
-    <span className={styles.line} style={{ background: 'rgba(140,160,180,0.4)' }} /> Member
+    <span className={styles.line} style={{ background: 'rgba(148,163,184,0.35)' }} /> Member
   </div>
 </div>
```

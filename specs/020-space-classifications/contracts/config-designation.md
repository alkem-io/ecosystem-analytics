# Contract: dashboard classification designation (`analytics.yml`)

**Feature**: 020-space-classifications | **Replaces**: the `tag_category_mapping` block

## What changes

`tag_category_mapping` is **deleted** from both dashboard blocks and from `DashboardAppConfig` (R-007). In its place each dashboard names which classification drives which panel — three strings, no vocabulary (FR-010, FR-011).

```diff
 vng:
   default_hub_nameid: ${VNG_DEFAULT_HUB_NAMEID}:vnginnovationhub
   gemeentedelers_space_nameid: ${VNG_GD_SPACE_NAMEID}:gemeentedelers
   gd_cache_ttl_hours: ${VNG_GD_CACHE_TTL_HOURS}:168
   geo_cache_ttl_hours: ${VNG_GEO_CACHE_TTL_HOURS}:168
-  tag_category_mapping:
-    nds:
-      "cloud": cloud
-      "data": data
-      "artificiële intelligentie": ai
-      "centrale (digitale) dienstverlening": dienstverlening
-      "digitale weerbaarheid en autonomie": weerbaarheid
-      "digitaal vakmanschap en moderne werkomgeving": vakmanschap
-    vng2030:
-      "bedrijfsvoering & gemeentediensten": bedrijfsvoering
-      … (6 entries)
+  # Which Alkemio Classification drives which panel, matched on the classification's
+  # displayLabel (case- and whitespace-insensitive). The VALUES inside each
+  # classification come from Alkemio — never restated here (FR-007/FR-010).
+  # Empty string = no classification designated; that panel renders empty.
+  classifications:
+    nds: "${VNG_CLASSIFICATION_NDS}:NDS"
+    vng2030: "${VNG_CLASSIFICATION_VNG2030}:VNG 2030"
+    phase: "${VNG_CLASSIFICATION_PHASE}:Groeifase"
```

`govtech:` gets the identical block with `GOVTECH_*` env vars, seeded as a copy of VNG's and operator-editable to diverge (feature 017 FR-026 unchanged).

## Env vars

| Var | Default | Panel |
|---|---|---|
| `VNG_CLASSIFICATION_NDS` / `GOVTECH_CLASSIFICATION_NDS` | `NDS` | NDS bar chart + matrix Y axis + Initiatives `NDS` column/filter |
| `VNG_CLASSIFICATION_VNG2030` / `GOVTECH_CLASSIFICATION_VNG2030` | `VNG 2030` | VNG-2030 bar chart + matrix X axis + Initiatives `VNG 2030` column/filter |
| `VNG_CLASSIFICATION_PHASE` / `GOVTECH_CLASSIFICATION_PHASE` | `Groeifase` | Growth-phase pipeline chart |

The defaults are the expected template display labels. They are a **guess about data that does not exist yet** — the classification programme decides the real labels, so treat the defaults as provisional and confirm them with the pre-flight query in quickstart.md before deploying.

## Parser contract (`server/src/config.ts`)

```
classifications: { nds: string; vng2030: string; phase: string }
```

- Absent block → all three default to the values above (matching how `parseDashboardConfig` already applies per-key defaults).
- A key present but empty → that panel has no designation.
- Values are stored verbatim; normalisation (trim / collapse whitespace / lowercase) happens at match time, so the config stays readable.

## Behaviour when a designation matches nothing

Per R-002, and this is the FR-018 path at the configuration level:

1. The dimension's vocabulary is empty, so the chart renders with only the `uncategorised` bucket — every counted entity in it.
2. The chart is **not** hidden. A hidden chart reads as "this dashboard has no NDS dimension"; an all-uncategorised chart reads as "nothing here is classified yet", which is the truth.
3. The server logs one warning per request naming the app, the panel, and the unmatched designation — enough to diagnose a typo or a renamed template without dumping space data.
4. The phase panel is the exception and keeps its existing rule: omitted entirely when nothing carries a phase (FR-013), rather than showing an empty pipeline.

## What must NOT appear in this block

- Value labels, value ids, or category keys — the vocabulary lives in Alkemio (FR-007).
- Any tag → category mapping, for spaces or for the GD layer (FR-011, R-006).
- Ordering — authored order comes from the vocabulary (R-003, R-005).

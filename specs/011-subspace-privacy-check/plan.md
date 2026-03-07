# Implementation Plan: Subspace Privacy-Aware Loading

**Branch**: `011-subspace-privacy-check` | **Date**: 2026-03-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-subspace-privacy-check/spec.md`

## Summary

Change subspace loading to a two-phase approach: first retrieve "about" info with privilege data, then selectively fetch full community data only for subspaces where the user has READ privilege. Subspaces with only READ_ABOUT are shown as restricted nodes with a lock icon overlay. L2 children of restricted L1 subspaces are skipped entirely.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode, ESM)
**Primary Dependencies**: React 19, Vite 7, Express 5, D3.js v7, graphql-request, @graphql-codegen/cli
**Storage**: SQLite (existing cache, no changes needed)
**Testing**: Vitest (server + frontend)
**Target Platform**: Web (Node 20 server, modern browsers)
**Project Type**: Web application (BFF + React SPA)
**Performance Goals**: Graph generation <20% slower than current for fully-accessible spaces (SC-003)
**Constraints**: Must not expose community data for READ_ABOUT-only subspaces (SC-004)
**Scale/Scope**: Affects 6 server files, 3 frontend components, 2 GraphQL fragments

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
| --------- | ------ | ----- |
| I. Alkemio Identity Auth | PASS | No auth changes; uses existing bearer/cookie forwarding |
| II. Typed GraphQL Contract | PASS | New queries use codegen SDK; will add fields to existing `.graphql` fragments and run `pnpm run codegen` |
| III. BFF Boundary | PASS | All privilege checks happen server-side in BFF; frontend receives pre-processed `restricted` flag |
| IV. Data Sensitivity | PASS | Community data excluded for restricted spaces; cache scoping unchanged |
| V. Graceful Degradation | PASS | Missing `myPrivileges` triggers error logging + frontend notification; restricted nodes show lock indicator; graph renders with available data |
| VI. Design Fidelity | PASS | Lock badge already exists for `privacyMode === 'PRIVATE'`; extended to `restricted` flag with same visual pattern |

All gates pass. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/011-subspace-privacy-check/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
server/
├── src/
│   ├── graphql/
│   │   ├── fragments/
│   │   │   ├── spaceAboutFragment.graphql      # Add membership.myPrivileges
│   │   │   └── spaceGraphInfoFragment.graphql  # Split into about-only vs full variants
│   │   ├── queries/
│   │   │   └── spaceByName.graphql             # Restructure for two-phase loading
│   │   └── generated/                          # Regenerated via codegen
│   ├── services/
│   │   ├── space-service.ts                    # Two-phase fetch logic
│   │   └── acquire-service.ts                  # Privilege-aware acquisition
│   ├── transform/
│   │   └── transformer.ts                      # Add restricted flag to nodes
│   └── types/
│       └── graph.ts                            # Add restricted field to GraphNode
└── tests/

frontend/
├── src/
│   ├── components/
│   │   ├── graph/
│   │   │   ├── ForceGraph.tsx                  # Lock badge for restricted nodes
│   │   │   └── HoverCard.tsx                   # Privacy notice for restricted nodes
│   │   └── panels/
│   │       └── DetailsDrawer.tsx               # Restricted node detail display
│   └── types/                                  # Shared types via @server/types alias
└── tests/
```

**Structure Decision**: Existing BFF + SPA dual-project structure. Changes span both `server/` and `frontend/` across GraphQL layer, services, transform, and UI components.

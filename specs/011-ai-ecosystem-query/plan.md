# Implementation Plan: AI Ecosystem Query — Natural Language Discovery

**Branch**: `011-ai-ecosystem-query` | **Date**: 2026-03-06 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/011-ai-ecosystem-query/spec.md`

## Summary

Add a natural language query interface to the ecosystem analytics tool that enables users to ask open-ended questions about people, projects, organisations, and collaboration opportunities. The system uses an LLM (OpenAI API) with the full ecosystem dataset serialised as structured context to interpret queries and return ranked, structured answers with plain-language explanations. The UI is a full-screen conversational overlay accessible from the graph explorer, with optional "Show on graph" to highlight matched nodes. Conversation context is session-scoped (server-side, ephemeral). A data indexing layer pre-fetches and caches all accessible spaces for the user to enable cross-ecosystem search beyond currently loaded graph data.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (server + frontend)
**Primary Dependencies**: Express 5, React 19, OpenAI Node SDK (>=4.x), `graphql-request` 7, `@graphql-codegen/cli` 6, D3.js 7
**Storage**: SQLite (better-sqlite3) for server-side graph cache; in-memory session store for conversation context
**Testing**: Vitest 4 (both server and frontend)
**Target Platform**: Modern browsers (Chrome, Firefox, Safari, Edge)
**Project Type**: Web — `server/` (Express BFF) + `frontend/` (React SPA)
**Performance Goals**: AI response time <10 seconds p95; data indexing for all accessible spaces <30 seconds; streaming responses for perceived responsiveness
**Constraints**: No direct Alkemio API access from frontend (BFF boundary); LLM API key server-side only; conversation data ephemeral per session; no numeric scores in responses
**Scale/Scope**: Typical ecosystems: 5-50 spaces, 100-2000 contributors, 500-5000 edges; LLM context window must accommodate serialised dataset

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Alkemio Identity Auth (Kratos) | ✅ PASS | Query endpoint uses existing bearer token forwarding; no new auth surface. Data indexing uses same token to fetch all accessible spaces. |
| II. Typed GraphQL Contract | ✅ PASS | Re-uses existing codegen SDK queries for data acquisition. No new `.graphql` queries needed initially — re-uses `mySpacesHierarchical`, `spaceByName`, `usersByIDs`, `organizationByID`. |
| III. BFF Boundary | ✅ PASS | LLM calls happen server-side only. Frontend sends NL queries to BFF; BFF calls LLM API; frontend never contacts OpenAI or Alkemio directly. |
| IV. Data Sensitivity | ✅ PASS | Ecosystem data sent to LLM is scoped to what the user can access. LLM API key stored server-side in `.env` config (not user credentials). Conversation data is ephemeral (session-scoped, discarded on end). Feedback logs store query+answer for quality monitoring but no credentials. |
| V. Graceful Degradation | ✅ PASS | If LLM API is unavailable, query interface shows a clear error with retry option. If data indexing is incomplete, queries run against available data with a notice. Graph explorer remains fully functional regardless of query feature state. |
| VI. Design Fidelity | ✅ PASS | New full-screen overlay follows existing modal/overlay patterns. No conflict with design brief — this is a new view mode, not a modification of existing graph layout. |
| Security: No creds in .env | ✅ PASS | LLM API key is a service credential (like `ALKEMIO_GRAPHQL_ENDPOINT`), not user credentials. User credentials remain login-only. |
| Security: Cache per-user | ✅ PASS | Data index and conversation sessions are user-scoped. Each user's indexed dataset and conversation are isolated. |
| Dev: pnpm, tsc --noEmit | ✅ PASS | Standard workflow applies. New dependency (`openai`) installed via pnpm. |

**Gate result: ALL PASS — proceed to Phase 0.**

## Project Structure

### Documentation (this feature)

```text
specs/011-ai-ecosystem-query/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── query-api.md     # BFF API contract for query endpoints
│   └── llm-prompt.md    # LLM system prompt and response format spec
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
server/
├── src/
│   ├── services/
│   │   ├── query-service.ts                # NEW — orchestrates NL query → LLM → structured answer
│   │   ├── index-service.ts                # NEW — builds per-user ecosystem index from all accessible spaces
│   │   └── session-service.ts              # NEW — manages ephemeral conversation sessions
│   ├── routes/
│   │   └── query.ts                        # NEW — /api/query/* endpoints (ask, feedback, sessions)
│   ├── types/
│   │   └── query.ts                        # NEW — Query, Answer, ConversationSession, MatchedEntity types
│   ├── transform/
│   │   └── serializer.ts                   # NEW — serializes GraphDataset to LLM-friendly text
│   └── app.ts                              # MODIFIED — register /api/query routes

frontend/
├── src/
│   ├── components/
│   │   └── query/
│   │       ├── QueryOverlay.tsx            # NEW — full-screen conversational overlay
│   │       ├── QueryInput.tsx              # NEW — text input with send button + suggested queries
│   │       ├── QueryMessage.tsx            # NEW — single message bubble (user or system)
│   │       ├── AnswerCard.tsx              # NEW — structured result card with match explanation
│   │       ├── EntityResult.tsx            # NEW — individual matched entity display
│   │       ├── FeedbackButton.tsx          # NEW — "This doesn't look right" per-answer
│   │       └── SuggestedQueries.tsx        # NEW — example question chips for onboarding
│   ├── hooks/
│   │   └── useQuery.ts                     # NEW — manages conversation state + API calls
│   ├── services/
│   │   └── query-api.ts                    # NEW — API client for /api/query/* endpoints
│   ├── pages/
│   │   └── Explorer.tsx                    # MODIFIED — add query overlay toggle + graph highlight state
│   └── types/
│       └── query.ts                        # NEW — frontend query/answer types (mirrors server types)
```

**Structure Decision**: Extends existing web application structure. New `query/` component directory for the conversational UI. New server services follow the existing acquire→transform→serve pattern. The `index-service` extends the existing `acquire-service` to fetch all accessible spaces (not just selected ones).

## Phase 0: Research — Complete

All unknowns from the Technical Context have been resolved. See [research.md](research.md) for full details.

| Research Question | Decision | Key Rationale |
|-------------------|----------|---------------|
| LLM Provider & SDK | OpenAI GPT-4o via `openai` SDK (>=4.x) | 128k context, function calling, streaming, mature TS SDK |
| Context Strategy | Two-tier: compressed index in system prompt + on-demand detail via function calling | Raw data exceeds 128k; compressed index ~15-25k tokens fits comfortably |
| Data Indexing | Extend acquire pipeline to build per-user `EcosystemIndex` from `mySpacesHierarchical` | Covers all accessible spaces; cached with same TTL as graph data |
| Streaming | Server-Sent Events (SSE) via `POST /api/query/ask` with fetch streaming | Simpler than WebSockets; unidirectional flow; perceived responsiveness |
| Session Management | In-memory `Map<sessionId, ConversationSession>` with 30 min TTL | Ephemeral by spec; matches existing pattern (`progressMap` in graph-service) |
| Data Richness | Excellent — skills, tags, location (city/country/lat-lon), roles per space all available | No major gaps; minor: no bio field (tagline + tags sufficient) |
| Feedback Logging | Dedicated SQLite table `query_feedback` | Write-heavy, read-rare; SQLite already available |
| LLM Prompt Design | Structured 4-section prompt: role/rules, ecosystem data, functions, output format | Structured markers (`<!--ENTITIES-->`) for reliable response parsing |

## Phase 1: Design & Contracts — Complete

### Generated Artifacts

| Artifact | File | Summary |
|----------|------|---------|
| Data Model | [data-model.md](data-model.md) | Types: `ConversationSession`, `QueryMessage`, `MatchedEntity`, `EcosystemIndex`, `IndexedSpace/Person/Org`, `QueryFeedback`, request/response types, SSE event types. SQLite schema for `query_feedback` table. Serialization format for LLM context. |
| API Contract | [contracts/query-api.md](contracts/query-api.md) | 3 endpoints: `POST /api/query/ask` (SSE streaming), `POST /api/query/feedback`, `GET /api/query/session/:id`. Full request/response schemas, error codes, auth flow, session lifecycle diagram. |
| LLM Contract | [contracts/llm-prompt.md](contracts/llm-prompt.md) | System prompt structure (4 sections), response format with `<!--ENTITIES-->` markers, function calling spec, token budget management, model configuration, conversation history trimming strategy. |
| Quickstart | [quickstart.md](quickstart.md) | Architecture overview, all new/modified files, development flow (11 steps), configuration schema for `analytics.yml`. |

## Constitution Check — Post-Design Re-evaluation

*Re-evaluated after Phase 1 design artifacts are complete.*

| Principle | Status | Post-Design Notes |
|-----------|--------|-------------------|
| I. Alkemio Identity Auth (Kratos) | ✅ PASS | No change. Query endpoints use `resolveUser` middleware (existing). Data indexing uses the user's bearer token to query Alkemio GraphQL — same auth pattern as graph generation. No new credential handling. |
| II. Typed GraphQL Contract | ✅ PASS | No change. `index-service.ts` re-uses existing codegen SDK queries (`mySpacesHierarchical`, `usersByIDs`, `organizationByID`). No new `.graphql` files needed initially. |
| III. BFF Boundary | ✅ PASS | Confirmed by design. OpenAI API calls are server-side only (`query-service.ts`). Frontend communicates exclusively with BFF via `/api/query/*`. OpenAI API key never reaches the frontend. |
| IV. Data Sensitivity | ✅ PASS | Confirmed by design. (1) Ecosystem data sent to LLM is scoped to user's accessible spaces. (2) Conversation sessions are user-scoped — users cannot access other users' sessions. (3) Feedback table stores query text/answer JSON but no credentials/tokens. (4) `query_feedback` table uses parameterised SQLite statements. (5) API key is a server config parameter, not a user credential — compliant with `.env` policy. |
| V. Graceful Degradation | ✅ PASS | Confirmed by design. (1) If OpenAI API is unavailable → SSE `error` event with clear message. (2) If index building fails → clear error, graph explorer unaffected. (3) Missing profile data (no skills, no location) → LLM returns fewer/broader matches, never crashes. (4) Malformed LLM response → treated as plain text, no structured entities. |
| VI. Design Fidelity | ✅ PASS | New full-screen overlay is a new view — no conflict with existing design brief. Overlay pattern will follow existing modal/overlay conventions (Inter font, theme tokens, CSS custom properties). |
| Security: No creds in .env | ✅ PASS | OpenAI API key is a service credential (like `ALKEMIO_GRAPHQL_ENDPOINT`) — not user credentials. Policy only prohibits user credentials in `.env`. |
| Security: Cache per-user | ✅ PASS | `EcosystemIndex` is per-user (keyed by userId). `ConversationSession` is per-user (keyed by sessionId + userId). Session retrieval verifies `req.auth.userId` matches session owner. |
| Security: Parameterised SQL | ✅ PASS | `query_feedback` INSERT uses better-sqlite3 prepared statements — consistent with existing cache layer pattern. |
| Dev: pnpm, tsc --noEmit | ✅ PASS | One new dependency (`openai`) via pnpm. All new TypeScript files must pass `tsc --noEmit` in both `server/` and `frontend/`. |

**Gate result: ALL PASS — ready for task generation (`/speckit.tasks`).**

## Next Steps

This plan is complete through Phase 1. The next command is `/speckit.tasks` to generate `tasks.md` with actionable, dependency-ordered implementation tasks.

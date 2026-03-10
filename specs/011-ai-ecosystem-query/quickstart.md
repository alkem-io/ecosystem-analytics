# Quickstart: AI Ecosystem Query — Natural Language Discovery

**Feature**: 011-ai-ecosystem-query  
**Date**: 2026-03-06

## What This Feature Does

Adds a natural language conversational interface to the ecosystem analytics tool. Users open a full-screen overlay and type questions like "Who has experience with circular economy in Rotterdam?" — the system queries an LLM with the full ecosystem dataset as context and streams back structured answers with matched entities and plain-language explanations. Supports follow-up questions, optional graph highlighting, and a feedback mechanism.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Alkemio Platform API                                       │
│  ├── mySpacesHierarchical()  → all accessible spaces        │
│  ├── usersByIDs()            → contributor profiles          │
│  └── organizationByID()      → org profiles                 │
└──────────────┬──────────────────────────────────────────────┘
               │ bearer token
┌──────────────▼──────────────────────────────────────────────┐
│  BFF Server (server/)                                       │
│  ├── index-service.ts    — build per-user EcosystemIndex    │
│  ├── serializer.ts       — compress index to LLM text       │
│  ├── query-service.ts    — LLM orchestration + streaming    │
│  ├── session-service.ts  — ephemeral conversation sessions  │
│  ├── routes/query.ts     — /api/query/* endpoints (SSE)     │
│  └── SQLite              — query_feedback table (persistent) │
└──────────────┬──────────────────────────────────────────────┘
               │ /api/query/ask (SSE stream)
               │ /api/query/feedback
               │ /api/query/session/:id
┌──────────────▼──────────────────────────────────────────────┐
│  OpenAI API                                                 │
│  └── gpt-4o (streaming, function calling)                   │
└──────────────┬──────────────────────────────────────────────┘
               │ streamed tokens
┌──────────────▼──────────────────────────────────────────────┐
│  Frontend (frontend/)                                       │
│  ├── QueryOverlay.tsx    — full-screen conversational UI     │
│  ├── QueryInput.tsx      — text input + suggested queries    │
│  ├── AnswerCard.tsx      — structured result card            │
│  ├── FeedbackButton.tsx  — "This doesn't look right"        │
│  ├── useQuery.ts         — conversation state + streaming    │
│  ├── query-api.ts        — API client for query endpoints   │
│  └── Explorer.tsx        — overlay toggle + graph highlight  │
└─────────────────────────────────────────────────────────────┘
```

## Key Files

### New Files

| File | Purpose |
|------|---------|
| `server/src/services/index-service.ts` | Builds per-user `EcosystemIndex` from all accessible spaces via existing SDK queries |
| `server/src/services/query-service.ts` | Orchestrates NL query → LLM call → parse structured response → stream to client |
| `server/src/services/session-service.ts` | Manages in-memory `ConversationSession` map with TTL cleanup |
| `server/src/routes/query.ts` | Express router: `POST /ask` (SSE), `POST /feedback`, `GET /session/:id` |
| `server/src/types/query.ts` | All query-related TypeScript types (see data-model.md) |
| `server/src/transform/serializer.ts` | Converts `EcosystemIndex` to compact text for LLM system prompt |
| `frontend/src/components/query/QueryOverlay.tsx` | Full-screen overlay with conversation history and input |
| `frontend/src/components/query/QueryInput.tsx` | Text input with send button, suggested query chips |
| `frontend/src/components/query/QueryMessage.tsx` | Single message bubble (user or assistant) |
| `frontend/src/components/query/AnswerCard.tsx` | Structured answer card with matched entities |
| `frontend/src/components/query/EntityResult.tsx` | Individual entity display within an answer |
| `frontend/src/components/query/FeedbackButton.tsx` | "This doesn't look right" button per answer |
| `frontend/src/components/query/SuggestedQueries.tsx` | Example question chips for onboarding |
| `frontend/src/hooks/useQuery.ts` | React hook: conversation state, SSE streaming, session management |
| `frontend/src/services/query-api.ts` | API client for `/api/query/*` endpoints |
| `frontend/src/types/query.ts` | Frontend mirror of query types |

### Modified Files

| File | Change |
|------|--------|
| `server/src/app.ts` | Register `/api/query` router |
| `server/package.json` | Add `openai` dependency |
| `server/analytics.yml` | Add `openai.apiKey`, `openai.model`, `query.sessionTtlMinutes` config |
| `frontend/src/pages/Explorer.tsx` | Add query overlay toggle button + graph highlight state for "Show on graph" |

## Prerequisites

```bash
# OpenAI API key (add to .env or analytics.yml)
OPENAI_API_KEY=sk-...
```

## Development Flow

```bash
# 1. Install OpenAI SDK
cd server && pnpm add openai

# 2. Add server types
# Create server/src/types/query.ts (from data-model.md)

# 3. Build server services (in dependency order)
# a. session-service.ts (no external deps)
# b. serializer.ts (depends on types only)
# c. index-service.ts (depends on existing acquire pipeline)
# d. query-service.ts (depends on all above + openai)

# 4. Add routes
# Create server/src/routes/query.ts
# Register in server/src/app.ts

# 5. Add feedback table migration
# Run CREATE TABLE query_feedback in cache setup

# 6. Verify server builds
cd server && npx tsc --noEmit

# 7. Build frontend types + API client
# Create frontend/src/types/query.ts
# Create frontend/src/services/query-api.ts

# 8. Build React components (leaf → parent)
# a. EntityResult, FeedbackButton, SuggestedQueries
# b. AnswerCard, QueryMessage, QueryInput
# c. QueryOverlay
# d. useQuery hook

# 9. Integrate into Explorer
# Add overlay toggle to Explorer.tsx
# Add graph highlight state for "Show on graph"

# 10. Verify frontend builds
cd frontend && npx tsc --noEmit

# 11. Test manually
# Open app → Click "Ask the Ecosystem" → Type a query
# Verify streaming response with matched entities
# Test follow-up questions
# Test "This doesn't look right" feedback
# Test "Show on graph" highlighting
# Test session timeout (wait 30 min or adjust config)
```

## Configuration

Add to `analytics.yml`:

```yaml
openai:
  apiKey: ${OPENAI_API_KEY}
  model: gpt-4o
  maxTokens: 4096
  temperature: 0.3

query:
  sessionTtlMinutes: 30
  maxQueryLength: 2000
  maxFeedbackLength: 5000
  indexRefreshOnCacheTtl: true
```

# Research: AI Ecosystem Query — Natural Language Discovery

**Feature**: `011-ai-ecosystem-query` | **Date**: 2026-03-06

## Research Questions

### 1. LLM Provider & SDK Selection

**Decision**: OpenAI GPT-4o via the `openai` Node SDK (>=4.x)

**Rationale**:
- GPT-4o offers 128k context window, function calling, and streaming — all required for this feature.
- The `openai` SDK is the most mature TypeScript SDK for LLM integration, with built-in streaming support, type-safe function calling, and structured output modes.
- Function calling allows the LLM to request specific data slices (e.g., "fetch users in space X with skill Y") rather than requiring the entire dataset in context.
- The server already uses ESM TypeScript — no compatibility issues.

**Alternatives considered**:
- **Anthropic Claude**: Comparable 200k context, but function calling is less mature. Good fallback option.
- **Local/self-hosted (Ollama)**: No external API dependency, but quality and context window limitations make it unsuitable for the semantic richness needed.
- **LangChain/LlamaIndex**: Over-engineered for this use case — we need a simple LLM call with structured context, not a complex RAG pipeline.

### 2. Context Strategy — How to Fit Ecosystem Data in the LLM Window

**Decision**: Two-tier approach — compressed index in system prompt + on-demand detail fetching via function calling.

**Rationale**:

Raw JSON serialization of a typical ecosystem (20 spaces, 500 users, 200 orgs, 2000+ edges) produces ~137k tokens — exceeding GPT-4o's 128k window. A compressed approach is required.

**Tier 1: Compressed Ecosystem Index (~15-25k tokens)**
Serialized once per session into the LLM system prompt:
- Space summaries: `{ id, name, tagline, tags[], city, country, memberCount, subspaceCount }`
- People summaries: `{ id, name, skills[], city, country, roles: [{ spaceName, roleType }] }`
- Organisation summaries: `{ id, name, tags[], city, country, roles: [{ spaceName, roleType }] }`

This index strips activity data, avatars, URLs, banner images, and verbose metadata — retaining only what's semantically queryable.

**Tier 2: On-demand detail via function calling**
When the LLM identifies matches, it can call functions to retrieve full profiles:
- `get_person_details(userId)` → full profile, all projects, all roles, activity data
- `get_space_details(spaceId)` → full description, all members, tags, activity
- `get_connections_between(entityA, entityB)` → shared spaces, shared members

This keeps the initial prompt lean while allowing deep dives.

**Alternatives considered**:
- **Full dataset in context**: Exceeds token limits for medium-to-large ecosystems. Rejected.
- **Vector embeddings / RAG**: Adds infrastructure complexity (vector DB, embedding pipeline) without proportional benefit for structured, tabular data. Better suited for unstructured text search. Rejected for MVP; could be a future enhancement.
- **Pre-filtering server-side**: Parse the NL query server-side to reduce the dataset before LLM call. Fragile — requires NLP parsing that the LLM already does better. Rejected.

### 3. Data Indexing — Fetching All Accessible Spaces

**Decision**: Extend the existing acquire pipeline to build a per-user "ecosystem index" covering all spaces the user has access to, cached server-side with the same TTL as graph data.

**Rationale**:

The spec requires querying across ALL spaces the user has access to, not just those currently loaded on the graph. The existing `mySpacesHierarchical` query already returns the full list of accessible L0 spaces with their nested L1/L2 hierarchy, community roles, and profile data. This is sufficient to build the index without per-space fetches.

**Index Build Flow**:
1. Call `mySpacesHierarchical()` — returns all L0 spaces with L1/L2 children, community role sets
2. Batch-fetch user profiles via `usersByIDs()` for all unique contributor IDs
3. Batch-fetch org profiles via `organizationByID()` for all unique org IDs  
4. Build compressed index (Tier 1 format above)
5. Cache per-user in SQLite with same TTL as graph cache

**Performance**: Initial index build mirrors the existing graph generation pipeline and takes ~5-15 seconds depending on ecosystem size. Subsequent queries use the cached index.

**Alternatives considered**:
- **Query only loaded spaces**: Contradicts spec requirement. Rejected.
- **Lazy per-space fetching**: Fetch space details only when a query matches space tags. Slower per-query but lighter upfront. Rejected for MVP — the index approach gives consistently fast responses.
- **Background indexing on login**: Build index in background immediately after login. Good optimisation for future iteration.

### 4. Streaming Responses

**Decision**: Server-Sent Events (SSE) for streaming LLM responses from BFF to frontend.

**Rationale**:
- LLM responses take 2-10 seconds. Streaming tokens provides perceived responsiveness.
- SSE is simpler than WebSockets for this unidirectional flow pattern.
- Express 5 supports SSE natively (set response headers, write chunks).
- The frontend can use the `EventSource` API or a `fetch` with `ReadableStream` for POST requests (SSE only supports GET natively, so we use fetch streaming).
- The existing `apiFetch` wrapper in `frontend/src/services/api.ts` can be extended with a streaming variant.

**Implementation Pattern**:
- `POST /api/query/ask` with `Accept: text/event-stream`
- Server streams: `{ type: 'thinking' }` → `{ type: 'chunk', text: '...' }` → `{ type: 'complete', answer: {...} }`
- Frontend accumulates chunks and renders progressively.

**Alternatives considered**:
- **WebSockets**: Overkill for unidirectional streaming. Adds connection management complexity. Rejected.
- **Request-response with polling**: Already used for graph generation progress. Works but poor UX for conversational flow — users expect streaming in chat interfaces. Rejected.

### 5. Conversation Session Management

**Decision**: In-memory `Map<string, ConversationSession>` keyed by `(userId, sessionId)`, with automatic cleanup on session timeout (30 minutes of inactivity) or explicit logout.

**Rationale**:
- The existing architecture already uses in-memory maps for progress tracking (`progressMap` in graph-service.ts).
- Conversation sessions are ephemeral by spec (FR-013) — no persistence needed.
- `req.auth.userId` (resolved by existing `resolveUser` middleware) provides reliable session keying.
- A `sessionId` is generated on the first query and returned to the frontend to identify the conversation.
- Memory footprint per session: ~50-200KB (conversation history + cached index reference). For 100 concurrent users: ~5-20MB total — well within server memory.

**Cleanup Strategy**:
- 30-minute inactivity timeout (configurable via `analytics.yml`)
- Explicit cleanup on logout (if frontend calls a session end endpoint)
- Periodic sweep every 5 minutes to remove expired sessions

**Alternatives considered**:
- **SQLite storage**: Over-engineered for ephemeral data. Adds IO for something that should be fast and transient. Rejected.
- **Redis**: External dependency for a simple in-memory store. Rejected — not justified at current scale.
- **Client-side only (localStorage)**: Can't support function calling or server-side LLM interaction. Rejected.

### 6. Data Available for NL Querying

**Decision**: The existing Alkemio data model provides excellent coverage for the planned query patterns.

**Findings**:

| Query Pattern | Data Source | Available Fields |
|---------------|-----------|------------------|
| "Find people with X skill" | `usersByIDs` → `profile.tagsets[]` | `{ name: "skills", tags: ["Python", "ML"], type: "COMPETENCIES" }` |
| "in Y location" | `usersByIDs` → `profile.location` | `country`, `city`, `geoLocation: { lat, lon }` |
| "projects about topic Z" | `spaceGraphInfo` → `profile.tagsets[]` + `tagline` | Tags, tagline, displayName |
| "who are the connectors" | Graph edges (MEMBER/LEAD/ADMIN) | Cross-space membership count derivable from edge list |
| "collaboration overlap" | Graph edges + node attributes | Shared members between spaces derivable from edge list |
| "organisations in sector X" | `organizationByID` → `profile.tagsets[]` | Tags, location, display name |

**Data Gaps** (not blockers — workarounds available):
- No explicit "bio" or "about me" text field on user profiles in the current queries. Tagline and tags provide equivalent semantic content.
- No explicit "sector" field — derived from space tags and org tags.
- Skills depend on users having populated their Alkemio profile tagsets. Empty profiles will return fewer matches — the system should note this.

### 7. Feedback Logging

**Decision**: Log feedback to a dedicated SQLite table. Unlike conversation data (ephemeral), feedback is persisted for quality monitoring.

**Rationale**:
- SQLite is already available (better-sqlite3 for the cache layer).
- Feedback is write-heavy, read-rare — SQLite is ideal.
- Table: `query_feedback(id, user_id, query_text, answer_json, comment, created_at)`
- User-supplied comment is optional (FR-014).
- Feedback data does not contain credentials or tokens — safe to persist.

### 8. LLM System Prompt Design

**Decision**: A structured system prompt with three sections: role definition, ecosystem data index, and available functions.

**Key Design Principles**:
- The LLM acts as an "Ecosystem Navigator" — it answers questions about the data, it does not make things up.
- Responses must cite concrete entities (people, projects, spaces) with names and context.
- When data is insufficient, the LLM must say so — never fabricate matches.
- Responses must be in the same language as the user's query (English or Dutch).
- No numeric confidence scores — only plain-language explanations.
- The LLM must refuse out-of-scope questions and redirect to ecosystem-relevant queries.

**Prompt Structure**:
```
[ROLE] You are the Ecosystem Navigator for {spaceName(s)}...
[RULES] Only answer from the data below. Never fabricate. Cite entities by name...
[DATA] Ecosystem index: {compressed JSON}
[FUNCTIONS] get_person_details(), get_space_details(), get_connections_between()
[OUTPUT FORMAT] Structured JSON with matchedEntities[], explanation, suggestedFollowups[]
```

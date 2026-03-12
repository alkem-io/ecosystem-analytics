# Tasks: AI Ecosystem Query — Natural Language Discovery

**Input**: Design documents from `/specs/011-ai-ecosystem-query/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies, add configuration, create shared types.

- [ ] T001 Install `openai` SDK in `server/package.json` — run `cd server && pnpm add openai`
- [ ] T002 [P] Add OpenAI and query configuration to `server/analytics.yml` — add `openai` section (`apiKey: ${OPENAI_API_KEY}`, `model: gpt-4o`, `maxTokens: 4096`, `temperature: 0.3`) and `query` section (`sessionTtlMinutes: 30`, `maxQueryLength: 2000`, `maxFeedbackLength: 5000`)
- [ ] T003 [P] Extend `ServerConfig` interface in `server/src/config.ts` to parse the new `openai` and `query` YAML sections — add `OpenAIConfig` (`apiKey`, `model`, `maxTokens`, `temperature`) and `QueryConfig` (`sessionTtlMinutes`, `maxQueryLength`, `maxFeedbackLength`) interfaces and wire them into the config loader
- [ ] T004 Create all query-related TypeScript types in `server/src/types/query.ts` — define `QueryEntityType`, `MatchedEntity`, `MessageRole`, `QueryMessage`, `ConversationSession`, `QueryFeedback`, `IndexedSpace`, `IndexedRole`, `IndexedPerson`, `IndexedOrg`, `EcosystemIndex`, `AskRequest`, `StreamEventType`, `StreamEvent`, `FeedbackRequest`, `SessionResponse` per data-model.md
- [ ] T005 [P] Create frontend query types in `frontend/src/types/query.ts` — mirror server types: `QueryEntityType`, `MatchedEntity`, `MessageRole`, `QueryMessage`, `StreamEventType`, `StreamEvent`, `SessionResponse`

**Checkpoint**: Dependencies installed, config wired, types defined. Both `cd server && npx tsc --noEmit` and `cd frontend && npx tsc --noEmit` pass.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Server-side services that ALL user stories depend on — session management, ecosystem indexing, LLM serialization, query orchestration, API routes, and feedback persistence.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T006 Implement session service in `server/src/services/session-service.ts` — export `createSession(userId, index)`, `getSession(sessionId, userId)`, `addMessage(sessionId, message)`, `deleteSession(sessionId)`. Use an in-memory `Map<string, ConversationSession>`. Implement periodic cleanup (every 5 min) removing sessions where `lastActiveAt` is older than `config.query.sessionTtlMinutes`. Generate `sessionId` using `crypto.randomUUID()`
- [X] T007 Implement ecosystem index serializer in `server/src/transform/serializer.ts` — export `serializeIndex(index: EcosystemIndex): string` that converts the index into the compact text format per llm-prompt.md: `SPACES (N total):` section with name, tags, location, memberCount; `PEOPLE (N total):` section with name, skills, location, roles; `ORGANIZATIONS (N total):` section with name, tags, location, roles. Also export `estimateTokens(text: string): number` using ~4 chars per token heuristic
- [X] T008 Implement ecosystem index builder in `server/src/services/index-service.ts` — export `buildEcosystemIndex(userId, sdk): Promise<EcosystemIndex>`. Call `sdk.mySpacesHierarchical()` to get all accessible L0 spaces with L1/L2 children. Extract all unique contributor IDs and org IDs from community role sets. Batch-fetch user profiles via `sdk.usersByIDs()` and org profiles via `sdk.organizationByID()`. Build `IndexedSpace[]`, `IndexedPerson[]`, `IndexedOrg[]`. Set `tokenEstimate` via `estimateTokens(serializeIndex(index))`
- [X] T009 Create `query_feedback` SQLite table in `server/src/cache/cache-manager.ts` (or equivalent DB setup file) — add `CREATE TABLE IF NOT EXISTS query_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, message_id TEXT NOT NULL, query_text TEXT NOT NULL, answer_json TEXT NOT NULL, comment TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))` with indexes on `user_id` and `created_at`. Use parameterised prepared statements for inserts
- [X] T010 Implement query service in `server/src/services/query-service.ts` — export `askQuery(userId, sdk, query, sessionId?, onEvent)`. Orchestration flow: (1) get or create session via session-service, (2) build index via index-service if not cached on session, (3) serialize index via serializer, (4) compose LLM messages array (system prompt per llm-prompt.md sections 1-4 + conversation history + new user message), (5) call OpenAI chat completions with streaming, (6) emit SSE events via `onEvent` callback (`thinking` → `chunk*` → `complete`), (7) parse `<!--ENTITIES-->` and `<!--FOLLOWUPS-->` markers from accumulated response, (8) enrich matched entities with `url`, `city`, `country` from index, (9) store assistant `QueryMessage` in session. Also export `submitFeedback(userId, messageId, comment?)` that validates the message exists in the user's session and inserts into `query_feedback` table
- [X] T011 Implement LLM function calling handlers in `server/src/services/query-service.ts` — handle `get_entity_details` and `get_shared_connections` tool calls from the LLM. `get_entity_details(entityId, entityType)` looks up the full profile from the `EcosystemIndex`. `get_shared_connections(entityA, entityB)` computes shared spaces, shared members, and common tags between two entities from the index
- [X] T012 Create query router in `server/src/routes/query.ts` — implement three routes behind `resolveUser` middleware: (1) `POST /ask` — validate `AskRequest` (query non-empty, ≤2000 chars; sessionId valid UUID if present), set SSE headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`), call `askQuery` with event callback that writes `data: ${JSON.stringify(event)}\n\n` to response, (2) `POST /feedback` — validate `FeedbackRequest`, call `submitFeedback`, return 201, (3) `GET /session/:sessionId` — validate UUID, call `getSession`, return `SessionResponse` or 404
- [X] T013 Register query router in `server/src/app.ts` — import query router from `./routes/query.ts`, mount at `/api/query` with `resolveUser` middleware applied

**Checkpoint**: Server builds cleanly. All three endpoints respond: `POST /api/query/ask` streams SSE events, `POST /api/query/feedback` returns 201, `GET /api/query/session/:id` returns session history. Ecosystem index builds from all accessible spaces. LLM returns structured answers with matched entities.

---

## Phase 3: User Story 1 & 2 — Find People by Expertise + Discover Projects/Spaces (Priority: P1) 🎯 MVP

**Goal**: Users can open a full-screen conversational overlay, type natural language questions about people (skills, location, roles) and projects/spaces (topics, tags), and receive structured answers with matched entities and plain-language explanations. Suggested example queries help new users.

**Independent Test**: Open the query overlay → type "Who has experience with circular economy in Rotterdam?" → receive a streaming answer listing matched people with skills, roles, and location context. Type "Which projects are related to sustainable mobility?" → receive matched spaces with descriptions and tags. When no results match, receive a clear message with alternative suggestions.

### Implementation

- [X] T014 [P] Create frontend API client in `frontend/src/services/query-api.ts` — export `askQuery(query, sessionId?): AsyncIterable<StreamEvent>` that POSTs to `/api/query/ask` with `Accept: text/event-stream`, reads the response body as a `ReadableStream`, parses SSE `data:` lines, and yields `StreamEvent` objects. Also export `submitFeedback(messageId, comment?)` and `getSession(sessionId)` as standard `apiFetch` wrappers
- [X] T015 [P] Create `SuggestedQueries` component in `frontend/src/components/query/SuggestedQueries.tsx` — display example question chips (FR-012): "Who has experience with [topic]?", "Which projects are working on [topic]?", "Find people with [skill] in [city]", "What organisations are involved in [topic]?", "Who are the connectors between [space] and [space]?". Accept `onSelect(query: string)` callback prop
- [X] T016 [P] Create `EntityResult` component in `frontend/src/components/query/EntityResult.tsx` — display a single `MatchedEntity`: icon by `entityType` (person/space/org), `displayName`, `matchReason` as explanatory text, `relevantTags` as small chips, `city`/`country` if present, clickable `url` link to Alkemio profile
- [X] T017 [P] Create `FeedbackButton` component in `frontend/src/components/query/FeedbackButton.tsx` — small "This doesn't look right" button (FR-014). On click, expand to show optional comment textarea (max 5000 chars) and submit button. Call `submitFeedback(messageId, comment)`. Show success confirmation. Disable after submission
- [X] T018 Create `AnswerCard` component in `frontend/src/components/query/AnswerCard.tsx` — display an assistant `QueryMessage`: render `content` as formatted text, render each `matchedEntities[]` item via `EntityResult`, render `suggestedFollowups[]` as clickable chips, include `FeedbackButton` passing the `messageId`
- [X] T019 Create `QueryMessage` component in `frontend/src/components/query/QueryMessage.tsx` — renders a single conversation message: for `role === 'user'` show right-aligned bubble with query text; for `role === 'assistant'` render via `AnswerCard`. Support a `streaming` state that shows accumulated text with a typing indicator while chunks arrive
- [X] T020 Create `QueryInput` component in `frontend/src/components/query/QueryInput.tsx` — text input with send button. Accept `onSubmit(query: string)` and `disabled: boolean` props. Validate non-empty and ≤2000 chars. Clear input on submit. Show `SuggestedQueries` when conversation is empty (pass `onSelect` to auto-fill and submit)
- [X] T021 Implement `useQuery` hook in `frontend/src/hooks/useQuery.ts` — manage conversation state: `messages: QueryMessage[]`, `sessionId: string | null`, `isStreaming: boolean`, `streamingContent: string`. Export `sendQuery(text)` that: (1) appends user message to `messages`, (2) sets `isStreaming = true`, (3) iterates `askQuery(text, sessionId)` stream events — on `thinking` show indicator, on `chunk` accumulate `streamingContent`, on `complete` append final `QueryMessage` to `messages` and update `sessionId`, on `error` show error message. Also export `submitFeedback(messageId, comment)` and `resetConversation()`
- [X] T022 Create `QueryOverlay` component in `frontend/src/components/query/QueryOverlay.tsx` — full-screen overlay (FR-001) with: (1) header bar with title "Ask the Ecosystem" and close button, (2) scrollable message area rendering `messages` via `QueryMessage`, (3) streaming indicator when `isStreaming`, (4) `QueryInput` at bottom. Use `useQuery` hook for state management. Auto-scroll to latest message on update
- [X] T023 Integrate query overlay into `frontend/src/pages/Explorer.tsx` — add `queryOverlayOpen: boolean` state. Add an "Ask the Ecosystem" button to the explorer toolbar/header. When clicked, set `queryOverlayOpen = true` and render `QueryOverlay` as a full-screen layer. When overlay closes, set `queryOverlayOpen = false`. Graph explorer remains mounted but hidden behind the overlay
- [X] T024 Handle out-of-scope and no-results states in `frontend/src/components/query/AnswerCard.tsx` — when `matchedEntities` is empty, render the content text (LLM's "no results" message per FR-007/FR-008) without the entity list section. Show suggested follow-ups as alternative query chips

**Checkpoint**: Full MVP is functional. Users open the overlay, type people/project queries, receive streaming answers with structured entity cards, see suggested queries on first open, and can submit feedback. Out-of-scope and no-results cases are handled gracefully.

---

## Phase 4: User Story 3 — Identify Collaboration Opportunities (Priority: P2)

**Goal**: Users describe a project context and ask "Who should we collaborate with?" — the system analyses overlap in topics, skills, geography, and stakeholders to suggest partnerships with reasoning.

**Independent Test**: Type "We're working on youth employment in The Hague — who could we partner with?" → receive organisations, projects, and people with overlapping themes/geography and an explanation of the overlap. Type "Which organisations overlap between Space A and Space B?" → receive shared members and common topics.

### Implementation

- [X] T025 [US3] Enhance `get_shared_connections` function handler in `server/src/services/query-service.ts` — extend to also compute: (1) shared topic tags between two spaces, (2) geographic proximity (same city/country), (3) count of shared contributor IDs. Return a structured summary the LLM can use to explain collaboration rationale
- [X] T026 [US3] Add collaboration-focused example queries to `frontend/src/components/query/SuggestedQueries.tsx` — add chips: "Who could we partner with on [topic]?", "Which organisations overlap between [space A] and [space B]?"

**Checkpoint**: Collaboration queries return multi-entity results with overlap reasoning. The LLM leverages function calling to provide detailed cross-entity analysis.

---

## Phase 5: User Story 4 — Identify Connectors and Key People (Priority: P2)

**Goal**: Users ask "Who are the key connectors?" and receive people who participate across multiple projects, spaces, or topic areas, ranked by cross-cutting involvement.

**Independent Test**: Type "Who are the connectors in my space?" → receive people with roles in multiple spaces, ranked by cross-space count, with plain-language explanation.

### Implementation

- [X] T027 [P] [US4] Add connector-detection utility in `server/src/services/query-service.ts` — export `identifyConnectors(index: EcosystemIndex): { personId: string, name: string, spaceCount: number, spaces: string[] }[]` that scans `IndexedPerson[]` and returns people sorted descending by the number of distinct spaces they hold roles in. This data is available to the LLM via the index but this utility provides pre-computed rankings for function calls
- [X] T028 [US4] Add connector-focused example queries to `frontend/src/components/query/SuggestedQueries.tsx` — add chips: "Who are the key connectors?", "Who bridges the [topic A] and [topic B] communities?"

**Checkpoint**: Connector queries return ranked people with cross-space involvement explanations. LLM prompt rules (rule 10) ensure connectors are identified from cross-space membership data.

---

## Phase 6: User Story 5 — Visual Answer Integration with the Graph (Priority: P3)

**Goal**: After receiving query results, users can click "Show on graph" to highlight matched entities on the ecosystem graph while dimming non-matches.

**Independent Test**: Run a query → receive results in overlay → click "Show on graph" → overlay transitions to graph view with matched nodes highlighted and non-matched nodes faded. Click "Back to conversation" → overlay reappears with conversation intact.

### Implementation

- [X] T029 [US5] Add highlight state to `frontend/src/pages/Explorer.tsx` — add `highlightedEntityIds: Set<string> | null` state. When non-null, pass to the graph component to visually emphasise matched nodes and dim non-matched nodes. Add `setHighlightedEntityIds` callback and `clearHighlight` function
- [X] T030 [US5] Implement graph highlight rendering in the force graph component (e.g., `frontend/src/components/graph/ForceGraph.tsx`) — when `highlightedEntityIds` is provided and non-empty: set `opacity: 1.0` and a highlight stroke/glow on nodes whose `id` is in the set; set `opacity: 0.15` on all other nodes and their edges. When `highlightedEntityIds` is null, render normally
- [X] T031 [US5] Add "Show on graph" button to `frontend/src/components/query/AnswerCard.tsx` — when an answer has `matchedEntities.length > 0`, show a "Show on graph" button. On click, extract `entityId` values from `matchedEntities`, call `setHighlightedEntityIds(new Set(ids))` (passed via context or prop from Explorer), and close the overlay (`queryOverlayOpen = false`)
- [X] T032 [US5] Add "Back to conversation" button in `frontend/src/pages/Explorer.tsx` — when `highlightedEntityIds` is non-null (graph is showing query highlights), show a floating "Back to conversation" button. On click, clear highlights (`setHighlightedEntityIds(null)`) and reopen the query overlay (`queryOverlayOpen = true`). Conversation state is preserved in the `useQuery` hook

**Checkpoint**: Full graph↔overlay flow works. Users toggle between conversational answers and visual graph highlights without losing conversation context.

---

## Phase 7: User Story 6 — Conversational Follow-up Questions (Priority: P3)

**Goal**: Users ask follow-up questions that reference previous answers, and the system maintains conversation context across multiple turns.

**Independent Test**: Ask "Who has experience with data science?" → receive results → ask "Tell me more about the second person" → system correctly references the second person from the previous answer. Ask an unrelated question → system handles the topic shift.

### Implementation

- [X] T033 [US6] Implement conversation history trimming in `server/src/services/query-service.ts` — before composing the LLM messages array, check if system prompt + conversation history + new query exceeds the token budget (100k tokens). If so, drop oldest message pairs (FIFO) and prepend a summary: "Previous conversation context: user asked about [topic] and received [N] results." Always preserve the system prompt and latest user query
- [X] T034 [US6] Add conversation reset UI in `frontend/src/components/query/QueryOverlay.tsx` — add a "New conversation" button in the overlay header. On click, call `resetConversation()` from the `useQuery` hook (clears messages, nulls sessionId). Show the `SuggestedQueries` component again after reset

**Checkpoint**: Multi-turn conversations work correctly. Follow-ups reference prior context. Topic shifts are handled. Users can reset to start fresh.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Error handling, accessibility, and validation across all stories.

- [X] T035 [P] Implement graceful degradation in `frontend/src/components/query/QueryOverlay.tsx` — when an SSE `error` event is received, display a user-friendly error message with a retry button (Constitution V — Graceful Degradation). Handle network failures in `query-api.ts` with appropriate error messages
- [X] T036 [P] Add keyboard accessibility to query components — `QueryInput` submits on Enter (Shift+Enter for newline), `QueryOverlay` closes on Escape, `SuggestedQueries` chips are keyboard-navigable, `FeedbackButton` is focusable
- [X] T037 [P] Add loading states and transitions — `QueryOverlay` shows a skeleton/spinner during initial index building (first query may take 5-15s), streaming indicator shows animated dots during `thinking` phase, smooth scroll on new messages
- [X] T038 Verify `cd server && npx tsc --noEmit` and `cd frontend && npx tsc --noEmit` both pass with zero errors
- [X] T039 Run quickstart.md validation — follow the 11-step development flow end-to-end, verify all manual test scenarios pass: open overlay → query → streaming response → follow-up → feedback → show on graph → back to conversation → session timeout

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **US1+2 (Phase 3)**: Depends on Phase 2 — delivers MVP
- **US3 (Phase 4)**: Depends on Phase 2; frontend tasks (T026) also depend on T015 from Phase 3
- **US4 (Phase 5)**: Depends on Phase 2; frontend tasks (T028) also depend on T015 from Phase 3
- **US5 (Phase 6)**: Depends on Phase 3 (needs overlay + answer cards)
- **US6 (Phase 7)**: Depends on Phase 3 (needs working conversation flow)
- **Polish (Phase 8)**: Depends on Phase 3 completion minimum

### User Story Dependencies

- **US1+2 (P1)**: Can start after Foundational — no dependencies on other stories. **MVP scope.**
- **US3 (P2)**: Server tasks (T025) can start after Foundational; frontend task (T026) depends on T015 from Phase 3
- **US4 (P2)**: Server task (T027) can start after Foundational; frontend task (T028) depends on T015 from Phase 3
- **US5 (P3)**: Depends on US1+2 (needs the overlay components and AnswerCard to add "Show on graph" button)
- **US6 (P3)**: Depends on US1+2 (needs the conversation flow to add follow-up support)

### Within Each Phase

- Tasks marked [P] can run in parallel
- Types before services (T004 → T006-T011)
- Services before routes (T006-T011 → T012-T013)
- Leaf components before composite components (T015-T017 → T018-T019 → T020-T022)
- API client alongside components (T014 ∥ T015-T020)

### Parallel Opportunities

**Phase 1** — T002, T003, T005 can all run in parallel after T001 (dependency install)

**Phase 2** — T006, T007 can run in parallel (no shared deps); T008 depends on T007; T009 is independent; T010 depends on T006-T009; T011 depends on T010; T012 depends on T010-T011; T013 depends on T012

**Phase 3** — T014, T015, T016, T017 can all run in parallel; T018 depends on T016+T017; T019 depends on T018; T020 depends on T015; T021 depends on T014+T020+T019; T022 depends on T021; T023 depends on T022

**Phase 4+5** — US3 (T025-T026) and US4 (T027-T028) can run fully in parallel with each other

---

## Parallel Example: Phase 3 (MVP)

```bash
# Wave 1 — all leaf components + API client (4 tasks in parallel):
T014: "Create frontend API client in frontend/src/services/query-api.ts"
T015: "Create SuggestedQueries component in frontend/src/components/query/SuggestedQueries.tsx"
T016: "Create EntityResult component in frontend/src/components/query/EntityResult.tsx"
T017: "Create FeedbackButton component in frontend/src/components/query/FeedbackButton.tsx"

# Wave 2 — composite components (2 tasks):
T018: "Create AnswerCard component in frontend/src/components/query/AnswerCard.tsx"
T020: "Create QueryInput component in frontend/src/components/query/QueryInput.tsx"

# Wave 3 — message + hook:
T019: "Create QueryMessage component in frontend/src/components/query/QueryMessage.tsx"
T021: "Implement useQuery hook in frontend/src/hooks/useQuery.ts"

# Wave 4 — overlay + integration:
T022: "Create QueryOverlay component in frontend/src/components/query/QueryOverlay.tsx"
T023: "Integrate query overlay into frontend/src/pages/Explorer.tsx"
T024: "Handle out-of-scope and no-results states"
```

---

## Implementation Strategy

### MVP First (US1+US2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: US1+US2 (Find People + Discover Projects)
4. **STOP and VALIDATE**: Open overlay → query people → query projects → verify streaming + entities + feedback
5. Deploy/demo if ready — this alone delivers transformative value

### Incremental Delivery

1. Setup + Foundational → Infrastructure ready
2. US1+US2 → Test independently → Deploy/Demo (**MVP!**)
3. US3 + US4 → Test independently → Deploy/Demo (collaboration + connectors)
4. US5 + US6 → Test independently → Deploy/Demo (graph integration + follow-ups)
5. Polish → Final validation → Release

### Parallel Team Strategy

With multiple developers after Foundational phase:
- Developer A: US1+US2 frontend (Phase 3: T014-T024)
- Developer B: US3+US4 server enhancements (Phase 4-5: T025-T028)
- Developer C: US5 graph integration (Phase 6: T029-T032) — starts when Phase 3 overlay is ready

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- US1 and US2 are combined in Phase 3 because they share identical infrastructure (overlay, streaming, entity cards) and only differ in query content
- No test tasks included — tests were not explicitly requested in the feature specification
- All SQLite operations use parameterised prepared statements (Constitution Principle IV)
- OpenAI API key is server-side only (Constitution Principle III — BFF Boundary)
- Conversation sessions are ephemeral — discarded on timeout (FR-013)

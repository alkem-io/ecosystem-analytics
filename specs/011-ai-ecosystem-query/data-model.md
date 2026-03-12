# Data Model: AI Ecosystem Query — Natural Language Discovery

**Feature**: 011-ai-ecosystem-query  
**Date**: 2026-03-06

## Entity Diagram

```
┌──────────────────┐       ┌───────────────────────┐       ┌──────────────────────┐
│ ConversationSession │    │      QueryMessage      │       │     MatchedEntity    │
│                   │  1──*│                        │  1──* │                      │
│  sessionId        │      │  messageId             │       │  entityId            │
│  userId           │      │  sessionId             │       │  messageId           │
│  createdAt        │      │  role (user | assistant)│      │  entityType          │
│  lastActiveAt     │      │  content               │       │  displayName         │
│  indexRef         │──┐   │  timestamp              │       │  matchReason         │
└──────────────────┘  │   │  matchedEntities?       │       │  url                 │
                      │   └───────────────────────┘       │  spaceContext         │
                      │                                    └──────────────────────┘
                      │
                      ▼
              ┌───────────────────┐      ┌──────────────────────┐
              │  EcosystemIndex   │      │   QueryFeedback      │
              │                   │      │                      │
              │  userId           │      │  id (auto)           │
              │  spaces[]         │      │  userId              │
              │  people[]         │      │  messageId           │
              │  organizations[]  │      │  queryText           │
              │  generatedAt      │      │  answerJson          │
              │  tokenEstimate    │      │  comment?            │
              └───────────────────┘      │  createdAt           │
                      │                  └──────────────────────┘
              ┌───────┴───────┐
              ▼               ▼
  ┌─────────────────┐  ┌──────────────────┐
  │  IndexedSpace   │  │  IndexedPerson   │
  │                 │  │                  │
  │  id             │  │  id              │
  │  name           │  │  name            │
  │  tagline        │  │  skills[]        │
  │  tags[]         │  │  city            │
  │  city           │  │  country         │
  │  country        │  │  roles[]         │
  │  memberCount    │  └──────────────────┘
  │  subspaceCount  │
  │  visibility     │  ┌──────────────────┐
  └─────────────────┘  │  IndexedOrg      │
                       │                  │
                       │  id              │
                       │  name            │
                       │  tags[]          │
                       │  city            │
                       │  country         │
                       │  roles[]         │
                       └──────────────────┘
```

## Type Definitions

### New Types (in `server/src/types/query.ts`)

```typescript
/** Supported entity types in query results */
export type QueryEntityType = 'USER' | 'SPACE' | 'ORGANIZATION';

/** A single matched entity in a query answer */
export interface MatchedEntity {
  entityId: string;
  entityType: QueryEntityType;
  displayName: string;
  /** Plain-language explanation of why this entity matched */
  matchReason: string;
  /** Alkemio profile URL (if available) */
  url: string | null;
  /** Name of the space context where this entity is most relevant */
  spaceContext: string | null;
  /** City/country for display */
  city: string | null;
  country: string | null;
  /** Skills or tag highlights relevant to the query */
  relevantTags: string[];
}

/** Role of a message in the conversation */
export type MessageRole = 'user' | 'assistant';

/** A single message (query or answer) in a conversation */
export interface QueryMessage {
  messageId: string;
  sessionId: string;
  role: MessageRole;
  /** Raw text for user messages; formatted answer text for assistant messages */
  content: string;
  timestamp: string;
  /** Matched entities (only for assistant messages that return results) */
  matchedEntities?: MatchedEntity[];
  /** Suggested follow-up questions (only for assistant messages) */
  suggestedFollowups?: string[];
}

/** A conversation session — ephemeral, in-memory only */
export interface ConversationSession {
  sessionId: string;
  userId: string;
  createdAt: string;
  lastActiveAt: string;
  /** Reference to the user's ecosystem index (used to avoid re-building) */
  indexRef: EcosystemIndex;
  /** Ordered conversation history */
  messages: QueryMessage[];
}

/** Feedback on a specific answer — persisted to SQLite */
export interface QueryFeedback {
  id?: number;
  userId: string;
  messageId: string;
  queryText: string;
  answerJson: string;
  comment: string | null;
  createdAt: string;
}
```

### Ecosystem Index Types (in `server/src/types/query.ts`)

```typescript
/** Compressed summary of a space for the LLM index */
export interface IndexedSpace {
  id: string;
  name: string;
  tagline: string | null;
  tags: string[];
  city: string | null;
  country: string | null;
  memberCount: number;
  subspaceCount: number;
  visibility: 'ACTIVE' | 'ARCHIVED' | 'DEMO' | null;
}

/** A role entry for people/orgs in the index */
export interface IndexedRole {
  spaceName: string;
  roleType: 'MEMBER' | 'LEAD' | 'ADMIN';
}

/** Compressed summary of a person for the LLM index */
export interface IndexedPerson {
  id: string;
  name: string;
  skills: string[];
  city: string | null;
  country: string | null;
  roles: IndexedRole[];
}

/** Compressed summary of an organisation for the LLM index */
export interface IndexedOrg {
  id: string;
  name: string;
  tags: string[];
  city: string | null;
  country: string | null;
  roles: IndexedRole[];
}

/** The complete per-user ecosystem index — cached server-side */
export interface EcosystemIndex {
  userId: string;
  spaces: IndexedSpace[];
  people: IndexedPerson[];
  organizations: IndexedOrg[];
  generatedAt: string;
  /** Estimated token count when serialized for the LLM */
  tokenEstimate: number;
}
```

### Request/Response Types (in `server/src/types/query.ts`)

```typescript
/** Request body for POST /api/query/ask */
export interface AskRequest {
  /** The natural language query text */
  query: string;
  /** Session ID for continuing a conversation (omit to start new) */
  sessionId?: string;
}

/** SSE event types streamed from the server */
export type StreamEventType = 'thinking' | 'chunk' | 'complete' | 'error';

/** A single SSE event payload */
export interface StreamEvent {
  type: StreamEventType;
  /** Partial text chunk (for 'chunk' events) */
  text?: string;
  /** Complete message (for 'complete' events) */
  message?: QueryMessage;
  /** Error message (for 'error' events) */
  error?: string;
}

/** Request body for POST /api/query/feedback */
export interface FeedbackRequest {
  messageId: string;
  comment?: string;
}

/** Response for GET /api/query/session/:sessionId */
export interface SessionResponse {
  sessionId: string;
  messages: QueryMessage[];
}
```

## Data Flow

```
1. User opens query overlay → Frontend calls GET /api/query/session (or creates new)

2. User submits question → Frontend POSTs to /api/query/ask with streaming
   ├── query-service receives (query, sessionId?)
   ├── If no sessionId → create ConversationSession via session-service
   ├── If no EcosystemIndex → build via index-service:
   │   ├── Call mySpacesHierarchical() via existing SDK
   │   ├── Batch-fetch user profiles (usersByIDs)
   │   ├── Batch-fetch org profiles (organizationByID)
   │   └── Build EcosystemIndex, cache on session
   ├── serializer.ts: serialize EcosystemIndex → compressed text for LLM system prompt
   ├── Build LLM messages array: [system prompt + conversation history + new query]
   ├── Call OpenAI API with streaming enabled
   ├── Stream SSE events to frontend: thinking → chunk* → complete
   ├── Parse structured response into MatchedEntity[]
   └── Store QueryMessage in ConversationSession

3. User clicks "This doesn't look right" → Frontend POSTs to /api/query/feedback
   └── query-service writes QueryFeedback row to SQLite

4. User clicks "Show on graph" → Frontend reads matchedEntities from latest answer
   ├── Maps entity IDs to GraphNode IDs in the loaded dataset
   ├── Sets highlight state on matching nodes
   └── Transitions from overlay to graph view with dimmed non-matches
```

## Storage

### In-Memory (ephemeral)

| Store | Key | Value | Lifetime |
|-------|-----|-------|----------|
| `sessions` | `sessionId` | `ConversationSession` | 30 min inactivity timeout |
| Session contains | — | `EcosystemIndex` (via `indexRef`) | Same as session |
| Session contains | — | `QueryMessage[]` (conversation history) | Same as session |

### SQLite (persistent)

#### `query_feedback` table

```sql
CREATE TABLE IF NOT EXISTS query_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  query_text TEXT NOT NULL,
  answer_json TEXT NOT NULL,
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_query_feedback_user ON query_feedback(user_id);
CREATE INDEX idx_query_feedback_created ON query_feedback(created_at);
```

## Validation Rules

- `query` in `AskRequest` must be a non-empty string, max 2000 characters
- `sessionId` must be a valid UUID when provided
- `messageId` in `FeedbackRequest` must reference a message in the user's active session
- `comment` in feedback is optional, max 5000 characters
- `EcosystemIndex` is rebuilt if the referenced session's index is older than the configured cache TTL
- Conversation sessions are scoped per-user: a user can only access their own sessions
- `matchedEntities` may be empty when the LLM finds no relevant matches
- All entity IDs in `MatchedEntity` reference real Alkemio platform entities — never fabricated

## Serialization Format (for LLM Context)

The `serializer.ts` module converts an `EcosystemIndex` into a compact text format for the LLM system prompt:

```
SPACES:
- [name] (tags: [t1, t2]) in [city, country] | [memberCount] members, [subspaceCount] subspaces
...

PEOPLE:
- [name] (skills: [s1, s2]) in [city, country] | roles: [spaceName/LEAD, spaceName/MEMBER]
...

ORGANIZATIONS:
- [name] (tags: [t1, t2]) in [city, country] | roles: [spaceName/MEMBER]
...
```

This format minimizes token usage (~40-60% smaller than JSON) while remaining parseable by the LLM.

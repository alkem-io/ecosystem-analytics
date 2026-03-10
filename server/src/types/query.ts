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
  city: string | null;
  country: string | null;
  /** Skills or tag highlights relevant to the query */
  relevantTags: string[];
  /** nameId slugs of spaces this entity belongs to (for graph integration) */
  spaceNameIds: string[];
  /** Avatar / profile image URL */
  avatarUrl: string | null;
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

/** Compressed summary of a space for the LLM index */
export interface IndexedSpace {
  id: string;
  nameId: string;
  name: string;
  tagline: string | null;
  tags: string[];
  city: string | null;
  country: string | null;
  memberCount: number;
  subspaceCount: number;
  visibility: string | null;
  avatarUrl: string | null;
}

/** A role entry for people/orgs in the index */
export interface IndexedRole {
  spaceName: string;
  spaceNameId: string;
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
  avatarUrl: string | null;
}

/** Compressed summary of an organisation for the LLM index */
export interface IndexedOrg {
  id: string;
  name: string;
  tags: string[];
  city: string | null;
  country: string | null;
  roles: IndexedRole[];
  avatarUrl: string | null;
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

/** Request body for POST /api/query/ask */
export interface AskRequest {
  query: string;
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

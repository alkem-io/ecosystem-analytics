/** Frontend mirror of server query types — used by components and hooks */

export type QueryEntityType = 'USER' | 'SPACE' | 'ORGANIZATION';

export interface MatchedEntity {
  entityId: string;
  entityType: QueryEntityType;
  displayName: string;
  matchReason: string;
  url: string | null;
  spaceContext: string | null;
  city: string | null;
  country: string | null;
  relevantTags: string[];
  spaceNameIds: string[];
  avatarUrl: string | null;
}

export type MessageRole = 'user' | 'assistant';

export interface QueryMessage {
  messageId: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  matchedEntities?: MatchedEntity[];
  suggestedFollowups?: string[];
}

export type StreamEventType = 'thinking' | 'chunk' | 'complete' | 'error';

export interface StreamEvent {
  type: StreamEventType;
  text?: string;
  message?: QueryMessage;
  error?: string;
}

export interface SessionResponse {
  sessionId: string;
  messages: QueryMessage[];
}

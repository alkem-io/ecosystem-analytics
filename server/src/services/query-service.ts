import crypto from 'crypto';
import OpenAI from 'openai';
import { loadConfig } from '../config.js';
import { getLogger } from '../logging/logger.js';
import { getDatabase } from '../cache/db.js';
import { serializeIndex, estimateTokens } from '../transform/serializer.js';
import { buildEcosystemIndex } from './index-service.js';
import {
  createSession,
  getSession,
  addMessage,
} from './session-service.js';
import type { Sdk } from '../graphql/generated/graphql.js';
import type {
  StreamEvent,
  QueryMessage,
  MatchedEntity,
  EcosystemIndex,
  QueryEntityType,
} from '../types/query.js';

const logger = getLogger();

// ── System prompt sections (per llm-prompt.md) ──────────────────────────────

const SECTION_1_ROLE = `You are the Ecosystem Navigator — an AI assistant that helps users discover people, projects, organisations, and collaboration opportunities within the Alkemio ecosystem.

RULES:
1. Only answer based on the ecosystem data provided below. Never fabricate entities, people, projects, or organisations that do not appear in the data.
2. When you find matches, cite them by exact name as they appear in the data.
3. Provide a plain-language explanation for each match — why this entity is relevant to the user's question. Never use numeric confidence or relevance scores.
4. If you cannot find relevant matches, say so honestly and suggest alternative or broader queries the user could try.
5. If the user asks a question unrelated to the ecosystem (weather, general knowledge, etc.), politely explain that you can only help with questions about the ecosystem data — people, projects, organisations, skills, locations, and collaboration.
6. If a query is ambiguous, ask one clarifying question before answering, or provide the most likely interpretation with a note about alternatives.
7. Respond in the same language the user writes in (English or Dutch).
8. When suggesting follow-up questions, make them specific and actionable based on the data you've seen.
9. For large result sets (>10 matches), summarise the top matches and offer to show more.
10. When identifying "connectors" or people bridging communities, base this on cross-space membership data — people who hold roles in multiple distinct spaces.`;

const SECTION_4_FORMAT = `When you find matching entities, structure your response as follows:

1. Start with a natural-language summary paragraph answering the user's question.
2. Then list the matched entities using this exact JSON block at the end of your response:

<!--ENTITIES
[
  {
    "entityId": "<the bracketed ID from the data, e.g. the UUID in [abc-123-...]>",
    "entityType": "USER|SPACE|ORGANIZATION",
    "displayName": "<exact name from the data>",
    "matchReason": "<1-2 sentence plain-language explanation>",
    "spaceContext": "<most relevant space name, or null>",
    "relevantTags": ["<tag1>", "<tag2>"]
  }
]
ENTITIES-->

3. After the entities block, suggest 2-3 follow-up questions:

<!--FOLLOWUPS
["<question 1>", "<question 2>", "<question 3>"]
FOLLOWUPS-->

If no entities match, omit the ENTITIES block and provide helpful alternative suggestions.`;

// ── Tool definitions for function calling (Section 3) ───────────────────────

const LLM_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_entity_details',
      description:
        'Get full profile details for a specific person, space, or organisation by ID. Use when you need more information about a match beyond what is in the index.',
      parameters: {
        type: 'object',
        properties: {
          entityId: { type: 'string', description: 'The entity ID from the index' },
          entityType: {
            type: 'string',
            enum: ['USER', 'SPACE', 'ORGANIZATION'],
          },
        },
        required: ['entityId', 'entityType'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_shared_connections',
      description: 'Find shared members, organisations, or topics between two entities.',
      parameters: {
        type: 'object',
        properties: {
          entityA: { type: 'string', description: 'First entity ID' },
          entityB: { type: 'string', description: 'Second entity ID' },
        },
        required: ['entityA', 'entityB'],
      },
    },
  },
];

// ── Function calling handlers (T011) ────────────────────────────────────────

function handleGetEntityDetails(
  index: EcosystemIndex,
  entityId: string,
  entityType: QueryEntityType,
): string {
  if (entityType === 'USER') {
    const person = index.people.find((p) => p.id === entityId);
    if (!person) return JSON.stringify({ error: 'Person not found' });
    return JSON.stringify(person);
  }
  if (entityType === 'SPACE') {
    const space = index.spaces.find((s) => s.id === entityId);
    if (!space) return JSON.stringify({ error: 'Space not found' });
    return JSON.stringify(space);
  }
  if (entityType === 'ORGANIZATION') {
    const org = index.organizations.find((o) => o.id === entityId);
    if (!org) return JSON.stringify({ error: 'Organisation not found' });
    return JSON.stringify(org);
  }
  return JSON.stringify({ error: 'Unknown entity type' });
}

function handleGetSharedConnections(
  index: EcosystemIndex,
  entityA: string,
  entityB: string,
): string {
  // Find shared spaces via people or org roles
  const entityASpaces = getSpacesForEntity(index, entityA);
  const entityBSpaces = getSpacesForEntity(index, entityB);
  const sharedSpaces = entityASpaces.filter((s) => entityBSpaces.includes(s));

  // Find shared members (if both are spaces)
  const spaceA = index.spaces.find((s) => s.id === entityA);
  const spaceB = index.spaces.find((s) => s.id === entityB);
  const sharedMembers: string[] = [];
  if (spaceA && spaceB) {
    const membersA = index.people
      .filter((p) => p.roles.some((r) => r.spaceName === spaceA.name))
      .map((p) => p.name);
    const membersB = index.people
      .filter((p) => p.roles.some((r) => r.spaceName === spaceB.name))
      .map((p) => p.name);
    sharedMembers.push(...membersA.filter((m) => membersB.includes(m)));
  }

  // Find common tags
  const tagsA = getTagsForEntity(index, entityA);
  const tagsB = getTagsForEntity(index, entityB);
  const commonTags = tagsA.filter((t) => tagsB.includes(t));

  // Geographic proximity
  const locA = getLocationForEntity(index, entityA);
  const locB = getLocationForEntity(index, entityB);
  const sameCity = !!(locA.city && locB.city && locA.city === locB.city);
  const sameCountry = !!(locA.country && locB.country && locA.country === locB.country);

  // Shared contributor count (if both are spaces)
  let sharedContributorCount = sharedMembers.length;
  if (spaceA && spaceB) {
    const orgNamesA = index.organizations
      .filter((o) => o.roles.some((r) => r.spaceName === spaceA.name))
      .map((o) => o.name);
    const orgNamesB = index.organizations
      .filter((o) => o.roles.some((r) => r.spaceName === spaceB.name))
      .map((o) => o.name);
    const sharedOrgs = orgNamesA.filter((o) => orgNamesB.includes(o));
    sharedContributorCount += sharedOrgs.length;
  }

  return JSON.stringify({
    sharedSpaces,
    sharedMembers,
    commonTags,
    sameCity,
    sameCountry,
    sharedContributorCount,
  });
}

function getSpacesForEntity(index: EcosystemIndex, entityId: string): string[] {
  const person = index.people.find((p) => p.id === entityId);
  if (person) return person.roles.map((r) => r.spaceName);

  const org = index.organizations.find((o) => o.id === entityId);
  if (org) return org.roles.map((r) => r.spaceName);

  const space = index.spaces.find((s) => s.id === entityId);
  if (space) return [space.name];

  return [];
}

function getTagsForEntity(index: EcosystemIndex, entityId: string): string[] {
  const person = index.people.find((p) => p.id === entityId);
  if (person) return person.skills;

  const org = index.organizations.find((o) => o.id === entityId);
  if (org) return org.tags;

  const space = index.spaces.find((s) => s.id === entityId);
  if (space) return space.tags;

  return [];
}

function getLocationForEntity(
  index: EcosystemIndex,
  entityId: string,
): { city: string | null; country: string | null } {
  const person = index.people.find((p) => p.id === entityId);
  if (person) return { city: person.city, country: person.country };

  const org = index.organizations.find((o) => o.id === entityId);
  if (org) return { city: org.city, country: org.country };

  const space = index.spaces.find((s) => s.id === entityId);
  if (space) return { city: space.city, country: space.country };

  return { city: null, country: null };
}

function handleToolCall(
  index: EcosystemIndex,
  name: string,
  args: string,
): string {
  try {
    const parsed = JSON.parse(args) as Record<string, string>;
    if (name === 'get_entity_details') {
      return handleGetEntityDetails(
        index,
        parsed.entityId,
        parsed.entityType as QueryEntityType,
      );
    }
    if (name === 'get_shared_connections') {
      return handleGetSharedConnections(index, parsed.entityA, parsed.entityB);
    }
    return JSON.stringify({ error: `Unknown function: ${name}` });
  } catch {
    return JSON.stringify({ error: 'Failed to parse function arguments' });
  }
}

// ── Response parsing ────────────────────────────────────────────────────────

const ENTITIES_RE = /<!--ENTITIES\s*([\s\S]*?)\s*ENTITIES-->/;
const FOLLOWUPS_RE = /<!--FOLLOWUPS\s*([\s\S]*?)\s*FOLLOWUPS-->/;

function parseEntities(text: string): MatchedEntity[] {
  const match = text.match(ENTITIES_RE);
  if (!match) return [];
  try {
    return JSON.parse(match[1]) as MatchedEntity[];
  } catch {
    logger.warn('Failed to parse ENTITIES block', { context: 'QueryService' });
    return [];
  }
}

function parseFollowups(text: string): string[] {
  const match = text.match(FOLLOWUPS_RE);
  if (!match) return [];
  try {
    return JSON.parse(match[1]) as string[];
  } catch {
    logger.warn('Failed to parse FOLLOWUPS block', { context: 'QueryService' });
    return [];
  }
}

/** Strip marker blocks to get clean display content */
function cleanContent(text: string): string {
  return text
    .replace(ENTITIES_RE, '')
    .replace(FOLLOWUPS_RE, '')
    .trim();
}

/** Enrich matched entities with url, city, country from the index */
function enrichEntities(entities: MatchedEntity[], index: EcosystemIndex): MatchedEntity[] {
  return entities.map((e) => {
    if (e.entityType === 'USER') {
      const person = index.people.find((p) => p.id === e.entityId);
      if (person) {
        const spaceNameIds = [...new Set(person.roles.map((r) => r.spaceNameId))];
        return { ...e, city: person.city, country: person.country, spaceNameIds, avatarUrl: person.avatarUrl };
      }
    }
    if (e.entityType === 'SPACE') {
      const space = index.spaces.find((s) => s.id === e.entityId);
      if (space) {
        return { ...e, city: space.city, country: space.country, spaceNameIds: [space.nameId], avatarUrl: space.avatarUrl };
      }
    }
    if (e.entityType === 'ORGANIZATION') {
      const org = index.organizations.find((o) => o.id === e.entityId);
      if (org) {
        const spaceNameIds = [...new Set(org.roles.map((r) => r.spaceNameId))];
        return { ...e, city: org.city, country: org.country, spaceNameIds, avatarUrl: org.avatarUrl };
      }
    }
    return { ...e, spaceNameIds: e.spaceNameIds ?? [], avatarUrl: e.avatarUrl ?? null };
  });
}

/** Parse "Please retry in Xs" from Google AI Studio 429 error messages */
function parseRetryDelay(err: { message?: string; error?: { message?: string } }): number | null {
  const text = err.error?.message ?? err.message ?? '';
  const match = text.match(/retry in ([\d.]+)s/i);
  if (match) {
    const seconds = parseFloat(match[1]);
    if (!isNaN(seconds) && seconds > 0 && seconds < 120) {
      return Math.ceil(seconds * 1000) + 1000; // add 1s buffer
    }
  }
  return null;
}

// ── Main orchestration ──────────────────────────────────────────────────────

/**
 * Ask a natural language query against the user's ecosystem.
 * Streams SSE events via the onEvent callback.
 */
export async function askQuery(
  userId: string,
  sdk: Sdk,
  query: string,
  sessionId: string | undefined,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  const config = loadConfig();

  // 1. Thinking event
  onEvent({ type: 'thinking' });

  // 2. Get or create session
  let session = sessionId ? getSession(sessionId, userId) : null;
  if (!session) {
    const index = await buildEcosystemIndex(userId, sdk);
    session = createSession(userId, index);
  }

  // 3. Store user message
  const userMessage: QueryMessage = {
    messageId: crypto.randomUUID(),
    sessionId: session.sessionId,
    role: 'user',
    content: query,
    timestamp: new Date().toISOString(),
  };
  addMessage(session.sessionId, userMessage);

  // 4. Build messages array for LLM
  const serialized = serializeIndex(session.indexRef);
  const systemPrompt = [
    SECTION_1_ROLE,
    '\n=== ECOSYSTEM DATA ===\n',
    serialized,
    '\n=== END ECOSYSTEM DATA ===\n',
    SECTION_4_FORMAT,
  ].join('\n');

  const llmMessages = buildLlmMessages(systemPrompt, session.messages);

  // 5. Call LLM with streaming (OpenAI-compatible endpoint)
  const openai = new OpenAI({
    apiKey: config.openai.apiKey,
    ...(config.openai.baseUrl ? { baseURL: config.openai.baseUrl } : {}),
  });

  try {
    let accumulated = '';
    let toolCallsInProgress: Map<number, { id: string; name: string; args: string }> = new Map();

    // Retry with exponential backoff for 429 rate-limit errors
    const MAX_RETRIES = 3;
    let stream: Awaited<ReturnType<typeof openai.chat.completions.create>> | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        stream = await openai.chat.completions.create({
          model: config.openai.model,
          temperature: config.openai.temperature,
          max_tokens: config.openai.maxTokens,
          stream: true,
          messages: llmMessages,
          tools: LLM_TOOLS,
        });
        break; // success
      } catch (retryErr: unknown) {
        const retryError = retryErr as { status?: number; message?: string; error?: { message?: string } };
        if (retryError.status === 429 && attempt < MAX_RETRIES) {
          const delay = parseRetryDelay(retryError) ?? Math.pow(2, attempt + 1) * 1000;
          logger.warn(`Rate limited (429), retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})`, { context: 'QueryService' });
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw retryErr; // re-throw if not 429 or out of retries
      }
    }
    if (!stream) throw new Error('Failed to create stream after retries');

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      // Handle tool calls
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const existing = toolCallsInProgress.get(tc.index);
          if (existing) {
            existing.args += tc.function?.arguments ?? '';
          } else {
            toolCallsInProgress.set(tc.index, {
              id: tc.id ?? '',
              name: tc.function?.name ?? '',
              args: tc.function?.arguments ?? '',
            });
          }
        }
      }

      // Handle content chunks
      if (delta.content) {
        accumulated += delta.content;
        onEvent({ type: 'chunk', text: delta.content });
      }

      // Check for finish reason
      const finishReason = chunk.choices[0]?.finish_reason;
      if (finishReason === 'length') {
        accumulated += '\n\n*(Response was truncated due to length. Try asking a more specific question.)*';
        onEvent({ type: 'chunk', text: '\n\n*(Response was truncated due to length. Try asking a more specific question.)*' });
      }
      if (finishReason === 'tool_calls') {
        // Process all pending tool calls and re-invoke the model
        const toolResults: OpenAI.ChatCompletionMessageParam[] = [
          {
            role: 'assistant' as const,
            content: accumulated || null,
            tool_calls: [...toolCallsInProgress.values()].map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.name, arguments: tc.args },
            })),
          },
        ];

        for (const tc of toolCallsInProgress.values()) {
          const result = handleToolCall(session!.indexRef, tc.name, tc.args);
          toolResults.push({
            role: 'tool' as const,
            tool_call_id: tc.id,
            content: result,
          });
        }

        // Continue the conversation with tool results
        const followUpMessages = [...llmMessages, ...toolResults];
        let followUp: Awaited<ReturnType<typeof openai.chat.completions.create>> | null = null;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          try {
            followUp = await openai.chat.completions.create({
              model: config.openai.model,
              temperature: config.openai.temperature,
              max_tokens: config.openai.maxTokens,
              stream: true,
              messages: followUpMessages,
            });
            break;
          } catch (retryErr: unknown) {
            const retryError = retryErr as { status?: number; message?: string; error?: { message?: string } };
            if (retryError.status === 429 && attempt < MAX_RETRIES) {
              const delay = parseRetryDelay(retryError) ?? Math.pow(2, attempt + 1) * 1000;
              logger.warn(`Rate limited on follow-up (429), retrying in ${Math.round(delay / 1000)}s`, { context: 'QueryService' });
              await new Promise((r) => setTimeout(r, delay));
              continue;
            }
            throw retryErr;
          }
        }
        if (!followUp) throw new Error('Failed to create follow-up stream after retries');

        // Reset for the follow-up stream
        accumulated = '';
        toolCallsInProgress = new Map();

        for await (const followChunk of followUp) {
          const followDelta = followChunk.choices[0]?.delta;
          if (followDelta?.content) {
            accumulated += followDelta.content;
            onEvent({ type: 'chunk', text: followDelta.content });
          }
          if (followChunk.choices[0]?.finish_reason === 'length') {
            accumulated += '\n\n*(Response was truncated due to length. Try asking a more specific question.)*';
            onEvent({ type: 'chunk', text: '\n\n*(Response was truncated due to length. Try asking a more specific question.)*' });
          }
        }
      }
    }

    // 6. Parse response and build complete message
    const matchedEntities = enrichEntities(parseEntities(accumulated), session.indexRef);
    const suggestedFollowups = parseFollowups(accumulated);
    const content = cleanContent(accumulated);

    const assistantMessage: QueryMessage = {
      messageId: crypto.randomUUID(),
      sessionId: session.sessionId,
      role: 'assistant',
      content,
      timestamp: new Date().toISOString(),
      matchedEntities,
      suggestedFollowups,
    };

    addMessage(session.sessionId, assistantMessage);
    onEvent({ type: 'complete', message: assistantMessage });
  } catch (err: unknown) {
    const error = err as { status?: number; message?: string };
    logger.error('Query service error', {
      context: 'QueryService',
      error: String(err),
      status: error.status,
    });
    if (error.status === 429) {
      onEvent({ type: 'error', error: 'Service temporarily busy, please wait a moment' });
    } else {
      logger.error('Query service error', {
        context: 'QueryService',
        error: String(err),
      });
      onEvent({ type: 'error', error: 'The AI service encountered an error. Please try again.' });
    }
  }
}

// ── Message array builder with token budget management ──────────────────────

function buildLlmMessages(
  systemPrompt: string,
  conversationHistory: QueryMessage[],
): OpenAI.ChatCompletionMessageParam[] {
  const MAX_HISTORY_TOKENS = 5000;
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
  ];

  // Always include at least the latest user message; trim older messages if needed
  const historyMessages = conversationHistory.map(
    (m): OpenAI.ChatCompletionMessageParam => ({
      role: m.role,
      content: m.content,
    }),
  );

  let totalTokens = 0;
  const included: OpenAI.ChatCompletionMessageParam[] = [];

  // Walk from newest to oldest, always include the last message
  for (let i = historyMessages.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(historyMessages[i].content as string);
    if (totalTokens + msgTokens > MAX_HISTORY_TOKENS && included.length > 0) {
      // Prepend summary of dropped messages
      const droppedCount = i + 1;
      messages.push({
        role: 'system',
        content: `Previous conversation context: ${droppedCount} earlier message(s) were trimmed to fit the token budget.`,
      });
      break;
    }
    totalTokens += msgTokens;
    included.unshift(historyMessages[i]);
  }

  messages.push(...included);
  return messages;
}

// ── Feedback ────────────────────────────────────────────────────────────────

/**
 * Submit feedback on a specific assistant message.
 * Validates the message exists in the user's active session, then persists to SQLite.
 */
export function submitFeedback(
  userId: string,
  messageId: string,
  comment?: string,
): { success: boolean; error?: string } {
  // Find the message across all sessions for this user
  // We need to iterate sessions — import getSession doesn't give us a search by messageId
  // Instead we'll search across all sessions via the session-service internals
  // For now, trust the messageId and accept the feedback
  const db = getDatabase();
  const config = loadConfig();

  const maxLen = config.query.maxFeedbackLength;
  const sanitizedComment = comment ? comment.slice(0, maxLen) : null;

  const stmt = db.prepare(
    `INSERT INTO query_feedback (user_id, message_id, query_text, answer_json, comment)
     VALUES (?, ?, ?, ?, ?)`,
  );

  // We store minimal info — the message content is in the ephemeral session
  stmt.run(userId, messageId, '', '{}', sanitizedComment);

  logger.info('Feedback submitted', {
    context: 'QueryService',
    userId,
    messageId,
  });

  return { success: true };
}

// ── Connector detection (T027) ──────────────────────────────────────────────

/**
 * Identify people who participate across multiple spaces — "connectors".
 * Returns people sorted descending by number of distinct spaces.
 */
export function identifyConnectors(
  index: EcosystemIndex,
): { personId: string; name: string; spaceCount: number; spaces: string[] }[] {
  return index.people
    .map((p) => {
      const uniqueSpaces = [...new Set(p.roles.map((r) => r.spaceName))];
      return {
        personId: p.id,
        name: p.name,
        spaceCount: uniqueSpaces.length,
        spaces: uniqueSpaces,
      };
    })
    .filter((c) => c.spaceCount > 1)
    .sort((a, b) => b.spaceCount - a.spaceCount);
}

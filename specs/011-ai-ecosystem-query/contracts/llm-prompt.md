# LLM Prompt & Response Contract

**Feature**: 011-ai-ecosystem-query  
**Date**: 2026-03-06

## Overview

This document defines the system prompt structure and expected structured response format for the LLM integration. The system prompt is composed dynamically per-request by `query-service.ts` using data from the `EcosystemIndex`.

## System Prompt Structure

The system prompt is composed of four sections assembled at runtime:

### Section 1: Role & Rules

```
You are the Ecosystem Navigator — an AI assistant that helps users discover people, 
projects, organisations, and collaboration opportunities within the Alkemio ecosystem.

RULES:
1. Only answer based on the ecosystem data provided below. Never fabricate entities, 
   people, projects, or organisations that do not appear in the data.
2. When you find matches, cite them by exact name as they appear in the data.
3. Provide a plain-language explanation for each match — why this entity is relevant 
   to the user's question. Never use numeric confidence or relevance scores.
4. If you cannot find relevant matches, say so honestly and suggest alternative or 
   broader queries the user could try.
5. If the user asks a question unrelated to the ecosystem (weather, general knowledge, 
   etc.), politely explain that you can only help with questions about the ecosystem 
   data — people, projects, organisations, skills, locations, and collaboration.
6. If a query is ambiguous, ask one clarifying question before answering, or provide 
   the most likely interpretation with a note about alternatives.
7. Respond in the same language the user writes in (English or Dutch).
8. When suggesting follow-up questions, make them specific and actionable based on 
   the data you've seen.
9. For large result sets (>10 matches), summarise the top matches and offer to show more.
10. When identifying "connectors" or people bridging communities, base this on 
    cross-space membership data — people who hold roles in multiple distinct spaces.
```

### Section 2: Ecosystem Data

Injected by `serializer.ts` from the user's `EcosystemIndex`:

```
=== ECOSYSTEM DATA ===

SPACES (N total):
- Green Rotterdam (tags: circular economy, sustainability) in Rotterdam, Netherlands | 45 members, 3 subspaces | ACTIVE
- Digital Innovation Hub (tags: AI, digital twins) in The Hague, Netherlands | 23 members, 2 subspaces | ACTIVE
...

PEOPLE (N total):
- Jan de Vries (skills: circular design, sustainability, urban farming) in Rotterdam, Netherlands | roles: Green Rotterdam/LEAD, Circular South Holland/MEMBER
- Maria Santos (skills: data science, machine learning) in Amsterdam, Netherlands | roles: Digital Innovation Hub/MEMBER, AI Ethics Lab/LEAD
...

ORGANIZATIONS (N total):
- Acme Corp (tags: technology, innovation) in Amsterdam, Netherlands | roles: Digital Innovation Hub/MEMBER
...

=== END ECOSYSTEM DATA ===
```

### Section 3: Available Functions

When the index is large or the LLM needs deeper detail, function calling is available:

```json
{
  "functions": [
    {
      "name": "get_entity_details",
      "description": "Get full profile details for a specific person, space, or organisation by ID. Use when you need more information about a match beyond what's in the index.",
      "parameters": {
        "type": "object",
        "properties": {
          "entityId": { "type": "string", "description": "The entity ID from the index" },
          "entityType": { "type": "string", "enum": ["USER", "SPACE", "ORGANIZATION"] }
        },
        "required": ["entityId", "entityType"]
      }
    },
    {
      "name": "get_shared_connections",
      "description": "Find shared members, organisations, or topics between two entities.",
      "parameters": {
        "type": "object",
        "properties": {
          "entityA": { "type": "string", "description": "First entity ID" },
          "entityB": { "type": "string", "description": "Second entity ID" }
        },
        "required": ["entityA", "entityB"]
      }
    }
  ]
}
```

### Section 4: Response Format

```
When you find matching entities, structure your response as follows:

1. Start with a natural-language summary paragraph answering the user's question.
2. Then list the matched entities using this exact JSON block at the end of your response:

<!--ENTITIES
[
  {
    "entityId": "<id from the data>",
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

If no entities match, omit the ENTITIES block and provide helpful alternative suggestions.
```

## Response Parsing

The `query-service.ts` parses the LLM response by:

1. Extracting the natural-language content (everything outside marker blocks)
2. Parsing the `<!--ENTITIES ... ENTITIES-->` block as JSON → `MatchedEntity[]`
3. Parsing the `<!--FOLLOWUPS ... FOLLOWUPS-->` block as JSON → `string[]`
4. Enriching each `MatchedEntity` with `url`, `city`, and `country` from the `EcosystemIndex`
5. Assembling the `QueryMessage` with `content`, `matchedEntities`, and `suggestedFollowups`

If the LLM response doesn't contain valid marker blocks, the entire response is treated as plain text content with no structured entities.

## Conversation History

For multi-turn conversations, the LLM messages array includes the full conversation history:

```json
[
  { "role": "system", "content": "<sections 1-4 above>" },
  { "role": "user", "content": "Who has experience with circular economy?" },
  { "role": "assistant", "content": "<previous answer with ENTITIES block>" },
  { "role": "user", "content": "Tell me more about the second person" },
]
```

The conversation history is trimmed if it exceeds the token budget:
- System prompt + latest query are always included
- Older messages are dropped from the beginning (FIFO) until within budget
- A summary of dropped messages is prepended: "Previous conversation context: user asked about [topic] and received [N] results."

## Token Budget Management

| Component | Estimated Tokens | Budget |
|-----------|-----------------|--------|
| System prompt (sections 1, 3, 4) | ~800 | Fixed |
| Ecosystem index (section 2) | 15,000–25,000 | Variable |
| Conversation history | 500–5,000 | Flexible |
| LLM response output | ~2,000 | Reserved |
| **Total budget** | **~30,000** | Max 100,000 (leaving buffer) |

For very large ecosystems (>25k index tokens), the index is split into tiers:
1. **Tier 1**: Full people + space index (always included)
2. **Tier 2**: Organisation details (included if within budget)
3. **Tier 3**: Extended role details (included via function calling on demand)

## Model Configuration

```typescript
{
  model: 'gpt-4o',
  temperature: 0.3,      // Low for factual accuracy, slight creativity for NL
  max_tokens: 4096,       // Sufficient for detailed answers with entities
  stream: true,
  response_format: undefined,  // Free-form with structured markers (not JSON mode)
}
```

## Error Handling

| Scenario | LLM Behaviour | Server Handling |
|----------|---------------|-----------------|
| Rate limited by OpenAI | 429 response | SSE `error` event → "Service temporarily busy, please wait a moment" |
| Model timeout | No response within 60s | Abort stream, SSE `error` event → "Request timed out" |
| Malformed LLM response | No ENTITIES block | Return content as plain text, empty matchedEntities |
| Function call fails | N/A | Return partial answer without the additional detail |
| Content filter triggered | Refusal response | Forward refusal text as assistant message |

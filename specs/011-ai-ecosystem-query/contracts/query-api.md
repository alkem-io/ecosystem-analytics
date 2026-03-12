# API Contract: Query Endpoints

**Feature**: 011-ai-ecosystem-query  
**Date**: 2026-03-06

## Overview

Three new BFF endpoints under `/api/query/` provide the conversational AI query interface. The `ask` endpoint uses Server-Sent Events (SSE) for streaming LLM responses. All endpoints require authentication via the existing bearer token mechanism.

## Endpoints

### `POST /api/query/ask` — Submit a query (streaming)

Submit a natural language question and receive a streaming response.

**Headers:**

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <token>` | Yes |
| `Content-Type` | `application/json` | Yes |
| `Accept` | `text/event-stream` | Yes |

**Request Body:**

```json
{
  "query": "Who has experience with circular economy in Rotterdam?",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `query` | `string` | Yes | Non-empty, max 2000 chars |
| `sessionId` | `string` | No | Valid UUID. Omit to start a new conversation. |

**Response:** `text/event-stream` — SSE stream with the following event types:

#### Event: `thinking`

Sent immediately while the system prepares context. Allows the frontend to show a loading indicator.

```
data: {"type":"thinking"}

```

#### Event: `chunk`

Streamed text chunks from the LLM response. Frontend accumulates these for progressive rendering.

```
data: {"type":"chunk","text":"Based on the ecosystem data, I found "}

```

```
data: {"type":"chunk","text":"several people with circular economy expertise"}

```

#### Event: `complete`

Sent once when the full response is assembled with structured data.

```json
data: {"type":"complete","message":{"messageId":"msg-uuid-123","sessionId":"550e8400-e29b-41d4-a716-446655440000","role":"assistant","content":"Based on the ecosystem data, I found several people with circular economy expertise in Rotterdam...","timestamp":"2026-03-06T14:30:00Z","matchedEntities":[{"entityId":"user-uuid-abc","entityType":"USER","displayName":"Jan de Vries","matchReason":"Member of 2 circular economy projects in Rotterdam; skills include 'circular design' and 'sustainability'","url":"https://alkem.io/user/jan-de-vries","spaceContext":"Green Rotterdam","city":"Rotterdam","country":"Netherlands","relevantTags":["circular design","sustainability","urban farming"]},{"entityId":"space-uuid-xyz","entityType":"SPACE","displayName":"Circular South Holland","matchReason":"Active project focused on circular economy initiatives in the Rotterdam-The Hague metropolitan area","url":"https://alkem.io/space/circular-south-holland","spaceContext":null,"city":"Rotterdam","country":"Netherlands","relevantTags":["circular economy","south holland"]}],"suggestedFollowups":["Which organisations are involved in these circular economy projects?","What other skills does Jan de Vries have?","Are there similar projects outside Rotterdam?"]}}

```

#### Event: `error`

Sent if processing fails after streaming has begun.

```
data: {"type":"error","error":"The AI service is temporarily unavailable. Please try again."}

```

**Error Responses (non-streaming):**

| Status | Body | Condition |
|--------|------|-----------|
| 400 | `{ "error": "Query text is required and must be <= 2000 characters" }` | Missing or invalid query |
| 400 | `{ "error": "Invalid session ID format" }` | Malformed sessionId |
| 401 | `{ "error": "Unauthorized" }` | Missing or invalid bearer token |
| 404 | `{ "error": "Session not found or expired" }` | sessionId references expired/unknown session |
| 503 | `{ "error": "AI query service is currently unavailable" }` | LLM API unreachable |

---

### `POST /api/query/feedback` — Submit feedback on an answer

Log a "This doesn't look right" report for quality monitoring.

**Headers:**

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <token>` | Yes |
| `Content-Type` | `application/json` | Yes |

**Request Body:**

```json
{
  "messageId": "msg-uuid-123",
  "comment": "The person listed doesn't work on circular economy"
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `messageId` | `string` | Yes | Must reference a message in the user's active session |
| `comment` | `string` | No | Max 5000 chars |

**Response:** `201 Created`

```json
{
  "success": true
}
```

**Error Responses:**

| Status | Body | Condition |
|--------|------|-----------|
| 400 | `{ "error": "messageId is required" }` | Missing messageId |
| 401 | `{ "error": "Unauthorized" }` | Missing or invalid bearer token |
| 404 | `{ "error": "Message not found in active session" }` | messageId not found |

---

### `GET /api/query/session/:sessionId` — Retrieve session history

Retrieve the conversation history for an active session. Used when the frontend needs to restore conversation state (e.g., after toggling between graph and overlay views).

**Headers:**

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <token>` | Yes |

**URL Parameters:**

| Param | Type | Required | Constraints |
|-------|------|----------|-------------|
| `sessionId` | `string` | Yes | Valid UUID |

**Response:** `200 OK`

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "messages": [
    {
      "messageId": "msg-uuid-001",
      "sessionId": "550e8400-e29b-41d4-a716-446655440000",
      "role": "user",
      "content": "Who has experience with circular economy in Rotterdam?",
      "timestamp": "2026-03-06T14:29:55Z"
    },
    {
      "messageId": "msg-uuid-002",
      "sessionId": "550e8400-e29b-41d4-a716-446655440000",
      "role": "assistant",
      "content": "Based on the ecosystem data, I found several people...",
      "timestamp": "2026-03-06T14:30:00Z",
      "matchedEntities": [],
      "suggestedFollowups": []
    }
  ]
}
```

**Error Responses:**

| Status | Body | Condition |
|--------|------|-----------|
| 401 | `{ "error": "Unauthorized" }` | Missing or invalid bearer token |
| 404 | `{ "error": "Session not found or expired" }` | Session doesn't exist or belongs to another user |

## Authentication

All endpoints use the existing BFF authentication flow:
1. Frontend sends `Authorization: Bearer <session_token>` header
2. `resolveUser` middleware validates token via Kratos whoami endpoint
3. `req.auth.userId` and `req.auth.userDisplayName` are populated
4. Query service uses `userId` for session scoping and data access control
5. Data fetched for the ecosystem index uses the user's token to query Alkemio GraphQL, automatically enforcing platform access controls

## Session Lifecycle

```
                          ┌─────────────────────────┐
                          │   No active session      │
                          └──────────┬──────────────┘
                                     │
                          POST /ask (no sessionId)
                                     │
                                     ▼
                          ┌─────────────────────────┐
                          │   Session created        │
                          │   Index built (if needed) │
                          │   sessionId returned     │
                          └──────────┬──────────────┘
                                     │
                          POST /ask (with sessionId)
                                     │ (repeatable)
                                     ▼
                          ┌─────────────────────────┐
                          │   Session active         │
                          │   lastActiveAt updated   │
                          └──────────┬──────────────┘
                                     │
                          30 min inactivity timeout
                                     │
                                     ▼
                          ┌─────────────────────────┐
                          │   Session expired        │
                          │   Memory freed           │
                          └─────────────────────────┘
```

## Rate Limiting

No explicit rate limiting is implemented in the BFF layer for MVP. The OpenAI API has its own rate limits. If rate-limited, the `ask` endpoint returns a `503` error event in the SSE stream. Future iterations may add per-user query throttling.

## CORS / Security

- All endpoints are behind the existing BFF CORS configuration
- The OpenAI API key is server-side only — never exposed to the frontend
- User query text is sent to OpenAI as part of the LLM prompt; no user credentials are sent
- Feedback data is stored in a separate SQLite table (not mixed with cache data)

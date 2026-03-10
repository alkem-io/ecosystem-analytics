import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth/middleware.js';
import { resolveUser } from '../auth/resolve-user.js';
import { createAlkemioSdk } from '../graphql/client.js';
import { loadConfig } from '../config.js';
import { getLogger } from '../logging/logger.js';
import { askQuery, submitFeedback } from '../services/query-service.js';
import { getSession } from '../services/session-service.js';
import type { AskRequest, FeedbackRequest, StreamEvent } from '../types/query.js';

const logger = getLogger();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const queryRouter = Router();
queryRouter.use(authMiddleware);
queryRouter.use(resolveUser);

// POST /api/query/ask — Submit a query (SSE streaming)
queryRouter.post('/ask', async (req: Request, res: Response) => {
  const config = loadConfig();
  const body = req.body as AskRequest;

  // Validate query
  if (!body.query || typeof body.query !== 'string' || body.query.trim().length === 0) {
    res.status(400).json({ error: 'Query text is required and must be <= 2000 characters' });
    return;
  }
  if (body.query.length > config.query.maxQueryLength) {
    res.status(400).json({ error: 'Query text is required and must be <= 2000 characters' });
    return;
  }

  // Validate sessionId format if provided
  if (body.sessionId && !UUID_RE.test(body.sessionId)) {
    res.status(400).json({ error: 'Invalid session ID format' });
    return;
  }

  // If sessionId is provided, verify it exists
  if (body.sessionId) {
    const existing = getSession(body.sessionId, req.auth!.userId!);
    if (!existing) {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sdk = createAlkemioSdk(req.auth!.bearerToken);

  const onEvent = (event: StreamEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    await askQuery(
      req.auth!.userId!,
      sdk,
      body.query.trim(),
      body.sessionId,
      onEvent,
    );
  } catch (err) {
    logger.error('Ask endpoint error', { context: 'QueryRouter', error: String(err) });
    onEvent({ type: 'error', error: 'AI query service is currently unavailable' });
  }

  res.end();
});

// POST /api/query/feedback — Submit feedback on an answer
queryRouter.post('/feedback', (req: Request, res: Response) => {
  const body = req.body as FeedbackRequest;

  if (!body.messageId || typeof body.messageId !== 'string') {
    res.status(400).json({ error: 'messageId is required' });
    return;
  }

  const result = submitFeedback(req.auth!.userId!, body.messageId, body.comment);

  if (!result.success) {
    res.status(404).json({ error: result.error ?? 'Message not found in active session' });
    return;
  }

  res.status(201).json({ success: true });
});

// GET /api/query/session/:sessionId — Retrieve session history
queryRouter.get('/session/:sessionId', (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;

  if (!UUID_RE.test(sessionId)) {
    res.status(400).json({ error: 'Invalid session ID format' });
    return;
  }

  const session = getSession(sessionId, req.auth!.userId!);
  if (!session) {
    res.status(404).json({ error: 'Session not found or expired' });
    return;
  }

  res.json({
    sessionId: session.sessionId,
    messages: session.messages,
  });
});

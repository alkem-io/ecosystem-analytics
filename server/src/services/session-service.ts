import crypto from 'crypto';
import { getLogger } from '../logging/logger.js';
import { loadConfig } from '../config.js';
import type { ConversationSession, QueryMessage, EcosystemIndex } from '../types/query.js';

const logger = getLogger();

/** In-memory store for ephemeral conversation sessions */
const sessions = new Map<string, ConversationSession>();

/** Periodic cleanup interval handle */
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export function createSession(userId: string, index: EcosystemIndex): ConversationSession {
  const now = new Date().toISOString();
  const session: ConversationSession = {
    sessionId: crypto.randomUUID(),
    userId,
    createdAt: now,
    lastActiveAt: now,
    indexRef: index,
    messages: [],
  };
  sessions.set(session.sessionId, session);
  logger.debug(`Session created: ${session.sessionId}`, { context: 'SessionService' });
  return session;
}

export function getSession(sessionId: string, userId: string): ConversationSession | null {
  const session = sessions.get(sessionId);
  if (!session || session.userId !== userId) return null;
  return session;
}

export function addMessage(sessionId: string, message: QueryMessage): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.messages.push(message);
  session.lastActiveAt = new Date().toISOString();
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}

/** Remove sessions that have been inactive longer than the configured TTL */
function purgeExpiredSessions(): void {
  const config = loadConfig();
  const ttlMs = config.query.sessionTtlMinutes * 60 * 1000;
  const now = Date.now();
  let purged = 0;

  for (const [id, session] of sessions) {
    if (now - new Date(session.lastActiveAt).getTime() > ttlMs) {
      sessions.delete(id);
      purged++;
    }
  }

  if (purged > 0) {
    logger.debug(`Purged ${purged} expired session(s)`, { context: 'SessionService' });
  }
}

/** Start the periodic cleanup (every 5 minutes) */
export function startSessionCleanup(): void {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(purgeExpiredSessions, 5 * 60 * 1000);
}

/** Stop the periodic cleanup (for graceful shutdown) */
export function stopSessionCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

import { useState, useCallback, useRef } from 'react';
import { askQuery } from '../services/query-api.js';
import type { QueryMessage, StreamEvent } from '../types/query.js';

export function useQuery() {
  const [messages, setMessages] = useState<QueryMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Abort controller for cancellation
  const abortRef = useRef<AbortController | null>(null);

  const sendQuery = useCallback(
    async (text: string) => {
      setError(null);

      // Append user message immediately
      const userMessage: QueryMessage = {
        messageId: `local-${Date.now()}`,
        sessionId: sessionId ?? '',
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setIsStreaming(true);
      setStreamingContent('');

      try {
        let accumulated = '';
        for await (const event of askQuery(text, sessionId ?? undefined)) {
          handleEvent(event);
        }

        function handleEvent(event: StreamEvent) {
          switch (event.type) {
            case 'thinking':
              // Indicator already shown via isStreaming
              break;
            case 'chunk':
              accumulated += event.text ?? '';
              setStreamingContent(accumulated);
              break;
            case 'complete':
              if (event.message) {
                setMessages((prev) => [...prev, event.message!]);
                setSessionId(event.message.sessionId);
              }
              break;
            case 'error':
              setError(event.error ?? 'An error occurred');
              break;
          }
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsStreaming(false);
        setStreamingContent('');
      }
    },
    [sessionId],
  );

  const resetConversation = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    setIsStreaming(false);
    setStreamingContent('');
    setError(null);
  }, []);

  return {
    messages,
    sessionId,
    isStreaming,
    streamingContent,
    error,
    sendQuery,
    resetConversation,
  };
}

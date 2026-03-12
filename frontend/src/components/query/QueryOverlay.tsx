import { useEffect, useRef, useState } from 'react';
import { useQuery } from '../../hooks/useQuery.js';
import QueryMessageBubble from './QueryMessage.js';
import QueryInput from './QueryInput.js';
import { X, RotateCcw, Sparkles } from 'lucide-react';

interface Props {
  hidden?: boolean;
  onClose: () => void;
  onShowOnGraph?: (entityIds: string[], spaceNameIds: string[]) => void;
}

export default function QueryOverlay({ hidden, onClose, onShowOnGraph }: Props) {
  const {
    messages,
    isStreaming,
    streamingContent,
    error,
    sendQuery,
    resetConversation,
  } = useQuery();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages or streaming content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[1000] flex flex-col bg-background"
      role="dialog"
      aria-label="Ask the Ecosystem"
      style={hidden ? { display: 'none' } : undefined}
    >
      {/* Header */}
      <div
        className="flex shrink-0 items-center justify-between"
        style={{
          height: 56,
          padding: '0 24px',
          borderBottom: '1px solid #e2e8f0',
          background: '#ffffff',
        }}
      >
        <div className="flex items-center" style={{ gap: 10 }}>
          <Sparkles style={{ width: 18, height: 18, color: '#2563eb' }} />
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', margin: 0 }}>Ask the Ecosystem</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={resetConversation}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                height: 32,
                padding: '0 10px',
                fontSize: 12,
                fontWeight: 500,
                fontFamily: 'inherit',
                color: '#64748b',
                background: 'transparent',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <RotateCcw style={{ width: 14, height: 14 }} />
              New conversation
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              background: 'transparent',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              color: '#64748b',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto" ref={scrollRef}>
        <div
          className={messages.length === 0 && !isStreaming ? 'flex flex-col h-full' : ''}
          style={{
            maxWidth: 672,
            margin: '0 auto',
            padding: '32px 32px',
            ...(messages.length > 0 || isStreaming ? { display: 'flex', flexDirection: 'column' as const, gap: 24 } : {}),
          }}
        >
          {messages.length === 0 && !isStreaming && (
            <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
              <div style={{ display: 'flex', width: 56, height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 16, background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb', marginBottom: 16 }}>
                <Sparkles style={{ width: 28, height: 28 }} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', margin: 0 }}>Ask the Ecosystem</h3>
              <p style={{ marginTop: 8, maxWidth: 384, fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>
                Ask questions about people, projects, skills, organisations, and connections across your portfolio.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <QueryMessageBubble
              key={msg.messageId}
              message={msg}
              onFollowup={sendQuery}
              onShowOnGraph={onShowOnGraph}
            />
          ))}

          {isStreaming && (
            <QueryMessageBubble
              message={{
                messageId: 'streaming',
                sessionId: '',
                role: 'assistant',
                content: '',
                timestamp: '',
              }}
              streaming
              streamingContent={streamingContent}
            />
          )}

          {error && (
            <div style={{ margin: '0 auto', maxWidth: 448, borderRadius: 10, border: '1px solid rgba(220, 38, 38, 0.3)', background: 'rgba(220, 38, 38, 0.05)', padding: 16, textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 14, color: '#1e293b' }}>{error}</p>
              <button
                type="button"
                onClick={() => {
                  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
                  if (lastUser) sendQuery(lastUser.content);
                }}
                style={{
                  marginTop: 12,
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: 32,
                  padding: '0 14px',
                  fontSize: 13,
                  fontWeight: 500,
                  fontFamily: 'inherit',
                  color: '#1e293b',
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Input area */}
      <div
        className="shrink-0"
        style={{
          borderTop: '1px solid #e2e8f0',
          background: '#ffffff',
        }}
      >
        <div style={{ maxWidth: 672, margin: '0 auto', padding: '0 24px' }}>
          <QueryInput
            onSubmit={sendQuery}
            disabled={isStreaming}
            showSuggestions={messages.length === 0}
          />
        </div>
      </div>
    </div>
  );
}

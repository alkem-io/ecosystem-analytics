import { useState, useEffect, type CSSProperties } from 'react';
import type { QueryMessage as QueryMessageType } from '../../types/query.js';
import AnswerCard from './AnswerCard.js';
import { Sparkles } from 'lucide-react';
import { getRandomThinkingPhrase } from '../../lib/thinking-phrases.js';

const avatarStyle: CSSProperties = {
  display: 'flex',
  width: 32,
  height: 32,
  flexShrink: 0,
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 10,
  background: 'rgba(37, 99, 235, 0.1)',
  color: '#2563eb',
};

const dotStyle: CSSProperties = {
  width: 4,
  height: 4,
  borderRadius: '50%',
  background: '#94a3b8',
};

interface Props {
  message: QueryMessageType;
  streaming?: boolean;
  streamingContent?: string;
  onFollowup?: (query: string) => void;
  onShowOnGraph?: (entityIds: string[], spaceNameIds: string[]) => void;
}

export default function QueryMessageBubble({
  message,
  streaming,
  streamingContent,
  onFollowup,
  onShowOnGraph,
}: Props) {
  const [thinkingPhrase, setThinkingPhrase] = useState(() => getRandomThinkingPhrase());

  // Rotate phrase every few seconds while streaming with no content yet
  useEffect(() => {
    if (!streaming || streamingContent) return;
    const interval = setInterval(() => {
      setThinkingPhrase(getRandomThinkingPhrase());
    }, 3000);
    return () => clearInterval(interval);
  }, [streaming, streamingContent]);

  if (message.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div
          style={{
            maxWidth: '80%',
            borderRadius: '16px 16px 4px 16px',
            background: '#2563eb',
            padding: '12px 20px',
            fontSize: 14,
            color: '#ffffff',
            lineHeight: 1.6,
          }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  // Streaming — thinking indicator or partial content
  if (streaming) {
    return (
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={avatarStyle}>
          <Sparkles style={{ width: 16, height: 16 }} />
        </div>
        <div style={{ minWidth: 0, flex: 1, paddingTop: 4 }}>
          {!streamingContent ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#94a3b8' }}>
              <span>{thinkingPhrase}</span>
              <span style={{ display: 'inline-flex', gap: 2 }}>
                <span className="animate-bounce [animation-delay:0ms]" style={dotStyle} />
                <span className="animate-bounce [animation-delay:150ms]" style={dotStyle} />
                <span className="animate-bounce [animation-delay:300ms]" style={dotStyle} />
              </span>
            </div>
          ) : (
            <div style={{ fontSize: 14, color: '#1e293b', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {streamingContent}
              <span className="animate-pulse" style={{ marginLeft: 2, display: 'inline-block', height: 16, width: 2, background: '#1e293b', verticalAlign: 'text-bottom' }} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Completed assistant message
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <div style={avatarStyle}>
        <Sparkles style={{ width: 16, height: 16 }} />
      </div>
      <div style={{ minWidth: 0, flex: 1, paddingTop: 4 }}>
        <AnswerCard message={message} onFollowup={onFollowup} onShowOnGraph={onShowOnGraph} />
      </div>
    </div>
  );
}

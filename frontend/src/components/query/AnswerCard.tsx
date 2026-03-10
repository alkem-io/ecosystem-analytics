import { useState } from 'react';
import type { QueryMessage } from '../../types/query.js';
import EntityResult from './EntityResult.js';
import FeedbackButton from './FeedbackButton.js';
import { MapPin } from 'lucide-react';

interface Props {
  message: QueryMessage;
  onFollowup?: (query: string) => void;
  onShowOnGraph?: (entityIds: string[], spaceNameIds: string[]) => void;
}

export default function AnswerCard({ message, onFollowup, onShowOnGraph }: Props) {
  const entities = message.matchedEntities ?? [];
  const followups = message.suggestedFollowups ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 14, color: '#1e293b', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
        {message.content}
      </div>

      {entities.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {entities.map((entity) => (
            <EntityResult key={entity.entityId} entity={entity} />
          ))}
        </div>
      )}

      {entities.length > 0 && onShowOnGraph && (
        <ShowOnGraphButton
          onClick={() => {
            const entityIds = entities.map((e) => e.entityId);
            const spaceNameIds = [...new Set(entities.flatMap((e) => e.spaceNameIds ?? []))];
            onShowOnGraph(entityIds, spaceNameIds);
          }}
        />
      )}

      {followups.length > 0 && (
        <>
          <div style={{ height: 1, background: '#e2e8f0' }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {followups.map((q) => (
              <FollowupChip key={q} label={q} onClick={() => onFollowup?.(q)} />
            ))}
          </div>
        </>
      )}

      <div style={{ paddingTop: 4 }}>
        <FeedbackButton messageId={message.messageId} />
      </div>
    </div>
  );
}

function ShowOnGraphButton({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        height: 32,
        padding: '0 12px',
        fontSize: 13,
        fontWeight: 500,
        fontFamily: 'inherit',
        color: hovered ? '#1e293b' : '#64748b',
        background: hovered ? '#f1f5f9' : 'transparent',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        cursor: 'pointer',
        transition: 'background 0.15s, color 0.15s',
      }}
    >
      <MapPin style={{ width: 14, height: 14 }} />
      Show on graph
    </button>
  );
}

function FollowupChip({ label, onClick }: { label: string; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 99,
        border: `1px solid ${hovered ? '#93b4f8' : '#e2e8f0'}`,
        background: hovered ? '#f1f5f9' : '#f8fafc',
        padding: '8px 14px',
        fontSize: 12,
        color: '#1e293b',
        cursor: 'pointer',
        fontFamily: 'inherit',
        lineHeight: 1.4,
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      {label}
    </button>
  );
}

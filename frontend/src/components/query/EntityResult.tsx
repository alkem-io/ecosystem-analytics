import { useState, type CSSProperties } from 'react';
import type { MatchedEntity } from '../../types/query.js';
import { User, Home, Building2, MapPin, ExternalLink } from 'lucide-react';

interface Props {
  entity: MatchedEntity;
}

const TYPE_ICONS: Record<string, typeof User> = {
  USER: User,
  SPACE: Home,
  ORGANIZATION: Building2,
};

const cardBase: CSSProperties = {
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  background: '#ffffff',
  padding: 16,
  transition: 'background 0.15s',
};

const iconBox: CSSProperties = {
  display: 'flex',
  width: 36,
  height: 36,
  flexShrink: 0,
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 10,
  background: '#f1f5f9',
  color: '#64748b',
  overflow: 'hidden',
};

const tagStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: 99,
  border: 'none',
  background: '#f1f5f9',
  padding: '2px 8px',
  fontSize: 10,
  fontWeight: 600,
  color: '#64748b',
  fontFamily: 'inherit',
};

export default function EntityResult({ entity }: Props) {
  const Icon = TYPE_ICONS[entity.entityType] ?? MapPin;
  const [hovered, setHovered] = useState(false);
  const [nameHovered, setNameHovered] = useState(false);

  return (
    <div
      style={{ ...cardBase, background: hovered ? '#f8fafc' : '#ffffff' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={iconBox}>
          {entity.avatarUrl ? (
            <img
              src={entity.avatarUrl}
              alt=""
              style={{ width: 36, height: 36, objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <Icon style={{ width: 16, height: 16 }} />
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {entity.url ? (
              <a
                href={entity.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 14,
                  fontWeight: 500,
                  color: nameHovered ? '#2563eb' : '#0f172a',
                  textDecoration: nameHovered ? 'underline' : 'none',
                }}
                onMouseEnter={() => setNameHovered(true)}
                onMouseLeave={() => setNameHovered(false)}
              >
                {entity.displayName}
                <ExternalLink style={{ width: 12, height: 12, color: '#94a3b8' }} />
              </a>
            ) : (
              <span style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }}>{entity.displayName}</span>
            )}
          </div>
          {(entity.city || entity.country) && (
            <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#94a3b8' }}>
              <MapPin style={{ width: 12, height: 12 }} />
              {[entity.city, entity.country].filter(Boolean).join(', ')}
            </div>
          )}
          <p style={{ margin: 0, marginTop: 6, fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>{entity.matchReason}</p>
          {entity.relevantTags.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {entity.relevantTags.map((tag) => (
                <span key={tag} style={tagStyle}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

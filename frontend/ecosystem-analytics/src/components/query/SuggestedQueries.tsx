import { MessageCircle } from 'lucide-react';

const EXAMPLE_QUERIES = [
  'Who has experience with circular economy?',
  'Which projects are working on sustainability?',
  'Find people with data science skills in Amsterdam',
  'What organisations are involved in digital innovation?',
  'Who could we partner with on youth employment?',
  'Who are the key connectors between communities?',
];

interface Props {
  onSelect: (query: string) => void;
}

export default function SuggestedQueries({ onSelect }: Props) {
  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{ fontSize: 12, fontWeight: 500, color: '#94a3b8', textAlign: 'center', marginBottom: 12 }}>
        Try asking:
      </p>
      <div className="flex flex-wrap justify-center" style={{ gap: 8 }}>
        {EXAMPLE_QUERIES.map((q) => (
          <button
            key={q}
            onClick={() => onSelect(q)}
            type="button"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 16px',
              fontSize: 12,
              color: '#334155',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 99,
              cursor: 'pointer',
              fontFamily: 'inherit',
              lineHeight: 1.4,
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f1f5f9';
              e.currentTarget.style.borderColor = '#93b4f8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#f8fafc';
              e.currentTarget.style.borderColor = '#e2e8f0';
            }}
          >
            <MessageCircle style={{ width: 12, height: 12, color: '#94a3b8', flexShrink: 0 }} />
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

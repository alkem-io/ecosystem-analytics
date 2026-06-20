import { useState, type CSSProperties } from 'react';
import { submitFeedback } from '../../services/query-api.js';
import { Flag, Loader2 } from 'lucide-react';

interface Props {
  messageId: string;
}

const btnBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 28,
  padding: '0 10px',
  fontSize: 12,
  fontWeight: 500,
  fontFamily: 'inherit',
  borderRadius: 6,
  cursor: 'pointer',
  border: 'none',
  transition: 'background 0.15s',
};

export default function FeedbackButton({ messageId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (submitted) {
    return <span style={{ fontSize: 12, color: '#94a3b8' }}>Thanks for your feedback</span>;
  }

  if (!expanded) {
    return (
      <button
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 12,
          color: '#b0b8c4',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          fontFamily: 'inherit',
          transition: 'color 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#64748b'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = '#b0b8c4'; }}
        onClick={() => setExpanded(true)}
        type="button"
      >
        <Flag style={{ width: 12, height: 12 }} />
        This doesn't look right
      </button>
    );
  }

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await submitFeedback(messageId, comment || undefined);
      setSubmitted(true);
    } catch {
      // Silently handle — non-critical feature
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        borderRadius: 10,
        border: '1px solid #e2e8f0',
        background: '#f8fafc',
        padding: 16,
      }}
    >
      <textarea
        placeholder="What seems wrong? (optional)"
        value={comment}
        onChange={(e) => setComment(e.target.value.slice(0, 5000))}
        rows={2}
        style={{
          width: '100%',
          padding: '8px 12px',
          fontSize: 12,
          fontFamily: 'inherit',
          lineHeight: 1.5,
          color: '#1e293b',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          resize: 'vertical',
          outline: 'none',
          boxSizing: 'border-box',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = '#93b4f8';
          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = '#e2e8f0';
          e.currentTarget.style.boxShadow = 'none';
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button
          type="button"
          style={{ ...btnBase, color: '#64748b', background: 'transparent' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          onClick={() => setExpanded(false)}
        >
          Cancel
        </button>
        <button
          type="button"
          style={{
            ...btnBase,
            color: '#ffffff',
            background: submitting ? '#93b4f8' : '#2563eb',
          }}
          onMouseEnter={(e) => { if (!submitting) e.currentTarget.style.background = '#1d4ed8'; }}
          onMouseLeave={(e) => { if (!submitting) e.currentTarget.style.background = '#2563eb'; }}
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <>
              <Loader2 className="animate-spin" style={{ width: 12, height: 12, marginRight: 4 }} />
              Sending…
            </>
          ) : (
            'Send feedback'
          )}
        </button>
      </div>
    </div>
  );
}

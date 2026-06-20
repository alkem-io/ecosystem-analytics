import { useState, useCallback } from 'react';
import SuggestedQueries from './SuggestedQueries.js';
import { Button } from '../ui/button.js';
import { ArrowUp } from 'lucide-react';

interface Props {
  onSubmit: (query: string) => void;
  disabled: boolean;
  showSuggestions: boolean;
}

export default function QueryInput({ onSubmit, disabled, showSuggestions }: Props) {
  const [value, setValue] = useState('');

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 2000) return;
    onSubmit(trimmed);
    setValue('');
  }, [value, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleSuggestionSelect = useCallback(
    (query: string) => {
      onSubmit(query);
    },
    [onSubmit],
  );

  return (
    <div style={{ padding: '16px 0' }}>
      {showSuggestions && <SuggestedQueries onSelect={handleSuggestionSelect} />}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 10,
          padding: 14,
          borderRadius: 16,
          border: '2px solid #cbd5e1',
          background: '#f8fafc',
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
        onFocus={(e) => {
          const el = e.currentTarget;
          el.style.borderColor = '#93b4f8';
          el.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)';
        }}
        onBlur={(e) => {
          const el = e.currentTarget;
          el.style.borderColor = '#cbd5e1';
          el.style.boxShadow = 'none';
        }}
      >
        <textarea
          style={{
            flex: 1,
            resize: 'none',
            background: 'transparent',
            padding: '8px 8px',
            fontSize: 14,
            color: '#0f172a',
            border: 'none',
            outline: 'none',
            lineHeight: 1.6,
            fontFamily: 'inherit',
          }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about people, projects, or organisations…"
          disabled={disabled}
          rows={1}
          aria-label="Query input"
        />
        <Button
          size="icon"
          className="h-9 w-9 shrink-0 rounded-xl"
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          aria-label="Send query"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      </div>
      <p style={{ marginTop: 10, textAlign: 'center', fontSize: 11, color: '#94a3b8' }}>
        AI responses may be inaccurate. Verify important information.
      </p>
    </div>
  );
}

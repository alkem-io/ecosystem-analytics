import { useState, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSpaces } from '../hooks/useSpaces.js';
import { Button } from '../components/ui/button.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { Network, Search, RefreshCw, Loader2, LogOut } from 'lucide-react';

const actionBtnStyle: CSSProperties = {
  padding: '4px 12px',
  fontSize: 12,
  fontWeight: 500,
  color: '#475569',
  background: 'transparent',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

interface SpaceSelectorProps {
  onLogout: () => void;
}

export default function SpaceSelector({ onLogout }: SpaceSelectorProps) {
  const { spaces, loading, error, reload } = useSpaces();
  const SELECTION_KEY = 'alkemio_selected_spaces';
  const [selected, setSelected] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(SELECTION_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const filteredSpaces = useMemo(() => {
    if (!search) return spaces;
    const q = search.toLowerCase();
    return spaces.filter((s) => s.displayName.toLowerCase().includes(q));
  }, [spaces, search]);

  const updateSelected = (next: Set<string>) => {
    setSelected(next);
    localStorage.setItem(SELECTION_KEY, JSON.stringify([...next]));
  };

  const toggleSpace = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    updateSelected(next);
  };

  const selectAll = () => updateSelected(new Set(filteredSpaces.map((s) => s.nameId)));
  const clearAll = () => updateSelected(new Set());

  const handleGenerate = () => {
    if (selected.size === 0) return;
    navigate('/explorer', { state: { spaceIds: Array.from(selected) } });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4" style={{ background: '#eef2f7' }}>
        <div
          className="flex items-center justify-center"
          style={{
            width: '100%',
            maxWidth: 560,
            padding: '64px 32px',
            borderRadius: 16,
            background: '#ffffff',
            boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.03)',
          }}
        >
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: '#94a3b8', marginRight: 12 }} />
          <span style={{ color: '#64748b', fontSize: 14 }}>Loading your spaces...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4" style={{ background: '#eef2f7' }}>
        <div
          style={{
            width: '100%',
            maxWidth: 560,
            padding: '64px 32px',
            borderRadius: 16,
            background: '#ffffff',
            boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.03)',
            textAlign: 'center',
            color: '#dc2626',
          }}
        >
          {error}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ background: '#eef2f7' }}
    >
      <div
        className="flex w-full flex-col overflow-hidden"
        style={{
          maxWidth: 560,
          maxHeight: 'min(720px, 85vh)',
          borderRadius: 16,
          background: '#ffffff',
          boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.03)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '32px 32px 24px' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center" style={{ gap: 16 }}>
              <div
                className="flex items-center justify-center"
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: 'rgba(37, 99, 235, 0.08)',
                  color: '#2563eb',
                }}
              >
                <Network style={{ width: 22, height: 22 }} />
              </div>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: '#0f172a', margin: 0 }}>
                  Select Spaces
                </h2>
                <p style={{ fontSize: 13, color: '#64748b', marginTop: 3, marginBottom: 0 }}>
                  Choose L0 spaces for your network graph
                </p>
              </div>
            </div>
            <button
              onClick={onLogout}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 500,
                color: '#64748b',
                background: 'transparent',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <LogOut style={{ width: 14, height: 14 }} />
              Logout
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '0 32px 16px' }}>
          <div style={{ position: 'relative' }}>
            <Search
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 16,
                height: 16,
                color: '#94a3b8',
                pointerEvents: 'none',
              }}
            />
            <input
              placeholder="Search spaces..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                height: 44,
                paddingLeft: 42,
                paddingRight: 16,
                fontSize: 14,
                borderRadius: 10,
                border: '2px solid #cbd5e1',
                background: '#f8fafc',
                outline: 'none',
                color: '#0f172a',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#93b4f8';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#cbd5e1';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>
        </div>

        {/* Action bar */}
        <div
          className="flex items-center"
          style={{
            margin: '0 32px 16px',
            padding: '8px 12px',
            borderRadius: 10,
            background: '#f1f5f9',
            gap: 4,
          }}
        >
          <button onClick={selectAll} style={actionBtnStyle}>Select All</button>
          <button onClick={clearAll} style={actionBtnStyle}>Clear</button>
          <button onClick={reload} style={{ ...actionBtnStyle, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <RefreshCw style={{ width: 12, height: 12 }} />
            Refresh
          </button>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>
            Member or Lead access only
          </span>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: '#e2e8f0' }} />

        {/* List */}
        {spaces.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center" style={{ padding: '64px 32px', textAlign: 'center' }}>
            <p style={{ color: '#64748b', fontWeight: 500, margin: 0 }}>No spaces available.</p>
            <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 4 }}>Request access or join a Space to get started.</p>
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <div style={{ padding: '4px 0' }}>
              {filteredSpaces.map((space, i) => (
                <label
                  key={space.id}
                  className="flex cursor-pointer items-center transition-colors hover:bg-blue-50/60"
                  style={{
                    gap: 16,
                    padding: '14px 32px',
                    borderBottom: i < filteredSpaces.length - 1 ? '1px solid #f1f5f9' : 'none',
                  }}
                >
                  <Checkbox
                    checked={selected.has(space.nameId)}
                    onCheckedChange={() => toggleSpace(space.nameId)}
                    className="h-5 w-5 rounded"
                  />
                  <span style={{ flex: 1, fontSize: 14, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {space.displayName}
                  </span>
                  {space.role === 'LEAD' && (
                    <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 4, background: '#f1f5f9', color: '#475569', flexShrink: 0 }}>
                      Lead
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: '#94a3b8', letterSpacing: '0.05em', textTransform: 'uppercase' as const, flexShrink: 0 }}>
                    {space.visibility}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <div className="flex items-center justify-between" style={{ padding: '20px 32px' }}>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>Cached data reused when available</span>
            <Button
              onClick={handleGenerate}
              disabled={selected.size === 0}
              style={{ height: 44, paddingLeft: 28, paddingRight: 28, fontSize: 14, fontWeight: 500, borderRadius: 10 }}
            >
              Generate Graph
              {selected.size > 0 && (
                <span
                  style={{
                    marginLeft: 8,
                    padding: '1px 8px',
                    borderRadius: 99,
                    fontSize: 11,
                    fontWeight: 600,
                    background: 'rgba(255,255,255,0.2)',
                    color: 'white',
                  }}
                >
                  {selected.size}
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

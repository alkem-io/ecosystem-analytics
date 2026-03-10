import { useNavigate } from 'react-router-dom';
import type { Theme } from '../../hooks/useTheme.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip.js';
import { RefreshCw, Download, Moon, Sun, LogOut, Search, ChevronRight, Network } from 'lucide-react';

interface Props {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  lastSync: string | null;
  onRefresh: () => void;
  refreshing: boolean;
  onExport?: () => void;
  onLogout?: () => void;
  theme?: Theme;
  onToggleTheme?: () => void;
  children?: React.ReactNode;
}

export default function TopBar({ searchQuery, onSearchChange, lastSync, onRefresh, refreshing, onExport, onLogout, theme, onToggleTheme, children }: Props) {
  const navigate = useNavigate();

  const syncTime = lastSync
    ? new Date(lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div
      className="flex shrink-0 items-center justify-between"
      style={{
        height: 52,
        padding: '0 20px',
        borderBottom: '1px solid #e2e8f0',
        background: '#ffffff',
      }}
    >
      <div className="flex items-center min-w-0" style={{ gap: 8 }}>
        <button
          onClick={() => navigate('/spaces')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 8px',
            fontSize: 13,
            fontWeight: 600,
            color: '#2563eb',
            background: 'transparent',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <Network style={{ width: 16, height: 16 }} />
          Alkemio
        </button>
        <ChevronRight style={{ width: 14, height: 14, color: '#cbd5e1', flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Ecosystem Analytics
        </span>
        <ChevronRight style={{ width: 14, height: 14, color: '#cbd5e1', flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: '#1e293b', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Portfolio Network
        </span>
        {children}
      </div>

      <div className="flex items-center shrink-0" style={{ gap: 6 }}>
        <div style={{ position: 'relative' }}>
          <Search
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 14,
              height: 14,
              color: '#94a3b8',
              pointerEvents: 'none',
            }}
          />
          <input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search nodes..."
            style={{
              height: 36,
              width: 180,
              paddingLeft: 32,
              paddingRight: 12,
              fontSize: 13,
              borderRadius: 8,
              border: '1.5px solid #e2e8f0',
              background: '#f8fafc',
              outline: 'none',
              color: '#0f172a',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#93b4f8';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.08)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#e2e8f0';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>

        <div style={{ width: 1, height: 20, background: '#e2e8f0', margin: '0 6px' }} />

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onRefresh}
              disabled={refreshing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                background: 'transparent',
                border: 'none',
                borderRadius: 6,
                cursor: refreshing ? 'default' : 'pointer',
                color: '#64748b',
                opacity: refreshing ? 0.5 : 1,
              }}
            >
              <RefreshCw className={refreshing ? 'animate-spin' : ''} style={{ width: 14, height: 14 }} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Refresh data</TooltipContent>
        </Tooltip>

        {onExport && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onExport}
                style={{
                  display: 'inline-flex',
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
              >
                <Download style={{ width: 14, height: 14 }} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Export dataset</TooltipContent>
          </Tooltip>
        )}

        {onToggleTheme && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onToggleTheme}
                style={{
                  display: 'inline-flex',
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
              >
                {theme === 'light'
                  ? <Moon style={{ width: 14, height: 14 }} />
                  : <Sun style={{ width: 14, height: 14 }} />
                }
              </button>
            </TooltipTrigger>
            <TooltipContent>Toggle {theme === 'light' ? 'dark' : 'light'} mode</TooltipContent>
          </Tooltip>
        )}

        {syncTime && (
          <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap', marginLeft: 4 }}>
            Synced {syncTime}
          </span>
        )}

        {onLogout && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onLogout}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  color: '#94a3b8',
                }}
              >
                <LogOut style={{ width: 14, height: 14 }} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Log out</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { ConnectToChrome, DisconnectFromChrome, GetTabs } from '../../wailsjs/go/main/App';

interface TabInfo {
  id: string;
  title: string;
  url: string;
}

interface ConnectionBarProps {
  connected: boolean;
  onConnectionChange: (status: boolean) => void;
  selectedTab: string;
  onTabChange: (tab: string) => void;
}

const DEFAULT_URL = 'http://localhost:9222';

export function ConnectionBar({ connected, onConnectionChange, selectedTab, onTabChange }: ConnectionBarProps) {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch tabs when connected
  useEffect(() => {
    if (!connected) {
      setTabs([]);
      return;
    }

    async function fetchTabs() {
      try {
        const result = await GetTabs();
        setTabs(result || []);
      } catch {
        setTabs([]);
      }
    }

    fetchTabs();
    // Refresh tabs every 3 seconds
    const interval = setInterval(fetchTabs, 3000);
    return () => clearInterval(interval);
  }, [connected]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function handleConnect() {
    if (connected) {
      try {
        await DisconnectFromChrome();
        onConnectionChange(false);
        setError('');
      } catch (e) {
        setError(String(e));
      }
      return;
    }

    setLoading(true);
    setError('');
    try {
      await ConnectToChrome(url);
      onConnectionChange(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const selectedTabInfo = tabs.find(t => t.id === selectedTab);
  const selectedLabel = selectedTab === 'all'
    ? `All Tabs (${tabs.length})`
    : truncate(selectedTabInfo?.title || selectedTab, 30);

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-surface-1 border-b border-border wails-drag select-none">
      {/* App title */}
      <span className="text-sm font-semibold text-white/80 tracking-wide mr-1">
        GLIMPSE
      </span>

      <div className="w-px h-4 bg-border" />

      {/* Tab selector — only when connected */}
      {connected && tabs.length > 0 && (
        <div className="relative" ref={dropdownRef} style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-mono
                       bg-surface-3 border border-border rounded text-white/50
                       hover:text-white/70 hover:border-white/15 transition-colors"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${selectedTab === 'all' ? 'bg-emerald-400' : 'bg-accent'}`} />
            {selectedLabel}
            <svg className="w-3 h-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {dropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-surface-2 border border-border
                            rounded-md shadow-xl z-50 py-1 max-h-60 overflow-y-auto console-scroll">
              {/* All tabs option */}
              <button
                onClick={() => { onTabChange('all'); setDropdownOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-[11px] flex items-center gap-2
                           hover:bg-white/5 transition-colors
                           ${selectedTab === 'all' ? 'text-emerald-400' : 'text-white/50'}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${selectedTab === 'all' ? 'bg-emerald-400' : 'bg-white/20'}`} />
                All Tabs ({tabs.length})
              </button>

              <div className="h-px bg-border mx-2 my-1" />

              {/* Individual tabs */}
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => { onTabChange(tab.id); setDropdownOpen(false); }}
                  className={`w-full text-left px-3 py-1.5 text-[11px] flex flex-col gap-0.5
                             hover:bg-white/5 transition-colors
                             ${selectedTab === tab.id ? 'text-accent' : 'text-white/50'}`}
                >
                  <span className="font-medium truncate">{tab.title || 'Untitled'}</span>
                  <span className="text-[9px] text-white/20 font-mono truncate">{tab.url}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-1" />

      {/* Connection controls */}
      <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {!connected && (
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="ws://localhost:9222"
            className="w-56 px-2.5 py-1 text-xs font-mono bg-surface-3 border border-border
                       rounded text-white/70 placeholder-white/20
                       focus:outline-none focus:border-accent/50 transition-colors"
            onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
          />
        )}

        <button
          onClick={handleConnect}
          disabled={loading}
          className={`px-3 py-1 text-xs font-medium rounded transition-all duration-150
            ${connected
              ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/20'
              : 'bg-accent/15 text-accent hover:bg-accent/25 border border-accent/20'
            }
            disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {loading ? 'Connecting…' : connected ? 'Disconnect' : 'Connect'}
        </button>

        {/* Status dot */}
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${
            connected ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]' : 'bg-white/15'
          }`} />
          <span className="text-[10px] text-white/30">
            {connected ? 'Live' : 'Idle'}
          </span>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <span className="text-[10px] text-red-400 max-w-xs truncate" title={error}>
          {error}
        </span>
      )}
    </div>
  );
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

import { useState, useCallback, useEffect } from 'react';
import { GetCookies, GetLocalStorage, GetSessionStorage } from '../../wailsjs/go/main/App';
import { StorageTable } from './StorageTable';

type Section = 'cookies' | 'localStorage' | 'sessionStorage';

interface CookieData {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: string;
  size: number;
}

interface StorageData {
  key: string;
  value: string;
}

interface ApplicationPanelProps {
  connected: boolean;
  selectedTab: string;
}

const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: 'cookies', label: 'Cookies', icon: '🍪' },
  { id: 'localStorage', label: 'Local Storage', icon: '💾' },
  { id: 'sessionStorage', label: 'Session Storage', icon: '📋' },
];

const COOKIE_COLUMNS = [
  { key: 'name', label: 'Name', width: '160px' },
  { key: 'value', label: 'Value', width: '200px' },
  { key: 'domain', label: 'Domain', width: '140px' },
  { key: 'path', label: 'Path', width: '60px' },
  {
    key: 'expires', label: 'Expires', width: '150px',
    render: (v: unknown) => {
      const n = Number(v);
      if (!n || n < 0) return <span className="text-white/20">Session</span>;
      return <span>{new Date(n * 1000).toLocaleString()}</span>;
    }
  },
  {
    key: 'httpOnly', label: 'HttpOnly', width: '60px',
    render: (v: unknown) => v ? <span className="text-accent">✓</span> : <span className="text-white/15">–</span>
  },
  {
    key: 'secure', label: 'Secure', width: '55px',
    render: (v: unknown) => v ? <span className="text-accent">✓</span> : <span className="text-white/15">–</span>
  },
  { key: 'sameSite', label: 'SameSite', width: '70px' },
];

const STORAGE_COLUMNS = [
  { key: 'key', label: 'Key', width: '200px' },
  { key: 'value', label: 'Value' },
];

export function ApplicationPanel({ connected, selectedTab }: ApplicationPanelProps) {
  const [section, setSection] = useState<Section>('cookies');
  const [cookies, setCookies] = useState<CookieData[]>([]);
  const [local, setLocal] = useState<StorageData[]>([]);
  const [session, setSession] = useState<StorageData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    if (!connected || selectedTab === 'all') return;
    setLoading(true);
    setError('');
    try {
      const [c, l, s] = await Promise.all([
        GetCookies(selectedTab),
        GetLocalStorage(selectedTab),
        GetSessionStorage(selectedTab),
      ]);
      setCookies((c || []) as unknown as CookieData[]);
      setLocal((l || []) as unknown as StorageData[]);
      setSession((s || []) as unknown as StorageData[]);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [connected, selectedTab]);

  useEffect(() => {
    if (!connected || selectedTab === 'all') {
      setCookies([]);
      setLocal([]);
      setSession([]);
      return;
    }
    fetchData();
  }, [connected, selectedTab, fetchData]);

  // --- Empty states ---
  if (!connected) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[11px] text-white/20 font-mono">Connect to Chrome to view storage</p>
      </div>
    );
  }

  if (selectedTab === 'all') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <span className="text-2xl opacity-10">🗄️</span>
          <p className="text-[11px] text-white/25 font-mono">Select a specific tab to view storage</p>
          <p className="text-[10px] text-white/15">Use the tab selector in the toolbar above</p>
        </div>
      </div>
    );
  }

  const currentData = section === 'cookies' ? cookies
    : section === 'localStorage' ? local
    : session;

  const currentColumns = section === 'cookies' ? COOKIE_COLUMNS : STORAGE_COLUMNS;

  const counts: Record<Section, number> = {
    cookies: cookies.length,
    localStorage: local.length,
    sessionStorage: session.length,
  };

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-44 shrink-0 bg-surface-1 border-r border-border flex flex-col">
        <div className="px-3 py-2 border-b border-border">
          <span className="text-[10px] text-white/20 font-mono uppercase tracking-wider">Storage</span>
        </div>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`flex items-center gap-2 px-3 py-1.5 text-[11px] text-left transition-colors
              ${section === s.id
                ? 'bg-accent/10 text-accent border-r-2 border-accent'
                : 'text-white/40 hover:text-white/60 hover:bg-white/[0.03]'
              }`}
          >
            <span className="text-xs">{s.icon}</span>
            <span className="flex-1">{s.label}</span>
            <span className="text-[9px] text-white/20 font-mono">{counts[s.id]}</span>
          </button>
        ))}

        <div className="flex-1" />

        {/* Refresh */}
        <div className="p-2 border-t border-border">
          <button
            onClick={fetchData}
            disabled={loading}
            className="w-full px-2 py-1 text-[10px] text-white/30 hover:text-white/60
                       hover:bg-white/5 rounded transition-colors disabled:opacity-30 font-mono"
          >
            {loading ? '⟳ Loading…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Header */}
        <div className="flex items-center px-3 py-1.5 bg-surface-1 border-b border-border">
          <span className="text-[10px] text-white/20 font-mono flex-1">
            {section === 'cookies' ? 'Cookies' : section === 'localStorage' ? 'Local Storage' : 'Session Storage'}
            {' '}({currentData.length})
          </span>
        </div>

        {/* Error */}
        {error ? (
          <div className="flex items-center justify-center flex-1">
            <p className="text-[11px] text-red-400/60 font-mono">{error}</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0">
            <StorageTable
              columns={currentColumns}
              data={currentData as unknown as Record<string, unknown>[]}
              emptyMessage={`No ${section === 'cookies' ? 'cookies' : 'entries'} found`}
            />
          </div>
        )}
      </div>
    </div>
  );
}

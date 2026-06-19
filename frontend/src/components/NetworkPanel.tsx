import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { EnableNetwork, GetCachedResponseBody, SaveResponseBody, ClearNetworkCache } from '../../wailsjs/go/main/App';
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime';

interface NetworkRequest {
  requestId: string;
  url: string;
  method: string;
  status: number;
  statusText: string;
  type: string;
  mimeType: string;
  startTime: number;
  duration: number;
  size: number;
  error: string;
  reqHeaders: Record<string, string> | null;
  respHeaders: Record<string, string> | null;
  bodySize: number;
}

interface NetworkPanelProps {
  connected: boolean;
  selectedTab: string;
}

function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '–';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '–';
  if (ms < 1000) return Math.round(ms) + ' ms';
  return (ms / 1000).toFixed(2) + ' s';
}

function statusColor(status: number, error: string): string {
  if (error) return 'text-red-400';
  if (status >= 200 && status < 300) return 'text-emerald-400';
  if (status >= 300 && status < 400) return 'text-yellow-400';
  if (status >= 400) return 'text-red-400';
  return 'text-white/40';
}

function typeShort(type: string): string {
  const map: Record<string, string> = {
    Document: 'Doc', Stylesheet: 'CSS', Script: 'JS', XHR: 'XHR',
    Fetch: 'Fetch', Image: 'Img', Font: 'Font', Media: 'Media',
    WebSocket: 'WS', Manifest: 'Man', Other: '…',
  };
  return map[type] || type;
}

function urlFilename(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname;
    const name = path.split('/').pop() || path;
    return name || u.hostname;
  } catch {
    return url.slice(0, 60);
  }
}

export function NetworkPanel({ connected, selectedTab }: NetworkPanelProps) {
  const [requests, setRequests] = useState<NetworkRequest[]>([]);
  const [selected, setSelected] = useState<NetworkRequest | null>(null);
  const [responseBody, setResponseBody] = useState('');
  const [loadingBody, setLoadingBody] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('');
  const [detailTab, setDetailTab] = useState<'headers' | 'response'>('headers');
  const listEndRef = useRef<HTMLDivElement>(null);

  // Enable network when tab is selected
  useEffect(() => {
    if (!connected || selectedTab === 'all') return;
    EnableNetwork(selectedTab).catch(() => {});
  }, [connected, selectedTab]);

  // Listen for network events
  useEffect(() => {
    if (!connected) return;

    function handleRequest(tabId: string, req: NetworkRequest) {
      if (selectedTab !== 'all' && tabId !== selectedTab) return;
      setRequests((prev) => [...prev, req]);
    }

    EventsOn('network:request', handleRequest);
    return () => { EventsOff('network:request'); };
  }, [connected, selectedTab]);

  // Auto-scroll to bottom
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [requests.length]);

  // Clear on tab change
  useEffect(() => {
    setRequests([]);
    setSelected(null);
    setResponseBody('');
    ClearNetworkCache().catch(() => {});
  }, [selectedTab]);

  // Select a request to view details
  const selectRequest = useCallback((req: NetworkRequest) => {
    setSelected(req);
    setDetailTab('headers');
    setResponseBody('');
  }, []);

  // Lazy-load body when Response tab is clicked
  const loadBody = useCallback(async (requestId: string) => {
    setLoadingBody(true);
    try {
      const body = await GetCachedResponseBody(requestId);
      setResponseBody(body);
    } catch {
      setResponseBody('(Response body not available)');
    } finally {
      setLoadingBody(false);
    }
  }, []);

  // Download full response body
  const downloadBody = useCallback(async (req: NetworkRequest) => {
    setSaving(true);
    try {
      const filename = urlFilename(req.url) || 'response.txt';
      const path = await SaveResponseBody(req.requestId, filename);
      alert(`Saved to: ${path}`);
    } catch (e) {
      alert(`Could not save: ${e}`);
    } finally {
      setSaving(false);
    }
  }, []);

  const filtered = useMemo(() => {
    if (!filter) return requests;
    const q = filter.toLowerCase();
    return requests.filter((r) => r.url.toLowerCase().includes(q));
  }, [requests, filter]);

  // --- Empty states ---
  if (!connected) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[11px] text-white/20 font-mono">Connect to Chrome to capture network</p>
      </div>
    );
  }

  if (selectedTab === 'all') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <span className="text-2xl opacity-10">🌐</span>
          <p className="text-[11px] text-white/25 font-mono">Select a specific tab to capture network</p>
          <p className="text-[10px] text-white/15">Use the tab selector in the toolbar above</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-1 border-b border-border shrink-0">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by URL…"
          className="flex-1 max-w-xs px-2 py-0.5 text-[11px] font-mono bg-surface-3 border border-border
                     rounded text-white/60 placeholder-white/20
                     focus:outline-none focus:border-accent/50 transition-colors"
        />
        <span className="text-[10px] text-white/20 font-mono">{filtered.length} requests</span>
        <div className="flex-1" />
        <button
          onClick={() => { setRequests([]); setSelected(null); setResponseBody(''); ClearNetworkCache().catch(() => {}); }}
          className="px-2 py-0.5 text-[10px] text-white/30 hover:text-white/60
                     hover:bg-white/5 rounded transition-colors"
        >
          ⌫ Clear
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Request list */}
        <div className={`overflow-auto console-scroll ${selected ? 'w-1/2' : 'flex-1'} border-r border-border`}>
          <table className="w-full text-[11px] font-mono border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-surface-2 border-b border-border">
                <th className="text-left px-2 py-1 text-white/30 font-medium w-12">Status</th>
                <th className="text-left px-2 py-1 text-white/30 font-medium w-10">Method</th>
                <th className="text-left px-2 py-1 text-white/30 font-medium">Name</th>
                <th className="text-left px-2 py-1 text-white/30 font-medium w-10">Type</th>
                <th className="text-right px-2 py-1 text-white/30 font-medium w-16">Size</th>
                <th className="text-right px-2 py-1 text-white/30 font-medium w-16">Time</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((req, i) => (
                <tr
                  key={req.requestId + '-' + i}
                  onClick={() => selectRequest(req)}
                  className={`border-b border-border/20 cursor-pointer transition-colors
                    ${selected?.requestId === req.requestId
                      ? 'bg-accent/10'
                      : 'hover:bg-white/[0.02]'
                    }
                    ${req.error ? 'bg-red-500/[0.03]' : ''}`}
                >
                  <td className={`px-2 py-0.5 ${statusColor(req.status, req.error)}`}>
                    {req.error ? '✕' : req.status || '…'}
                  </td>
                  <td className="px-2 py-0.5 text-white/30">{req.method}</td>
                  <td className="px-2 py-0.5 text-white/50 truncate max-w-[300px]" title={req.url}>
                    {urlFilename(req.url)}
                  </td>
                  <td className="px-2 py-0.5 text-white/25">{typeShort(req.type)}</td>
                  <td className="px-2 py-0.5 text-white/30 text-right">{formatSize(req.size)}</td>
                  <td className="px-2 py-0.5 text-white/30 text-right">{formatDuration(req.duration)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div ref={listEndRef} />

          {filtered.length === 0 && (
            <div className="flex items-center justify-center py-16">
              <p className="text-[11px] text-white/15 font-mono">
                {requests.length === 0 ? 'Waiting for network activity…' : 'No matching requests'}
              </p>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-1/2 flex flex-col min-w-0">
            {/* Detail tabs */}
            <div className="flex items-center gap-0 bg-surface-1 border-b border-border shrink-0">
              {(['headers', 'response'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    setDetailTab(tab);
                    if (tab === 'response' && selected && !responseBody && !loadingBody) {
                      loadBody(selected.requestId);
                    }
                  }}
                  className={`px-3 py-1.5 text-[11px] transition-colors capitalize
                    ${detailTab === tab
                      ? 'text-accent border-b-2 border-accent'
                      : 'text-white/30 hover:text-white/50'}`}
                >
                  {tab}
                </button>
              ))}
              <div className="flex-1" />
              <button
                onClick={() => { setSelected(null); }}
                className="px-2 py-1 text-white/20 hover:text-white/50 text-xs transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Detail content */}
            <div className="flex-1 overflow-auto console-scroll p-3">
              {detailTab === 'headers' ? (
                <div className="space-y-4">
                  {/* General */}
                  <div>
                    <h4 className="text-[10px] text-white/25 uppercase tracking-wider mb-1.5">General</h4>
                    <div className="space-y-0.5 text-[11px] font-mono">
                      <div><span className="text-white/30">URL: </span><span className="text-white/60 break-all">{selected.url}</span></div>
                      <div><span className="text-white/30">Method: </span><span className="text-white/60">{selected.method}</span></div>
                      <div><span className="text-white/30">Status: </span><span className={statusColor(selected.status, selected.error)}>{selected.status} {selected.statusText}</span></div>
                      <div><span className="text-white/30">Type: </span><span className="text-white/60">{selected.type}</span></div>
                      {selected.error && <div><span className="text-white/30">Error: </span><span className="text-red-400">{selected.error}</span></div>}
                    </div>
                  </div>

                  {/* Request Headers */}
                  {selected.reqHeaders && Object.keys(selected.reqHeaders).length > 0 && (
                    <div>
                      <h4 className="text-[10px] text-white/25 uppercase tracking-wider mb-1.5">Request Headers</h4>
                      <div className="space-y-0.5 text-[11px] font-mono">
                        {Object.entries(selected.reqHeaders).map(([k, v]) => (
                          <div key={k}>
                            <span className="text-[#D19A66]">{k}: </span>
                            <span className="text-white/50 break-all">{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Response Headers */}
                  {selected.respHeaders && Object.keys(selected.respHeaders).length > 0 && (
                    <div>
                      <h4 className="text-[10px] text-white/25 uppercase tracking-wider mb-1.5">Response Headers</h4>
                      <div className="space-y-0.5 text-[11px] font-mono">
                        {Object.entries(selected.respHeaders).map(([k, v]) => (
                          <div key={k}>
                            <span className="text-[#D19A66]">{k}: </span>
                            <span className="text-white/50 break-all">{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[11px] font-mono">
                  {/* Body toolbar */}
                  {selected.bodySize > 0 && (
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/30">
                      <span className="text-[10px] text-white/20">
                        {formatSize(selected.bodySize)}
                        {selected.bodySize > 500 * 1024 && ' (preview truncated)'}
                      </span>
                      <div className="flex-1" />
                      <button
                        onClick={() => downloadBody(selected)}
                        disabled={saving}
                        className="px-2 py-0.5 text-[10px] text-accent/60 hover:text-accent
                                   hover:bg-accent/10 rounded transition-colors disabled:opacity-30"
                      >
                        {saving ? 'Saving…' : '↓ Download'}
                      </button>
                    </div>
                  )}
                  {loadingBody ? (
                    <span className="text-white/20 animate-pulse">Loading response body…</span>
                  ) : responseBody ? (
                    <pre className="text-white/50 whitespace-pre-wrap break-all">{responseBody}</pre>
                  ) : (
                    <span className="text-white/20">No response body available</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useCallback, useEffect, useRef } from 'react';
import { GetDOMTree, GetChildNodes, HighlightNode, ClearHighlight, SearchDOM } from '../../wailsjs/go/main/App';
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime';
import { DOMTreeNode, type DOMNodeData } from './DOMTreeNode';

interface SearchResult {
  nodeId: number;
  highlightNodeId: number;
  nodeName: string;
  localName: string;
  nodeValue: string;
  selector: string;
}

interface ElementsPanelProps {
  connected: boolean;
  selectedTab: string;
}

export function ElementsPanel({ connected, selectedTab }: ElementsPanelProps) {
  const [root, setRoot] = useState<DOMNodeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchIndex, setSearchIndex] = useState(0);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // Fetch DOM
  const fetchDOM = useCallback(async () => {
    if (!connected || selectedTab === 'all') return;
    setLoading(true);
    setError('');
    try {
      const tree = await GetDOMTree(selectedTab);
      setRoot(tree as unknown as DOMNodeData);
    } catch (e) {
      setError(String(e));
      setRoot(null);
    } finally {
      setLoading(false);
    }
  }, [connected, selectedTab]);

  useEffect(() => {
    if (!connected || selectedTab === 'all') {
      setRoot(null);
      setError('');
      return;
    }
    fetchDOM();
  }, [connected, selectedTab, fetchDOM]);

  // Auto-refresh on navigation
  useEffect(() => {
    if (!connected || selectedTab === 'all') return;
    function handleDOMUpdated(tabId: string) {
      if (tabId === selectedTab) {
        setTimeout(() => fetchDOM(), 500);
      }
    }
    EventsOn('dom:updated', handleDOMUpdated);
    return () => { EventsOff('dom:updated'); };
  }, [connected, selectedTab, fetchDOM]);

  // Keyboard shortcut: Ctrl/Cmd+F to open search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false);
        setSearchQuery('');
        setSearchResults([]);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSearch]);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim() || selectedTab === 'all') {
      setSearchResults([]);
      setSearchIndex(0);
      return;
    }

    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await SearchDOM(selectedTab, searchQuery);
        setSearchResults((results || []) as unknown as SearchResult[]);
        setSearchIndex(0);
        // Highlight first result
        if (results && results.length > 0) {
          const first = results[0] as unknown as SearchResult;
          HighlightNode(selectedTab, first.highlightNodeId).catch(() => {});
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(searchTimer.current);
  }, [searchQuery, selectedTab]);

  // Navigate search results
  const navigateResult = useCallback((delta: number) => {
    if (searchResults.length === 0) return;
    const next = (searchIndex + delta + searchResults.length) % searchResults.length;
    setSearchIndex(next);
    HighlightNode(selectedTab, searchResults[next].highlightNodeId).catch(() => {});
  }, [searchResults, searchIndex, selectedTab]);

  const handleExpand = useCallback(async (nodeId: number): Promise<DOMNodeData[]> => {
    const children = await GetChildNodes(selectedTab, nodeId);
    return children as unknown as DOMNodeData[];
  }, [selectedTab]);

  const handleHover = useCallback((nodeId: number) => {
    HighlightNode(selectedTab, nodeId).catch(() => {});
  }, [selectedTab]);

  const handleHoverEnd = useCallback(() => {
    ClearHighlight(selectedTab).catch(() => {});
  }, [selectedTab]);

  // --- Empty states ---
  if (!connected) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[11px] text-white/20 font-mono">Connect to Chrome to inspect elements</p>
      </div>
    );
  }

  if (selectedTab === 'all') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <svg className="w-8 h-8 text-white/10 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-[11px] text-white/25 font-mono">Select a specific tab to inspect its DOM</p>
          <p className="text-[10px] text-white/15">Use the tab selector in the toolbar above</p>
        </div>
      </div>
    );
  }

  if (loading && !root) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[11px] text-white/20 font-mono animate-pulse">Loading DOM tree…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[11px] text-red-400/60 font-mono max-w-md text-center">{error}</p>
      </div>
    );
  }

  if (!root) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[11px] text-white/20 font-mono">No DOM tree available</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1 bg-surface-1 border-b border-border">
        <span className="text-[10px] text-white/20 font-mono">DOM</span>

        <div className="flex-1" />

        {/* Search toggle */}
        <button
          onClick={() => {
            setShowSearch(!showSearch);
            if (!showSearch) setTimeout(() => searchInputRef.current?.focus(), 50);
            else { setSearchQuery(''); setSearchResults([]); }
          }}
          className={`px-1.5 py-0.5 text-[10px] rounded transition-colors
            ${showSearch ? 'text-accent bg-accent/10' : 'text-white/30 hover:text-white/60 hover:bg-white/5'}`}
          title="Search DOM (⌘F)"
        >
          ⌕
        </button>

        <button
          onClick={fetchDOM}
          disabled={loading}
          className="px-2 py-0.5 text-[10px] text-white/30 hover:text-white/60
                     hover:bg-white/5 rounded transition-colors disabled:opacity-30"
          title="Refresh DOM tree"
        >
          ↻
        </button>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-2 border-b border-border">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') navigateResult(e.shiftKey ? -1 : 1);
              if (e.key === 'Escape') {
                setShowSearch(false);
                setSearchQuery('');
                setSearchResults([]);
              }
            }}
            placeholder="Search by text, CSS selector, or XPath…"
            className="flex-1 px-2 py-1 text-[11px] font-mono bg-surface-3 border border-border
                       rounded text-white/70 placeholder-white/20
                       focus:outline-none focus:border-accent/50 transition-colors"
          />

          {/* Result count & navigation */}
          {searchQuery && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-mono text-white/30 min-w-[60px] text-right">
                {searching ? '…' : searchResults.length === 0 ? 'No results' : `${searchIndex + 1} / ${searchResults.length}`}
              </span>
              <button
                onClick={() => navigateResult(-1)}
                disabled={searchResults.length === 0}
                className="w-5 h-5 flex items-center justify-center text-white/30
                           hover:text-white/60 disabled:opacity-20 transition-colors"
                title="Previous (Shift+Enter)"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
              <button
                onClick={() => navigateResult(1)}
                disabled={searchResults.length === 0}
                className="w-5 h-5 flex items-center justify-center text-white/30
                           hover:text-white/60 disabled:opacity-20 transition-colors"
                title="Next (Enter)"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Search results list */}
      {showSearch && searchResults.length > 0 && (
        <div className="max-h-32 overflow-y-auto console-scroll border-b border-border bg-surface-1/50">
          {searchResults.map((result, i) => (
            <button
              key={`${result.nodeId}-${i}`}
              onClick={() => {
                setSearchIndex(i);
                HighlightNode(selectedTab, result.highlightNodeId).catch(() => {});
              }}
              onMouseEnter={() => HighlightNode(selectedTab, result.highlightNodeId).catch(() => {})}
              onMouseLeave={() => ClearHighlight(selectedTab).catch(() => {})}
              className={`w-full text-left px-3 py-1 text-[11px] font-mono flex items-center gap-2
                         hover:bg-white/[0.04] transition-colors
                         ${i === searchIndex ? 'bg-accent/10 text-accent' : 'text-white/40'}`}
            >
              <span className="text-[#E06C75] shrink-0">{result.selector || result.localName || result.nodeName}</span>
              {result.nodeValue && (
                <span className="text-white/25 truncate">"{result.nodeValue}"</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* DOM Tree */}
      <div className="flex-1 overflow-y-auto console-scroll py-1">
        <DOMTreeNode
          node={root}
          depth={0}
          onExpand={handleExpand}
          onHover={handleHover}
          onHoverEnd={handleHoverEnd}
        />
      </div>
    </div>
  );
}

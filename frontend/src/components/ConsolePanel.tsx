import { useEffect, useRef, useState, useCallback } from 'react';
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime';
import { RunJS, AnalyzeSingleError } from '../../wailsjs/go/main/App';

interface ConsoleEntry {
  type: string;
  message: string;
  timestamp: number;
  targetId: string;
}

// Log-level styling map
const LOG_STYLES: Record<string, { text: string; bg: string; badge: string; icon: string }> = {
  log:     { text: 'text-white/70',  bg: '',                      badge: 'text-log-info bg-white/5',  icon: '›' },
  info:    { text: 'text-blue-300',  bg: '',                      badge: 'text-blue-400 bg-blue-500/10', icon: 'ℹ' },
  warning: { text: 'text-log-warn',  bg: 'bg-yellow-500/[0.03]',  badge: 'text-log-warn bg-yellow-500/10', icon: '⚠' },
  error:   { text: 'text-log-error', bg: 'bg-red-500/[0.04]',     badge: 'text-log-error bg-red-500/10',   icon: '✕' },
  debug:   { text: 'text-log-debug', bg: '',                      badge: 'text-log-debug bg-white/5',  icon: '⬡' },
};

const DEFAULT_STYLE = LOG_STYLES.log;

// Cap to prevent memory bloat from long-running sessions
const MAX_LOGS = 5000;

interface ConsolePanelProps {
  connected: boolean;
  selectedTab: string;
}

export function ConsolePanel({ connected, selectedTab }: ConsolePanelProps) {
  const [logs, setLogs] = useState<ConsoleEntry[]>([]);
  const [filter, setFilter] = useState('all');
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  // AI analysis state
  const [analyzingIdx, setAnalyzingIdx] = useState<number | null>(null);
  const [aiResults, setAiResults] = useState<Record<number, string>>({});

  // Subscribe to console:log events from Go backend
  useEffect(() => {
    function handler(entry: ConsoleEntry) {
      setLogs((prev) => {
        const next = [...prev, entry];
        // Trim from front if over cap
        return next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next;
      });
    }

    EventsOn('console:log', handler);
    return () => {
      EventsOff('console:log');
    };
  }, []);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  // Detect if user scrolled up (disable auto-scroll)
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    autoScrollRef.current = atBottom;
  }, []);

  function clearLogs() {
    setLogs([]);
    setAiResults({});
  }

  const analyzeError = useCallback(async (idx: number, message: string) => {
    setAnalyzingIdx(idx);
    try {
      const result = await AnalyzeSingleError(message);
      setAiResults(prev => ({ ...prev, [idx]: result }));
    } catch (e) {
      setAiResults(prev => ({ ...prev, [idx]: `Analiz hatası: ${e}` }));
    } finally {
      setAnalyzingIdx(null);
    }
  }, []);

  const dismissResult = useCallback((idx: number) => {
    setAiResults(prev => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });
  }, []);

  // Filter logs by tab (target ID) first, then by log type
  const tabLogs = selectedTab === 'all' ? logs : logs.filter((l) => l.targetId === selectedTab);
  const filteredLogs = filter === 'all' ? tabLogs : tabLogs.filter((l) => l.type === filter);

  // Count by type for filter badges (within selected tab)
  const counts: Record<string, number> = {};
  for (const l of tabLogs) {
    counts[l.type] = (counts[l.type] || 0) + 1;
  }

  function formatTime(ms: number): string {
    if (!ms) return '';
    const d = new Date(ms);
    return d.toLocaleTimeString('en-GB', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-1 border-b border-border">
        {/* Filter buttons */}
        <FilterButton label="All" count={tabLogs.length} active={filter === 'all'} onClick={() => setFilter('all')} />
        <FilterButton label="Errors" count={counts['error'] || 0} active={filter === 'error'} onClick={() => setFilter('error')} accent="red" />
        <FilterButton label="Warnings" count={counts['warning'] || 0} active={filter === 'warning'} onClick={() => setFilter('warning')} accent="yellow" />
        <FilterButton label="Info" count={(counts['info'] || 0) + (counts['log'] || 0)} active={filter === 'info-all'} onClick={() => setFilter('all')} />

        <div className="flex-1" />

        {/* Log count */}
        <span className="text-[10px] text-white/20 font-mono mr-2">
          {filteredLogs.length} entries
        </span>

        {/* Test button — sends sample logs to Chrome */}
        {connected && (
          <button
            onClick={() => {
              RunJS(`console.log("✅ Glimpse test: log")`);
              RunJS(`console.warn("⚠️ Glimpse test: warning")`);
              RunJS(`console.error("❌ Glimpse test: error")`);
              RunJS(`console.info("ℹ️ Glimpse test: info")`);
              RunJS(`console.debug("🔍 Glimpse test: debug")`);
            }}
            className="px-2 py-0.5 text-[10px] text-accent/60 hover:text-accent
                       hover:bg-accent/10 rounded transition-colors"
            title="Send test logs to Chrome"
          >
            Test
          </button>
        )}

        {/* Clear button */}
        <button
          onClick={clearLogs}
          className="px-2 py-0.5 text-[10px] text-white/30 hover:text-white/60
                     hover:bg-white/5 rounded transition-colors"
          title="Clear console"
        >
          Clear
        </button>
      </div>

      {/* Log list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto console-scroll"
      >
        {filteredLogs.length === 0 ? (
          <EmptyState connected={connected} />
        ) : (
          filteredLogs.map((entry, i) => (
            <LogRow
              key={i}
              idx={i}
              entry={entry}
              formatTime={formatTime}
              onAnalyze={analyzeError}
              analyzing={analyzingIdx === i}
              aiResult={aiResults[i]}
              onDismiss={dismissResult}
            />
          ))
        )}
      </div>
    </div>
  );
}

// --- Sub-components ---

function FilterButton({ label, count, active, onClick, accent }: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  accent?: string;
}) {
  const base = 'px-2 py-0.5 text-[10px] rounded transition-all duration-150 font-medium';
  const colors = active
    ? accent === 'red'
      ? 'bg-red-500/15 text-red-400'
      : accent === 'yellow'
        ? 'bg-yellow-500/15 text-yellow-400'
        : 'bg-white/10 text-white/70'
    : 'text-white/30 hover:text-white/50 hover:bg-white/5';

  return (
    <button onClick={onClick} className={`${base} ${colors}`}>
      {label}
      {count > 0 && (
        <span className="ml-1 opacity-60">{count}</span>
      )}
    </button>
  );
}

function LogRow({ idx, entry, formatTime, onAnalyze, analyzing, aiResult, onDismiss }: {
  idx: number;
  entry: ConsoleEntry;
  formatTime: (ms: number) => string;
  onAnalyze: (idx: number, message: string) => void;
  analyzing: boolean;
  aiResult?: string;
  onDismiss: (idx: number) => void;
}) {
  const style = LOG_STYLES[entry.type] || DEFAULT_STYLE;
  const isAnalyzable = entry.type === 'error' || entry.type === 'warning';

  return (
    <div>
      <div className={`flex items-start gap-2 px-3 py-[5px] border-b border-white/[0.03]
                       hover:bg-white/[0.02] transition-colors group ${style.bg}`}>
        {/* Type icon */}
        <span className={`text-[10px] font-mono w-4 text-center mt-[3px] shrink-0 ${style.badge} rounded px-0.5`}>
          {style.icon}
        </span>

        {/* Timestamp */}
        <span className="text-[10px] font-mono text-white/15 mt-[3px] shrink-0 w-20
                          group-hover:text-white/25 transition-colors">
          {formatTime(entry.timestamp)}
        </span>

        {/* Message */}
        <span className={`text-log font-mono whitespace-pre-wrap break-all flex-1 ${style.text}`}>
          {entry.message}
        </span>

        {/* AI Analyze button — only for errors and warnings */}
        {isAnalyzable && (
          <button
            onClick={() => onAnalyze(idx, entry.message)}
            disabled={analyzing}
            className="opacity-0 group-hover:opacity-100 shrink-0 px-1.5 py-0.5 mt-[1px]
                       text-[9px] rounded border transition-all
                       text-accent/50 border-accent/20 bg-accent/5
                       hover:bg-accent/15 hover:text-accent/80
                       disabled:opacity-40"
            title="AI ile analiz et"
          >
            {analyzing ? (
              <span className="inline-block w-2.5 h-2.5 border border-accent/30 border-t-accent rounded-full animate-spin" />
            ) : '🔍'}
          </button>
        )}
      </div>

      {/* AI Result — inline below the error */}
      {aiResult && (
        <div className="mx-3 my-1.5 p-3 bg-surface-1/80 rounded-lg border border-accent/15 text-[10px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] text-accent/50 uppercase tracking-wider font-semibold">AI Analiz</span>
            <button onClick={() => onDismiss(idx)}
              className="text-[9px] text-white/20 hover:text-white/40 transition-colors">✕ Kapat</button>
          </div>
          <div className="text-white/55 leading-relaxed
                          prose prose-invert prose-xs max-w-none
                          [&_h3]:text-white/70 [&_h3]:text-[11px] [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1
                          [&_strong]:text-white/65
                          [&_code]:bg-surface-0 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-accent/70
                          [&_pre]:bg-surface-0 [&_pre]:rounded [&_pre]:p-2 [&_pre]:overflow-x-auto
                          [&_ul]:list-disc [&_ul]:pl-3 [&_li]:mb-0.5"
            dangerouslySetInnerHTML={{ __html: markdownToHtml(aiResult) }}
          />
        </div>
      )}
    </div>
  );
}

function markdownToHtml(md: string): string {
  return md
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) =>
      `<pre><code>${code.trim().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code></pre>`)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');
}

function EmptyState({ connected }: { connected: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-white/15 select-none">
      <div className="text-3xl mb-3">
        {connected ? '⌘' : '◇'}
      </div>
      <p className="text-xs font-medium">
        {connected
          ? 'Listening for console output…'
          : 'Connect to Chrome to start capturing logs'
        }
      </p>
      {!connected && (
        <p className="text-[10px] mt-1.5 text-white/10">
          Launch Chrome with <code className="font-mono bg-white/5 px-1 py-0.5 rounded text-white/20">--remote-debugging-port=9222</code>
        </p>
      )}
    </div>
  );
}

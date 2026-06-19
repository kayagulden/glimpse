import { useState, useEffect, useCallback } from 'react';
import { EnablePerformance, CollectWebVitals } from '../../wailsjs/go/main/App';
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime';

interface PerfMetrics {
  jsHeapUsedSize: number;
  jsHeapTotalSize: number;
  nodes: number;
  documents: number;
  frames: number;
  jsEventListeners: number;
  layoutCount: number;
  layoutDuration: number;
  recalcStyleCount: number;
  recalcStyleDuration: number;
  scriptDuration: number;
  taskDuration: number;
}

interface WebVitals {
  fcp: number;
  lcp: number;
  cls: number;
  ttfb: number;
  domContentLoaded: number;
  load: number;
}

interface PerformancePanelProps {
  connected: boolean;
  selectedTab: string;
}

// --- Color thresholds ---
function vitalColor(metric: string, value: number): string {
  if (value === 0) return 'text-white/20';
  const thresholds: Record<string, [number, number]> = {
    fcp:  [1800, 3000],
    lcp:  [2500, 4000],
    cls:  [0.1,  0.25],
    ttfb: [800,  1800],
  };
  const t = thresholds[metric];
  if (!t) return 'text-white/60';
  if (value <= t[0]) return 'text-emerald-400';
  if (value <= t[1]) return 'text-amber-400';
  return 'text-red-400';
}

function vitalBadge(metric: string, value: number): string {
  if (value === 0) return '';
  const thresholds: Record<string, [number, number]> = {
    fcp:  [1800, 3000],
    lcp:  [2500, 4000],
    cls:  [0.1,  0.25],
    ttfb: [800,  1800],
  };
  const t = thresholds[metric];
  if (!t) return '';
  if (value <= t[0]) return 'Good';
  if (value <= t[1]) return 'Needs Improvement';
  return 'Poor';
}

function formatMs(ms: number): string {
  if (ms === 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return '0 ms';
  return `${(seconds * 1000).toFixed(1)} ms`;
}

// Turkish descriptions for all metrics
const HINTS: Record<string, string> = {
  fcp: 'İlk İçerikli Boyama — tarayıcının ekrana ilk metin veya görseli çizdiği an.',
  lcp: 'En Büyük İçerikli Boyama — görünen alandaki en büyük içerik öğesinin yüklenme süresi.',
  cls: 'Kümülatif Düzen Kayması — sayfa yüklenirken öğelerin beklenmedik şekilde yer değiştirme miktarı. 0\'a yakın olması idealdir.',
  ttfb: 'İlk Bayt Süresi — tarayıcının sunucudan ilk yanıt baytını alana kadar geçen süre.',
  domContentLoaded: 'DOM\'un tamamen ayrıştırılıp hazır olduğu an (resimler/stiller hariç).',
  load: 'Sayfanın tüm kaynaklar dahil tamamen yüklendiği an.',
  jsHeap: 'JavaScript motorunun kullandığı bellek miktarı.',
  nodes: 'Sayfadaki toplam DOM düğüm sayısı. Çok fazla düğüm performansı düşürür.',
  listeners: 'Kayıtlı JavaScript olay dinleyicisi sayısı (click, scroll vb.).',
  documents: 'Sayfadaki doküman sayısı (ana sayfa + iframe\'ler).',
  frames: 'Sayfadaki frame/iframe sayısı.',
  layouts: 'Tarayıcının sayfa düzenini yeniden hesaplama sayısı ve toplam süresi.',
  styleRecalcs: 'CSS stillerinin yeniden hesaplanma sayısı ve toplam süresi.',
  scriptExecution: 'JavaScript kodunun toplam çalışma süresi.',
  taskDuration: 'Tarayıcının tüm görevlere (JS, layout, stil vb.) harcadığı toplam süre.',
};

function InfoTip({ hint }: { hint: string }) {
  return (
    <span className="relative group cursor-help ml-1 inline-flex">
      <span className="text-[9px] text-white/20 hover:text-white/40 transition-colors">ⓘ</span>
      <span className="absolute top-full left-0 mt-1.5 px-2.5 py-1.5
                       text-[10px] text-white/70 bg-[#1a1a2e] border border-border/50
                       rounded-md shadow-xl whitespace-normal w-52 leading-relaxed
                       opacity-0 group-hover:opacity-100 pointer-events-none
                       transition-opacity duration-150 z-[100]">
        {hint}
      </span>
    </span>
  );
}

export function PerformancePanel({ connected, selectedTab }: PerformancePanelProps) {
  const [metrics, setMetrics] = useState<PerfMetrics | null>(null);
  const [vitals, setVitals] = useState<WebVitals | null>(null);
  const [collecting, setCollecting] = useState(false);

  // Enable performance polling when tab is selected
  useEffect(() => {
    if (!connected || selectedTab === 'all') return;
    EnablePerformance(selectedTab).catch(() => {});
  }, [connected, selectedTab]);

  // Listen for runtime metrics
  useEffect(() => {
    if (!connected) return;

    function handleMetrics(tabId: string, m: PerfMetrics) {
      if (selectedTab !== 'all' && tabId !== selectedTab) return;
      setMetrics(m);
    }

    EventsOn('perf:metrics', handleMetrics);
    return () => { EventsOff('perf:metrics'); };
  }, [connected, selectedTab]);

  // Reset on tab change
  useEffect(() => {
    setMetrics(null);
    setVitals(null);
  }, [selectedTab]);

  // Collect Web Vitals
  const collectVitals = useCallback(async () => {
    if (selectedTab === 'all') return;
    setCollecting(true);
    try {
      const wv = await CollectWebVitals(selectedTab);
      setVitals(wv);
    } catch {
      setVitals(null);
    } finally {
      setCollecting(false);
    }
  }, [selectedTab]);

  if (!connected) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/15 text-sm">
        Connect to Chrome to view performance metrics
      </div>
    );
  }

  if (selectedTab === 'all') {
    return (
      <div className="flex-1 flex items-center justify-center text-white/15 text-sm">
        Select a specific tab to view performance metrics
      </div>
    );
  }

  const heapPercent = metrics && metrics.jsHeapTotalSize > 0
    ? (metrics.jsHeapUsedSize / metrics.jsHeapTotalSize) * 100
    : 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-auto console-scroll p-4 space-y-5">

        {/* ── Web Vitals ── */}
        <section>
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-[11px] text-white/30 uppercase tracking-wider font-semibold">Web Vitals</h3>
            <button
              onClick={collectVitals}
              disabled={collecting}
              className="px-2.5 py-1 text-[10px] text-accent/70 hover:text-accent
                         bg-accent/5 hover:bg-accent/10 border border-accent/20
                         rounded transition-colors disabled:opacity-30"
            >
              {collecting ? 'Collecting…' : '▶ Collect'}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(['fcp', 'lcp', 'cls', 'ttfb', 'domContentLoaded', 'load'] as const).map((key) => {
              const labels: Record<string, string> = {
                fcp: 'FCP', lcp: 'LCP', cls: 'CLS', ttfb: 'TTFB',
                domContentLoaded: 'DOM Loaded', load: 'Page Load',
              };
              const val = vitals ? vitals[key] : 0;
              const isCls = key === 'cls';

              return (
                <div key={key} className="bg-surface-1 rounded-lg border border-border/40 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-white/30 uppercase tracking-wider">{labels[key]}<InfoTip hint={HINTS[key]} /></span>
                    {vitals && val > 0 && (key === 'fcp' || key === 'lcp' || key === 'cls' || key === 'ttfb') && (
                      <span className={`text-[8px] px-1.5 py-0.5 rounded-full ${
                        vitalBadge(key, val) === 'Good' ? 'bg-emerald-400/10 text-emerald-400' :
                        vitalBadge(key, val) === 'Needs Improvement' ? 'bg-amber-400/10 text-amber-400' :
                        'bg-red-400/10 text-red-400'
                      }`}>
                        {vitalBadge(key, val)}
                      </span>
                    )}
                  </div>
                  <span className={`text-lg font-mono font-semibold ${vitalColor(key, val)}`}>
                    {vitals ? (isCls ? (val === 0 ? '—' : val.toFixed(3)) : formatMs(val)) : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Memory & DOM ── */}
        <section>
          <h3 className="text-[11px] text-white/30 uppercase tracking-wider font-semibold mb-3">Memory & DOM</h3>

          {metrics ? (
            <div className="space-y-3">
              {/* JS Heap bar */}
              <div className="bg-surface-1 rounded-lg border border-border/40 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-white/30 uppercase tracking-wider">JS Heap<InfoTip hint={HINTS.jsHeap} /></span>
                  <span className="text-[10px] text-white/40 font-mono">
                    {formatBytes(metrics.jsHeapUsedSize)} / {formatBytes(metrics.jsHeapTotalSize)}
                  </span>
                </div>
                <div className="h-2 bg-surface-0 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      heapPercent > 90 ? 'bg-red-400' : heapPercent > 70 ? 'bg-amber-400' : 'bg-accent'
                    }`}
                    style={{ width: `${Math.min(heapPercent, 100)}%` }}
                  />
                </div>
              </div>

              {/* DOM stats grid */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'DOM Nodes', value: Math.round(metrics.nodes), hint: HINTS.nodes },
                  { label: 'Listeners', value: Math.round(metrics.jsEventListeners), hint: HINTS.listeners },
                  { label: 'Documents', value: Math.round(metrics.documents), hint: HINTS.documents },
                  { label: 'Frames', value: Math.round(metrics.frames), hint: HINTS.frames },
                ].map((item) => (
                  <div key={item.label} className="bg-surface-1 rounded-lg border border-border/40 p-3 text-center">
                    <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">{item.label}<InfoTip hint={item.hint} /></div>
                    <div className="text-base font-mono font-semibold text-white/60">{item.value.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-white/15 animate-pulse">Waiting for metrics…</div>
          )}
        </section>

        {/* ── Rendering ── */}
        <section>
          <h3 className="text-[11px] text-white/30 uppercase tracking-wider font-semibold mb-3">Rendering</h3>

          {metrics ? (
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Layouts', count: Math.round(metrics.layoutCount), duration: metrics.layoutDuration, hint: HINTS.layouts },
                { label: 'Style Recalcs', count: Math.round(metrics.recalcStyleCount), duration: metrics.recalcStyleDuration, hint: HINTS.styleRecalcs },
                { label: 'Script Execution', count: null, duration: metrics.scriptDuration, hint: HINTS.scriptExecution },
                { label: 'Total Task Time', count: null, duration: metrics.taskDuration, hint: HINTS.taskDuration },
              ].map((item) => (
                <div key={item.label} className="bg-surface-1 rounded-lg border border-border/40 p-3">
                  <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">{item.label}<InfoTip hint={item.hint} /></div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-base font-mono font-semibold text-white/60">
                      {formatDuration(item.duration)}
                    </span>
                    {item.count !== null && (
                      <span className="text-[10px] text-white/25 font-mono">
                        ({item.count.toLocaleString()}×)
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-white/15 animate-pulse">Waiting for metrics…</div>
          )}
        </section>
      </div>
    </div>
  );
}

import { useState, useCallback, useEffect, useRef } from 'react';
import { GetConfig, SaveGeminiKey, SaveGeminiModel, DebugAnalysis, SaveReport, ExportReportPDF, EmailReport } from '../../wailsjs/go/main/App';

const MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (En Güçlü)' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite (Hızlı)' },
  { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
];

interface AIPanelProps {
  connected: boolean;
  selectedTab: string;
}

export function AIPanel({ connected, selectedTab }: AIPanelProps) {
  const [apiKey, setApiKey] = useState('');
  const [keySaved, setKeySaved] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [model, setModel] = useState('gemini-2.5-flash');

  // Debug state
  const [debugResult, setDebugResult] = useState('');
  const [debugLoading, setDebugLoading] = useState(false);

  const [error, setError] = useState('');

  // Load saved config
  useEffect(() => {
    GetConfig().then(cfg => {
      if (cfg && cfg.geminiApiKey) {
        setApiKey(cfg.geminiApiKey);
        setKeyInput(cfg.geminiApiKey);
        setKeySaved(true);
      }
      if (cfg && cfg.geminiModel) {
        setModel(cfg.geminiModel);
      }
    }).catch(() => {});
  }, []);

  const saveKey = useCallback(async () => {
    if (!keyInput.trim()) return;
    try {
      await SaveGeminiKey(keyInput.trim());
      setApiKey(keyInput.trim());
      setKeySaved(true);
      setError('');
    } catch {
      setError('API key kaydedilemedi');
    }
  }, [keyInput]);

  const runDebug = useCallback(async () => {
    if (!apiKey || selectedTab === 'all') return;
    setDebugLoading(true);
    setDebugResult('');
    setError('');
    try {
      const result = await DebugAnalysis(selectedTab);
      setDebugResult(result);
      setTimeout(() => debugRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (e) {
      setError(`Hata analizi başarısız: ${e}`);
    } finally {
      setDebugLoading(false);
    }
  }, [apiKey, selectedTab]);

  const debugRef = useRef<HTMLDivElement>(null);

  const saveReport = useCallback(async (content: string, filename: string) => {
    try {
      await SaveReport(content, filename);
    } catch {
      // user cancelled
    }
  }, []);

  const exportPDF = useCallback(async (content: string, filename: string) => {
    try {
      await ExportReportPDF(content, filename);
    } catch (e) {
      setError(`PDF hatası: ${e}`);
    }
  }, []);

  const emailReport = useCallback(async (content: string, subject: string) => {
    try {
      await EmailReport(content, subject);
    } catch (e) {
      setError(`E-posta hatası: ${e}`);
    }
  }, []);

  if (!connected) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/15 text-sm">
        AI analiz için Chrome'a bağlanın
      </div>
    );
  }

  if (selectedTab === 'all') {
    return (
      <div className="flex-1 flex items-center justify-center text-white/15 text-sm">
        AI analiz için bir sekme seçin
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', minHeight: 0 }}>
      {/* Settings Bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/40 bg-surface-1/50 shrink-0 flex-wrap">
        <span className="text-[10px] text-white/30 uppercase tracking-wider">API Key</span>
        <input
          type="password"
          value={keyInput}
          onChange={e => { setKeyInput(e.target.value); setKeySaved(false); }}
          placeholder="API key giriniz..."
          className="flex-1 min-w-[140px] px-2.5 py-1 bg-surface-0 border border-border/40 rounded
                     text-[11px] text-white/60 font-mono placeholder:text-white/15
                     focus:outline-none focus:border-accent/40"
        />
        <button
          onClick={saveKey}
          disabled={!keyInput.trim() || keySaved}
          className={`px-3 py-1 text-[10px] rounded transition-colors border ${
            keySaved
              ? 'text-emerald-400/60 border-emerald-400/20 bg-emerald-400/5'
              : 'text-accent/70 border-accent/20 bg-accent/5 hover:bg-accent/10'
          } disabled:opacity-40`}
        >
          {keySaved ? '✓' : 'Kaydet'}
        </button>

        <span className="text-white/10">|</span>

        <span className="text-[10px] text-white/30 uppercase tracking-wider">Model</span>
        <select
          value={model}
          onChange={e => {
            setModel(e.target.value);
            SaveGeminiModel(e.target.value).catch(() => {});
          }}
          className="px-2 py-1 bg-surface-0 border border-border/40 rounded
                     text-[11px] text-white/60 focus:outline-none focus:border-accent/40
                     [&>option]:bg-[#1a1a2e] [&>option]:text-white/60"
        >
          {MODELS.map(m => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Scrollable content */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflowY: 'auto' }} className="console-scroll p-4">

          {/* Error display */}
          {error && (
            <div className="text-[10px] font-mono px-3 py-2 rounded border mb-4
                            bg-red-400/5 border-red-400/20 text-red-400/70">
              {error}
            </div>
          )}

          {/* ── Debug Assistant ── */}
          <div className="bg-surface-1 rounded-lg border border-border/40 p-4 space-y-3">
            <h3 className="text-[11px] text-white/30 uppercase tracking-wider font-semibold">
              🔍 Hata Analizi (Debug Assistant)
            </h3>
            <p className="text-[10px] text-white/25 leading-relaxed">
              Console hataları, başarısız ağ istekleri ve performans sorunlarını analiz eder.
              Her hata için kök neden ve çözüm önerisi sunar.
            </p>

            <button
              onClick={runDebug}
              disabled={debugLoading || !apiKey}
              className="w-full py-2.5 text-[11px] font-semibold rounded-md transition-all
                         bg-accent/10 hover:bg-accent/20 text-accent border border-accent/25
                         disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {debugLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                  Analiz ediliyor...
                </span>
              ) : '🔍 Hata Analizi Yap'}
            </button>

            {debugResult && (
              <div ref={debugRef}>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[10px] text-white/25">Analiz Sonucu</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => saveReport(debugResult, `debug-report-${new Date().toISOString().slice(0,10)}.md`)}
                      className="px-2 py-1 text-[10px] rounded border transition-colors
                                 text-white/40 border-border/30 hover:bg-surface-1 hover:text-white/60"
                      title="Markdown olarak kaydet"
                    >
                      💾 MD
                    </button>
                    <button
                      onClick={() => exportPDF(debugResult, `debug-report-${new Date().toISOString().slice(0,10)}.pdf`)}
                      className="px-2 py-1 text-[10px] rounded border transition-colors
                                 text-white/40 border-border/30 hover:bg-surface-1 hover:text-white/60"
                      title="PDF olarak kaydet"
                    >
                      📄 PDF
                    </button>
                    <button
                      onClick={() => emailReport(debugResult, 'Glimpse - Hata Analizi Raporu')}
                      className="px-2 py-1 text-[10px] rounded border transition-colors
                                 text-white/40 border-border/30 hover:bg-surface-1 hover:text-white/60"
                      title="E-posta ile gönder"
                    >
                      📧
                    </button>
                  </div>
                </div>
                <div className="mt-2 p-4 bg-surface-0 rounded-lg border border-border/30 
                                text-[11px] text-white/60 leading-relaxed
                                prose prose-invert prose-sm max-w-none
                                [&_h3]:text-white/70 [&_h3]:text-[12px] [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2
                                [&_h2]:text-white/80 [&_h2]:text-[13px] [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-2
                                [&_strong]:text-white/70
                                [&_code]:bg-surface-1 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-accent/80
                                [&_pre]:bg-surface-1 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto
                                [&_ul]:list-disc [&_ul]:pl-4 [&_li]:mb-1"
                  dangerouslySetInnerHTML={{ __html: markdownToHtml(debugResult) }}
                />
              </div>
            )}
          </div>

        </div>{/* end absolute scroll */}
      </div>{/* end relative wrapper */}
    </div>
  );
}

// Simple markdown to HTML converter (no external deps)
function markdownToHtml(md: string): string {
  return md
    // Code blocks (``` ... ```)
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) =>
      `<pre><code>${escapeHtml(code.trim())}</code></pre>`)
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Unordered list
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    // Ordered list
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr/>')
    // Paragraphs (double newlines)
    .replace(/\n\n/g, '</p><p>')
    // Single newlines
    .replace(/\n/g, '<br/>');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

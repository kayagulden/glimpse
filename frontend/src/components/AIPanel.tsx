import { useState, useCallback, useEffect } from 'react';
import { GetConfig, SaveGeminiKey, DebugAnalysis, SiteAudit } from '../../wailsjs/go/main/App';

interface AIPanelProps {
  connected: boolean;
  selectedTab: string;
}

export function AIPanel({ connected, selectedTab }: AIPanelProps) {
  const [apiKey, setApiKey] = useState('');
  const [keySaved, setKeySaved] = useState(false);
  const [keyInput, setKeyInput] = useState('');

  // Debug state
  const [debugResult, setDebugResult] = useState('');
  const [debugLoading, setDebugLoading] = useState(false);

  // Audit state
  const [auditResult, setAuditResult] = useState('');
  const [auditLoading, setAuditLoading] = useState(false);

  const [error, setError] = useState('');

  // Load saved API key
  useEffect(() => {
    GetConfig().then(cfg => {
      if (cfg && cfg.geminiApiKey) {
        setApiKey(cfg.geminiApiKey);
        setKeyInput(cfg.geminiApiKey);
        setKeySaved(true);
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
    } catch (e) {
      setError(`Hata analizi başarısız: ${e}`);
    } finally {
      setDebugLoading(false);
    }
  }, [apiKey, selectedTab]);

  const runAudit = useCallback(async () => {
    if (!apiKey || selectedTab === 'all') return;
    setAuditLoading(true);
    setAuditResult('');
    setError('');
    try {
      const result = await SiteAudit(selectedTab);
      setAuditResult(result);
    } catch (e) {
      setError(`Site denetimi başarısız: ${e}`);
    } finally {
      setAuditLoading(false);
    }
  }, [apiKey, selectedTab]);

  if (!connected) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/15 text-sm">
        Connect to Chrome to use AI analysis
      </div>
    );
  }

  if (selectedTab === 'all') {
    return (
      <div className="flex-1 flex items-center justify-center text-white/15 text-sm">
        Select a specific tab for AI analysis
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* API Key Bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/40 bg-surface-1/50 shrink-0">
        <span className="text-[10px] text-white/30 uppercase tracking-wider">Gemini API Key</span>
        <input
          type="password"
          value={keyInput}
          onChange={e => { setKeyInput(e.target.value); setKeySaved(false); }}
          placeholder="API key giriniz..."
          className="flex-1 px-2.5 py-1 bg-surface-0 border border-border/40 rounded
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
          {keySaved ? '✓ Kayıtlı' : 'Kaydet'}
        </button>
      </div>

      <div className="flex-1 overflow-auto console-scroll p-4 space-y-5">
        {/* Error display */}
        {error && (
          <div className="text-[10px] font-mono px-3 py-2 rounded border
                          bg-red-400/5 border-red-400/20 text-red-400/70">
            {error}
          </div>
        )}

        {/* ── Debug Assistant ── */}
        <section>
          <h3 className="text-[11px] text-white/30 uppercase tracking-wider font-semibold mb-3">
            🔍 Hata Analizi (Debug Assistant)
          </h3>

          <div className="bg-surface-1 rounded-lg border border-border/40 p-4 space-y-3">
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
              <div className="mt-3 p-4 bg-surface-0 rounded-lg border border-border/30 
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
            )}
          </div>
        </section>

        {/* ── Site Audit ── */}
        <section>
          <h3 className="text-[11px] text-white/30 uppercase tracking-wider font-semibold mb-3">
            📊 Site Denetimi (Site Audit)
          </h3>

          <div className="bg-surface-1 rounded-lg border border-border/40 p-4 space-y-3">
            <p className="text-[10px] text-white/25 leading-relaxed">
              SEO, performans, erişilebilirlik, UX, güvenlik ve en iyi uygulamalar başlıklarında
              kapsamlı bir değerlendirme yapar. Her başlık için 0-100 puan verir.
            </p>

            <button
              onClick={runAudit}
              disabled={auditLoading || !apiKey}
              className="w-full py-2.5 text-[11px] font-semibold rounded-md transition-all
                         bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/25
                         disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {auditLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3 h-3 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
                  Denetleniyor...
                </span>
              ) : '📊 Site Denetimi Başlat'}
            </button>

            {auditResult && (
              <div className="mt-3 p-4 bg-surface-0 rounded-lg border border-border/30
                              text-[11px] text-white/60 leading-relaxed
                              prose prose-invert prose-sm max-w-none
                              [&_h2]:text-white/80 [&_h2]:text-[13px] [&_h2]:font-bold [&_h2]:mt-5 [&_h2]:mb-2
                              [&_h3]:text-white/70 [&_h3]:text-[12px] [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1
                              [&_strong]:text-white/70
                              [&_code]:bg-surface-1 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-accent/80
                              [&_pre]:bg-surface-1 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto
                              [&_ul]:list-disc [&_ul]:pl-4 [&_li]:mb-1"
                dangerouslySetInnerHTML={{ __html: markdownToHtml(auditResult) }}
              />
            )}
          </div>
        </section>
      </div>
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

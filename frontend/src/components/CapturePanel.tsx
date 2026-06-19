import { useState, useCallback } from 'react';
import { CaptureScreenshot, PrintToPDF } from '../../wailsjs/go/main/App';

interface CapturePanelProps {
  connected: boolean;
  selectedTab: string;
}

type ImageFormat = 'png' | 'jpeg' | 'webp';

export function CapturePanel({ connected, selectedTab }: CapturePanelProps) {
  // Screenshot options
  const [format, setFormat] = useState<ImageFormat>('png');
  const [quality, setQuality] = useState(85);
  const [fullPage, setFullPage] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [lastPath, setLastPath] = useState('');

  // PDF options
  const [pdfLandscape, setPdfLandscape] = useState(false);
  const [printBackground, setPrintBackground] = useState(true);
  const [pdfScale, setPdfScale] = useState(1.0);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const takeScreenshot = useCallback(async () => {
    if (selectedTab === 'all') return;
    setCapturing(true);
    setLastPath('');
    try {
      const path = await CaptureScreenshot(selectedTab, format, quality, fullPage);
      setLastPath(path);
    } catch (e) {
      const msg = String(e);
      if (!msg.includes('cancelled')) {
        setLastPath(`Hata: ${msg}`);
      }
    } finally {
      setCapturing(false);
    }
  }, [selectedTab, format, quality, fullPage]);

  const generatePdf = useCallback(async () => {
    if (selectedTab === 'all') return;
    setGeneratingPdf(true);
    setLastPath('');
    try {
      const path = await PrintToPDF(selectedTab, pdfLandscape, printBackground, pdfScale);
      setLastPath(path);
    } catch (e) {
      const msg = String(e);
      if (!msg.includes('cancelled')) {
        setLastPath(`Hata: ${msg}`);
      }
    } finally {
      setGeneratingPdf(false);
    }
  }, [selectedTab, pdfLandscape, printBackground, pdfScale]);

  if (!connected) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/15 text-sm">
        Connect to Chrome to capture screenshots
      </div>
    );
  }

  if (selectedTab === 'all') {
    return (
      <div className="flex-1 flex items-center justify-center text-white/15 text-sm">
        Select a specific tab to capture
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-auto console-scroll p-4 space-y-5">

        {/* ── Screenshot ── */}
        <section>
          <h3 className="text-[11px] text-white/30 uppercase tracking-wider font-semibold mb-3">
            📸 Ekran Görüntüsü
          </h3>

          <div className="bg-surface-1 rounded-lg border border-border/40 p-4 space-y-4">
            {/* Format */}
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-white/30 uppercase tracking-wider w-16">Format</span>
              <div className="flex gap-1">
                {(['png', 'jpeg', 'webp'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className={`px-2.5 py-1 text-[10px] rounded transition-colors ${
                      format === f
                        ? 'bg-accent/15 text-accent border border-accent/30'
                        : 'text-white/40 hover:text-white/60 border border-border/30 hover:border-border/50'
                    }`}
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Quality (JPEG/WebP only) */}
            {format !== 'png' && (
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-white/30 uppercase tracking-wider w-16">Kalite</span>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={quality}
                  onChange={e => setQuality(Number(e.target.value))}
                  className="flex-1 h-1 accent-accent"
                />
                <span className="text-[10px] text-white/40 font-mono w-8 text-right">{quality}%</span>
              </div>
            )}

            {/* Full Page toggle */}
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-white/30 uppercase tracking-wider w-16">Kapsam</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setFullPage(false)}
                  className={`px-2.5 py-1 text-[10px] rounded transition-colors ${
                    !fullPage
                      ? 'bg-accent/15 text-accent border border-accent/30'
                      : 'text-white/40 hover:text-white/60 border border-border/30 hover:border-border/50'
                  }`}
                >
                  Viewport
                </button>
                <button
                  onClick={() => setFullPage(true)}
                  className={`px-2.5 py-1 text-[10px] rounded transition-colors ${
                    fullPage
                      ? 'bg-accent/15 text-accent border border-accent/30'
                      : 'text-white/40 hover:text-white/60 border border-border/30 hover:border-border/50'
                  }`}
                >
                  Full Page
                </button>
              </div>
            </div>

            {/* Capture button */}
            <button
              onClick={takeScreenshot}
              disabled={capturing}
              className="w-full py-2 text-[11px] font-semibold rounded-md transition-all
                         bg-accent/10 hover:bg-accent/20 text-accent border border-accent/25
                         disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {capturing ? '⏳ Yakalanıyor…' : '📸 Ekran Görüntüsü Al'}
            </button>
          </div>
        </section>

        {/* ── PDF ── */}
        <section>
          <h3 className="text-[11px] text-white/30 uppercase tracking-wider font-semibold mb-3">
            📄 PDF Dışa Aktarma
          </h3>

          <div className="bg-surface-1 rounded-lg border border-border/40 p-4 space-y-4">
            {/* Orientation */}
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-white/30 uppercase tracking-wider w-16">Yön</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPdfLandscape(false)}
                  className={`px-2.5 py-1 text-[10px] rounded transition-colors ${
                    !pdfLandscape
                      ? 'bg-accent/15 text-accent border border-accent/30'
                      : 'text-white/40 hover:text-white/60 border border-border/30 hover:border-border/50'
                  }`}
                >
                  Dikey
                </button>
                <button
                  onClick={() => setPdfLandscape(true)}
                  className={`px-2.5 py-1 text-[10px] rounded transition-colors ${
                    pdfLandscape
                      ? 'bg-accent/15 text-accent border border-accent/30'
                      : 'text-white/40 hover:text-white/60 border border-border/30 hover:border-border/50'
                  }`}
                >
                  Yatay
                </button>
              </div>
            </div>

            {/* Print background */}
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-white/30 uppercase tracking-wider w-16">Arka Plan</span>
              <button
                onClick={() => setPrintBackground(!printBackground)}
                className={`px-2.5 py-1 text-[10px] rounded transition-colors ${
                  printBackground
                    ? 'bg-accent/15 text-accent border border-accent/30'
                    : 'text-white/40 border border-border/30 hover:border-border/50'
                }`}
              >
                {printBackground ? '✓ Dahil' : '✗ Hariç'}
              </button>
            </div>

            {/* Scale */}
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-white/30 uppercase tracking-wider w-16">Ölçek</span>
              <input
                type="range"
                min={0.1}
                max={2.0}
                step={0.1}
                value={pdfScale}
                onChange={e => setPdfScale(Number(e.target.value))}
                className="flex-1 h-1 accent-accent"
              />
              <span className="text-[10px] text-white/40 font-mono w-8 text-right">{pdfScale.toFixed(1)}×</span>
            </div>

            {/* Generate button */}
            <button
              onClick={generatePdf}
              disabled={generatingPdf}
              className="w-full py-2 text-[11px] font-semibold rounded-md transition-all
                         bg-accent/10 hover:bg-accent/20 text-accent border border-accent/25
                         disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {generatingPdf ? '⏳ Oluşturuluyor…' : '📄 PDF Olarak Kaydet'}
            </button>
          </div>
        </section>

        {/* Result */}
        {lastPath && (
          <div className={`text-[10px] font-mono px-3 py-2 rounded border ${
            lastPath.startsWith('Hata')
              ? 'bg-red-400/5 border-red-400/20 text-red-400/70'
              : 'bg-emerald-400/5 border-emerald-400/20 text-emerald-400/70'
          }`}>
            {lastPath.startsWith('Hata') ? lastPath : `✓ Kaydedildi: ${lastPath}`}
          </div>
        )}
      </div>
    </div>
  );
}

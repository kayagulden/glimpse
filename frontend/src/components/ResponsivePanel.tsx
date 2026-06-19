import { useState, useCallback } from 'react';
import { SetViewport, ResetViewport } from '../../wailsjs/go/main/App';

interface DevicePreset {
  name: string;
  width: number;
  height: number;
  dpr: number;
  mobile: boolean;
  category: 'phone' | 'tablet' | 'desktop';
}

const PRESETS: DevicePreset[] = [
  // Phones
  { name: 'iPhone SE',          width: 375,  height: 667,  dpr: 2,     mobile: true,  category: 'phone' },
  { name: 'iPhone 14 Pro',      width: 393,  height: 852,  dpr: 3,     mobile: true,  category: 'phone' },
  { name: 'iPhone 14 Pro Max',  width: 430,  height: 932,  dpr: 3,     mobile: true,  category: 'phone' },
  { name: 'Galaxy S24',         width: 360,  height: 780,  dpr: 3,     mobile: true,  category: 'phone' },
  { name: 'Pixel 8',            width: 412,  height: 915,  dpr: 2.625, mobile: true,  category: 'phone' },
  // Tablets
  { name: 'iPad Mini',          width: 768,  height: 1024, dpr: 2,     mobile: true,  category: 'tablet' },
  { name: 'iPad Air',           width: 820,  height: 1180, dpr: 2,     mobile: true,  category: 'tablet' },
  { name: 'iPad Pro 12.9"',     width: 1024, height: 1366, dpr: 2,     mobile: true,  category: 'tablet' },
  // Desktops
  { name: 'Laptop',             width: 1366, height: 768,  dpr: 1,     mobile: false, category: 'desktop' },
  { name: 'MacBook Air',        width: 1440, height: 900,  dpr: 2,     mobile: false, category: 'desktop' },
  { name: 'Desktop HD',         width: 1920, height: 1080, dpr: 1,     mobile: false, category: 'desktop' },
];

interface ResponsivePanelProps {
  connected: boolean;
  selectedTab: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  phone: '📱',
  tablet: '📋',
  desktop: '🖥️',
};

export function ResponsivePanel({ connected, selectedTab }: ResponsivePanelProps) {
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [customW, setCustomW] = useState('');
  const [customH, setCustomH] = useState('');
  const [landscape, setLandscape] = useState(false);
  const [currentViewport, setCurrentViewport] = useState<{
    width: number; height: number; dpr: number; mobile: boolean; name: string;
  } | null>(null);
  const [applying, setApplying] = useState(false);

  const applyViewport = useCallback(async (
    name: string, width: number, height: number, dpr: number, mobile: boolean, isLandscape: boolean
  ) => {
    if (selectedTab === 'all') return;
    setApplying(true);
    try {
      const w = isLandscape ? height : width;
      const h = isLandscape ? width : height;
      await SetViewport(selectedTab, w, h, dpr, mobile, isLandscape);
      setCurrentViewport({ width: w, height: h, dpr, mobile, name });
    } catch {
      // ignore
    } finally {
      setApplying(false);
    }
  }, [selectedTab]);

  const selectPreset = useCallback((preset: DevicePreset) => {
    setActivePreset(preset.name);
    setLandscape(false);
    setCustomW('');
    setCustomH('');
    applyViewport(preset.name, preset.width, preset.height, preset.dpr, preset.mobile, false);
  }, [applyViewport]);

  const toggleOrientation = useCallback(() => {
    if (!currentViewport) return;
    const newLandscape = !landscape;
    setLandscape(newLandscape);
    const preset = PRESETS.find(p => p.name === activePreset);
    if (preset) {
      applyViewport(preset.name, preset.width, preset.height, preset.dpr, preset.mobile, newLandscape);
    }
  }, [landscape, activePreset, currentViewport, applyViewport]);

  const applyCustom = useCallback(() => {
    const w = parseInt(customW, 10);
    const h = parseInt(customH, 10);
    if (!w || !h || w < 100 || h < 100) return;
    setActivePreset(null);
    setLandscape(false);
    applyViewport(`${w}×${h}`, w, h, 1, false, false);
  }, [customW, customH, applyViewport]);

  const reset = useCallback(async () => {
    if (selectedTab === 'all') return;
    setApplying(true);
    try {
      await ResetViewport(selectedTab);
      setActivePreset(null);
      setCurrentViewport(null);
      setLandscape(false);
      setCustomW('');
      setCustomH('');
    } catch {
      // ignore
    } finally {
      setApplying(false);
    }
  }, [selectedTab]);

  if (!connected) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/15 text-sm">
        Connect to Chrome to use responsive testing
      </div>
    );
  }

  if (selectedTab === 'all') {
    return (
      <div className="flex-1 flex items-center justify-center text-white/15 text-sm">
        Select a specific tab to test responsive layouts
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Active viewport info bar */}
      {currentViewport && (
        <div className="flex items-center gap-3 px-4 py-2 bg-accent/5 border-b border-accent/15 shrink-0">
          <span className="text-[11px] text-accent/80 font-mono font-semibold">
            {currentViewport.name}
          </span>
          <span className="text-[10px] text-white/30 font-mono">
            {currentViewport.width}×{currentViewport.height}
          </span>
          <span className="text-[9px] text-white/20 font-mono">
            DPR {currentViewport.dpr}
          </span>
          <span className={`text-[8px] px-1.5 py-0.5 rounded-full ${
            currentViewport.mobile
              ? 'bg-amber-400/10 text-amber-400'
              : 'bg-emerald-400/10 text-emerald-400'
          }`}>
            {currentViewport.mobile ? 'Mobile' : 'Desktop'}
          </span>
          <div className="flex-1" />
          <button
            onClick={toggleOrientation}
            className="px-2 py-0.5 text-[10px] text-white/40 hover:text-white/60
                       hover:bg-white/5 rounded transition-colors"
            title={landscape ? 'Portrait moda geç' : 'Landscape moda geç'}
          >
            🔄 {landscape ? 'Landscape' : 'Portrait'}
          </button>
          <button
            onClick={reset}
            disabled={applying}
            className="px-2 py-0.5 text-[10px] text-red-400/60 hover:text-red-400
                       hover:bg-red-400/10 rounded transition-colors disabled:opacity-30"
          >
            ↩ Sıfırla
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto console-scroll p-4 space-y-5">
        {/* Custom size */}
        <section>
          <h3 className="text-[11px] text-white/30 uppercase tracking-wider font-semibold mb-3">Özel Boyut</h3>
          <div className="flex items-center gap-2">
            <input
              type="number"
              placeholder="Genişlik"
              value={customW}
              onChange={e => setCustomW(e.target.value)}
              min={100}
              className="w-24 px-2.5 py-1.5 bg-surface-1 border border-border/40 rounded
                         text-[11px] text-white/60 font-mono placeholder:text-white/15
                         focus:outline-none focus:border-accent/40"
            />
            <span className="text-white/20 text-[11px]">×</span>
            <input
              type="number"
              placeholder="Yükseklik"
              value={customH}
              onChange={e => setCustomH(e.target.value)}
              min={100}
              className="w-24 px-2.5 py-1.5 bg-surface-1 border border-border/40 rounded
                         text-[11px] text-white/60 font-mono placeholder:text-white/15
                         focus:outline-none focus:border-accent/40"
            />
            <button
              onClick={applyCustom}
              disabled={applying || !customW || !customH}
              className="px-3 py-1.5 text-[10px] text-accent/70 hover:text-accent
                         bg-accent/5 hover:bg-accent/10 border border-accent/20
                         rounded transition-colors disabled:opacity-30"
            >
              Uygula
            </button>
          </div>
        </section>

        {/* Device presets by category */}
        {(['phone', 'tablet', 'desktop'] as const).map(category => {
          const devices = PRESETS.filter(p => p.category === category);
          const categoryLabels: Record<string, string> = {
            phone: 'Telefonlar', tablet: 'Tabletler', desktop: 'Masaüstü',
          };
          return (
            <section key={category}>
              <h3 className="text-[11px] text-white/30 uppercase tracking-wider font-semibold mb-3">
                {CATEGORY_ICONS[category]} {categoryLabels[category]}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {devices.map(device => {
                  const isActive = activePreset === device.name;
                  return (
                    <button
                      key={device.name}
                      onClick={() => selectPreset(device)}
                      disabled={applying}
                      className={`text-left p-3 rounded-lg border transition-all duration-150 ${
                        isActive
                          ? 'bg-accent/10 border-accent/30 ring-1 ring-accent/20'
                          : 'bg-surface-1 border-border/40 hover:border-border/60 hover:bg-surface-1/80'
                      } disabled:opacity-30`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-[11px] font-medium ${
                          isActive ? 'text-accent' : 'text-white/50'
                        }`}>
                          {device.name}
                        </span>
                        {isActive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                        )}
                      </div>
                      <div className="text-[10px] text-white/25 font-mono">
                        {device.width}×{device.height} · DPR {device.dpr}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

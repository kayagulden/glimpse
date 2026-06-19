interface TabBarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const TABS = [
  { id: 'console', label: 'Console' },
  { id: 'elements', label: 'Elements' },
  { id: 'network', label: 'Network' },
  { id: 'application', label: 'Application' },
];

export function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <div className="flex items-center bg-surface-1 border-b border-border px-2">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`relative px-3 py-2 text-[11px] font-medium tracking-wide transition-colors
            ${activeTab === tab.id
              ? 'text-accent'
              : 'text-white/35 hover:text-white/55'
            }`}
        >
          {tab.label}
          {/* Active underline */}
          {activeTab === tab.id && (
            <span className="absolute bottom-0 left-1 right-1 h-[2px] bg-accent rounded-full" />
          )}
        </button>
      ))}
    </div>
  );
}

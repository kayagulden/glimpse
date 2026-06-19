import { useState, useCallback } from 'react';
import './style.css';
import { ConnectionBar } from './components/ConnectionBar';
import { TabBar } from './components/TabBar';
import { ConsolePanel } from './components/ConsolePanel';
import { ElementsPanel } from './components/ElementsPanel';

function App() {
  const [connected, setConnected] = useState(false);
  const [selectedTab, setSelectedTab] = useState('all'); // 'all' or target ID
  const [activePanel, setActivePanel] = useState('console'); // 'console' | 'elements'

  const handleConnectionChange = useCallback((status: boolean) => {
    setConnected(status);
    if (!status) {
      setSelectedTab('all');
      setActivePanel('console');
    }
  }, []);

  return (
    <div className="flex flex-col h-full bg-surface-0">
      <ConnectionBar
        connected={connected}
        onConnectionChange={handleConnectionChange}
        selectedTab={selectedTab}
        onTabChange={setSelectedTab}
      />

      {connected && (
        <TabBar activeTab={activePanel} onTabChange={setActivePanel} />
      )}

      <div className="flex-1 min-h-0">
        {activePanel === 'console' ? (
          <ConsolePanel connected={connected} selectedTab={selectedTab} />
        ) : (
          <ElementsPanel connected={connected} selectedTab={selectedTab} />
        )}
      </div>
    </div>
  );
}

export default App;

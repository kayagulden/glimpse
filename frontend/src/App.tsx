import { useState, useCallback } from 'react';
import './style.css';
import { ConnectionBar } from './components/ConnectionBar';
import { TabBar } from './components/TabBar';
import { ConsolePanel } from './components/ConsolePanel';
import { ElementsPanel } from './components/ElementsPanel';
import { ApplicationPanel } from './components/ApplicationPanel';
import { NetworkPanel } from './components/NetworkPanel';

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
        ) : activePanel === 'elements' ? (
          <ElementsPanel connected={connected} selectedTab={selectedTab} />
        ) : activePanel === 'network' ? (
          <NetworkPanel connected={connected} selectedTab={selectedTab} />
        ) : activePanel === 'application' ? (
          <ApplicationPanel connected={connected} selectedTab={selectedTab} />
        ) : null}
      </div>
    </div>
  );
}

export default App;

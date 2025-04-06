// App.tsx (Verify this matches your version)
import React, { useState } from 'react';
import './App.css';
import MainView from './components/MainView';
import PatchingView from './components/PatchingView';

interface Device {
  id: string;
  name: string;
  sections: Section[];
}

interface Section {
  id: string;
  name: string;
  color?: string;
  parameters?: Parameter[];
}

interface Parameter {
  id: string;
  name: string;
  color?: string;
  scaler?: ScalerConfig;
}

interface ScalerConfig {
  autoScale: boolean;
  min?: number | null;
  max?: number | null;
  method?: 'lin' | 'log';
}

interface Connection {
  from: { sectionId: string; paramId: string };
  to: { sectionId: string; paramId: string };
}

const App: React.FC = () => {
  const [yellowModeSection, setYellowModeSection] = useState<Section | null>(null);
  const [patchSections, setPatchSections] = useState<Section[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [mainViewKey, setMainViewKey] = useState(0);

  const handleEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (patchSections.length > 0) {
        setPatchSections([]);
        setMainViewKey(prev => prev + 1);
      }
      if (yellowModeSection) {
        setYellowModeSection(null);
      }
    }
  };

  React.useEffect(() => {
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [patchSections, yellowModeSection]);

  const handleSectionDoubleClick = (section: Section) => {
    setYellowModeSection({ ...section, color: 'yellow' });
  };

  const handleSectionClick = (section: Section) => {
    if (yellowModeSection && yellowModeSection.id !== section.id) {
      setPatchSections([yellowModeSection, section]);
      setYellowModeSection(null);
    }
  };

  const handleBackToMain = () => {
    setPatchSections([]);
    setMainViewKey(prev => prev + 1);
  };

  const handleConnectionChange = (from: { sectionId: string; paramId: string }, to: { sectionId: string; paramId: string }) => {
    const existingConnection = connections.find(
      conn =>
        (conn.from.sectionId === from.sectionId && conn.from.paramId === from.paramId && conn.to.sectionId === to.sectionId && conn.to.paramId === to.paramId) ||
        (conn.from.sectionId === to.sectionId && conn.from.paramId === to.paramId && conn.to.sectionId === from.sectionId && conn.to.paramId === from.paramId)
    );

    if (existingConnection) {
      setConnections(prev => prev.filter(conn => conn !== existingConnection));
    } else {
      setConnections(prev => [...prev, { from, to }]);
    }
    setMainViewKey(prev => prev + 1);
  };

  return (
    <div className="app">
      <MainView
        key={mainViewKey}
        onSectionDoubleClick={handleSectionDoubleClick}
        onSectionClick={handleSectionClick}
        yellowModeSection={yellowModeSection}
        connections={connections}
      />
      {patchSections.length > 0 && (
        <PatchingView
          sections={patchSections}
          onAddSection={() => {}}
          onBackToMain={handleBackToMain}
          onConnectionMade={handleConnectionChange}
          existingConnections={connections}
        />
      )}
    </div>
  );
};

export default App;
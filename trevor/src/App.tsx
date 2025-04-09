import React from 'react';
import InstanceCreation from './components/views/InstanceCreation';
import DevicePatching from './components/views/DevicePatching';

const App = () => {
  return (
    <div className="app-layout">
      <div className="top-section">
        <InstanceCreation />
      </div>
      <div className="bottom-section">
        <DevicePatching />
      </div>
    </div>
  );
};

export default App;

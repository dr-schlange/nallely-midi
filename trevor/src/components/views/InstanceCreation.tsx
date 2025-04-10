import React from 'react';

const InstanceCreation = () => {
  return (
    <div className="instance-creation">
      <div className="instance-creation-top-panel">
        <div className="instance-creation-midi-output">
          <h3>MIDI Output</h3>
          {/* Add content for MIDI Output here */}
        </div>
        <div className="instance-creation-midi-inputs">
          <h3>MIDI Inputs</h3>
          {/* Add content for MIDI Inputs here */}
        </div>
      </div>
      <div className="instance-creation-bottom-panel">
        <h3>Bottom Panel</h3>
        {/* Add content for the bottom panel here */}
      </div>
    </div>
  );
};

export default InstanceCreation;

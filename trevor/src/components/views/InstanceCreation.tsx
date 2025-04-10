import React, { useState } from 'react';
import Device from './Device';

const truncateName = (name: string, maxLength: number) => {
  return name.length > maxLength ? `${name.slice(0, maxLength)}...` : name;
};

const midiPorts = [
  { id: 'out1', name: 'Output 1', info: 'Details about Output 1' },
  { id: 'out2', name: 'Output 2', info: 'Details about Output 2' },
  { id: 'in1', name: 'Input 1', info: 'Details about Input 1' },
  { id: 'in2', name: 'Input 2', info: 'Details about Input 2' },
];

const deviceClasses = [
  { name: 'Synthesizer', info: 'A device that generates audio signals.' },
  { name: 'Drum Machine', info: 'A device that produces drum sounds.' },
  { name: 'Sampler', info: 'A device that plays back recorded audio.' },
  { name: 'Sequencer', info: 'A device that sequences musical patterns.' },
  { name: 'Effect Processor', info: 'A device that processes audio signals.' },
];

const InstanceCreation = ({
  onDeviceCreate = () => {}, // Provide a default no-op function
}: {
  onDeviceCreate?: (device: any) => void; // Make onDeviceCreate optional
}) => {
  const [selectedInfo, setSelectedInfo] = useState<string | null>(null);
  const [devices, setDevices] = useState<{ id: string; name: string; channel: number; sections: string[] }[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<{ id: string; name: string; channel: number; sections: string[] } | null>(null);

  const handlePortClick = (info: string) => {
    setSelectedInfo(info);
  };

  const handleDeviceClassClick = (deviceClass: { name: string; info: string }) => {
    const newDevice = {
      id: `device-${devices.length + 1}`,
      name: `${deviceClass.name} ${devices.length + 1}`,
      channel: 0,
      sections: ['Section 1', 'Section 2', 'Section 3'], // Example sections
    };
    setDevices((prev) => [...prev, newDevice]); // Add the device to the "Devices" zone
    setSelectedInfo(null); // Clear info panel
    setSelectedDevice(newDevice); // Automatically select the new device
  };

  const handleDeviceClick = (device: { id: string; name: string; channel: number; sections: string[] }) => {
    setSelectedDevice(device);
    setSelectedInfo(null); // Clear the info panel
  };

  const handleChannelChange = (deviceId: string, newChannel: number) => {
    setDevices((prev) =>
      prev.map((device) =>
        device.id === deviceId ? { ...device, channel: newChannel } : device
      )
    );
    if (selectedDevice?.id === deviceId) {
      setSelectedDevice((prev) => (prev ? { ...prev, channel: newChannel } : null));
    }
  };

  return (
    <div className="instance-creation">
      <div className="instance-creation-top-panel">
        <div className="instance-creation-midi-output">
          <h3>MIDI Output</h3>
          <div className="midi-ports-grid">
            {midiPorts
              .filter((port) => port.id.startsWith('out'))
              .map((port) => (
                <div
                  key={port.id}
                  className="midi-port"
                  title={port.name}
                  onClick={() => handlePortClick(port.info)}
                >
                  <span className="midi-port-name">
                    {truncateName(port.name, 8)}
                  </span>
                  <div className="midi-port-circle"></div>
                </div>
              ))}
          </div>
        </div>
        <div className="instance-creation-midi-inputs">
          <h3>MIDI Inputs</h3>
          <div className="midi-ports-grid">
            {midiPorts
              .filter((port) => port.id.startsWith('in'))
              .map((port) => (
                <div
                  key={port.id}
                  className="midi-port"
                  title={port.name}
                  onClick={() => handlePortClick(port.info)}
                >
                  <span className="midi-port-name">
                    {truncateName(port.name, 8)}
                  </span>
                  <div className="midi-port-circle"></div>
                </div>
              ))}
          </div>
        </div>
        <div className="instance-creation-info-panel">
          <h3>Info</h3>
          <div className="info-content">
            {selectedDevice ? (
              <div>
                <p>Device: {selectedDevice.name}</p>
                <label>
                  Channel:
                  <input
                    type="number"
                    value={selectedDevice.channel}
                    onChange={(e) =>
                      handleChannelChange(selectedDevice.id, parseInt(e.target.value, 10))
                    }
                  />
                </label>
              </div>
            ) : (
              <p>Select a device to see its details.</p>
            )}
          </div>
        </div>
      </div>
      <div className="instance-creation-bottom-panel">
        <div className="device-class-left-panel">
          <h3>Devices</h3>
          {/* Center only the devices in the list, leaving the title at the top */}
          <div className="device-list" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 'calc(100% - 40px)' }}>
            {devices.map((device) => (
              <Device
                key={device.id}
                slot={0} // Slot is irrelevant here
                slotWidth={250}
                height={100}
                name={device.name}
                sections={device.sections}
                onDragStart={() => {}} // No drag functionality here
                onDragEnd={() => {}}
                onSectionClick={() => setSelectedDevice(device)} // Select the device
                selectedSections={[]}
                onNonSectionClick={() => {}}
              />
            ))}
          </div>
        </div>
        <div className="device-class-right-panel">
          <h3>Device Classes</h3>
          <ul className="device-class-list">
            {deviceClasses.map((deviceClass, index) => (
              <li
                key={index}
                className="device-class-item"
                onClick={() => handleDeviceClassClick(deviceClass)}
              >
                {deviceClass.name}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default InstanceCreation;

import React, { useState } from 'react';
import Device from './Device';

export const RackRow = ({
  height,
  rowIndex,
  onDeviceDrop,
  onSectionClick,
  selectedSections,
  onNonSectionClick,
}: {
  height: number;
  rowIndex: number;
  onDeviceDrop: (draggedDevice: any, targetSlot: number, targetRow: number) => void;
  onSectionClick: (sectionId: string) => void;
  selectedSections: string[];
  onNonSectionClick: () => void;
}) => {
  const slotWidth = 250;
  const [devices, setDevices] = useState([
    { slot: 0, name: 'Device 1', sections: ['Power Supply', 'Cooling Unit', 'Processor'] },
    { slot: 1, name: 'Device 2', sections: ['Memory Module', 'Network Adapter'] },
  ]);

  const handleDragStart = (event: React.DragEvent, device: any) => {
    event.dataTransfer.setData('device', JSON.stringify({ ...device, rowIndex }));
  };

  const handleDrop = (event: React.DragEvent, targetSlot: number) => {
    const draggedDevice = JSON.parse(event.dataTransfer.getData('device'));
    onDeviceDrop(draggedDevice, targetSlot, rowIndex);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  return (
    <div
      className="rack-row"
      style={{
        height,
        position: 'relative',
        overflow: 'hidden',
      }}
      onClick={(event) => {
        if (
          !(event.target as HTMLElement).classList.contains('rack-section-box') &&
          !(event.target as HTMLElement).classList.contains('rack-section-name')
        ) {
          onNonSectionClick(); // Trigger deselection if clicking outside sections
        }
      }}
    >
      {devices.map((device) => (
        <div
          key={device.slot}
          data-rack-slot={device.slot}
          onDrop={(event) => handleDrop(event, device.slot)}
          onDragOver={handleDragOver}
          style={{
            position: 'absolute',
            left: device.slot * slotWidth,
            width: slotWidth,
            height: '100%',
          }}
        >
          <Device
            slot={device.slot}
            slotWidth={slotWidth}
            height={height}
            name={device.name}
            sections={device.sections}
            onDragStart={(event) => handleDragStart(event, device)}
            onDragEnd={() => {}}
            onSectionClick={onSectionClick}
            selectedSections={selectedSections}
            onNonSectionClick={onNonSectionClick} // Pass the function
          />
        </div>
      ))}
    </div>
  );
};

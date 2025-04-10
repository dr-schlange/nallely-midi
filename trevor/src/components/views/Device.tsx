import React from 'react';

const generateAcronym = (name: string): string => {
  // Generate an acronym by selecting consonants or meaningful letters
  return name
    .split(' ')
    .map(word => word.replace(/[aeiou]/gi, '').slice(0, 2)) // Remove vowels and take up to 2 letters
    .join('')
    .toUpperCase();
};

const Device = ({
  slot,
  slotWidth,
  height,
  margin = 5,
  name,
  sections,
  onDragStart,
  onDragEnd,
  onSectionClick,
  selectedSections,
  onNonSectionClick,
}: {
  slot: number;
  slotWidth: number;
  height: number;
  margin?: number;
  name: string;
  sections: string[];
  onDragStart: (event: React.DragEvent, slot: number) => void;
  onDragEnd: () => void;
  onSectionClick: (sectionId: string) => void;
  selectedSections: string[];
  onNonSectionClick: () => void;
}) => {
  const half = Math.ceil(sections.length / 2); // Split sections into left and right sides
  const leftSections = sections.slice(0, half);
  const rightSections = sections.slice(half);

  return (
    <div
      className="device"
      draggable
      onDragStart={(event) => onDragStart(event, slot)}
      onDragEnd={onDragEnd}
      onClick={(event) => {
        if (
          !(event.target as HTMLElement).classList.contains("section-box") &&
          !(event.target as HTMLElement).classList.contains("section-name")
        ) {
          onNonSectionClick(); // Trigger deselection if clicking outside sections
        }
      }}
      style={{
        position: 'absolute',
        left: slot * slotWidth + margin, // Follow slot spacing
        top: '50%', // Center vertically
        transform: 'translateY(-50%)', // Adjust to center the device properly
        width: slotWidth - margin * 2,
        height: height - margin * 2,
      }}
    >
      <div className="device-name">{name}</div>
      <div className="device-sections">
        {/* Left side sections */}
        <div className="device-side left">
          {leftSections.map((section, index) => {
            const sectionId = `${name}-left-${index}`;
            return (
              <div
                key={index}
                className={`device-section ${selectedSections.includes(sectionId) ? 'selected' : ''}`}
                onClick={() => onSectionClick(sectionId)}
              >
                <div className="section-box" title={section}></div>
                <span className="section-name left">{generateAcronym(section)}</span>
              </div>
            );
          })}
        </div>
        {/* Right side sections */}
        <div className="device-side right">
          {rightSections.map((section, index) => {
            const sectionId = `${name}-right-${index}`;
            return (
              <div
                key={index}
                className={`device-section ${selectedSections.includes(sectionId) ? 'selected' : ''}`}
                onClick={() => onSectionClick(sectionId)}
              >
                <span className="section-name right">{generateAcronym(section)}</span>
                <div className="section-box" title={section}></div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Device;

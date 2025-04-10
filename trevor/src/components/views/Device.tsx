import type React from 'react';
import { useState, useEffect } from 'react';

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
  onNonSectionClick?: () => void; // Make onNonSectionClick optional
}) => {
  const [isNameOnLeft, setIsNameOnLeft] = useState(true); // Track the side of the name

  const half = Math.ceil(sections.length / 2); // Split sections into left and right sides
  const leftSections = sections.slice(0, half);
  const rightSections = sections.slice(half);

  useEffect(() => {
    // Dynamically adjust the side of the name based on section positions
    setIsNameOnLeft(leftSections.length > rightSections.length);
  }, [leftSections, rightSections]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
<div
      className="device-component"
      draggable
      onDragStart={(event) => onDragStart(event, slot)}
      onDragEnd={onDragEnd}
      onClick={(event) => {
        if (
          !(event.target as HTMLElement).classList.contains("device-section-box") &&
          !(event.target as HTMLElement).classList.contains("device-section-name")
        ) {
          onNonSectionClick?.(); // Safely call onNonSectionClick if provided
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
      <div className={`device-name ${isNameOnLeft ? "left" : "right"}`}>{name}</div>
      <div className="device-sections">
        {/* Left side sections */}
        <div className="device-side left">
          {leftSections.map((section, index) => {
            const sectionId = `${name}-left-${index}`;
            return (
              // biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
<div
                key={sectionId}
                className={`device-section ${selectedSections.includes(sectionId) ? 'selected' : ''}`}
                data-dp-section-id={sectionId}
                onClick={(event) => {
                  event.stopPropagation(); // Prevent triggering onNonSectionClick
                  onSectionClick(sectionId); // Call onSectionClick with the section ID
                }}
              >
                <div className="device-section-box" title={section} />
                <span className="device-section-name left">{generateAcronym(section)}</span>
              </div>
            );
          })}
        </div>
        {/* Right side sections */}
        <div className="device-side right">
          {rightSections.map((section, index) => {
            const sectionId = `${name}-right-${index}`;
            return (
              // biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
<div
                key={sectionId}
                className={`device-section ${selectedSections.includes(sectionId) ? 'selected' : ''}`}
                data-dp-section-id={sectionId}
                onClick={(event) => {
                  event.stopPropagation(); // Prevent triggering onNonSectionClick
                  onSectionClick(sectionId); // Call onSectionClick with the section ID
                }}
              >
                <span className="device-section-name right">{generateAcronym(section)}</span>
                <div className="device-section-box" title={section} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Device;

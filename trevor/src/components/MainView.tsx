import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Section, Connection } from '../App';

interface MainViewProps {
  onSectionDoubleClick: (section: Section) => void;
  onSectionClick: (section: Section) => void;
  yellowModeSection: Section | null;
  connections: Connection[];
}

interface PositionedSection extends Section {
  position: 'left' | 'right' | 'top' | 'bottom';
}

interface PositionedDevice {
  id: string;
  name: string;
  sections: PositionedSection[];
}

const MainView: React.FC<MainViewProps> = ({
  onSectionDoubleClick,
  onSectionClick,
  yellowModeSection,
  connections,
}) => {
  const ROW_HEIGHT = 140;
  const [devices, setDevices] = useState<(PositionedDevice | null)[][]>(() => {
    const rows = Array(Math.floor(window.innerHeight / ROW_HEIGHT)).fill(null).map(() => []);
    rows[0] = [
      {
        id: '1',
        name: 'dev1',
        sections: [
          { id: 's1', name: 'sec1', parameters: [{ id: 'p1', name: 'param1' }], position: 'left' },
          { id: 's2', name: 'sec2', parameters: [{ id: 'p2', name: 'param2' }], position: 'right' },
        ],
      },
      {
        id: '2',
        name: 'dev2',
        sections: [
          { id: 's3', name: 'sec3', parameters: [{ id: 'p3', name: 'param3' }], position: 'left' },
          { id: 's4', name: 'sec4', parameters: [{ id: 'p4', name: 'param4' }], position: 'right' },
        ],
      },
    ];
    rows[1] = [
      {
        id: '3',
        name: 'dev3',
        sections: [
          { id: 's5', name: 'sec5', parameters: [{ id: 'p5', name: 'param5' }], position: 'left' },
          { id: 's6', name: 'sec6', parameters: [{ id: 'p6', name: 'param6' }], position: 'right' },
        ],
      },
    ];
    return rows;
  });
  const [selectedDevice, setSelectedDevice] = useState<PositionedDevice | null>(null);
  const dragItem = useRef<{ row: number; index: number } | null>(null);
  const dragOverItem = useRef<{ row: number; index: number } | null>(null);
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const svgRef = useRef<SVGSVGElement>(null);
  const [linePositions, setLinePositions] = useState<{ [key: string]: { x1: number; y1: number; x2: number; y2: number } }>({});

  const updatePositions = useCallback(() => {
    const newDevices = devices.map(row => row.map(device => {
      if (!device) return null;
      const newSections: PositionedSection[] = [...device.sections];

      const deviceConnections = connections.filter(conn =>
        device.sections.some(s => s.id === conn.from.sectionId || s.id === conn.to.sectionId)
      );

      deviceConnections.forEach(conn => {
        const fromIndex = newSections.findIndex(s => s.id === conn.from.sectionId);
        const toIndex = newSections.findIndex(s => s.id === conn.to.sectionId);

        if (fromIndex !== -1 && toIndex !== -1) return;

        const sectionIndex = fromIndex !== -1 ? fromIndex : toIndex;
        const otherDevice = devices.flat().find(d => d && d.sections.some(s =>
          s.id === (fromIndex !== -1 ? conn.to.sectionId : conn.from.sectionId)
        ));

        if (!otherDevice) return;

        const section = newSections[sectionIndex];
        const fromRow = devices.findIndex(row => row.includes(device));
        const toRow = devices.findIndex(row => row.includes(otherDevice));
        const fromCol = devices[fromRow].indexOf(device);
        const toCol = devices[toRow].indexOf(otherDevice);

        if (fromCol < toCol) {
          section.position = 'right';
        } else if (fromCol > toCol) {
          section.position = 'left';
        } else if (fromRow < toRow) {
          section.position = 'bottom';
        } else if (fromRow > toRow) {
          section.position = 'top';
        }

        const hasLeft = deviceConnections.some(c => {
          const target = c.from.sectionId === section.id ? c.to.sectionId : c.from.sectionId;
          const targetDevice = devices.flat().find(d => d && d.sections.some(s => s.id === target));
          return targetDevice && devices.findIndex(r => r.includes(targetDevice)) < fromRow;
        });
        const hasRight = deviceConnections.some(c => {
          const target = c.from.sectionId === section.id ? c.to.sectionId : c.from.sectionId;
          const targetDevice = devices.flat().find(d => d && d.sections.some(s => s.id === target));
          return targetDevice && devices.findIndex(r => r.includes(targetDevice)) > fromRow;
        });

        if (hasLeft && hasRight) {
          section.position = fromRow < toRow ? 'bottom' : 'top';
        }
      });

      return { ...device, sections: newSections };
    }));

    return JSON.stringify(newDevices) === JSON.stringify(devices) ? devices : newDevices; // Only return new if changed
  }, [devices, connections]);

  const updateLinePositions = useCallback(() => {
    if (!svgRef.current || !svgRef.current.parentElement) return;

    const parentRect = svgRef.current.parentElement.getBoundingClientRect();
    const newPositions: { [key: string]: { x1: number; y1: number; x2: number; y2: number } } = {};

    connections.forEach((conn, index) => {
      const fromSection = sectionRefs.current.get(conn.from.sectionId);
      const toSection = sectionRefs.current.get(conn.to.sectionId);
      if (fromSection && toSection) {
        const fromRect = fromSection.getBoundingClientRect();
        const toRect = toSection.getBoundingClientRect();
        newPositions[index] = {
          x1: fromRect.left - parentRect.left + fromRect.width / 2,
          y1: fromRect.top - parentRect.top + fromRect.height / 2,
          x2: toRect.left - parentRect.left + toRect.width / 2,
          y2: toRect.top - parentRect.top + toRect.height / 2,
        };
      }
    });

    setLinePositions(prev =>
      JSON.stringify(newPositions) === JSON.stringify(prev) ? prev : newPositions
    );
  }, [connections]);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, row: number, index: number) => {
    dragItem.current = { row, index };
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, row: number, index?: number) => {
    e.preventDefault();
    if (index !== undefined) {
      dragOverItem.current = { row, index };
    } else {
      dragOverItem.current = { row, index: devices[row].length };
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, row: number) => {
    e.preventDefault();
    if (!dragItem.current || !dragOverItem.current) return;

    const { row: fromRow, index: fromIndex } = dragItem.current;
    const { row: toRow, index: toIndex } = dragOverItem.current;

    const newDevices = devices.map(row => [...row]);
    const draggedDevice = newDevices[fromRow][fromIndex];

    newDevices[fromRow].splice(fromIndex, 1);
    newDevices[toRow].splice(toIndex, 0, draggedDevice);

    setDevices(newDevices);
    setTimeout(() => {
      const updatedDevices = updatePositions();
      setDevices(updatedDevices);
      updateLinePositions();
    }, 0);

    dragItem.current = null;
    dragOverItem.current = null;
  };

  const setSectionRef = (sectionId: string, element: HTMLDivElement | null) => {
    if (element) {
      sectionRefs.current.set(sectionId, element);
      requestAnimationFrame(updateLinePositions); // Only update lines, not devices
    }
  };

  useEffect(() => {
    const handleResize = () => {
      const updatedDevices = updatePositions();
      setDevices(updatedDevices);
      updateLinePositions();
    };
    updateLinePositions(); // Initial line positions
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [connections, updateLinePositions, updatePositions]);

  useEffect(() => {
    if (svgRef.current && svgRef.current.parentElement) {
      const parent = svgRef.current.parentElement;
      svgRef.current.setAttribute('width', `${parent.clientWidth}`);
      svgRef.current.setAttribute('height', `${parent.clientHeight}`);
    }
  }, [devices]);

  return (
    <div className="main-view">
      <div className="left-panel">
        <svg ref={svgRef} className="connection-lines" style={{ position: 'absolute', pointerEvents: 'none' }}>
          {Object.entries(linePositions).map(([index, pos]) => (
            <line
              key={index}
              x1={pos.x1}
              y1={pos.y1}
              x2={pos.x2}
              y2={pos.y2}
              stroke="#000080"
              strokeWidth="2"
            />
          ))}
        </svg>
        {devices.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className="device-row"
            onDragOver={(e) => handleDragOver(e, rowIndex)}
            onDrop={(e) => handleDrop(e, rowIndex)}
          >
            {row.map((device, devIndex) => device && (
              <div
                key={device.id}
                className="device"
                draggable
                onDragStart={(e) => handleDragStart(e, rowIndex, devIndex)}
                onDragOver={(e) => handleDragOver(e, rowIndex, devIndex)}
                onDrop={(e) => handleDrop(e, rowIndex)}
                onClick={() => setSelectedDevice(device)}
              >
                <div className="section-group top">
                  {device.sections.filter(s => s.position === 'top').map((section) => (
                    <div
                      key={section.id}
                      className="section"
                      ref={(el) => setSectionRef(section.id, el)}
                      style={{ backgroundColor: yellowModeSection?.id === section.id ? 'yellow' : '#d3d3d3' }}
                      onClick={(e) => { e.stopPropagation(); onSectionClick(section); }}
                      onDoubleClick={(e) => { e.stopPropagation(); onSectionDoubleClick(section); }}
                    >
                      <span className="section-name top">{section.name}</span>
                    </div>
                  ))}
                </div>
                <div className="middle-section">
                  <div className="section-group left">
                    {device.sections.filter(s => s.position === 'left').map((section) => (
                      <div
                        key={section.id}
                        className="section"
                        ref={(el) => setSectionRef(section.id, el)}
                        style={{ backgroundColor: yellowModeSection?.id === section.id ? 'yellow' : '#d3d3d3' }}
                        onClick={(e) => { e.stopPropagation(); onSectionClick(section); }}
                        onDoubleClick={(e) => { e.stopPropagation(); onSectionDoubleClick(section); }}
                      >
                        <span className="section-name left">{section.name}</span>
                      </div>
                    ))}
                  </div>
                  <span className="device-name">{device.name}</span>
                  <div className="section-group right">
                    {device.sections.filter(s => s.position === 'right').map((section) => (
                      <div
                        key={section.id}
                        className="section"
                        ref={(el) => setSectionRef(section.id, el)}
                        style={{ backgroundColor: yellowModeSection?.id === section.id ? 'yellow' : '#d3d3d3' }}
                        onClick={(e) => { e.stopPropagation(); onSectionClick(section); }}
                        onDoubleClick={(e) => { e.stopPropagation(); onSectionDoubleClick(section); }}
                      >
                        <span className="section-name right">{section.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="section-group bottom">
                  {device.sections.filter(s => s.position === 'bottom').map((section) => (
                    <div
                      key={section.id}
                      className="section"
                      ref={(el) => setSectionRef(section.id, el)}
                      style={{ backgroundColor: yellowModeSection?.id === section.id ? 'yellow' : '#d3d3d3' }}
                      onClick={(e) => { e.stopPropagation(); onSectionClick(section); }}
                      onDoubleClick={(e) => { e.stopPropagation(); onSectionDoubleClick(section); }}
                    >
                      <span className="section-name bottom">{section.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="right-panel">
        <div className="top-subpanel">
          {selectedDevice && (
            <>
              <h3>{selectedDevice.name}</h3>
              {yellowModeSection && <p>Selected Section: {yellowModeSection.name}</p>}
            </>
          )}
        </div>
        <div className="bottom-subpanel">
          <input type="text" placeholder="Filter connections..." />
          <div className="connections-list">
            {connections.length === 0 ? (
              <p>No connections yet</p>
            ) : (
              connections.map((conn, index) => (
                <div key={index} className="connection-item">
                  {`Sec ${conn.from.sectionId} (Param ${conn.from.paramId}) → Sec ${conn.to.sectionId} (Param ${conn.to.paramId})`}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MainView;
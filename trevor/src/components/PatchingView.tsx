import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Section, Parameter, ScalerConfig } from '../App';

interface PatchingViewProps {
  sections: Section[];
  onAddSection: (section: Section) => void;
  onBackToMain: () => void;
  onConnectionMade: (from: { sectionId: string; paramId: string }, to: { sectionId: string; paramId: string }) => void;
  existingConnections: { from: { sectionId: string; paramId: string }; to: { sectionId: string; paramId: string } }[];
}

interface Connection {
  from: Parameter;
  to: Parameter;
  fromPos: { x: number; y: number };
  toPos: { x: number; y: number };
  scaler?: ScalerConfig;
}

const PatchingView: React.FC<PatchingViewProps> = ({ sections, onBackToMain, onConnectionMade, existingConnections }) => {
  const [selectedParam, setSelectedParam] = useState<Parameter | null>(null);
  const [selectedConnection, setSelectedConnection] = useState<Connection | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const paramRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const svgRef = useRef<SVGSVGElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const updateConnectionPositions = useCallback(() => {
    if (!modalRef.current || !svgRef.current) return;

    const modalRect = modalRef.current.getBoundingClientRect();
    setConnections(prev => {
      const newConnections = prev.map((conn) => {
        const fromEl = paramRefs.current.get(conn.from.id);
        const toEl = paramRefs.current.get(conn.to.id);
        if (fromEl && toEl) {
          const fromRect = fromEl.getBoundingClientRect();
          const toRect = toEl.getBoundingClientRect();
          const fromPos = getEdgePosition(fromEl, toEl, modalRect);
          const toPos = getEdgePosition(toEl, fromEl, modalRect);
          console.log(`Connection ${conn.from.id} → ${conn.to.id}: fromPos=${JSON.stringify(fromPos)}, toPos=${JSON.stringify(toPos)}, fromRect=${JSON.stringify(fromRect)}, toRect=${JSON.stringify(toRect)}`);
          return { ...conn, fromPos, toPos };
        }
        return conn;
      });
      return JSON.stringify(newConnections) === JSON.stringify(prev) ? prev : newConnections;
    });
  }, []);

  useEffect(() => {
    const initialConnections: Connection[] = existingConnections
      .filter(conn =>
        sections.some(s => s.id === conn.from.sectionId) &&
        sections.some(s => s.id === conn.to.sectionId)
      )
      .map((conn) => {
        const fromSection = sections.find(s => s.id === conn.from.sectionId);
        const toSection = sections.find(s => s.id === conn.to.sectionId);
        const fromParam = fromSection?.parameters?.find(p => p.id === conn.from.paramId);
        const toParam = toSection?.parameters?.find(p => p.id === conn.to.paramId);

        if (fromParam && toParam) {
          return {
            from: fromParam,
            to: toParam,
            fromPos: { x: 0, y: 0 },
            toPos: { x: 0, y: 0 },
            scaler: fromParam.scaler || toParam.scaler || undefined,
          };
        }
        return null;
      })
      .filter((c): c is Connection => c !== null);

    setConnections(initialConnections);
    requestAnimationFrame(updateConnectionPositions);
  }, [existingConnections, sections, updateConnectionPositions]);

  const getEdgePosition = (el: HTMLDivElement, targetEl: HTMLDivElement | null, modalRect: DOMRect) => {
    const rect = el.getBoundingClientRect();
    const borderWidth = 2; // From CSS
    const left = rect.left - modalRect.left + borderWidth;
    const right = rect.right - modalRect.left - borderWidth;
    const top = rect.top - modalRect.top + borderWidth;
    const bottom = rect.bottom - modalRect.top - borderWidth;
    const centerX = left + ((right - left) / 2);
    const centerY = top + ((bottom - top) / 2);

    if (!targetEl) {
      console.log(`getEdgePosition: el=${el.id || 'unknown'}, targetEl=null, returning center: x=${centerX}, y=${centerY}`);
      return { x: centerX, y: centerY };
    }

    const targetRect = targetEl.getBoundingClientRect();
    const targetLeft = targetRect.left - modalRect.left + borderWidth;
    const targetRight = targetRect.right - modalRect.left - borderWidth;
    const targetTop = targetRect.top - modalRect.top + borderWidth;
    const targetBottom = targetRect.bottom - modalRect.top - borderWidth;
    const targetCenterX = targetLeft + ((targetRight - targetLeft) / 2);
    const targetCenterY = targetTop + ((targetBottom - targetTop) / 2);

    const dx = targetCenterX - centerX;
    const dy = targetCenterY - centerY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx > absDy) {
      // Horizontal: source goes right/left, target goes opposite
      return { x: dx > 0 ? right : left, y: centerY };
    } else {
      // Vertical: source goes down/up, target goes opposite
      return { x: centerX, y: dy > 0 ? bottom : top };
    }
  };

  const handleParameterClick = (param: Parameter, e: React.MouseEvent<HTMLDivElement>, sectionId: string) => {
    if (!modalRef.current) return;

    const modalRect = modalRef.current.getBoundingClientRect();
    console.log(`handleParameterClick: param=${param.id}, selectedParam=${selectedParam?.id || 'null'}`);
    const position = getEdgePosition(e.currentTarget, selectedParam ? paramRefs.current.get(selectedParam.id) || null : null, modalRect);

    if (!selectedParam) {
      setSelectedParam({ ...param, color: 'yellow' });
      setSelectedConnection(null);
    } else if (selectedParam.id !== param.id) {
      const existingConnection = connections.find(
        conn =>
          (conn.from.id === selectedParam.id && conn.to.id === param.id) ||
          (conn.from.id === param.id && conn.to.id === selectedParam.id)
      );

      if (existingConnection) {
        setConnections(prev => prev.filter(conn => conn !== existingConnection));
        onConnectionMade({ sectionId: sections[0].id, paramId: selectedParam.id }, { sectionId, paramId: param.id });
      } else {
        const selectedEl = paramRefs.current.get(selectedParam.id);
        if (selectedEl) {
          const newConnection: Connection = {
            from: selectedParam,
            to: param,
            fromPos: getEdgePosition(selectedEl, e.currentTarget, modalRect),
            toPos: position,
          };
          setConnections(prev => [...prev, newConnection]);
          onConnectionMade({ sectionId: sections[0].id, paramId: selectedParam.id }, { sectionId, paramId: param.id });
          requestAnimationFrame(updateConnectionPositions);
        }
      }
      setSelectedParam(null);
    }
  };

  const handleLineClick = (conn: Connection) => {
    setSelectedConnection(conn);
    setSelectedParam(null);
  };

  const setParamRef = (paramId: string, element: HTMLDivElement | null) => {
    if (element) {
      paramRefs.current.set(paramId, element);
      requestAnimationFrame(() => {
        if (paramRefs.current.size === sections.flatMap(s => s.parameters || []).length) {
          updateConnectionPositions();
        }
      });
    }
  };

  useEffect(() => {
    if (svgRef.current && modalRef.current) {
      const modal = modalRef.current;
      svgRef.current.setAttribute('width', `${modal.clientWidth}`);
      svgRef.current.setAttribute('height', `${modal.clientHeight}`);
    }
  }, [connections, sections]);

  const toggleScaler = (enable: boolean) => {
    if (selectedConnection) {
      const updatedConnection = {
        ...selectedConnection,
        scaler: enable ? { autoScale: true, min: null, max: null, method: 'lin' } : undefined,
      };
      setConnections(prev =>
        prev.map(conn => (conn.from.id === selectedConnection.from.id && conn.to.id === selectedConnection.to.id ? updatedConnection : conn))
      );
      setSelectedConnection(updatedConnection);
      requestAnimationFrame(updateConnectionPositions);
    }
  };

  const updateScalerConfig = (updates: Partial<ScalerConfig>) => {
    if (selectedConnection && selectedConnection.scaler) {
      const updatedConnection = {
        ...selectedConnection,
        scaler: { ...selectedConnection.scaler, ...updates },
      };
      setConnections(prev =>
        prev.map(conn => (conn.from.id === selectedConnection.from.id && conn.to.id === selectedConnection.to.id ? updatedConnection : conn))
      );
      setSelectedConnection(updatedConnection);
      requestAnimationFrame(updateConnectionPositions);
    }
  };

  const hasScaler = (paramId: string) => {
    return connections.some(conn => conn.from.id === paramId && !!conn.scaler);
  };

  return (
    <div className="patching-modal-overlay">
      <div className="patching-modal" ref={modalRef}>
        <div className="left-panel">
          <div className="header">
            <button className="back-button" onClick={() => { console.log('Close clicked'); onBackToMain(); }}>
              Close
            </button>
          </div>
          <svg ref={svgRef} className="connection-lines" style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
            {connections.map((conn, index) => (
              <line
                key={index}
                x1={conn.fromPos.x}
                y1={conn.fromPos.y}
                x2={conn.toPos.x}
                y2={conn.toPos.y}
                stroke={selectedConnection === conn ? 'red' : 'black'}
                strokeWidth="4"
                onClick={() => handleLineClick(conn)}
              />
            ))}
          </svg>
          <div className="top-subpanel">
            <h3>{sections[0]?.name || 'First Section'} Params</h3>
            <div className="parameters-container">
              {sections[0]?.parameters?.map((param) => (
                <div key={param.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span className="parameter-name" style={{ marginBottom: '4px' }}>{param.name}</span>
                  <div
                    className={`parameter ${hasScaler(param.id) ? 'scaler-outline' : ''}`}
                    ref={(el) => setParamRef(param.id, el)}
                    style={{ backgroundColor: selectedParam?.id === param.id ? 'yellow' : param.color || '#d3d3d3' }}
                    onClick={(e) => handleParameterClick(param, e, sections[0].id)}
                  >
                    {hasScaler(param.id) && <span className="scaler-indicator">S</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bottom-subpanel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div className="parameters-container">
              {sections[1]?.parameters?.map((param) => (
                <div key={param.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div
                    className={`parameter ${hasScaler(param.id) ? 'scaler-outline' : ''}`}
                    ref={(el) => setParamRef(param.id, el)}
                    style={{ backgroundColor: selectedParam?.id === param.id ? 'yellow' : param.color || '#d3d3d3' }}
                    onClick={(e) => handleParameterClick(param, e, sections[1].id)}
                  >
                    {hasScaler(param.id) && <span className="scaler-indicator">S</span>}
                  </div>
                  <span className="parameter-name" style={{ marginTop: '4px' }}>{param.name}</span>
                </div>
              ))}
            </div>
            <h3 style={{ marginTop: '8px', textAlign: 'center' }}>{sections[1]?.name || 'Second Section'} Params</h3>
          </div>
        </div>
        <div className="right-panel">
          <div className="top-subpanel">
            {selectedConnection && (
              <div className="connection-info">
                <h4>Connection: {selectedConnection.from.name} → {selectedConnection.to.name}</h4>
                <div className="scaler-config">
                  <label>
                    <input
                      type="checkbox"
                      checked={!!selectedConnection.scaler}
                      onChange={(e) => toggleScaler(e.target.checked)}
                    />
                    Scaler
                  </label>
                  {selectedConnection.scaler && (
                    <>
                      <label>
                        <input
                          type="checkbox"
                          checked={selectedConnection.scaler.autoScale}
                          onChange={(e) => updateScalerConfig({ autoScale: e.target.checked })}
                        />
                        Auto-scale
                      </label>
                      {!selectedConnection.scaler.autoScale && (
                        <>
                          <input
                            type="text"
                            placeholder="Min"
                            value={selectedConnection.scaler.min ?? ''}
                            onChange={(e) => updateScalerConfig({ min: e.target.value ? parseFloat(e.target.value) : null })}
                          />
                          <input
                            type="text"
                            placeholder="Max"
                            value={selectedConnection.scaler.max ?? ''}
                            onChange={(e) => updateScalerConfig({ max: e.target.value ? parseFloat(e.target.value) : null })}
                          />
                          <select
                            value={selectedConnection.scaler.method || 'lin'}
                            onChange={(e) => updateScalerConfig({ method: e.target.value as 'lin' | 'log' })}
                          >
                            <option value="lin">Linear</option>
                            <option value="log">Logarithmic</option>
                          </select>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="bottom-subpanel">
            <h3>Connections</h3>
            <div className="connections-list">
              {connections.length === 0 ? (
                <p>No connections yet</p>
              ) : (
                connections.map((conn, index) => (
                  <div
                    key={index}
                    className="connection-item"
                    onClick={() => handleLineClick(conn)}
                    style={{ backgroundColor: selectedConnection === conn ? '#e0e0e0' : 'transparent' }}
                  >
                    {conn.from.name} → {conn.to.name}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatchingView;
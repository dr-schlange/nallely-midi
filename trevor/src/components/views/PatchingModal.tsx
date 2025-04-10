import React, { useEffect, useState, useRef } from "react";

const PatchingModal = ({
  onClose,
  firstSection,
  secondSection,
}: {
  onClose: () => void;
  firstSection: { name: string; parameters: string[] } | null;
  secondSection: { name: string; parameters: string[] } | null;
}) => {
  const [selectedParameters, setSelectedParameters] = useState<string[]>([]);
  const [connections, setConnections] = useState<{ from: string; to: string }[]>([]);
  const [selectedConnection, setSelectedConnection] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const [scalerEnabled, setScalerEnabled] = useState(false);
  const [autoScaleEnabled, setAutoScaleEnabled] = useState(true);
  const [minValue, setMinValue] = useState("");
  const [maxValue, setMaxValue] = useState("");
  const [method, setMethod] = useState("lin");
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const handleParameterClick = (param: string) => {
    setSelectedConnection(null); // Deselect the connection
    setSelectedParameters((prev) => {
      if (prev.length === 0) {
        return [param]; // Select the first parameter
      } else if (prev.length === 1) {
        if (prev[0] === param) {
          return []; // Deselect if the same parameter is clicked twice
        }
        const newConnection = { from: prev[0], to: param };
        setConnections((prevConnections) => {
          // Prevent duplicate connections
          if (
            prevConnections.some(
              (connection) =>
                connection.from === newConnection.from &&
                connection.to === newConnection.to
            )
          ) {
            return prevConnections;
          }
          return [...prevConnections, newConnection];
        });
        return []; // Reset selection after creating the connection
      }
      return prev;
    });
  };

  const handleConnectionClick = (connection: { from: string; to: string }) => {
    setSelectedConnection((prev) =>
      prev === connection ? null : connection // Deselect if the same connection is clicked again
    );
  };

  const drawConnections = () => {
    if (!svgRef.current) return;

    const svg = svgRef.current;
    svg.innerHTML = ""; // Clear existing arrows

    connections.forEach((connection) => {
      const fromElement = document.querySelector(`[data-param-id="${connection.from}"]`);
      const toElement = document.querySelector(`[data-param-id="${connection.to}"]`);

      if (fromElement && toElement) {
        const fromRect = fromElement.getBoundingClientRect();
        const toRect = toElement.getBoundingClientRect();

        const svgRect = svg.getBoundingClientRect();

        let fromX, fromY, toX, toY;

        if (fromRect.top === toRect.top) {
          // Same panel, draw left to right or right to left
          fromX = fromRect.right - svgRect.left; // Right side of the source
          fromY = fromRect.top + fromRect.height / 2 - svgRect.top; // Center vertically
          toX = toRect.left - svgRect.left; // Left side of the target
          toY = toRect.top + toRect.height / 2 - svgRect.top; // Center vertically
        } else {
          // Different panels, draw bottom to top or top to bottom
          fromX = fromRect.left + fromRect.width / 2 - svgRect.left; // Center horizontally
          fromY =
            fromRect.bottom < toRect.top
              ? fromRect.bottom - svgRect.top // Bottom side of the source parameter
              : fromRect.top - svgRect.top; // Top side of the source parameter

          toX = toRect.left + toRect.width / 2 - svgRect.left; // Center horizontally
          toY =
            fromRect.bottom < toRect.top
              ? toRect.top - svgRect.top // Top side of the target parameter
              : toRect.bottom - svgRect.top; // Bottom side of the target parameter
        }

        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", fromX.toString());
        line.setAttribute("y1", fromY.toString());
        line.setAttribute("x2", toX.toString());
        line.setAttribute("y2", toY.toString());
        line.setAttribute("stroke", "orange");
        line.setAttribute("stroke-width", "2");
        line.setAttribute("marker-end", "url(#retro-arrowhead)");
        line.addEventListener("click", () => handleConnectionClick(connection)); // Add click event

        svg.appendChild(line);
      }
    });
  };

  useEffect(() => {
    drawConnections();
  }, [connections]);

  return (
    <div className="patching-modal">
      <div className="modal-header">
        <button className="close-button" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="modal-body">
        <svg className="connection-svg" ref={svgRef}>
          <defs>
            <marker
              id="retro-arrowhead"
              markerWidth="10"
              markerHeight="10"
              refX="7"
              refY="5"
              orient="auto"
            >
              <polygon points="0 0, 10 5, 0 10, 3 5" fill="orange" /> {/* Retro-style arrowhead */}
            </marker>
          </defs>
        </svg>
        <div className="left-panel">
          <div className="top-left-panel">
            <h3>{firstSection?.name || "First Section"}</h3>
            <div className="parameters-grid">
              {firstSection?.parameters.map((param, index) => (
                <div
                  key={index}
                  className={`parameter ${
                    selectedParameters.includes(param) ? "selected" : ""
                  }`}
                  data-param-id={param}
                  onClick={() => handleParameterClick(param)}
                >
                  <span className="parameter-name top">{param}</span>
                  <div className="parameter-box"></div>
                </div>
              ))}
            </div>
          </div>
          <div className="bottom-left-panel">
            <h3>{secondSection?.name || "Second Section"}</h3>
            <div className="parameters-grid">
              {secondSection?.parameters.map((param, index) => (
                <div
                  key={index}
                  className={`parameter ${
                    selectedParameters.includes(param) ? "selected" : ""
                  }`}
                  data-param-id={param}
                  onClick={() => handleParameterClick(param)}
                >
                  <div className="parameter-box"></div>
                  <span className="parameter-name bottom">{param}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="right-panel">
          <div className="top-right-panel">
            {selectedConnection ? (
              <div className="connection-setup">
                <h3>Connection Setup</h3>
                <label>
                  <input
                    type="checkbox"
                    checked={scalerEnabled}
                    onChange={(e) => {
                      setScalerEnabled(e.target.checked);
                      if (!e.target.checked) {
                        setAutoScaleEnabled(true); // Reset auto-scale when scaler is disabled
                      }
                    }}
                  />
                  Scaler
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={autoScaleEnabled}
                    disabled={!scalerEnabled}
                    onChange={(e) => setAutoScaleEnabled(e.target.checked)}
                  />
                  Auto-Scale
                </label>
                <div className="form-group">
                  <label>
                    Min:
                    <input
                      type="text"
                      value={minValue}
                      disabled={!scalerEnabled || autoScaleEnabled}
                      onChange={(e) => setMinValue(e.target.value)}
                    />
                  </label>
                  <label>
                    Max:
                    <input
                      type="text"
                      value={maxValue}
                      disabled={!scalerEnabled || autoScaleEnabled}
                      onChange={(e) => setMaxValue(e.target.value)}
                    />
                  </label>
                </div>
                <label>
                  Method:
                  <select
                    value={method}
                    disabled={!scalerEnabled || autoScaleEnabled}
                    onChange={(e) => setMethod(e.target.value)}
                  >
                    <option value="lin">Lin</option>
                    <option value="log">Log</option>
                  </select>
                </label>
              </div>
            ) : (
              <div className="parameter-info">
                <h3>Parameter Info</h3>
                {selectedParameters.length === 1 && <p>Details about {selectedParameters[0]}</p>}
              </div>
            )}
          </div>
          <div className="bottom-right-panel">
            <h3>Connections</h3>
            <ul className="connections-list">
              {connections.map((connection, index) => (
                <li
                  key={index}
                  onClick={() => handleConnectionClick(connection)}
                  className={`connection-item ${
                    selectedConnection === connection ? "selected" : ""
                  }`}
                >
                  {connection.from} → {connection.to}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatchingModal;

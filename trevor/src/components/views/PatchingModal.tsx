import { useEffect, useState, useRef } from "react";
import type { MidiConnection, MidiDeviceWithSection } from "../../model";
import { useTrevorSelector } from "../../store";
import {
	buildParameterId,
	connectionsOfInterest,
	drawConnection,
} from "../../utils/svgUtils";

const PatchingModal = ({
	onClose,
	firstSection,
	secondSection,
}: {
	onClose: () => void;
	firstSection: MidiDeviceWithSection | null;
	secondSection: MidiDeviceWithSection | null;
}) => {
	const [selectedParameters, setSelectedParameters] = useState<string[]>([]);
	const allConnections = useTrevorSelector(
		(state) => state.nallely.connections,
	);
	const connections = allConnections.filter(
		(f) =>
			connectionsOfInterest(
				f,
				firstSection?.device.id,
				firstSection?.section.parameters[0]?.module_state_name,
			) ||
			connectionsOfInterest(
				f,
				secondSection?.device.id,
				secondSection?.section.parameters[0]?.module_state_name,
			),
	);

	const [selectedConnection, setSelectedConnection] =
		useState<MidiConnection | null>(null);
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
			}
			if (prev.length === 1) {
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
								connection.to === newConnection.to,
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

	const handleConnectionClick = (connection: MidiConnection) => {
		setSelectedConnection(
			(prev) => (prev === connection ? null : connection), // Deselect if the same connection is clicked again
		);
	};

	const drawConnections = () => {
		if (!svgRef.current) return;

		const svg = svgRef.current;
		svg.innerHTML = ""; // Clear existing arrows

		for (const connection of connections) {
			const srcId = buildParameterId(
				connection.src.device,
				connection.src.parameter,
			);
			const destId = buildParameterId(
				connection.dest.device,
				connection.dest.parameter,
			);
			const fromElement = document.querySelector(`[id="${srcId}"]`);
			const toElement = document.querySelector(`[id="${destId}"]`);
			drawConnection(svg, fromElement, toElement);
		}
	};

	useEffect(() => {
		drawConnections();
	}, [connections]);

	useEffect(() => {
		const handleResize = () => {
			drawConnections();
		};

		const observer = new ResizeObserver(handleResize);
		if (svgRef.current) {
			observer.observe(svgRef.current.parentElement as HTMLElement);
		}

		return () => {
			observer.disconnect();
		};
	}, [connections]);

	return (
		<div className="patching-modal">
			<div className="modal-header">
				<button type="button" className="close-button" onClick={onClose}>
					Close
				</button>
			</div>
			<div className="modal-body">
				<svg className="connection-svg" ref={svgRef}>
					<title>Connection diagram</title>
					<defs>
						<marker
							id="retro-arrowhead"
							markerWidth="10"
							markerHeight="10"
							refX="7"
							refY="5"
							orient="auto"
						>
							<polygon points="0 0, 10 5, 0 10, 3 5" fill="orange" />{" "}
							{/* Retro-style arrowhead */}
						</marker>
					</defs>
				</svg>
				<div className="left-panel">
					<div className="top-left-panel">
						<h3>
							{firstSection?.device.meta.name} {firstSection?.section.name}
						</h3>
						<div className="parameters-grid">
							{firstSection?.section.parameters.map((param, index) => (
								<div
									key={param.name}
									className={`parameter ${
										selectedParameters.includes(param.name) ? "selected" : ""
									}`}
									id={buildParameterId(firstSection.device.id, param)}
									onClick={() => handleParameterClick(param.name)}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											handleParameterClick(param.name);
										}
									}}
								>
									<span className="parameter-name top">{param.name}</span>
									<div className="parameter-box" />
								</div>
							))}
						</div>
					</div>
					<div className="bottom-left-panel">
						<div className="parameters-grid">
							{secondSection?.section.parameters.map((param, index) => (
								<div
									key={param.name}
									className={`parameter ${
										selectedParameters.includes(param.name) ? "selected" : ""
									}`}
									id={buildParameterId(secondSection.device.id, param)}
									onClick={() => handleParameterClick(param.name)}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											handleParameterClick(param.name);
										}
									}}
									onKeyUp={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
										}
									}}
								>
									<div className="parameter-box" />
									<span className="parameter-name bottom">{param.name}</span>
								</div>
							))}
						</div>
						<h3>
							{secondSection?.device.meta.name} {secondSection?.section.name}
						</h3>
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
								{selectedParameters.length === 1 && (
									<p>Details about {selectedParameters[0]}</p>
								)}
							</div>
						)}
					</div>
					<div className="bottom-right-panel">
						<h3>Connections</h3>
						<ul className="connections-list">
							{connections.map((connection, index) => (
								<li
									key={`${connection.src.parameter.module_state_name}-${connection.src.parameter.name}-${connection.dest.parameter.module_state_name}-${connection.dest.parameter.name}`}
									onClick={() => handleConnectionClick(connection)}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											handleConnectionClick(connection);
										}
									}}
									onKeyUp={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
										}
									}}
									className={`connection-item ${
										selectedConnection === connection ? "selected" : ""
									}`}
								>
									{`${connection.src.parameter.module_state_name}[${connection.src.parameter.name}] → ${connection.dest.parameter.module_state_name}[${connection.dest.parameter.name}]`}
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

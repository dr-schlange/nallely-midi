import { useEffect, useState, useRef } from "react";
import type {
	MidiConnection,
	MidiDevice,
	MidiDeviceWithSection,
	MidiParameter,
} from "../model";
import { useTrevorSelector } from "../store";
import {
	buildParameterId,
	connectionsOfInterest,
	drawConnection,
	findConnectorElement,
} from "../utils/svgUtils";
import { ScalerForm } from "./ScalerForm";
import { useTrevorWebSocket } from "../websocket";

const PatchingModal = ({
	onClose,
	firstSection,
	secondSection,
}: {
	onClose: () => void;
	firstSection: MidiDeviceWithSection | null;
	secondSection: MidiDeviceWithSection | null;
}) => {
	const [selectedParameters, setSelectedParameters] = useState<
		{ device: MidiDevice; parameter: MidiParameter }[]
	>([]);
	const websocket = useTrevorWebSocket();
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

	const handleParameterClick = (device: MidiDevice, param: MidiParameter) => {
		setSelectedConnection(null); // Deselect the connection
		setSelectedParameters((prev) => {
			if (prev.length === 0) {
				return [{ device, parameter: param }]; // Select the first parameter
			}
			if (prev.length === 1) {
				if (prev[0].parameter === param) {
					return []; // Deselect if the same parameter is clicked twice
				}
				websocket?.associateParameters(
					prev[0].device,
					prev[0].parameter,
					device,
					param,
				);
				return []; // Reset selection after creating the connection
			}
			return prev;
		});
	};

	const handleConnectionClick = (connection: MidiConnection) => {
		setSelectedConnection((prev) => (prev === connection ? null : connection));
	};

	const drawConnections = () => {
		if (!svgRef.current) return;

		const svg = svgRef.current;
		for (const line of svg.querySelectorAll("line")) {
			line.remove();
		}

		for (const connection of connections) {
			const [fromElement, toElement] = findConnectorElement(connection);
			drawConnection(
				svg,
				fromElement,
				toElement,
				connection === selectedConnection,
			);
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
							markerUnits="strokeWidth"
						>
							<polygon points="0 0, 10 5, 0 10, 3 5" fill="orange" />{" "}
						</marker>
					</defs>
				</svg>
				<div className="left-panel">
					<div className="top-left-panel">
						<h3>
							{firstSection?.device.meta.name} {firstSection?.section.name}
						</h3>
						<div className="parameters-grid">
							{firstSection?.section.parameters.map((param) => (
								<div
									key={param.name}
									className={`parameter ${
										selectedParameters[0]?.parameter === param ? "selected" : ""
									}`}
									id={buildParameterId(firstSection.device.id, param)}
									onClick={() =>
										handleParameterClick(firstSection.device, param)
									}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											handleParameterClick(firstSection.device, param);
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
							{secondSection?.section.parameters.map((param) => (
								<div
									key={param.name}
									className={`parameter ${
										selectedParameters[0]?.parameter === param ? "selected" : ""
									}`}
									id={buildParameterId(secondSection.device.id, param)}
									onClick={() =>
										handleParameterClick(secondSection.device, param)
									}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											handleParameterClick(secondSection.device, param);
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
							<ScalerForm connection={selectedConnection} />
						) : (
							<div className="parameter-info">
								<h3>Parameter Info</h3>
								{selectedParameters.length === 1 && (
									<p>Details about {selectedParameters[0].name}</p>
								)}
							</div>
						)}
					</div>
					<div className="bottom-right-panel">
						<h3>Connections</h3>
						<ul className="connections-list">
							{connections.map((connection) => (
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

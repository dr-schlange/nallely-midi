import { useEffect, useState, useRef } from "react";
import type {
	MidiConnection,
	MidiDevice,
	MidiDeviceWithSection,
	MidiParameter,
	PadOrKey,
	PadsOrKeys,
	VirtualDevice,
	VirtualDeviceWithSection,
	VirtualParameter,
} from "../../model";
import { useTrevorSelector } from "../../store";
import { drawConnection, findConnectorElement } from "../../utils/svgUtils";
import { ScalerForm } from "../ScalerForm";
import { useTrevorWebSocket } from "../../websockets/websocket";
import {
	buildParameterId,
	connectionId,
	connectionsOfInterest,
	isPadOrdKey,
	isPadsOrdKeys,
	isVirtualParameter,
} from "../../utils/utils";
import { MidiGrid } from "../MidiGrid";

const parameterUUID = (
	device: MidiDevice | number | VirtualDevice,
	parameter: MidiParameter | VirtualParameter | PadsOrKeys | PadOrKey,
) => {
	const id = typeof device === "object" ? device.id : device;
	let parameterName = undefined;
	if (isVirtualParameter(parameter)) {
		parameterName = parameter.cv_name;
	} else if (isPadsOrdKeys(parameter)) {
		parameterName = "all_keys_or_pads";
	} else if (isPadOrdKey(parameter)) {
		parameterName = parameter.note;
	} else {
		parameterName = parameter.name;
	}
	return `${id}::${parameter.section_name}::${parameterName}`;
};

const PatchingModal = ({
	onClose,
	firstSection,
	secondSection,
}: {
	onClose: () => void;
	firstSection: MidiDeviceWithSection | VirtualDeviceWithSection | null;
	secondSection: MidiDeviceWithSection | VirtualDeviceWithSection | null;
}) => {
	const [selectedParameters, setSelectedParameters] = useState<
		{
			device: MidiDevice | VirtualDevice;
			parameter: MidiParameter | VirtualParameter | PadsOrKeys | PadOrKey;
		}[]
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
				firstSection?.section.parameters[0]?.section_name,
			) ||
			connectionsOfInterest(
				f,
				secondSection?.device.id,
				secondSection?.section.parameters[0]?.section_name,
			),
	);

	const [selectedConnection, setSelectedConnection] = useState<string | null>(
		null,
	);
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

	const handleParameterClick = (
		device: MidiDevice | VirtualDevice,
		param: MidiParameter | VirtualParameter,
	) => {
		setSelectedConnection(null); // Deselect the connection
		if (selectedParameters.length === 0) {
			setSelectedParameters([{ device, parameter: param }]);
			return;
		}
		if (selectedParameters[0].parameter === param) {
			setSelectedParameters([]);
			return; // Deselect if the same parameter is clicked twice
		}
		const firstParameter = selectedParameters[0];
		const firstParameterUUID = parameterUUID(
			firstParameter.device,
			firstParameter.parameter,
		);
		websocket?.associateParameters(
			firstParameter.device,
			firstParameter.parameter,
			device,
			param,
			connections.find(
				(c) =>
					parameterUUID(c.src.device, c.src.parameter) === firstParameterUUID &&
					parameterUUID(c.dest.device, c.dest.parameter) ===
						parameterUUID(device, param),
			) !== undefined, // if a connection already exist, we remove it
		);
		setSelectedParameters([]);
	};

	const handleConnectionClick = (connection: MidiConnection) => {
		if (selectedConnection === connectionId(connection)) {
			setSelectedConnection(null);
			return;
		}
		setSelectedConnection(connectionId(connection));
	};

	const handleKeySectionClick = (
		device: MidiDevice | VirtualDevice,
		keys: PadsOrKeys,
	) => {
		setSelectedConnection(null); // Deselect the connection
		if (selectedParameters.length === 0) {
			setSelectedParameters([{ device, parameter: keys }]);
			return;
		}
		const firstParameter = selectedParameters[0];
		if (
			firstParameter.device === device &&
			firstParameter.parameter.section_name === keys.section_name
		) {
			setSelectedParameters([]);
			return; // Deselect if the same parameter is clicked twice
		}
		const firstParameterUUID = parameterUUID(
			firstParameter.device,
			firstParameter.parameter,
		);
		websocket?.associateParameters(
			firstParameter.device,
			firstParameter.parameter,
			device,
			keys,
			connections.find(
				(c) =>
					parameterUUID(c.src.device, c.src.parameter) === firstParameterUUID &&
					parameterUUID(c.dest.device, c.dest.parameter) ===
						parameterUUID(device, keys),
			) !== undefined, // if a connection already exist, we remove it
		);
		setSelectedParameters([]);
	};

	const handleKeyClick = (
		device: MidiDevice | VirtualDevice,
		key: PadOrKey,
	) => {
		setSelectedConnection(null); // Deselect the connection
		if (selectedParameters.length === 0) {
			setSelectedParameters([{ device, parameter: key }]);
			return;
		}
		const firstParameter = selectedParameters[0];
		if (
			firstParameter.device === device &&
			firstParameter.parameter.section_name === key.section_name &&
			(firstParameter.parameter as PadOrKey).note === key.note
		) {
			setSelectedParameters([]);
			return; // Deselect if the same parameter is clicked twice
		}
		const firstParameterUUID = parameterUUID(
			firstParameter.device,
			firstParameter.parameter,
		);
		websocket?.associateParameters(
			firstParameter.device,
			firstParameter.parameter,
			device,
			key,
			connections.find(
				(c) =>
					parameterUUID(c.src.device, c.src.parameter) === firstParameterUUID &&
					parameterUUID(c.dest.device, c.dest.parameter) ===
						parameterUUID(device, key),
			) !== undefined, // if a connection already exist, we remove it
		);
		setSelectedParameters([]);
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
				connectionId(connection) === selectedConnection,
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

	const selectedConnectionInstance = allConnections.find(
		(c) => connectionId(c) === selectedConnection,
	);
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
							{firstSection?.device.repr} {firstSection?.section.name}
						</h3>
						<div className="parameters-grid left">
							{firstSection?.section.pads_or_keys && (
								<MidiGrid
									device={firstSection.device}
									section={firstSection.section}
									onKeysClick={handleKeySectionClick}
									onNoteClick={handleKeyClick}
									highlight={
										(selectedParameters[0]?.parameter as PadOrKey)?.note ||
										selectedParameters[0]?.parameter.section_name
									}
								/>
							)}
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
									<div className="parameter-box" />
									<span className="parameter-name left">{param.name}</span>
								</div>
							))}
						</div>
					</div>
					<div className="bottom-left-panel">
						<h3>
							{secondSection?.device.repr} {secondSection?.section.name}
						</h3>
						<div className="parameters-grid right">
							{secondSection?.section.pads_or_keys && (
								<MidiGrid
									device={secondSection.device}
									section={secondSection.section}
									onKeysClick={handleKeySectionClick}
									onNoteClick={handleKeyClick}
									highlight={
										(selectedParameters[0]?.parameter as PadOrKey)?.note ||
										selectedParameters[0]?.parameter.section_name
									}
								/>
							)}

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
									<span className="parameter-name right">{param.name}</span>
								</div>
							))}
						</div>
					</div>
				</div>
				<div className="right-panel">
					<div className="top-right-panel">
						{selectedConnection && selectedConnectionInstance ? (
							<ScalerForm connection={selectedConnectionInstance} />
						) : (
							<div className="parameter-info">
								<h3>Parameter Info</h3>
								{selectedParameters.length === 1 && (
									<p>
										{(selectedParameters[0].parameter as MidiParameter)?.name ||
											(isPadsOrdKeys(selectedParameters[0].parameter) &&
												`Section ${(selectedParameters[0].parameter as PadsOrKeys).section_name}`) ||
											`Key/Pad ${(selectedParameters[0].parameter as PadOrKey).note}`}
									</p>
								)}
							</div>
						)}
					</div>
					<div className="bottom-right-panel">
						<h3>Connections</h3>
						<ul className="connections-list">
							{connections.map((connection) => {
								const srcSection = connection.src.parameter.section_name;
								const dstSection = connection.dest.parameter.section_name;
								return (
									<li
										key={`${connection.src.repr}-${connection.src.parameter.section_name}-${connection.src.parameter.name}-${connection.dest.repr}-${connection.dest.parameter.section_name}-${connection.dest.parameter.name}`}
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
											selectedConnection === connectionId(connection)
												? "selected"
												: ""
										}`}
									>
										{`${connection.src.repr}${srcSection === "__virtual__" ? "" : `.${srcSection}`}[${connection.src.parameter.name}] → ${connection.dest.repr}${dstSection === "__virtual__" ? "" : `.${dstSection}`}[${connection.dest.parameter.name}]`}
									</li>
								);
							})}
						</ul>
					</div>
				</div>
			</div>
		</div>
	);
};

export default PatchingModal;

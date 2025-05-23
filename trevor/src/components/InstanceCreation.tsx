import { useEffect, useMemo, useRef, useState } from "react";
import MidiDeviceComponent from "./DeviceComponent";
import { useTrevorSelector } from "../store";
import { drawConnection } from "../utils/svgUtils";
import { useTrevorWebSocket, WsStatus } from "../websockets/websocket";
import type { MidiDevice } from "../model";
import { SettingsModal } from "./modals/SettingsModal";

const truncateName = (name: string, maxLength: number) => {
	return name.length > maxLength ? `${name.slice(0, maxLength)}...` : name;
};

interface MidiPort {
	name: string;
	direction: string;
}

const InstanceCreation = () => {
	const svgRef = useRef<SVGSVGElement | null>(null);

	const trevorSocket = useTrevorWebSocket();
	const midiInPorts = useTrevorSelector((state) => state.nallely.input_ports);
	const midiOutPorts = useTrevorSelector((state) => state.nallely.output_ports);
	const devices = useTrevorSelector((state) => state.nallely.midi_devices);
	const virtualClasses = useTrevorSelector(
		(state) => state.nallely.classes.virtual,
	);
	const midiClasses = useTrevorSelector((state) => state.nallely.classes.midi);
	const deviceClasses = useMemo(
		() => [...midiClasses, ...virtualClasses],
		[midiClasses, virtualClasses],
	);
	const [selectedDevice, setSelectedDevice] = useState<MidiDevice | null>();
	const [selectedPort, setSelectedPort] = useState<MidiPort | null>();

	const [isExpanded, setIsExpanded] = useState<boolean>(true);
	const websocketStatus = useTrevorSelector((state) => state.general.connected);
	const connectionUrl = useTrevorSelector(
		(state) => state.general.trevorWebsocketURL,
	);

	const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

	useEffect(() => {
		updateConnections();
	}, [devices]);

	const updateConnections = () => {
		if (!svgRef.current) {
			return;
		}
		const svg = svgRef.current;
		for (const line of svg.querySelectorAll("line")) {
			line.remove();
		}
		for (const device of devices) {
			const fromElement = document.querySelector(`[id="${device.id}"]`);
			const toInput = document.querySelector(
				`[id="input-${device.ports.input}"]`,
			);
			const toOutput = document.querySelector(
				`[id="output-${device.ports.output}"]`,
			);
			if (toInput) {
				drawConnection(svg, fromElement, toInput);
			}
			if (toOutput) {
				drawConnection(svg, toOutput, fromElement);
			}
		}
	};

	useEffect(() => {
		const handleResize = () => {
			updateConnections();
		};

		const observer = new ResizeObserver(handleResize);
		if (svgRef.current) {
			observer.observe(svgRef.current.parentElement as HTMLElement);
		}

		return () => {
			observer.disconnect();
		};
	}, [devices]);

	const establishConnection = (device: MidiDevice, port: MidiPort) => {
		trevorSocket?.associatePort(device, port.name, port.direction);
	};

	const handlePortClick = (port: string, direction: string) => {
		if (selectedPort?.name === port && selectedPort?.direction === direction) {
			setSelectedPort(null);
			return;
		}

		if (selectedDevice) {
			establishConnection(selectedDevice, { name: port, direction });
			setSelectedDevice(null);
		} else {
			setSelectedPort({ name: port, direction });
		}
	};

	const selectDevice = (device: MidiDevice) => {
		if (device === selectedDevice) {
			setSelectedDevice(null);
			return;
		}
		if (selectedPort) {
			establishConnection(device, selectedPort);
			setSelectedPort(null);
		} else {
			setSelectedDevice(device);
		}
	};

	const handleExpand = () => {
		setIsExpanded((prev) => !prev);
	};

	const handleClose = () => {
		setIsSettingsOpen(false);
	};

	const handleSettingsClick = () => {
		setIsSettingsOpen(true);
	};

	const displayWebsocketStatus = () => {
		switch (websocketStatus) {
			case WsStatus.DISCONNECTED:
				return "🔴";
			case WsStatus.CONNECTED:
				return "🟢";
			default:
				return "🟡";
		}
	};

	return (
		<div className="instance-creation">
			<div
				style={{
					display: "flex",
					flexDirection: "row",
					flexWrap: "nowrap",
					alignItems: "center",
				}}
			>
				<button
					style={{
						width: "100%",
						textAlign: "left",
						paddingLeft: "5px",
					}}
					type="button"
					title={isExpanded ? "Collapse panel" : "Expand panel"}
					onClick={() => handleExpand()}
				>
					{isExpanded ? "-" : "+"}
				</button>
				<span
					title={
						(websocketStatus === WsStatus.CONNECTED &&
							`Connected to ${connectionUrl}`) ||
						`Not connected, trying on ${connectionUrl}`
					}
				>
					{displayWebsocketStatus()}
				</span>
				<button
					style={{ fontSize: "larger", padding: "0px" }}
					type="button"
					title="settings"
					onClick={handleSettingsClick}
				>
					⚙
				</button>
			</div>
			{isExpanded && (
				<>
					<div className="instance-creation-main-panel">
						<div style={{ display: "flex" }}>
							<div className="instance-creation-midi-output">
								<h3>MIDI Output</h3>
								<div className="midi-ports-grid">
									{midiInPorts.map((port) => (
										// biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
										<div
											key={port}
											className="midi-port"
											title={port}
											onClick={() => handlePortClick(port, "output")}
										>
											<span className="midi-port-name">
												{truncateName(port, 8)}
											</span>
											<div
												className="midi-port-circle"
												id={`output-${port}`}
												style={{
													borderColor:
														selectedPort?.name === port &&
														selectedPort?.direction
															? "yellow"
															: "",
												}}
											/>
										</div>
									))}
								</div>
							</div>
							<div className="instance-creation-midi-inputs">
								<h3>MIDI Inputs</h3>
								<div className="midi-ports-grid">
									{midiOutPorts.map((port) => (
										// biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
										<div
											key={port}
											className="midi-port"
											title={port}
											onClick={() => handlePortClick(port, "input")}
										>
											<span className="midi-port-name">
												{truncateName(port, 8)}
											</span>
											<div
												className="midi-port-circle"
												id={`input-${port}`}
												style={{
													borderColor:
														selectedPort?.name === port &&
														selectedPort?.direction
															? "yellow"
															: "",
												}}
											/>
										</div>
									))}
								</div>
							</div>
						</div>

						<div
							className="device-class-left-panel device-list"
							onScroll={() => updateConnections()}
						>
							{devices.map((device, i) => (
								<MidiDeviceComponent
									classConnections
									key={device.id}
									device={device}
									selected={selectedDevice === device}
									onDeviceClick={() => selectDevice(device)}
								/>
							))}
						</div>
					</div>
					<svg className="connection-svg" ref={svgRef}>
						<title>MIDI Device Port Mapping</title>
						<defs>
							<marker
								id="retro-arrowhead"
								markerWidth="6"
								markerHeight="6"
								refX="5"
								refY="3"
								orient="auto"
								markerUnits="strokeWidth"
							>
								<polygon
									points="0,0 5,3 0,6"
									fill="gray"
									stroke="white"
									strokeWidth="1"
									strokeOpacity="0.3"
								/>
							</marker>
							<marker
								id="selected-retro-arrowhead"
								markerWidth="6"
								markerHeight="6"
								refX="5"
								refY="3"
								orient="auto"
								markerUnits="strokeWidth"
							>
								<polygon
									points="0,0 5,3 0,6"
									fill="blue"
									stroke="white"
									strokeWidth="1"
									strokeOpacity="0.8"
								/>
							</marker>
							<marker
								id="bouncy-retro-arrowhead"
								markerWidth="6"
								markerHeight="6"
								refX="5"
								refY="3"
								orient="auto"
								markerUnits="strokeWidth"
							>
								<polygon
									points="0,0 5,3 0,6"
									fill="green"
									stroke="white"
									strokeWidth="1"
									strokeOpacity="0.8"
								/>
							</marker>
						</defs>
					</svg>
				</>
			)}
			{isSettingsOpen && <SettingsModal onClose={handleClose} />}
		</div>
	);
};

export default InstanceCreation;

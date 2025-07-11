import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MidiDeviceComponent from "./DeviceComponent";
import { useTrevorDispatch, useTrevorSelector } from "../store";
import { drawConnection } from "../utils/svgUtils";
import { useTrevorWebSocket, WsStatus } from "../websockets/websocket";
import type { MidiDevice } from "../model";
import { SettingsModal } from "./modals/SettingsModal";
import { setClassCodeMode, setLogMode } from "../store/runtimeSlice";

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
	const [selectedDevice, setSelectedDevice] = useState<MidiDevice | null>();
	const [selectedPort, setSelectedPort] = useState<MidiPort | null>();

	const [isExpanded, setIsExpanded] = useState<boolean>(false);
	const websocketStatus = useTrevorSelector((state) => state.general.connected);
	const connectionUrl = useTrevorSelector(
		(state) => state.general.trevorWebsocketURL,
	);
	const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

	useEffect(() => {
		updateConnections();
	}, [devices]);

	// Handling of the log window START
	const [position, setPosition] = useState({ x: 0, y: 0 });
	const logWindowRef = useRef<HTMLDivElement>(null);
	const dispatch = useTrevorDispatch();
	const [logMessages, setLogMessages] = useState<string>("");
	const logMode = useTrevorSelector((state) => state.runTime.logMode);
	const loggedComponent = useTrevorSelector(
		(state) => state.runTime.loggedComponent,
	);
	const classCodeMode = useTrevorSelector(
		(state) => state.runTime.classCodeMode,
	);

	useEffect(() => {
		const win = logWindowRef.current;
		if (!win) {
			return;
		}
		win.scrollTop = win.scrollHeight;
	}, [logMessages]);

	useEffect(() => {
		if (!loggedComponent) {
			setLogMessages("");
			return;
		}

		const handleMouseMove = (e) => {
			setPosition({ x: e.clientX + 20, y: e.clientY });
		};
		document.addEventListener("mousemove", handleMouseMove);
		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
		};
	}, [loggedComponent]);

	const handleLogMode = () => {
		if (!logMode) {
			document.body.style.cursor = "zoom-in";
		} else {
			document.body.style.cursor = "auto";
		}
		dispatch(setLogMode(!logMode));
	};

	useEffect(() => {
		const onStdoutHandler = (event) => {
			const message = JSON.parse(event.data);

			if (message.command === "stdout") {
				setLogMessages((prev) => `${prev}${message.line}`);
			}
		};

		trevorSocket?.socket?.addEventListener("message", onStdoutHandler);

		return () => {
			trevorSocket?.socket?.removeEventListener("message", onStdoutHandler);
		};
	}, [trevorSocket?.socket]);

	// Handling of the log window END

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
		updateConnections();
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

	const handleClassCodeMode = () => {
		if (!classCodeMode) {
			document.body.style.cursor = "crosshair";
		} else {
			document.body.style.cursor = "auto";
		}
		dispatch(setClassCodeMode(!classCodeMode));
	};

	useEffect(() => {
		if (!classCodeMode) {
			document.body.style.cursor = "auto";
		}
	}, [classCodeMode]);

	return (
		<>
			{loggedComponent && (
				<div
					ref={logWindowRef}
					className="logWindow"
					style={{
						left: `${position.x}px`,
						top: `${position.y}px`,
					}}
				>
					<pre>{logMessages}</pre>
				</div>
			)}
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
						{isExpanded ? "- MIDI IOs" : "+ MIDI IOs"}
					</button>
					<button
						className={classCodeMode ? "active" : ""}
						style={{ padding: "0px", width: "27px", height: "100%" }}
						type="button"
						title="class code"
						onClick={handleClassCodeMode}
					>
						C
					</button>
					<button
						className={logMode ? "active" : ""}
						style={{ fontSize: "larger", padding: "0px" }}
						type="button"
						title="log mode"
						onClick={handleLogMode}
					>
						🔍
					</button>
					<button
						style={{ fontSize: "larger", padding: "0px", width: "27px" }}
						type="button"
						title="settings"
						onClick={handleSettingsClick}
					>
						⚙
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
		</>
	);
};

export default InstanceCreation;

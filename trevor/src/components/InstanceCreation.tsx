/** biome-ignore-all lint/a11y/noStaticElementInteractions: <explanation> */
/** biome-ignore-all lint/correctness/useUniqueElementIds: <explanation> */
/** biome-ignore-all lint/a11y/useKeyWithClickEvents: <explanation> */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MidiDevice } from "../model";
import { useTrevorDispatch, useTrevorSelector } from "../store";
import { setWebsocketURL } from "../store/generalSlice";
import {
	setAssociateMode,
	setClassCodeMode,
	setLogMode,
} from "../store/runtimeSlice";
import { drawConnection } from "../utils/svgUtils";
import { useTrevorWebSocket, WsStatus } from "../websockets/websocket";
import { FriendModal } from "./modals/FriendModal";
import { SettingsModal } from "./modals/SettingsModal";
import { Portal } from "./Portal";
import { Button } from "./widgets/BaseComponents";

interface MidiPort {
	name: string;
	direction: string;
}

const InstanceCreation = () => {
	const svgRef = useRef<SVGSVGElement | null>(null);

	const trevorSocket = useTrevorWebSocket();
	const midiInPorts = useTrevorSelector((state) => state.nallely.input_ports);
	const midiOutPorts = useTrevorSelector((state) => state.nallely.output_ports);
	const currentName = useTrevorSelector((state) => state.nallely.myname);
	const myip = useTrevorSelector((state) => state.general.trevorWebsocketURL);
	const friendsRegister = useTrevorSelector((state) => state.general.friends);
	const devices = useTrevorSelector((state) => state.nallely.midi_devices);
	const [selectedDevice, setSelectedDevice] = useState<MidiDevice | null>();
	const [selectedPort, setSelectedPort] = useState<MidiPort | null>();
	const [isFriendsOpen, setFriendsOpen] = useState(false);
	const friends = useMemo(
		() => Object.values(friendsRegister).map(([name]) => name),
		[friendsRegister],
	);
	const friendIdx = useMemo(
		() => friends.indexOf(currentName),
		[friends, currentName],
	);
	const [prevFriend, nextFriend] = useMemo(() => {
		const friendIPs = Object.keys(friendsRegister);
		if (friendIPs.length === 0) {
			return [[], []];
		}
		const nbFriends = friendIPs.length;
		const idx = friendIdx < 0 ? 0 : friendIdx;
		const nextFriendIdx = (idx + 1) % nbFriends;
		const prevFriendIdx = (nbFriends + (idx - 1)) % nbFriends;
		const prevIP = friendIPs[prevFriendIdx];
		const nextIP = friendIPs[nextFriendIdx];
		const prev = friendsRegister[prevIP];
		const next = friendsRegister[nextIP];
		return [
			[prevIP, prev[1]],
			[nextIP, next[1]],
		];
	}, [friendIdx, friendsRegister]);

	const [isExpanded, setIsExpanded] = useState<boolean>(false);
	const websocketStatus = useTrevorSelector((state) => state.general.connected);
	const connectionUrl = useTrevorSelector(
		(state) => state.general.trevorWebsocketURL,
	);
	const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
	const groupedPorts = useMemo(() => {
		const groups: Record<string, { input: boolean; output: boolean }> = {};
		for (const inPort of midiInPorts) {
			groups[inPort] = {
				input: true,
				output: false,
			};
		}
		for (const outPort of midiOutPorts) {
			if (outPort in groups) {
				groups[outPort].output = true;
			} else {
				groups[outPort] = {
					input: false,
					output: true,
				};
			}
		}
		return groups;
	}, [midiInPorts, midiOutPorts]);

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
	const associateMode = useTrevorSelector(
		(state) => state.runTime.associateMode,
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

	const updateConnections = useCallback(() => {
		if (!svgRef.current) {
			return;
		}
		const svg = svgRef.current;
		for (const line of svg.querySelectorAll("path")) {
			line.remove();
		}
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
				drawConnection(svg, toInput, fromElement);
			}
			if (toOutput) {
				drawConnection(svg, fromElement, toOutput);
			}
		}
	}, [devices]);

	useEffect(() => {
		updateConnections();
	}, [updateConnections]);

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
	}, [updateConnections]);

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

	const handleExpand = useCallback(() => {
		setTimeout(() => updateConnections(), 10);
		setIsExpanded((prev) => !prev);
	}, [updateConnections]);

	const handleClose = useCallback(() => {
		updateConnections();
		setIsSettingsOpen(false);
		setFriendsOpen(false);
	}, [updateConnections]);

	const handleSettingsClick = useCallback(() => {
		updateConnections();
		setIsSettingsOpen(true);
	}, [updateConnections]);

	const statusColor = () => {
		switch (websocketStatus) {
			case WsStatus.DISCONNECTED:
				return "gray";
			case WsStatus.CONNECTED:
				return "mediumseagreen";
			default:
				return "gold";
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

	const toggleAssociateMode = () => {
		dispatch(setAssociateMode(!associateMode));
	};

	const handleFriendClick = () => {
		setFriendsOpen(true);
	};

	const setNextFriend = () => {
		const [ip, port] = nextFriend;
		console.log("Connect on ", ip, port);
		dispatch(setWebsocketURL(`ws://${ip}:${port}`));
	};

	const setPrevFriend = () => {
		const [ip, port] = prevFriend;
		console.log("Connect on ", ip, port);
		dispatch(setWebsocketURL(`ws://${ip}:${port}`));
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
						gap: "1px",
						width: "100%",
					}}
				>
					<Button
						text={isExpanded ? "- MIDI IOs" : "+ MIDI IOs"}
						tooltip={isExpanded ? "Collapse panel" : "Expand panel"}
						variant="big"
						onClick={handleExpand}
						activated={isExpanded}
						style={{
							width: "100%",
							fontSize: "14px",
							textAlign: "left",
							paddingLeft: "4px",
						}}
					/>
					<div
						style={{ display: "flex", flexDirection: "row", fontSize: "14px" }}
					>
						{friends.length > 1 && (
							<Button
								disabled={friends.length <= 1}
								text="<"
								tooltip="prev"
								variant="big"
								onClick={setPrevFriend}
								style={{ border: "2px" }}
							/>
						)}

						<Button
							text={currentName}
							tooltip={`${myip}`}
							variant="big"
							onClick={handleFriendClick}
							style={{
								width: "100%",
								paddingLeft: "4px",
								paddingRight: "4px",
								border: "2px",
							}}
						/>
						{friends.length > 1 && (
							<Button
								disabled={friends.length <= 1}
								text=">"
								tooltip="next"
								variant="big"
								onClick={setNextFriend}
								style={{ border: "2px" }}
							/>
						)}
					</div>
					<Button
						activated={associateMode}
						text={"A"}
						tooltip="Associate mode"
						variant="big"
						onClick={toggleAssociateMode}
					/>
					<Button
						activated={classCodeMode}
						text={"C"}
						tooltip="Class code"
						variant="big"
						onClick={handleClassCodeMode}
					/>
					<Button
						activated={logMode}
						text={"L"}
						tooltip="Log mode"
						variant="big"
						onClick={handleLogMode}
					/>

					<Button
						text={"⚙"}
						tooltip="Settings"
						variant="big"
						onClick={handleSettingsClick}
					/>
					<Button
						disabled
						text="⬤"
						tooltip={
							(websocketStatus === WsStatus.CONNECTED &&
								`Connected to ${connectionUrl}`) ||
							`Not connected, trying on ${connectionUrl}`
						}
						variant="big"
						onClick={handleSettingsClick}
						style={{
							color: statusColor(),
							border: "unset",
							fontSize: "10px",
						}}
					/>
				</div>
				{isExpanded && (
					<>
						<div className="instance-creation-main-panel">
							<div
								style={{ display: "flex", maxHeight: "250px", width: "100%" }}
							>
								<div
									className="instance-creation-midi"
									onScroll={() => updateConnections()}
								>
									<h3>MIDI World</h3>
									<div
										className="midi-ports-grid"
										onScroll={() => updateConnections()}
									>
										{Object.entries(groupedPorts).map(
											([portName, { input, output }]) => {
												return (
													<div
														key={portName}
														style={{
															border: "2px solid gray",
															paddingRight: "2px",
														}}
													>
														{output && (
															<div
																key={`${portName}-output`}
																className="midi-port"
																title={portName}
																onClick={() =>
																	handlePortClick(portName, "output")
																}
															>
																{/*<span className="midi-port-name">{`[to] ${portName} ⬅`}</span>*/}
																<Button
																	text={`[to] ${portName} ⬅`}
																	tooltip={`Send midi messages to ${portName}`}
																	className="midi-port-name"
																	activated={
																		selectedPort?.name === portName &&
																		selectedPort?.direction === "output"
																	}
																/>
																<div
																	className={`midi-port-circle ${
																		selectedPort?.name === portName &&
																		selectedPort?.direction === "output"
																			? "selected"
																			: ""
																	}`}
																	id={`output-${portName}`}
																/>
															</div>
														)}
														{input && (
															<div
																key={`${portName}-input`}
																className="midi-port"
																title={portName}
																onClick={() =>
																	handlePortClick(portName, "input")
																}
															>
																<Button
																	text={`[from] ${portName} ➡`}
																	tooltip={`Receive midi messages from ${portName}`}
																	className="midi-port-name"
																	activated={
																		selectedPort?.name === portName &&
																		selectedPort?.direction === "input"
																	}
																/>
																<div
																	className={`midi-port-circle ${
																		selectedPort?.name === portName &&
																		selectedPort?.direction === "input"
																			? "selected"
																			: ""
																	}`}
																	id={`input-${portName}`}
																/>
															</div>
														)}
													</div>
												);
											},
										)}
									</div>
								</div>
								<div
									className="instance-creation-nallely"
									onScroll={() => updateConnections()}
								>
									<h3>Nallely's World</h3>
									<div
										className="midi-ports-grid"
										style={{ alignItems: "flex-start" }}
									>
										{devices.map((device) => (
											<SmallMidiDeviceComponent
												key={device.id}
												device={device}
												selected={selectedDevice === device}
												onDeviceClick={() => selectDevice(device)}
											/>
										))}
									</div>
								</div>
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
			</div>
			{isSettingsOpen && (
				<Portal>
					<SettingsModal onClose={handleClose} />
				</Portal>
			)}
			{isFriendsOpen && (
				<Portal>
					<FriendModal onClose={handleClose} />
				</Portal>
			)}
		</>
	);
};

export default InstanceCreation;

const SmallMidiDeviceComponent = ({
	device,
	selected = false,
	onDeviceClick,
}: {
	device: MidiDevice;
	onDeviceClick?: (device: MidiDevice) => void;
	selected?: boolean;
}) => {
	const handleDeviceClick = (device: MidiDevice) => {
		onDeviceClick?.(device);
	};

	return (
		<div
			className="device-component"
			style={{
				boxSizing: "border-box",
				borderColor: selected ? "gold" : "",
				position: "relative",
				userSelect: "none",
				minWidth: "auto",
				width: "auto",
				height: "50px",
			}}
			id={`${device.id}`}
			onClick={() => handleDeviceClick(device)}
		>
			<div className={`device-name left}`}>{device.repr}</div>
		</div>
	);
};

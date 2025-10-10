import { useEffect, useState, useRef, type ReactElement } from "react";
import { RackRow } from "./RackRow";
import { selectChannels, useTrevorDispatch, useTrevorSelector } from "../store";

import type {
	MidiConnection,
	MidiDevice,
	MidiDeviceSection,
	MidiDeviceWithSection,
	MidiParameter,
	VirtualDevice,
	VirtualDeviceSection,
	VirtualDeviceWithSection,
	VirtualParameter,
} from "../model";
import { drawConnection } from "../utils/svgUtils";
import { RackRowVirtual } from "./RackRowVirtual";
import { useTrevorWebSocket } from "../websockets/websocket";
import DragNumberInput from "./DragInputs";
import {
	buildConnectionName,
	buildSectionId,
	connectionId,
	devUID,
	isVirtualDevice,
} from "../utils/utils";
import { ScalerForm } from "./ScalerForm";
import PatchingModal from "./modals/PatchingModal";
import { AboutModal } from "./modals/AboutModal";
import { Playground } from "./modals/Playground";
import { RackRowWidgets, type RackRowWidgetRef } from "./RackRowWidgets";
import { type RackRowCCRef, RackRowCCs } from "./RackRowCC";
import { MemoryModal } from "./modals/MemoryModal";
import { setCurrentAddress } from "../store/runtimeSlice";

const VERTICAL = "⇄";
const HORIZONTAL = "⇅";

interface DevicePatchingProps {
	open3DView?: (open: boolean) => void;
}

const DevicePatching = ({ open3DView }: DevicePatchingProps) => {
	const mainSectionRef = useRef(null);
	const [associateMode, setAssociateMode] = useState(true);
	const [selection, setSelection] = useState<MidiDeviceWithSection[]>([]);
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [isAboutOpen, setIsAboutOpen] = useState(false);
	const [isMemoryOpen, setIsMemoryOpen] = useState(false);
	const [isPlaygroundOpen, setIsPlaygroundOpen] = useState(false);

	const [selectedSections, setSelectedSections] = useState<{
		firstSection: MidiDeviceWithSection | VirtualDeviceWithSection | null;
		secondSection: MidiDeviceWithSection | VirtualDeviceWithSection | null;
	}>({ firstSection: null, secondSection: null });
	const allConnections = useTrevorSelector(
		(state) => state.nallely.connections,
	);
	const svgRef = useRef<SVGSVGElement>(null);

	const midi_devices = useTrevorSelector((state) => state.nallely.midi_devices);
	const virtual_devices = useTrevorSelector(
		(state) => state.nallely.virtual_devices,
	);
	// const device_classes = useTrevorSelector((state) => state.nallely.classes);
	const trevorSocket = useTrevorWebSocket();
	const [information, setInformation] = useState<ReactElement>();
	const [currentSelected, setCurrentSelected] = useState<number>();
	const [selectedConnection, setSelectedConnection] = useState<string>();
	const [tempValues, setTempValues] = useState<
		Record<number, Record<string, string | undefined>>
	>({});
	const channels = useTrevorSelector(selectChannels);
	const widgetRack = useRef<RackRowWidgetRef>(null);
	const ccsRack = useRef<RackRowCCRef>(null);
	const [isExpanded, setIsExpanded] = useState<boolean>(false);
	const [orientation, setOrientation] = useState<string>(
		window.innerHeight < 450 ? HORIZONTAL : VERTICAL,
	);
	const currentAddress = useTrevorSelector(
		(state) => state.runTime.currentAddress,
	);
	const saveDefaultValue = useTrevorSelector(
		(state) => state.runTime.saveDefaultValue,
	);

	useEffect(() => {
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, []);

	function handleKeyDown(event: KeyboardEvent) {
		if (event.altKey && event.code === "Space") {
			event.preventDefault();
			setIsPlaygroundOpen((prev) => !prev);
		}
	}

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				mainSectionRef.current &&
				!mainSectionRef.current.contains(event.target as Node) &&
				!(event.target as HTMLElement).classList.contains("section-box") &&
				!(event.target as HTMLElement).classList.contains("section-name")
			) {
				if (displayedSection && isExpanded) {
					return;
				}
				setSelection([]); // Deselect sections when clicking outside or on non-section elements
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, []);

	const toggleAssociateMode = () => {
		setAssociateMode((prev) => !prev);
		setSelection([]); // Reset selections when toggling mode
	};

	const openAboutModal = () => {
		setIsAboutOpen(true);
	};

	const openPlayground = () => {
		setIsPlaygroundOpen(true);
	};

	const createVirtualInput = (
		device: VirtualDevice,
		parameter: VirtualParameter,
		value: string | number | boolean,
	) => {
		const tempDevice = tempValues[device.id] || {};
		const tempValue = tempDevice[parameter.name];
		if (parameter.accepted_values.length > 0) {
			return (
				<select
					style={{
						maxWidth: "52.1%",
					}}
					value={value ? value.toString() : "--"}
					onChange={(e) =>
						trevorSocket?.setVirtualValue(device, parameter, e.target.value)
					}
				>
					{parameter.accepted_values.map((v) => (
						<option key={v.toString()} value={v.toString()}>
							{v.toString()}
						</option>
					))}
				</select>
			);
		}
		const currentValue =
			tempValue ?? device.config[parameter.name]?.toString() ?? "";
		if (typeof value === "number") {
			return (
				<DragNumberInput
					value={currentValue}
					onBlur={(value) => {
						if (!Number.isNaN(Number.parseFloat(value))) {
							trevorSocket?.setVirtualValue(device, parameter, value);
						}
					}}
					onChange={(value) => {
						setTempValues({
							...tempValues,
							[device.id]: {
								...tempValues[device.id],
								[parameter.name]: value,
							},
						});
					}}
					range={parameter.range}
				/>
			);
		}
		if (typeof value === "string") {
			return (
				<input
					type="text"
					value={currentValue}
					onChange={(e) => {
						const val = e.target.value;
						setTempValues({
							...tempValues,
							[device.id]: {
								...tempValues[device.id],
								[parameter.name]: val,
							},
						});
					}}
					onBlur={(e) => {
						const newVal = e.target.value;
						trevorSocket?.setVirtualValue(device, parameter, newVal);
					}}
				/>
			);
		}
		if (typeof value === "boolean") {
			return (
				<input
					type="checkbox"
					checked={Boolean(device.config[parameter.name]) ?? false}
					onChange={(e) => {
						const newVal = !e.target.value;
						trevorSocket?.setVirtualValue(device, parameter, newVal);
					}}
				/>
			);
		}
	};

	const createMidiParameterInput = (
		device: MidiDevice,
		parameter: MidiParameter,
	) => {
		const tempDevice = tempValues[device.id] || {};
		const key = `${parameter.section_name}::${parameter.name}`;
		const tempValue = tempDevice[key];
		const currentValue =
			tempValue ??
			device.config[parameter.section_name]?.[parameter.name]?.toString() ??
			"0";
		return (
			<DragNumberInput
				value={currentValue}
				onBlur={(value) => {
					if (!Number.isNaN(Number.parseInt(value))) {
						trevorSocket?.setParameterValue(
							device.id,
							parameter.section_name,
							parameter.name,
							Number.parseInt(value),
						);
					}
				}}
				onChange={(value) => {
					setTempValues({
						...tempValues,
						[device.id]: {
							...tempValues[device.id],
							[key]: value,
						},
					});
				}}
				range={parameter.range}
			/>
		);
	};

	const updateInfo = (
		device: VirtualDevice | MidiDevice | undefined,
		section: MidiDeviceSection | undefined = undefined,
	) => {
		if (device === undefined) {
			setInformation(undefined);
			return;
		}
		if (isVirtualDevice(device)) {
			setInformation(
				<>
					<p
						style={{
							marginLeft: "5px",
							marginTop: "5px",
							fontSize: "24px",
							marginBottom: "4px",
						}}
					>
						{device.repr}
					</p>
					<button
						type="button"
						className={"associate-button"}
						onClick={() => trevorSocket?.randomPreset(device.id)}
					>
						random preset
					</button>
					<hr />
					{device.meta.parameters.map((param) => (
						<div
							key={param.name}
							style={{
								marginTop: 0,
								marginBottom: 2,
								marginLeft: "10px",
								marginRight: "5px",
								display: "flex",
								flexDirection: "row",
								alignItems: "center",
							}}
						>
							{/* biome-ignore lint/a11y/noLabelWithoutControl: <explanation> */}
							<label style={{ width: "100%", display: "flex" }}>
								<p
									style={{
										margin: "0px 0px 3px",
										width: "50%",
										overflowInline: "auto",
									}}
								>
									{param.name}
								</p>
								{createVirtualInput(device, param, device.config[param.name])}
							</label>
						</div>
					))}
					<hr />
					<button
						type="button"
						className={"associate-button"}
						onClick={() => trevorSocket?.killDevice(device.id)}
					>
						Kill device
					</button>
				</>,
			);
			return;
		}
		if (section) {
			// MIDI device click
			if (displayedSection?.section?.name !== section.name) {
				setDisplayedSection({ device, section });
			}
			setInformation(
				<>
					<p style={{ marginLeft: "5px" }}>
						{device.repr} {section?.name}
					</p>
					{section?.parameters.map((param) => {
						return (
							<label
								key={param.name}
								style={{
									display: "flex",

									flexDirection: "row",
									justifyContent: "space-between",
									alignItems: "center",
									width: "99%",
								}}
							>
								<p
									style={{ marginTop: 0, marginBottom: 0, marginLeft: "10px" }}
								>
									{param.name}
								</p>
								{createMidiParameterInput(device, param)}
							</label>
						);
					})}
				</>,
			);
			return;
		}
		// Device information on the right panel
		setInformation(
			<>
				<p style={{ marginLeft: "5px" }}>{device.repr}</p>
				<button
					type="button"
					className={"associate-button"}
					onClick={() => trevorSocket?.randomPreset(device.id)}
				>
					random preset
				</button>
				<hr />
				<label
					style={{
						width: "100%",
						display: "flex",
						marginLeft: "10px",
						alignItems: "center",
					}}
				>
					<p
						style={{
							margin: "0px",
							width: "50%",
							overflowInline: "auto",
						}}
					>
						channel
					</p>
					<input
						type="number"
						onChange={(e) => {
							trevorSocket?.setDeviceChannel(
								device,
								Number.parseInt(e.target.value) || 0,
							);
						}}
						min={0}
						max={16}
						value={channels[device.id]}
					/>
				</label>
				<hr />
				{device.meta.sections?.map((section) => (
					<button
						key={section.name}
						type="button"
						className={"associate-button"}
						onClick={() => updateInfo(device, section)}
					>
						{section.name}
					</button>
				))}
				<hr />
				<button
					type="button"
					className={"associate-button"}
					onClick={() => trevorSocket?.killDevice(device.id)}
				>
					Kill device
				</button>
			</>,
		);
	};

	const resetAll = () => {
		trevorSocket?.resetAll();
		widgetRack.current?.resetAll();
		ccsRack.current?.resetAll();
		setInformation(undefined);
	};

	useEffect(() => {
		updateConnections();
	}, [selection]);

	useEffect(() => {
		const newTempvalues = { ...tempValues };
		for (const device of midi_devices) {
			const config = newTempvalues[device.id] || {};
			for (const [section, parameter] of Object.entries(device.config)) {
				for (const [parameterName, parameterValue] of Object.entries(
					parameter,
				)) {
					const key = `${section}::${parameterName}`;
					config[key] = parameterValue.toString();
				}
			}
			newTempvalues[device.id] = config;
		}
		for (const device of virtual_devices) {
			const config = newTempvalues[device.id] || {};
			for (const [parameterName, parameterValue] of Object.entries(
				device.config,
			)) {
				config[parameterName] = parameterValue.toString();
			}
			newTempvalues[device.id] = config;
		}
		setTempValues(newTempvalues);
	}, [midi_devices, virtual_devices]);

	// Updates depending on the new devices or connections
	useEffect(() => {
		const device = [...midi_devices, ...virtual_devices].find(
			(d) => d.id === currentSelected,
		);
		if (device) {
			updateInfo(
				[...midi_devices, ...virtual_devices].find(
					(d) => d.id === currentSelected,
				),
				displayedSection?.section as MidiDeviceSection,
			);
			return;
		}
		const connection = [...allConnections].find(
			(d) => d.id === currentSelected,
		);
		if (connection) {
			displayConnectionMenu(connection);
			return;
		}
		setInformation(undefined);
	}, [tempValues, midi_devices, virtual_devices, allConnections, channels]);

	const handleParameterClick = (device: VirtualDevice) => {
		setSelectedConnection(undefined);
		if (!associateMode) {
			updateInfo(device);
			setCurrentSelected((_) => device.id);
			return;
		}
		if (selection.length < 2) {
			const virtualSection = {
				parameters: device.meta.parameters.map((e) => {
					return { ...e, name: e.cv_name };
				}),
			} as VirtualDeviceSection;
			const newElement = { device, section: virtualSection };
			setDisplayedSection((_) => undefined);

			if (selection.length === 1) {
				setSelectedSections((_) => ({
					firstSection: selection[0],
					secondSection: newElement,
				}));
				if (isExpanded) {
					setDisplayedSection((_) => selection[0]);
					updateInfo(
						selection[0].device,
						selection[0].section as MidiDeviceSection,
					);
				}
				setIsModalOpen(true);
			} else {
				// @ts-expect-error objects are not fully polymorphic, but that's ok here
				setSelection((prev) => [...prev, newElement]);
				updateInfo(device);
				setCurrentSelected(device.id);
				setDisplayedSection(newElement);
			}
		}
	};

	const handleSectionClick = (
		device: MidiDevice,
		section: MidiDeviceSection,
	) => {
		setSelectedConnection(undefined);
		if (!associateMode) {
			updateInfo(device, section);
			setCurrentSelected(device.id);
			setDisplayedSection((_) => ({ device, section }));
			return;
		}
		if (
			selection.find(
				(e) => e.device.id === device.id && e.section.name === section.name,
			)
		) {
			setSelection((_) =>
				selection.filter(
					(s) => s.device.id !== device.id || s.section.name !== section.name,
				),
			);
		}

		if (selection.length < 2) {
			setDisplayedSection(undefined);
			const newElement = { device, section };

			if (selection.length === 1) {
				setSelectedSections((_) => ({
					firstSection: selection[0],
					secondSection: newElement,
				}));
				if (isExpanded) {
					setDisplayedSection((_) => selection[0]);
					updateInfo(selection[0].device, selection[0].section);
				}
				setIsModalOpen(true);
			} else {
				updateInfo(device, section);
				setCurrentSelected(device.id);
				setSelection((prev) => [...prev, newElement]);
			}
		}
	};

	const closeModal = () => {
		setIsModalOpen(false);
		setIsAboutOpen(false);
		setSelection([]);
		setIsPlaygroundOpen(false);
		// setAssociateMode(false);
		setIsMemoryOpen(false);
	};

	const [linkMouseInteraction, setLinkMouseInteraction] = useState(false);
	const updateConnections = () => {
		if (linkMouseInteraction) {
			return;
		}

		const svg = svgRef.current;
		if (!svg) return;

		for (const line of svg.querySelectorAll("line")) {
			line.remove();
		}
		const sortedConnections = [...allConnections].sort((a, b) => {
			const isSelected = (x) => connectionId(x) === selectedConnection;
			if (isSelected(a) && !isSelected(b)) return 1;
			if (!isSelected(a) && isSelected(b)) return -1;
			return 0;
		});
		for (const connection of sortedConnections) {
			const srcSection = connection.src.parameter.section_name;
			const srcId = buildSectionId(
				connection.src.device,
				srcSection === "__virtual__"
					? (connection.src.parameter as VirtualParameter).cv_name
					: srcSection,
			);
			const dstSection = connection.dest.parameter.section_name;
			const destId = buildSectionId(
				connection.dest.device,
				dstSection === "__virtual__"
					? (connection.dest.parameter as VirtualParameter).cv_name
					: dstSection,
			);
			const fromElement = document.querySelector(`[id="${srcId}"]`);
			const toElement = document.querySelector(`[id="${destId}"]`);
			const highlightConnected = selection.length === 1;
			const firstSelected = selection[0];
			const firstSelectedSection =
				firstSelected?.section.parameters[0]?.section_name ||
				firstSelected?.section.pads_or_keys?.section_name;
			const connectionRepr = connectionId(connection);
			const highlighted =
				connectionRepr === selectedConnection ||
				(highlightConnected &&
					(connectionRepr.startsWith(
						`${firstSelected?.device.id}::${firstSelectedSection}`,
					) ||
						connectionRepr.includes(
							`-${firstSelected?.device.id}::${firstSelectedSection}`,
						)));
			drawConnection(
				svg,
				fromElement,
				toElement,
				highlighted,
				{ bouncy: connection.bouncy, muted: connection.muted },
				connection.id,
			);

			// specific code to draw connections with the widgets (scopes, etc)
			if (connection.src.repr.includes("WebSocketBus")) {
				const port = (connection.src.parameter as VirtualParameter).cv_name;
				const widgetId = port.split(/_/)[0];
				const widgetTarget = document.querySelector(`[id="${widgetId}"]`);
				drawConnection(svg, widgetTarget, fromElement, highlighted, {
					bouncy: false,
					muted: true,
				});
			}
			if (connection.dest.repr.includes("WebSocketBus")) {
				const port = (connection.dest.parameter as VirtualParameter).cv_name;
				const widgetId = port.split(/_/)[0];
				const widgetTarget = document.querySelector(`[id="${widgetId}"]`);
				drawConnection(svg, toElement, widgetTarget, highlighted, {
					bouncy: false,
					muted: true,
				});
			}
		}
	};

	useEffect(() => {
		updateConnections();
	}, [allConnections, selectedConnection, orientation]); // Update lines when connections change

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
	}, [allConnections, selectedConnection]);

	const handleNonSectionClick = () => {
		setSelection([]); // Deselect sections
		setDisplayedSection(undefined);
	};

	const handleMidiDeviceClick = (device: MidiDevice) => {
		setCurrentSelected(device.id);
		setSelectedConnection(undefined);
		setSelection([]);
		setDisplayedSection(undefined);
		updateInfo(device);
	};

	const findDevice = (deviceId: number) => {
		return [...midi_devices, ...virtual_devices].find((d) => d.id === deviceId);
	};

	const displayConnectionMenu = (connection: MidiConnection) => {
		setSelectedConnection(connectionId(connection));
		setCurrentSelected(connection.id);
		const srcDevice = findDevice(connection.src.device);
		const destDevice = findDevice(connection.dest.device);
		setInformation(
			<>
				<ScalerForm connection={connection} />
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						justifyContent: "space-evenly",
					}}
				>
					{srcDevice && destDevice && (
						<button
							type="button"
							className={"associate-button}"}
							onClick={() => {
								setSelectedConnection(undefined);
								trevorSocket?.associateParameters(
									srcDevice,
									connection.src.parameter,
									destDevice,
									connection.dest.parameter,
									true,
								);
							}}
						>
							Delete
						</button>
					)}
				</div>
			</>,
		);
	};

	const handleConnectionClick = (connection: MidiConnection) => {
		const coId = connectionId(connection);
		if (selectedConnection === coId) {
			setSelectedConnection(undefined);
			setInformation(undefined);
			setCurrentSelected(undefined);
			return;
		}
		displayConnectionMenu(connection);
	};

	const deleteAllConnections = () => {
		trevorSocket?.deleteAllConnections();
	};

	const handleLoadOk = () => {
		widgetRack.current?.resetAll();
		ccsRack.current?.resetAll();
	};

	const handleExpand = () => {
		setIsExpanded((prev) => !prev);
	};

	const toggleOrientation = () => {
		setOrientation((prev) => (prev === VERTICAL ? HORIZONTAL : VERTICAL));
	};

	const usedAddresses = useTrevorSelector(
		(state) => state.runTime.usedAddresses,
	);
	const dispatch = useTrevorDispatch();
	const savePatch = () => {
		if (currentAddress) {
			trevorSocket.saveAdress(currentAddress.hex, saveDefaultValue);
			return;
		}
		let addr = 0;
		let hex = "";
		// We find the first unused address
		while (true) {
			hex = addr.toString(16).padStart(4, "0").toUpperCase();
			if (!usedAddresses.find((a) => a.hex === hex)) {
				break;
			}
			addr += 1;
		}
		dispatch(
			setCurrentAddress({
				hex,
				path: "",
			}),
		);
		trevorSocket.saveAdress(hex, saveDefaultValue);
	};

	const [displayedSection, setDisplayedSection] = useState<
		MidiDeviceWithSection | VirtualDeviceWithSection | undefined
	>(undefined);
	const handleSettingsClick = (
		deviceSection: MidiDeviceWithSection | VirtualDeviceWithSection,
	) => {
		if (
			isExpanded &&
			displayedSection?.device.id === deviceSection.device.id &&
			displayedSection?.section.name === deviceSection.section.name
		) {
			setIsExpanded(false);
			setInformation(undefined);
			setDisplayedSection(undefined);
			setCurrentSelected(undefined);
			return;
		}
		setIsExpanded(true);
		setDisplayedSection(deviceSection);
		setCurrentSelected(deviceSection.device.id);
		updateInfo(
			deviceSection.device,
			isVirtualDevice(deviceSection.device)
				? undefined
				: (deviceSection.section as MidiDeviceSection),
		);
	};

	return (
		<div
			className={`device-patching ${orientation === VERTICAL ? "vertical" : ""}`}
		>
			<div
				className={`device-patching-main-section ${orientation === HORIZONTAL ? "horizontal" : ""}`}
				ref={mainSectionRef}
			>
				<RackRowCCs ref={ccsRack} horizontal={orientation === HORIZONTAL} />
				<RackRow
					devices={midi_devices}
					onSectionClick={handleSectionClick}
					onNonSectionClick={handleNonSectionClick}
					selectedSections={selection.map(
						(d) => `${d.device.id}::${d.section.parameters[0]?.section_name}`,
					)}
					onSectionScroll={updateConnections}
					onDeviceClick={handleMidiDeviceClick}
					horizontal={orientation === HORIZONTAL}
					onDeviceDrop={updateConnections}
					onDragEnd={updateConnections}
				/>
				<RackRowVirtual
					devices={virtual_devices.filter(
						(device) =>
							!device.meta.name.includes("TrevorBus") &&
							!device.meta.name.includes("WebSocketBus"),
					)}
					onParameterClick={handleParameterClick}
					onNonSectionClick={handleNonSectionClick}
					selectedSections={(() => {
						return selection.map(
							(d) =>
								`${devUID(d.device)}::${d.section.parameters[0]?.section_name}`,
						);
					})()}
					onSectionScroll={updateConnections}
					horizontal={orientation === HORIZONTAL}
					onDeviceDrop={updateConnections}
					onDragEnd={updateConnections}
				/>
				<RackRowWidgets
					ref={widgetRack}
					onAddWidget={updateConnections}
					horizontal={orientation === HORIZONTAL}
					onDragEnd={updateConnections}
					onRackScroll={updateConnections}
				/>
				<svg
					className={`device-patching-svg ${orientation === HORIZONTAL ? "horizontal" : ""}`}
					ref={svgRef}
					// width={mainSectionRef.current?.scrollWidth}
					// height={mainSectionRef.current?.scrollHeight}
				/>
			</div>

			<div
				style={
					isExpanded
						? {
								minWidth: "262px",
								overflowY: "auto",
								height: "100%",
								backgroundColor: "rgb(192, 192, 192)",
								zIndex: 20,
							}
						: {}
				}
			>
				<button
					style={{
						width: "100%",
						padding: "4px 0px 0px 5px",
						textAlign: "left",
						fontSize: "20px",
					}}
					type="button"
					title={isExpanded ? "Open panel" : "Close panel"}
					onClick={() => handleExpand()}
				>
					{isExpanded ? "»" : "«"}
				</button>
				{(isExpanded && (
					<div className="device-patching-side-section">
						<div className="device-patching-top-panel">
							<button
								type="button"
								className={`associate-button ${associateMode ? "active" : ""}`}
								onClick={toggleAssociateMode}
							>
								Associate
							</button>
						</div>
						<div>
							<div className="device-patching-middle-panel">
								<div className="information-panel">
									{information ? (
										information
									) : (
										<>
											<h3>Information</h3>
											<p>
												Select a section to view details or associate sections
											</p>
										</>
									)}
								</div>
							</div>
							<div className="bottom-right-panel">
								<h3>Connections</h3>
								<div
									className="connection-setup"
									style={{
										height: "150px",
										position: "relative",
										overflowY: "scroll",
									}}
								>
									<ul className="connections-list">
										{allConnections.map((connection) => {
											return (
												<li
													key={buildConnectionName(connection)}
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
													className={`connection-item ${selectedConnection === connectionId(connection) ? "selected" : ""}`}
												>
													{buildConnectionName(connection)}
												</li>
											);
										})}
									</ul>
								</div>
								{allConnections?.length > 0 && (
									<button
										type="button"
										className={"associate-button"}
										onClick={deleteAllConnections}
										style={{
											height: "auto",
										}}
									>
										Delete All
									</button>
								)}
							</div>
						</div>
						<div className="device-patching-top-panel">
							<button
								className={"associate-button"}
								type="button"
								onClick={savePatch}
							>
								Save at 0x{currentAddress?.hex ?? "????"}
							</button>
						</div>
						<div className="device-patching-top-panel">
							<button
								type="button"
								className={"associate-button"}
								onClick={() => setIsMemoryOpen?.(true)}
							>
								Manage Addresses
							</button>
						</div>
						<div className="device-patching-top-panel">
							<button
								type="button"
								className={"associate-button"}
								onClick={resetAll}
							>
								Reset All
							</button>
						</div>
						<div className="device-patching-top-panel">
							<button
								type="button"
								className={"associate-button"}
								onClick={() => trevorSocket?.pullFullState()}
							>
								Full State
							</button>
						</div>
						<div className="device-patching-top-panel">
							<button
								type="button"
								className={"associate-button"}
								onClick={openPlayground}
							>
								Playground
							</button>
						</div>
						<div className="device-patching-top-panel">
							<button
								type="button"
								className={"associate-button"}
								onClick={openAboutModal}
							>
								About
							</button>
						</div>
					</div>
				)) || (
					<div
						style={{ display: "flex", flexDirection: "column", width: "50px" }}
					>
						<button
							className="rightbar-button"
							type="button"
							onClick={toggleOrientation}
						>
							{orientation}
						</button>
						<button
							className="rightbar-button"
							type="button"
							onClick={savePatch}
						>
							💾
						</button>
						<button
							className="rightbar-button"
							type="button"
							onClick={() => setIsMemoryOpen?.(true)}
						>
							<p style={{ fontSize: "12px" }}>
								0x{currentAddress?.hex ?? "????"}
							</p>
						</button>
						<button
							className="rightbar-button"
							type="button"
							onClick={() => open3DView?.(true)}
						>
							🌐
						</button>
						{/* <p style={{ fontSize: "14px", margin: "5px" }}>
							0x{currentAddress?.hex ?? "????"}
						</p> */}
					</div>
				)}
			</div>
			{isModalOpen && (
				<PatchingModal
					onClose={closeModal}
					firstSection={selectedSections.firstSection}
					secondSection={selectedSections.secondSection}
					onSettingsClick={handleSettingsClick}
					selectedSettings={displayedSection}
					onSectionChange={(deviceSection) => {
						if (!isExpanded) {
							return;
						}
						setDisplayedSection(deviceSection);
						setCurrentSelected(deviceSection.device.id);
						updateInfo(
							deviceSection.device,
							isVirtualDevice(deviceSection.device)
								? undefined
								: (deviceSection.section as MidiDeviceSection),
						);
					}}
				/>
			)}
			{isAboutOpen && <AboutModal onClose={closeModal} />}
			{isPlaygroundOpen && <Playground onClose={closeModal} />}
			{isMemoryOpen && (
				<MemoryModal onClose={closeModal} onLoad={handleLoadOk} />
			)}
		</div>
	);
};

export default DevicePatching;

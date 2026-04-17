/** biome-ignore-all lint/a11y/noLabelWithoutControl: <explanation> */
import {
	lazy,
	type ReactElement,
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type {
	Connection,
	MidiDevice,
	MidiDeviceSection,
	MidiDeviceWithSection,
	MidiParameter,
	VirtualDevice,
	VirtualDeviceSection,
	VirtualDeviceWithSection,
	VirtualParameter,
} from "../model";
import { selectChannels, useTrevorDispatch, useTrevorSelector } from "../store";
import { setCurrentAddress } from "../store/runtimeSlice";
import { drawConnection, drawCurvedConnection } from "../utils/svgUtils";
import {
	buildConnectionName,
	buildSectionId,
	connectionId,
	devUID,
	isVirtualDevice,
	rejectedClasses,
} from "../utils/utils";
import { useTrevorWebSocket } from "../websockets/websocket";
import DragNumberInput from "./DragInputs";
import { AboutModal } from "./modals/AboutModal";
import { MemoryModal } from "./modals/MemoryModal";
import PatchingModal from "./modals/PatchingModal";
// import { Playground } from "./modals/Playground";
import { Portal } from "./Portal";
import { RackRow } from "./RackRow";
import { type RackRowCCRef, RackRowCCs } from "./RackRowCC";
import { RackRowVirtual } from "./RackRowVirtual";
import { type RackRowWidgetRef, RackRowWidgets } from "./RackRowWidgets";
import { ScalerForm } from "./ScalerForm";
import { Button } from "./widgets/BaseComponents";

const Playground = lazy(() =>
	import("./modals/Playground").then((module) => ({
		default: module.Playground,
	})),
);

const ORIENTATIONS = {
	horizontal: "⇅",
	vertical: "⇄",
};

interface DevicePatchingProps {
	open3DView?: (open: boolean) => void;
}

const findDevice = (
	deviceId: number,
	midi_devices: MidiDevice[],
	virtual_devices: VirtualDevice[],
) => {
	return [...midi_devices, ...virtual_devices].find((d) => d.id === deviceId);
};

const DevicePatching = ({ open3DView }: DevicePatchingProps) => {
	const mainSectionRef = useRef(null);
	const associateMode = useTrevorSelector(
		(state) => state.runTime.associateMode,
	);
	const [selection, setSelection] = useState<
		(MidiDeviceWithSection | VirtualDeviceWithSection)[]
	>([]);
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
	const all_devices = useMemo(
		() => [...midi_devices, ...virtual_devices],
		[midi_devices, virtual_devices],
	);
	const trevorSocket = useTrevorWebSocket();
	const exposedServices = useTrevorSelector(
		(state) => state.nallely.exposed_services,
	);
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
	const [orientation, setOrientation] = useState<"horizontal" | "vertical">(
		window.innerHeight < 450 ? "horizontal" : "vertical",
	);

	// Refs for stable updateConnections function
	const allConnectionsRef = useRef(allConnections);
	const selectedConnectionRef = useRef(selectedConnection);
	const selectionRef = useRef(selection);
	const friends = useTrevorSelector((state) => state.general.friends);

	const [displayedSection, setDisplayedSection] = useState<
		MidiDeviceWithSection | VirtualDeviceWithSection | undefined
	>(undefined);

	// Sync refs with current values
	useEffect(() => {
		allConnectionsRef.current = allConnections;
	}, [allConnections]);

	useEffect(() => {
		selectedConnectionRef.current = selectedConnection;
	}, [selectedConnection]);

	useEffect(() => {
		selectionRef.current = selection;
	}, [selection]);
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

	const openAboutModal = () => {
		setIsAboutOpen(true);
	};

	const openPlayground = () => {
		setIsPlaygroundOpen(true);
	};

	const createVirtualInput = useCallback(
		(
			device: VirtualDevice,
			parameter: VirtualParameter,
			value: string | number | boolean,
		) => {
			const tempDevice = tempValues[device.id] || {};
			const tempValue = tempDevice[parameter.name];
			if (parameter.accepted_values?.length > 0) {
				return (
					<select
						style={{
							minWidth: "0",
							direction: "rtl",
							textAlign: "left",
							height: "24px",
							lineHeight: "24px",
							paddingTop: "2px",
							paddingBottom: "4px",
							width: "100%",
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
						style={{
							width: "100%",
							fontSize: "12px",
						}}
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
						style={{
							width: "100%",
							fontSize: "12px",
						}}
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
			// If we have a "undefined" as input
			// return (
			// 	<DragNumberInput
			// 		style={{
			// 			width: "100%",
			// 			fontSize: "12px",
			// 		}}
			// 		value={currentValue}
			// 		onBlur={(value) => {
			// 			if (!Number.isNaN(Number.parseFloat(value))) {
			// 				trevorSocket?.setVirtualValue(device, parameter, value);
			// 			}
			// 		}}
			// 		onChange={(value) => {
			// 			setTempValues({
			// 				...tempValues,
			// 				[device.id]: {
			// 					...tempValues[device.id],
			// 					[parameter.name]: value,
			// 				},
			// 			});
			// 		}}
			// 		range={parameter.range}
			// 	/>
			// );
		},
		[trevorSocket, tempValues],
	);

	const createMidiParameterInput = useCallback(
		(device: MidiDevice, parameter: MidiParameter) => {
			const tempDevice = tempValues[device.id] || {};
			const sectionName = parameter.section_name;
			const parameterName = parameter.name;
			const key = `${sectionName}::${parameterName}`;
			const tempValue = tempDevice[key];
			const currentValue =
				tempValue ??
				device.config[sectionName]?.[parameterName]?.toString() ??
				"0";
			if (parameter.accepted_values?.length > 0) {
				const acceptedValues = parameter.accepted_values;
				const nbAcceptedValues = acceptedValues.length;
				const [, upper] = parameter.range;

				const parsedValue = Number.parseInt(currentValue, 10);
				const safeValue = Number.isNaN(parsedValue) ? 0 : parsedValue;
				const bucketSize = Math.floor((upper + 1) / nbAcceptedValues);
				const index = Math.min(
					nbAcceptedValues - 1,
					Math.floor((safeValue % (upper + 1)) / bucketSize),
				);
				const value = acceptedValues[index];
				return (
					<select
						style={{
							minWidth: "132px",
							maxWidth: "132px",
						}}
						value={value ?? "--"}
						onChange={(e) =>
							trevorSocket?.setParameterValue(
								device.id,
								sectionName,
								parameterName,
								e.target.value,
							)
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
			return (
				<DragNumberInput
					style={{
						width: "100%",
					}}
					value={currentValue}
					onBlur={(value) => {
						if (!Number.isNaN(Number.parseFloat(value))) {
							trevorSocket?.setParameterValue(
								device.id,
								parameter.section_name,
								parameter.name,
								Number.parseFloat(value),
							);
						}
					}}
					onChange={(value) => {
						setTempValues((prev) => ({
							...prev,
							[device.id]: {
								...prev[device.id],
								[key]: value,
							},
						}));
					}}
					range={parameter.range}
				/>
			);
		},
		[trevorSocket, tempValues],
	);

	const updateInfoRef =
		useRef<
			(device?: VirtualDevice | MidiDevice, section?: MidiDeviceSection) => void
		>(null);

	const handleMidiDeviceClick = useCallback(
		(device: MidiDevice) => {
			setCurrentSelected(device.id);
			if (!associateMode) {
				setIsExpanded(true);
			}
			setSelectedConnection(undefined);
			setSelection([]);
			setDisplayedSection(undefined);
			updateInfoRef.current?.(device);
		},
		[associateMode],
	);

	const updateInfo = useCallback(
		(
			device: VirtualDevice | MidiDevice | undefined,
			section: MidiDeviceSection | undefined = undefined,
		) => {
			if (device === undefined) {
				setInformation(undefined);
				return;
			}
			if (isVirtualDevice(device)) {
				if (friends && Object.keys(friends).length === 0) {
					trevorSocket.scanForFriends();
				}
				const exposedTo = exposedServices[device.id]?.map(([, ip]) => ip) ?? [];
				setInformation(
					<>
						{device.meta.parameters.map((param) => (
							<div
								key={param.name}
								style={{
									paddingLeft: "4px",
									paddingRight: "4px",
								}}
							>
								<label
									style={{
										display: "flex",
										alignItems: "baseline",
										width: "100%",
										fontSize: "14px",
									}}
								>
									<p
										style={{
											margin: "0px 0px 3px",
											overflowInline: "auto",
											width: "100%",
										}}
									>
										{param.name}
									</p>
									{createVirtualInput(device, param, device.config[param.name])}
								</label>
							</div>
						))}
						{!device.proxy && (
							<>
								<hr />
								<details>
									<summary>Expose to friends</summary>
									<div className="details-content">
										{Object.entries(friends).map(([ip, [name, _]]) => (
											<Button
												key={`${ip}`}
												text={`${name} - ${ip}`}
												tooltip={`Expose neuron to ${name} living at ${ip}`}
												activated={exposedTo.includes(ip)}
												onClick={() => {
													if (exposedTo.includes(ip)) {
														trevorSocket.unexposeNeuron(device.id, ip);
													} else {
														trevorSocket.exposeNeuron(device.id, ip);
													}
												}}
												className="menu-button"
												style={{
													fontSize: "13px",
												}}
											/>
										))}
									</div>
								</details>
							</>
						)}
						<details>
							<summary>Danger zone</summary>
							<div className="details-content">
								<Button
									text="Random preset"
									tooltip="Generates a random preset"
									onClick={() => trevorSocket?.randomPreset(device.id)}
									className="menu-button"
								/>
								{!device.proxy ? (
									<Button
										text="Kill"
										tooltip="Kill the device and removes it from the session"
										onClick={() => {
											trevorSocket?.killDevice(device.id);
											setCurrentSelected(undefined);
											setSelectedConnection(undefined);
											setSelection([]);
											setInformation(undefined);
										}}
										className="menu-button"
									/>
								) : (
									<Button
										text="Unregister"
										tooltip="Unregister the service from the network bus"
										onClick={() => {
											trevorSocket?.unregisterService(device.id, device.repr);
											setCurrentSelected(undefined);
											setSelectedConnection(undefined);
											setSelection([]);
											setInformation(undefined);
										}}
										className="menu-button"
									/>
								)}
							</div>
						</details>
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
						<p style={{ marginLeft: "5px", fontSize: "18px" }}>
							{device.repr} {section?.name}
						</p>
						{section?.parameters.map((param) => {
							return (
								<label
									key={param.name}
									style={{
										width: "100%",
										display: "flex",
										flexDirection: "row",
										alignItems: "baseline",
									}}
								>
									<p
										style={{
											margin: 0,
											paddingLeft: "4px",
											paddingRight: "4px",
											width: "100%",
											overflowInline: "auto",
										}}
									>
										{param.name}
									</p>
									{createMidiParameterInput(device, param)}
								</label>
							);
						})}
						<hr />
						<Button
							text="Back to device view"
							tooltip="Returns to the main device view"
							onClick={() => handleMidiDeviceClick(device)}
							className="menu-button"
						/>
					</>,
				);
				return;
			}
			// Device information on the right panel
			setInformation(
				<>
					<p style={{ marginLeft: "5px", fontSize: "18px" }}>{device.repr}</p>
					<Button
						text="Random preset"
						tooltip="Generates a random preset"
						onClick={() => trevorSocket?.randomPreset(device.id)}
						className="menu-button"
					/>
					<hr />
					<label
						style={{
							width: "100%",
							display: "flex",
							marginLeft: "10px",
							alignItems: "baseline",
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
							inputMode="numeric"
							onChange={(e) => {
								trevorSocket?.setDeviceChannel(
									device,
									Number.parseInt(e.target.value, 10) || 0,
								);
							}}
							min={0}
							max={15}
							value={channels[device.id]}
						/>
					</label>
					<hr />
					{device.meta.sections?.map((section) => (
						<Button
							key={section.name}
							text={`${section.name}`}
							tooltip={`Opens section ${section.name}`}
							onClick={() => updateInfo(device, section)}
							className="menu-button"
						/>
					))}
					<hr />
					<Button
						text="Force not off"
						tooltip="Send multiple note off to the device"
						onClick={() => trevorSocket?.forceNoteOff(device.id)}
						className="menu-button"
					/>
					<details>
						<summary>Danger zone</summary>
						<div className="details-content">
							<Button
								text="Kill device"
								tooltip="Kills the device"
								onClick={() => trevorSocket?.killDevice(device.id)}
								className="menu-button"
							/>
						</div>
					</details>
					<hr />
				</>,
			);
		},
		[
			trevorSocket,
			displayedSection,
			handleMidiDeviceClick,
			createMidiParameterInput,
			channels,
			createVirtualInput,
			exposedServices,
			friends,
			currentSelected,
		],
	);

	useEffect(() => {
		updateInfoRef.current = updateInfo;
	}, [updateInfo]);

	const resetAll = () => {
		trevorSocket?.resetAll();
		widgetRack.current?.resetAll();
		ccsRack.current?.resetAll();
		setInformation(undefined);
	};

	useEffect(() => {
		updateConnections();
	}, [selection]);

	const displayConnectionMenu = useCallback(
		(connection: Connection) => {
			setSelectedConnection(connectionId(connection));
			setCurrentSelected(connection.id);
			const srcDevice = findDevice(
				connection.src.device,
				midi_devices,
				virtual_devices,
			);
			const destDevice = findDevice(
				connection.dest.device,
				midi_devices,
				virtual_devices,
			);
			setInformation(
				<>
					<h3>Patch setup</h3>
					<ScalerForm connection={connection} />
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							justifyContent: "space-evenly",
							marginTop: "10px",
						}}
					>
						{srcDevice && destDevice && (
							<details>
								<summary>Danger zone</summary>
								<div className="details-content">
									<Button
										text="Delete"
										tooltip="Delete patch"
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
										className="menu-button"
									/>
								</div>
							</details>
						)}
					</div>
				</>,
			);
		},
		[trevorSocket, trevorSocket?.socket, midi_devices, virtual_devices],
	);

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
	}, [
		tempValues,
		midi_devices,
		virtual_devices,
		allConnections,
		displayedSection,
		currentSelected,
		updateInfo,
		displayConnectionMenu,
	]);

	const handleParameterClick = useCallback(
		(device: VirtualDevice) => {
			setSelectedConnection(undefined);
			if (!associateMode) {
				updateInfoRef.current?.(device);
				setCurrentSelected((_) => device.id);
				const virtualSection = {
					parameters: device.meta.parameters.map((e) => {
						return { ...e, name: e.cv_name };
					}),
				} as VirtualDeviceSection;
				setSelection([{ device, section: virtualSection }]);
				setIsExpanded(true);
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
						updateInfoRef.current?.(
							selection[0].device,
							selection[0].section as MidiDeviceSection,
						);
					}
					setIsModalOpen(true);
				} else {
					setSelection((prev) => [...prev, newElement]);
					updateInfoRef.current?.(device);
					setCurrentSelected(device.id);
					setDisplayedSection(newElement);
				}
			}
		},
		[associateMode, isExpanded, selection],
	);

	const handleSectionClick = useCallback(
		(device: MidiDevice, section: MidiDeviceSection) => {
			setSelectedConnection(undefined);
			if (!associateMode) {
				updateInfoRef.current?.(device, section);
				setCurrentSelected(device.id);
				setDisplayedSection((_) => ({ device, section }));
				setSelection([{ device, section }]);
				setIsExpanded(true);
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
						updateInfoRef.current?.(
							selection[0].device,
							selection[0].section as MidiDeviceSection,
						);
					}
					setIsModalOpen(true);
				} else {
					updateInfoRef.current?.(device, section);
					setCurrentSelected(device.id);
					setSelection((prev) => [...prev, newElement]);
				}
			}
		},
		[associateMode, isExpanded, selection],
	);

	const closeModal = () => {
		setIsModalOpen(false);
		setIsAboutOpen(false);
		setSelection([]);
		setIsPlaygroundOpen(false);
		setIsMemoryOpen(false);
	};

	const [linkMouseInteraction, setLinkMouseInteraction] = useState(false);
	const updateConnectionsRef = useRef<number | null>(null);
	const throttleTimeoutRef = useRef<number | null>(null);

	const updateConnections = useCallback(() => {
		if (linkMouseInteraction) {
			return;
		}

		// Debounce: cancel previous scheduled update
		if (updateConnectionsRef.current !== null) {
			cancelAnimationFrame(updateConnectionsRef.current);
		}

		updateConnectionsRef.current = requestAnimationFrame(() => {
			const svg = svgRef.current;
			if (!svg) return;

			// Clearing the innerHTML looks like it's faster than removing child nodes
			svg.innerHTML = "";

			updateConnectionsRef.current = null;
			// Use refs to get current values without triggering dependency changes
			const allConnections = allConnectionsRef.current;
			const selectedConnection = selectedConnectionRef.current;
			const selection = selectionRef.current;

			// Memoize sorted connections and element queries
			const sortedConnections = [...allConnections].sort((a, b) => {
				const isSelected = (x) => connectionId(x) === selectedConnection;
				if (isSelected(a) && !isSelected(b)) return 1;
				if (!isSelected(a) && isSelected(b)) return -1;
				return 0;
			});

			// Cache element queries
			const elementCache = new Map<string, Element | null>();
			const getElement = (id: string) => {
				if (!elementCache.has(id)) {
					elementCache.set(id, document.querySelector(`[id="${id}"]`));
				}
				return elementCache.get(id) || null;
			};
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
				const fromElement = getElement(srcId);
				const toElement = getElement(destId);
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
				drawCurvedConnection(
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
					const widgetTarget = getElement(widgetId);
					drawConnection(svg, widgetTarget, fromElement, highlighted, {
						bouncy: false,
						muted: true,
					});
				}
				if (connection.dest.repr.includes("WebSocketBus")) {
					const port = (connection.dest.parameter as VirtualParameter).cv_name;
					const widgetId = port.split(/_/)[0];
					const widgetTarget = getElement(widgetId);
					drawConnection(svg, toElement, widgetTarget, highlighted, {
						bouncy: false,
						muted: true,
					});
				}
			}
		});
	}, [linkMouseInteraction]);

	// Throttled version for frequent events like scrolling
	const updateConnectionsThrottled = useCallback(() => {
		if (throttleTimeoutRef.current !== null) {
			// We already have a scheduled update
			return;
		}
		throttleTimeoutRef.current = window.setTimeout(() => {
			updateConnections();
			throttleTimeoutRef.current = null;
		}, 16); // throttle at 60Hz more or less
	}, [updateConnections]);

	useEffect(() => {
		updateConnections();
	}, [updateConnections]);

	useEffect(() => {
		let resizeTimeout: number;
		const handleResize = () => {
			// Throttle resize events
			clearTimeout(resizeTimeout);
			resizeTimeout = window.setTimeout(() => {
				updateConnections();
			}, 100);
		};

		const observer = new ResizeObserver(handleResize);
		if (svgRef.current) {
			observer.observe(svgRef.current.parentElement as HTMLElement);
		}

		return () => {
			observer.disconnect();
			clearTimeout(resizeTimeout);
		};
	}, [updateConnections]);

	const handleNonSectionClick = useCallback(() => {
		setSelection([]); // Deselect sections
		setSelectedConnection(undefined);
	}, []);

	const handleConnectionClick = (connection: Connection) => {
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
		setIsExpanded((isExpanded) => {
			if (isExpanded) {
				setInformation(undefined);
			}
			return !isExpanded;
		});
		setSelection([]);
	};

	const toggleOrientation = () => {
		setOrientation((prev) => (prev === "vertical" ? "horizontal" : "vertical"));
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

	const handleSettingsClick = useCallback(
		(deviceSection: MidiDeviceWithSection | VirtualDeviceWithSection) => {
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
			updateInfoRef.current?.(
				deviceSection.device,
				isVirtualDevice(deviceSection.device)
					? undefined
					: (deviceSection.section as MidiDeviceSection),
			);
		},
		[displayedSection, isExpanded],
	);

	const selectedSectionIds = useMemo(
		() =>
			selection.map(
				(d) => `${d.device.id}::${d.section.parameters[0]?.section_name}`,
			),
		[selection],
	);

	const selectedVirtualSectionIds = useMemo(() => {
		return selection.map(
			(d) => `${devUID(d.device)}::${d.section.parameters[0]?.section_name}`,
		);
	}, [selection]);

	const handleSectionChangePatchingModal = useCallback(
		(deviceSection) => {
			if (!isExpanded) {
				return;
			}
			setDisplayedSection(deviceSection);
			setCurrentSelected(deviceSection.device.id);
			updateInfoRef.current?.(
				deviceSection.device,
				isVirtualDevice(deviceSection.device)
					? undefined
					: (deviceSection.section as MidiDeviceSection),
			);
		},
		[isExpanded],
	);

	return (
		<div className={`device-patching ${orientation}`}>
			<div
				className={`device-patching-main-section ${orientation}`}
				ref={mainSectionRef}
			>
				<RackRowCCs ref={ccsRack} orientation={orientation} />
				<RackRow
					devices={midi_devices}
					onSectionClick={handleSectionClick}
					onNonSectionClick={handleNonSectionClick}
					selectedSections={selectedSectionIds}
					onSectionScroll={updateConnectionsThrottled}
					onDeviceClick={handleMidiDeviceClick}
					orientation={orientation}
					onDeviceDrop={updateConnections}
					onDragEnd={updateConnections}
				/>
				<RackRowVirtual
					devices={virtual_devices.filter(
						(device) => !rejectedClasses.includes(device.meta.name),
					)}
					onParameterClick={handleParameterClick}
					onNonSectionClick={handleNonSectionClick}
					selectedSections={selectedVirtualSectionIds}
					onSectionScroll={updateConnectionsThrottled}
					orientation={orientation}
					onDeviceDrop={updateConnections}
					onDragEnd={updateConnections}
				/>
				<RackRowWidgets
					ref={widgetRack}
					onAddWidget={updateConnections}
					orientation={orientation}
					onDragEnd={updateConnections}
					onRackScroll={updateConnectionsThrottled}
					onNonSectionClick={handleNonSectionClick}
				/>
				<svg className={`device-patching-svg ${orientation}`} ref={svgRef} />
			</div>

			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: "2px",
					paddingLeft: "2px",
					...(isExpanded
						? {
								minWidth: "262px",
								overflowY: "auto",
								height: "100%",
								backgroundColor: "rgb(192, 192, 192)",
								zIndex: 20,
							}
						: {
								minWidth: "40px",
							}),
				}}
			>
				<Button
					text={isExpanded ? "»" : "«"}
					tooltip={isExpanded ? "Open panel" : "Close panel"}
					onClick={handleExpand}
					activated={isExpanded}
					style={{
						width: "inherit",
						textAlign: "left",
						paddingLeft: "4px",
						height: "20px",
					}}
				/>
				{(isExpanded && (
					<div className="device-patching-side-section">
						<div
							style={{
								display: "flex",
								gap: "4px",
								alignItems: "center",
								padding: "4px",
							}}
						>
							<Button
								text={"⟳"}
								tooltip="Pull full state"
								variant={"big"}
								style={{ backgroundColor: "var(--button-bg-color)" }}
								onClick={() => trevorSocket?.pullFullState()}
							/>
							<select
								style={{ width: "100%" }}
								value={currentSelected ?? ""}
								title="Select device to associate"
								onChange={(e) => {
									const val = e.target.value;
									const device = all_devices.filter(
										(d) => d.id.toString() === val,
									)?.[0];
									if (!device) {
										return;
									}
									if (isVirtualDevice(device)) {
										handleParameterClick(device);
									} else {
										handleMidiDeviceClick(device);
									}
								}}
							>
								<option value={""}>--</option>
								{all_devices.map((cls) => (
									<option key={cls.repr} value={cls.id}>
										{cls.repr}
									</option>
								))}
							</select>
						</div>
						<div>
							<div className="device-patching-middle-panel">
								<div className="information-panel">
									{information ? (
										information
									) : (
										<>
											<h3>Settings panel</h3>
											<p>Select a neuron to view details</p>
										</>
									)}
								</div>
							</div>
							<div className="bottom-right-panel">
								<details>
									<summary>Connections</summary>
									<div className="details-content">
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
									</div>
									{allConnections?.length > 0 && (
										<Button
											text="Delete all"
											tooltip="Deletes all patchs from the session"
											onClick={deleteAllConnections}
											className="menu-button"
											style={{
												width: "100%",
											}}
										/>
									)}
								</details>
							</div>
						</div>
						<div className="device-patching-top-panel">
							<Button
								text="Addresses"
								tooltip="Opens the memory manager"
								onClick={() => setIsMemoryOpen?.(true)}
								activated={isMemoryOpen}
								className="menu-button"
							/>
							<Button
								text={`Save at 0x${currentAddress?.hex ?? "????"}`}
								tooltip={`Save the session at address  0x${currentAddress?.hex ?? "????"}`}
								onClick={savePatch}
								className="menu-button"
							/>
						</div>
						<div className="device-patching-top-panel">
							<Button
								text="Open playground"
								tooltip="Opens the playground"
								onClick={openPlayground}
								className="menu-button"
							/>
						</div>
						<div className="device-patching-top-panel">
							<Button
								text="Reset all"
								tooltip="Reset the session"
								onClick={resetAll}
								className="menu-button"
							/>
						</div>
						<div className="device-patching-top-panel">
							<Button
								text="About"
								tooltip="Opens the about menu"
								onClick={openAboutModal}
								className="menu-button"
							/>
						</div>
					</div>
				)) || (
					<div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
						<Button
							text={ORIENTATIONS[orientation]}
							tooltip="Change orientation"
							onClick={toggleOrientation}
							style={{
								width: "inherit",
								height: "37px",
							}}
						/>
						<Button
							text="💾"
							tooltip="Save patch"
							onClick={savePatch}
							style={{
								width: "inherit",
								height: "37px",
							}}
						/>
						<Button
							text={`0x${currentAddress?.hex ?? "????"}`}
							tooltip="Manage memory"
							onClick={() => setIsMemoryOpen?.(true)}
							style={{
								width: "inherit",
								height: "37px",
								fontSize: "11px",
								color: "var(--black)",
							}}
						/>
					</div>
				)}
			</div>
			{isModalOpen && (
				<Portal>
					<PatchingModal
						onClose={closeModal}
						firstSection={selectedSections.firstSection}
						secondSection={selectedSections.secondSection}
						onSettingsClick={handleSettingsClick}
						selectedSettings={displayedSection}
						onSectionChange={handleSectionChangePatchingModal}
					/>
				</Portal>
			)}
			{isAboutOpen && (
				<Portal>
					<AboutModal onClose={closeModal} />
				</Portal>
			)}
			{isPlaygroundOpen && (
				<Portal>
					<Suspense fallback={null}>
						<Playground onClose={closeModal} />
					</Suspense>
				</Portal>
			)}
			{isMemoryOpen && (
				<Portal>
					<MemoryModal onClose={closeModal} onLoad={handleLoadOk} />
				</Portal>
			)}
		</div>
	);
};

export default DevicePatching;

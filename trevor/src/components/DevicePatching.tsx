import { useEffect, useState, useRef, type ReactElement } from "react";
import { RackRow } from "./RackRow";
import { selectChannels, useTrevorSelector } from "../store";

import type {
	MidiConnection,
	MidiDevice,
	MidiDeviceSection,
	MidiDeviceWithSection,
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
	isVirtualDevice,
} from "../utils/utils";
import { ScalerForm } from "./ScalerForm";
import PatchingModal from "./modals/PatchingModal";
import { AboutModal } from "./modals/AboutModal";
import { SaveModal } from "./modals/SaveModal";
import { Playground } from "./modals/Playground";
import { RackRowWidgets, type RackRowWidgetRef } from "./RackRowWidgets";
import { LoadModal } from "./modals/LoadModal";
import { type RackRowCCRef, RackRowCCs } from "./RackRowCC";

const VERTICAL = "⇄";
const HORIZONTAL = "⇅";

const DevicePatching = () => {
	const mainSectionRef = useRef(null);
	const [rackRowHeight, setRackRowHeight] = useState(150); // Default height
	const [associateMode, setAssociateMode] = useState(true);
	const [selectedSections, setSelectedSections] = useState<
		MidiDeviceWithSection[]
	>([]);
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [isAboutOpen, setIsAboutOpen] = useState(false);
	const [isSaveOpen, setIsSaveOpen] = useState(false);
	const [isLoadOpen, setIsLoadOpen] = useState(false);
	const [isPlaygroundOpen, setIsPlaygroundOpen] = useState(false);

	const [selectedSection, setSelectedSection] = useState<{
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
	const [isExpanded, setIsExpanded] = useState<boolean>(true);
	const [orientation, setOrientation] = useState<string>(
		window.innerHeight < 450 ? HORIZONTAL : VERTICAL,
	);
	const patchFilename = useTrevorSelector(
		(state) => state.runTime.patchFilename,
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
				setSelectedSections([]); // Deselect sections when clicking outside or on non-section elements
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, []);

	const toggleAssociateMode = () => {
		setAssociateMode((prev) => !prev);
		setSelectedSections([]); // Reset selections when toggling mode
	};

	const openAboutModal = () => {
		setIsAboutOpen(true);
	};

	const openSaveModal = () => {
		setIsSaveOpen(true);
	};

	const openPlayground = () => {
		setIsPlaygroundOpen(true);
	};

	const createInput = (
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
								{createInput(device, param, device.config[param.name])}
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
			setInformation(
				<>
					<p style={{ marginLeft: "5px" }}>
						{device.repr} {section?.name}
					</p>
					{section?.parameters.map((param) => (
						<p
							key={param.name}
							style={{ marginTop: 0, marginBottom: 0, marginLeft: "10px" }}
						>
							{""}
							{param.name}: {device.config[param.section_name]?.[param.name]}
						</p>
					))}
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
		const device = [...midi_devices, ...virtual_devices].find(
			(d) => d.id === currentSelected,
		);
		if (device) {
			updateInfo(
				[...midi_devices, ...virtual_devices].find(
					(d) => d.id === currentSelected,
				),
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

	const handleParameterClick = (
		device: VirtualDevice,
		// parameter: VirtualParameter,
	) => {
		setSelectedConnection(undefined);
		if (!associateMode) {
			updateInfo(device);
			setCurrentSelected(device.id);
			return;
		}
		if (selectedSections.length < 2) {
			const virtualSection = {
				parameters: device.meta.parameters.map((e) => {
					return { ...e, name: e.cv_name };
				}),
			} as VirtualDeviceSection;
			const newSelection = [
				...selectedSections,
				{ device, section: virtualSection },
			];
			// @ts-expect-error objects are not fully polymorphic, but that's ok here
			setSelectedSections(newSelection);

			if (newSelection.length === 2) {
				setSelectedSection({
					firstSection: newSelection[0],
					secondSection: newSelection[1],
				});
				setInformation(
					<p>
						Associating {newSelection[0].section.name} with{" "}
						{newSelection[1].section.name}
					</p>,
				);
				setIsModalOpen(true);
			} else {
				updateInfo(device);
				setCurrentSelected(device.id);
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
			return;
		}
		if (
			selectedSections.find(
				(e) => e.device.id === device.id && e.section.name === section.name,
			)
		) {
			setSelectedSections(
				selectedSections.filter(
					(s) => s.device.id !== device.id || s.section.name !== section.name,
				),
			);
		}
		if (selectedSections.length < 2) {
			const newSelection = [...selectedSections, { device, section }];
			setSelectedSections(newSelection);
			if (newSelection.length === 2) {
				setSelectedSection({
					firstSection: newSelection[0],
					secondSection: newSelection[1],
				});
				setInformation(
					<p>
						Associating {newSelection[0].section.name} with{" "}
						{newSelection[1].section.name}
					</p>,
				);
				setIsModalOpen(true);
			} else {
				updateInfo(device, section);
				setCurrentSelected(device.id);
			}
		}
	};

	const closeModal = () => {
		setIsModalOpen(false);
		setIsAboutOpen(false);
		setSelectedSections([]);
		setIsSaveOpen(false);
		setIsPlaygroundOpen(false);
		setIsLoadOpen(false);
		// setAssociateMode(false);
	};

	const updateConnections = () => {
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
			drawConnection(
				svg,
				fromElement,
				toElement,
				connectionId(connection) === selectedConnection,
				connection.bouncy,
			);
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
		setSelectedSections([]); // Deselect sections
	};

	const handleMidiDeviceClick = (device: MidiDevice) => {
		setCurrentSelected(device.id);
		setSelectedConnection(undefined);
		setSelectedSections([]);
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
					{/* <button
						type="button"
						className={"associate-button}"}
						onClick={() => {
							// setSelectedSections()
							setIsModalOpen(true);
						}}
					>
						Open
					</button> */}
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

	const handleLoadPatch = () => {
		setIsLoadOpen(true);
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

	const savePatch = () => {
		trevorSocket.saveAll(patchFilename, saveDefaultValue);
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
					selectedSections={selectedSections.map(
						(d) => `${d.device.id}-${d.section.parameters[0]?.section_name}`,
					)}
					onSectionScroll={updateConnections}
					onDeviceClick={handleMidiDeviceClick}
					horizontal={orientation === HORIZONTAL}
					onDeviceDrop={updateConnections}
				/>
				<RackRowVirtual
					devices={virtual_devices.filter(
						(device) => !device.meta.name.includes("TrevorBus"),
					)}
					onParameterClick={handleParameterClick}
					onNonSectionClick={handleNonSectionClick}
					selectedSections={selectedSections.map(
						(d) => `${d.device.id}-${d.section.parameters[0]?.section_name}`,
					)}
					onSectionScroll={updateConnections}
					horizontal={orientation === HORIZONTAL}
					onDeviceDrop={updateConnections}
				/>
				<svg
					className={`device-patching-svg ${orientation === HORIZONTAL ? "horizontal" : ""}`}
					ref={svgRef}
				/>
				<RackRowWidgets
					ref={widgetRack}
					horizontal={orientation === HORIZONTAL}
				/>
			</div>

			<div
				style={
					isExpanded
						? { minWidth: "262px", overflowY: "auto", height: "100%" }
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
						<div className="device-patching-top-panel">
							<button
								type="button"
								className={"associate-button"}
								onClick={handleLoadPatch}
							>
								Load
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
								type="button"
								className={"associate-button"}
								onClick={openSaveModal}
							>
								Save
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
					<>
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
					</>
				)}
			</div>
			{isModalOpen && (
				<PatchingModal
					onClose={closeModal}
					firstSection={selectedSection.firstSection}
					secondSection={selectedSection.secondSection}
				/>
			)}
			{isAboutOpen && <AboutModal onClose={closeModal} />}
			{isSaveOpen && <SaveModal onClose={closeModal} />}
			{isLoadOpen && <LoadModal onClose={closeModal} onOk={handleLoadOk} />}
			{isPlaygroundOpen && <Playground onClose={closeModal} />}
		</div>
	);
};

export default DevicePatching;

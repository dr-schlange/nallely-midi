import { useEffect, useState, useRef, type ReactElement } from "react";
import { RackRow } from "./RackRow";
import PatchingModal from "./PatchingModal";
import { useTrevorSelector } from "../store";

import type {
	MidiDevice,
	MidiDeviceSection,
	MidiDeviceWithSection,
	VirtualDevice,
	VirtualParameter,
} from "../model";
import { buildSectionId, drawConnection } from "../utils/svgUtils";
import { AboutModal } from "./AboutModal";
import { SaveModal } from "./SaveModal";
import { RackRowVirtual } from "./RackRowVirtual";
import { useTrevorWebSocket } from "../websocket";

function isVirtualDevice(
	device: VirtualDevice | MidiDevice,
): device is VirtualDevice {
	return (device as VirtualDevice).paused !== undefined;
}

const DevicePatching = () => {
	const mainSectionRef = useRef(null);
	const [rackRowHeight, setRackRowHeight] = useState(150); // Default height
	const [associateMode, setAssociateMode] = useState(false);
	const [selectedSections, setSelectedSections] = useState<
		MidiDeviceWithSection[]
	>([]);
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [isAboutOpen, setIsAboutOpen] = useState(false);
	const [isSaveOpen, setIsSaveOpen] = useState(false);

	const [selectedSection, setSelectedSection] = useState<{
		firstSection: MidiDeviceWithSection | null;
		secondSection: MidiDeviceWithSection | null;
	}>({ firstSection: null, secondSection: null });
	const allConnections = useTrevorSelector(
		(state) => state.nallely.connections,
	);
	const svgRef = useRef<SVGSVGElement>(null);

	const midi_devices = useTrevorSelector((state) => state.nallely.midi_devices);
	const virtual_devices = useTrevorSelector(
		(state) => state.nallely.virtual_devices,
	);
	const trevorSocket = useTrevorWebSocket();
	const [information, setInformation] = useState<ReactElement | null>(null);
	const [currentSelected, setCurrentSelected] = useState<number>();
	const [tempValues, setTempValues] = useState<
		Record<number, Record<string, string | undefined>>
	>({});

	useEffect(() => {
		const updateRackRowHeight = () => {
			// if (mainSectionRef.current) {
			// 	const mainSectionHeight = mainSectionRef.current.offsetHeight;
			// 	setRackRowHeight(mainSectionHeight); // Adjust height to fit
			// }
		};

		// updateRackRowHeight();

		window.addEventListener("resize", updateRackRowHeight); // Recalculate on window resize
		return () => {
			window.removeEventListener("resize", updateRackRowHeight);
		};
	}, []); // Run only once on mount

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
					value={value.toString()}
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
				<input
					type="text"
					inputMode="decimal"
					value={currentValue}
					onChange={(e) => {
						const val = e.target.value;

						// Store user-typed value temporarily
						setTempValues((prev) => ({
							...prev,
							[device.id]: {
								...prev[device.id],
								[parameter.name]: val, // Store the raw string input
							},
						}));

						// If valid, send to backend and clear the temp state
						const parsed = val.includes(".")
							? Number.parseFloat(val)
							: Number.parseInt(val);

						if (!Number.isNaN(parsed) && val.match(/^(\d+|\d*\.\d*[1-9])$/)) {
							trevorSocket?.setVirtualValue(device, parameter, parsed);

							// Clear temp value so Redux takes over rendering
							setTempValues({
								...tempValues,
								[device.id]: {
									...tempValues[device.id],
									[parameter.name]: undefined,
								},
							});
						}
					}}
				/>
			);
		}
		if (typeof value === "string") {
			return (
				<input
					type="text"
					value={currentValue}
					onChange={(e) => {
						// const newVal = e.target.value;
						// trevorSocket?.setVirtualValue(device, parameter, newVal);
						const val = e.target.value;

						// Store user-typed value temporarily
						setTempValues((prev) => ({
							...prev,
							[device.id]: {
								...prev[device.id],
								[parameter.name]: val, // Store the raw string input
							},
						}));
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
						const newVal = Boolean(e.target.value);
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
			return;
		}
		if (isVirtualDevice(device)) {
			setInformation(
				<>
					<p style={{ marginLeft: "5px" }}>{device.meta.name}</p>
					{device.meta.parameters.map((param) => (
						<p
							key={param.name}
							style={{ marginTop: 0, marginBottom: 0, marginLeft: "10px" }}
						>
							{""}
							{param.name}:{" "}
							{createInput(device, param, device.config[param.name])}
						</p>
					))}
				</>,
			);
		} else {
			setInformation(
				<>
					<p style={{ marginLeft: "5px" }}>
						{device.meta.name} {section?.name}
					</p>
					{section?.parameters.map((param) => (
						<p
							key={param.name}
							style={{ marginTop: 0, marginBottom: 0, marginLeft: "10px" }}
						>
							{""}
							{param.name}: {device.config[param.module_state_name][param.name]}
						</p>
					))}
				</>,
			);
		}
	};

	useEffect(() => {
		updateInfo(
			[...midi_devices, ...virtual_devices].find(
				(d) => d.id === currentSelected,
			),
		);
	}, [tempValues, midi_devices, virtual_devices]);

	const handleParameterClick = (
		device: VirtualDevice,
		// parameter: VirtualParameter,
	) => {
		if (!associateMode) {
			updateInfo(device);
			setCurrentSelected(device.id);
			return;
		}
	};

	const handleSectionClick = (
		device: MidiDevice,
		section: MidiDeviceSection,
	) => {
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
			}
			setSelectedSections(newSelection);
		}
	};

	const closeModal = () => {
		setIsModalOpen(false);
		setIsAboutOpen(false);
		setSelectedSections([]);
		setIsSaveOpen(false);
	};

	const updateConnections = () => {
		const svg = svgRef.current;
		if (!svg) return;

		for (const line of svg.querySelectorAll("line")) {
			line.remove();
		}

		for (const connection of allConnections) {
			const srcId = buildSectionId(
				connection.src.device,
				connection.src.parameter.module_state_name,
			);
			const destId = buildSectionId(
				connection.dest.device,
				connection.dest.parameter.module_state_name,
			);
			const fromElement = document.querySelector(`[id="${srcId}"]`);
			const toElement = document.querySelector(`[id="${destId}"]`);
			drawConnection(svg, fromElement, toElement, false);
		}
	};

	useEffect(() => {
		updateConnections();
	}, [allConnections]); // Update lines when connections change

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
	}, [allConnections]);

	const handleDeviceDrop = (
		draggedDevice: any,
		targetSlot: number,
		targetRow: number,
	) => {
		// Handle device drop logic
		updateConnections(); // Update connections after device drop
	};

	const addDeviceToRack = (newDevice: any) => {
		// Handle adding device to rack logic
	};

	const handleNonSectionClick = () => {
		setSelectedSections([]); // Deselect sections
	};

	return (
		<div className="device-patching">
			<div
				className="device-patching-main-section"
				ref={mainSectionRef}
				style={{ overflow: "hidden" }} // Prevent scrollbars
			>
				<RackRow
					devices={midi_devices}
					height={rackRowHeight}
					rowIndex={0}
					onDeviceDrop={handleDeviceDrop}
					onSectionClick={handleSectionClick}
					onNonSectionClick={handleNonSectionClick}
					selectedSections={selectedSections.map(
						(d) =>
							`${d.device.id}-${d.section.parameters[0]?.module_state_name}`,
					)}
				/>
				<RackRowVirtual
					devices={virtual_devices}
					height={rackRowHeight}
					rowIndex={0}
					onDeviceDrop={handleDeviceDrop}
					onParameterClick={handleParameterClick}
					onNonSectionClick={handleNonSectionClick}
					selectedSections={selectedSections.map(
						(d) =>
							`${d.device.id}-${d.section.parameters[0]?.module_state_name}`,
					)}
				/>
				<svg className="device-patching-svg" ref={svgRef} />
			</div>
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
						onClick={openAboutModal}
					>
						Load
					</button>
				</div>
				<div className="device-patching-middle-panel">
					<div className="information-panel">
						<h3>Information</h3>
						{information ? (
							information
						) : (
							<p>Select a section to view details or associate sections</p>
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
						onClick={openAboutModal}
					>
						About
					</button>
				</div>
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
		</div>
	);
};

export default DevicePatching;

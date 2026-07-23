/** biome-ignore-all lint/a11y/noLabelWithoutControl: <explanation> */
import {
	lazy,
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
	VirtualDevice,
	VirtualDeviceSection,
	VirtualDeviceWithSection,
} from "../model";
import { useTrevorDispatch, useTrevorSelector } from "../store";
import { setCurrentAddress } from "../store/runtimeSlice";
import {
	connectionId,
	devUID,
	isVirtualDevice,
	rejectedClasses,
} from "../utils/utils";
import { useTrevorWebSocket } from "../websockets/websocket";
import { useConnectionDrawing } from "../hooks/useConnectionDrawing";
import { SidePanel } from "./SidePanel";
import { AboutModal } from "./modals/AboutModal";
import { MemoryModal } from "./modals/MemoryModal";
import PatchingModal from "./modals/PatchingModal";
import { Portal } from "./Portal";
import { RackRow } from "./RackRow";
import { type RackRowCCRef, RackRowCCs } from "./RackRowCC";
import { RackRowVirtual } from "./RackRowVirtual";
import { type RackRowWidgetRef, RackRowWidgets } from "./RackRowWidgets";

const Playground = lazy(() =>
	import("./modals/Playground").then((module) => ({
		default: module.Playground,
	})),
);

interface DevicePatchingProps {
	open3DView?: (open: boolean) => void;
}

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

	const midi_devices = useTrevorSelector((state) => state.nallely.midi_devices);
	const virtual_devices = useTrevorSelector(
		(state) => state.nallely.virtual_devices,
	);
	const trevorSocket = useTrevorWebSocket();
	const [currentSelected, setCurrentSelected] = useState<string>();
	const setCurrentSelectedDevice = useCallback(
		(device: MidiDevice | VirtualDevice) => {
			setCurrentSelected(`${device.id}::${device.repr}`);
		},
		[],
	);

	const [selectedConnection, setSelectedConnection] = useState<string>();

	const { svgRef, updateConnections, updateConnectionsThrottled } =
		useConnectionDrawing({
			allConnections,
			selectedConnection,
			selection,
		});

	const widgetRack = useRef<RackRowWidgetRef>(null);
	const ccsRack = useRef<RackRowCCRef>(null);
	const [isExpanded, setIsExpanded] = useState<boolean>(false);
	const [orientation, setOrientation] = useState<"horizontal" | "vertical">(
		window.innerHeight < 450 ? "horizontal" : "vertical",
	);

	const [displayedSection, setDisplayedSection] = useState<
		MidiDeviceWithSection | VirtualDeviceWithSection | undefined
	>(undefined);

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

	const handleMidiDeviceClick = useCallback(
		(device: MidiDevice) => {
			setCurrentSelectedDevice(device);
			if (!associateMode) {
				setIsExpanded(true);
			}
			setSelectedConnection(undefined);
			setSelection([]);
			setDisplayedSection(undefined);
		},
		[associateMode, setCurrentSelectedDevice],
	);

	const handleDeselect = useCallback(() => {
		setCurrentSelected(undefined);
		setSelectedConnection(undefined);
		setSelection([]);
		setDisplayedSection(undefined);
	}, []);

	const resetAll = () => {
		trevorSocket?.resetAll();
		widgetRack.current?.resetAll();
		ccsRack.current?.resetAll();
		setCurrentSelected(undefined);
		setDisplayedSection(undefined);
	};

	const openMemory = () => setIsMemoryOpen(true);

	const handleDeviceSelect = useCallback(
		(device: MidiDevice | VirtualDevice) => {
			if (isVirtualDevice(device)) {
				setSelectedConnection(undefined);
				setDisplayedSection(undefined);
				setCurrentSelectedDevice(device);
				setIsExpanded(true);
				const virtualSection = {
					parameters: device.meta.parameters,
				} as VirtualDeviceSection;
				setSelection([{ device, section: virtualSection }]);
			} else {
				handleMidiDeviceClick(device as MidiDevice);
			}
		},
		[handleMidiDeviceClick, setCurrentSelectedDevice],
	);

	const handleParameterClick = useCallback(
		(device: VirtualDevice) => {
			setSelectedConnection(undefined);
			if (!associateMode) {
				setCurrentSelectedDevice(device);
				const virtualSection = {
					parameters: device.meta.parameters,
				} as VirtualDeviceSection;
				setSelection([{ device, section: virtualSection }]);
				setIsExpanded(true);
				return;
			}
			if (selection.length < 2) {
				const virtualSection = {
					parameters: device.meta.parameters,
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
					}
					setIsModalOpen(true);
				} else {
					setSelection((prev) => [...prev, newElement]);
					setCurrentSelectedDevice(device);
					setDisplayedSection(newElement);
				}
			}
		},
		[associateMode, isExpanded, selection, setCurrentSelectedDevice],
	);

	const handleSectionClick = useCallback(
		(device: MidiDevice, section: MidiDeviceSection) => {
			setSelectedConnection(undefined);
			if (!associateMode) {
				setCurrentSelectedDevice(device);
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
					}
					setIsModalOpen(true);
				} else {
					setCurrentSelectedDevice(device);
					setSelection((prev) => [...prev, newElement]);
				}
			}
		},
		[associateMode, isExpanded, selection, setCurrentSelectedDevice],
	);

	const closeModal = () => {
		setIsModalOpen(false);
		setIsAboutOpen(false);
		setSelection([]);
		setIsPlaygroundOpen(false);
		setIsMemoryOpen(false);
	};

	const handleNonSectionClick = useCallback(() => {
		setSelection([]); // Deselect sections
		setSelectedConnection(undefined);
	}, []);

	const handleConnectionClick = (connection: Connection) => {
		const coId = connectionId(connection);
		if (selectedConnection === coId) {
			setSelectedConnection(undefined);
			setCurrentSelected(undefined);
			return;
		}
		setSelectedConnection(coId);
		setCurrentSelected(connection.id.toString());
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
				setDisplayedSection(undefined);
				setCurrentSelected(undefined);
				return;
			}
			setIsExpanded(true);
			setDisplayedSection(deviceSection);
			setCurrentSelectedDevice(deviceSection.device);
		},
		[displayedSection, isExpanded, setCurrentSelectedDevice],
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
			setCurrentSelectedDevice(deviceSection.device);
		},
		[isExpanded, setCurrentSelectedDevice],
	);

	return (
		<div className={`device-patching ${orientation}`}>
			<div
				className={`device-patching-main-section ${orientation}`}
				ref={mainSectionRef}
				onScroll={updateConnectionsThrottled}
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

			<SidePanel
				isExpanded={isExpanded}
				onToggleExpand={handleExpand}
				currentSelected={currentSelected}
				onDeviceSelect={handleDeviceSelect}
				displayedSection={displayedSection}
				onSectionChange={setDisplayedSection}
				selectedConnection={selectedConnection}
				orientation={orientation}
				onToggleOrientation={toggleOrientation}
				isMemoryOpen={isMemoryOpen}
				onOpenMemory={openMemory}
				onSavePatch={savePatch}
				onOpenPlayground={openPlayground}
				onResetAll={resetAll}
				onOpenAbout={openAboutModal}
				onDeleteAllConnections={deleteAllConnections}
				onConnectionClick={handleConnectionClick}
				onDeselect={handleDeselect}
				onMidiDeviceClick={handleMidiDeviceClick}
			/>
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

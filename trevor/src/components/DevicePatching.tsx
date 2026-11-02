/** biome-ignore-all lint/a11y/noLabelWithoutControl: <explanation> */
import {
    lazy,
    Suspense,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { RackScaleContext } from "../hooks/RackScaleContext";
import { ScopeContext } from "../hooks/ScopeContext";
import { useConnectionDrawing } from "../hooks/useConnectionDrawing";
import { useScopeManager } from "../hooks/useScopeManager";
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
import {
    resetCCState,
    setBarSelection,
    setCurrentAddress,
    setHighlightedUnit,
} from "../store/runtimeSlice";
import {
    connectionId,
    devUID,
    isVirtualDevice,
    rejectedClasses,
} from "../utils/utils";
import { useTrevorWebSocket } from "../websockets/websocket";
import { BarLinks, type BarLinksRef } from "./BarLinks";
import { AboutModal } from "./modals/AboutModal";
import { MemoryModal } from "./modals/MemoryModal";
import PatchingModal, { TmpScopeOverlay } from "./modals/PatchingModal";
import { Portal } from "./Portal";
import { RackRow } from "./RackRow";
import { RackRowVirtual } from "./RackRowVirtual";
import { type RackRowWidgetRef, RackRowWidgets } from "./RackRowWidgets";
import { SidePanel } from "./SidePanel";

const Playground = lazy(() =>
	import("./modals/Playground").then((module) => ({
		default: module.Playground,
	})),
);

interface DevicePatchingProps {
	open3DView?: (open: boolean) => void;
}

// a bar is 88px wide in the vertical racks; the zoom on a parameter leaves 50% around it
const BAR_WIDTH = 88;
const PARAMETER_MARGIN = 1.5;

const DevicePatching = ({ open3DView }: DevicePatchingProps) => {
	const mainSectionRef = useRef(null);
	const oldView = useTrevorSelector((state) => state.runTime.oldView);
	const rackZoom = useTrevorSelector((state) => state.runTime.rackZoom);
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

	const scope = useScopeManager();
	const scopeContext = useMemo(
		() => ({
			toggle: (parameterId: string, portElemId: string) =>
				scope.handleScopeLongPress(parameterId, portElemId, -1),
			activePortIds: scope.scopePortElemIds,
			manager: scope,
		}),
		[
			scope.handleScopeLongPress,
			scope.scopePortElemIds,
			scope.numScopeChannels,
			scope.isScopeOpen,
			scope.closeAllScopeChannels,
		],
	);
	const barLinks = useRef<BarLinksRef>(null);
	const redrawLinks = useCallback(() => {
		updateConnections();
		barLinks.current?.redraw();
	}, [updateConnections]);
	const redrawLinksThrottled = useCallback(() => {
		updateConnectionsThrottled();
		barLinks.current?.redraw();
	}, [updateConnectionsThrottled]);

	const widgetRack = useRef<RackRowWidgetRef>(null);
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
		dispatch(resetCCState());
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

	// the "<" button of a title bar: select the device and open the side panel on it
	const handleOpenPanel = useCallback(
		(device: MidiDevice | VirtualDevice) => {
			// the button of the device already shown in the panel closes it
			if (isExpanded && currentSelected === `${device.id}::${device.repr}`) {
				setIsExpanded(false);
				setSelection([]);
				return;
			}
			setCurrentSelectedDevice(device);
			setSelectedConnection(undefined);
			setDisplayedSection(undefined);
			setSelection(
				isVirtualDevice(device)
					? [
							{
								device,
								section: {
									parameters: device.meta.parameters,
								} as VirtualDeviceSection,
							},
						]
					: [],
			);
			setIsExpanded(true);
		},
		[setCurrentSelectedDevice, isExpanded, currentSelected],
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
		dispatch(resetCCState());
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

	// a press anywhere but on a device (or the menu of one of its parameters) drops the
	// selected parameter and the highlighted links
	useEffect(() => {
		const onPointerDown = (event: PointerEvent) => {
			if (
				event.target instanceof Element &&
				event.target.closest("[data-link-device], [data-bar-menu]")
			)
				return;
			dispatch(setBarSelection(null));
			dispatch(setHighlightedUnit(null));
		};
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, [dispatch]);
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

	const [rackScale, setRackScale] = useState(1);
	const [zoomHeight, setZoomHeight] = useState<number | null>(null);
	const zoomed = rackZoom > 0 && !oldView;
	useLayoutEffect(() => {
		const main = mainSectionRef.current as HTMLElement | null;
		if (!zoomed || !main) {
			setRackScale(1);
			setZoomHeight(null);
			return undefined;
		}
		const fit = () => {
			const rack = main.querySelector(".rack-row") as HTMLElement | null;
			if (!rack) return;
			const barTop =
				document
					.querySelector<HTMLElement>(".notification-bar")
					?.getBoundingClientRect().top ?? window.innerHeight;
			const height = Math.max(
				100,
				Math.floor(
					Math.min(
						main.parentElement?.clientHeight ?? Number.POSITIVE_INFINITY,
						barTop - main.getBoundingClientRect().top,
					),
				),
			);
			setZoomHeight(height);
			const rackHeight = rack.offsetHeight + 10;
			const scale =
				orientation === "vertical"
					? main.offsetWidth /
						(rackZoom === 2
							? BAR_WIDTH * PARAMETER_MARGIN
							: rack.offsetWidth + 10)
					: height / (rackZoom === 2 ? rackHeight : 2 * rackHeight);
			setRackScale(Math.max(1, scale));
		};
		fit();
		main.scrollTo(0, 0);
		const resize = new ResizeObserver(fit);
		if (main.parentElement) resize.observe(main.parentElement);
		window.addEventListener("resize", fit);
		return () => {
			resize.disconnect();
			window.removeEventListener("resize", fit);
		};
	}, [zoomed, orientation, rackZoom]);
	useEffect(() => {
		const frame = requestAnimationFrame(redrawLinks);
		return () => cancelAnimationFrame(frame);
	}, [rackScale, zoomHeight, redrawLinks]);
	const racksStyle: React.CSSProperties | undefined =
		rackScale === 1
			? undefined
			: orientation === "vertical"
				? {
						transform: `scale(${rackScale})`,
						transformOrigin: "0 0",
						width: "max-content",
						minWidth: `${100 / rackScale}%`,
						height: `${(zoomHeight ?? 0) / rackScale}px`,
						alignSelf: "flex-start",
					}
				: {
						transform: `scale(${rackScale})`,
						transformOrigin: "0 0",
						width: `${100 / rackScale}%`,
					};
	const mainStyle: React.CSSProperties | undefined =
		zoomed && zoomHeight !== null
			? { height: zoomHeight, alignSelf: "flex-start" }
			: undefined;

	return (
		<ScopeContext.Provider value={scopeContext}>
			<RackScaleContext.Provider value={rackScale}>
				<div className={`device-patching ${orientation}`}>
					<div
						className={`device-patching-main-section ${orientation}`}
						ref={mainSectionRef}
						style={mainStyle}
					>
						<div
							className={`device-patching-racks ${orientation}`}
							style={racksStyle}
						>
							<RackRow
								devices={midi_devices}
								onSectionClick={handleSectionClick}
								onNonSectionClick={handleNonSectionClick}
								selectedSections={selectedSectionIds}
								onSectionScroll={redrawLinksThrottled}
								onDeviceClick={handleMidiDeviceClick}
								onOpenPanel={handleOpenPanel}
								openPanelDevice={isExpanded ? currentSelected : undefined}
								orientation={orientation}
								onDeviceDrop={redrawLinks}
								onDragEnd={redrawLinks}
							/>
							<RackRowVirtual
								devices={virtual_devices.filter(
									(device) => !rejectedClasses.includes(device.meta.name),
								)}
								onParameterClick={handleParameterClick}
								onOpenPanel={handleOpenPanel}
								openPanelDevice={isExpanded ? currentSelected : undefined}
								onNonSectionClick={handleNonSectionClick}
								selectedSections={selectedVirtualSectionIds}
								onSectionScroll={redrawLinksThrottled}
								orientation={orientation}
								onDeviceDrop={redrawLinks}
								onDragEnd={redrawLinks}
							/>
							<RackRowWidgets
								ref={widgetRack}
								onAddWidget={redrawLinks}
								orientation={orientation}
								onDragEnd={redrawLinks}
								onRackScroll={redrawLinksThrottled}
								onNonSectionClick={handleNonSectionClick}
							/>
						</div>
						<svg
							className={`device-patching-svg ${orientation}`}
							ref={svgRef}
						/>
						{!oldView && (
							<BarLinks
								ref={barLinks}
								containerRef={mainSectionRef}
								scale={rackScale}
							/>
						)}
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
					{scope.isScopeOpen && !isModalOpen && (
						<Portal>
							<TmpScopeOverlay
								onClose={scope.closeAllScopeChannels}
								numChannels={scope.numScopeChannels}
								portElemIds={scope.scopePortElemIds}
							/>
						</Portal>
					)}
				</div>
			</RackScaleContext.Provider>
		</ScopeContext.Provider>
	);
};

export default DevicePatching;

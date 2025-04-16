import { useEffect, useState, useRef, type ReactElement } from "react";
import { RackRow } from "./RackRow";
import PatchingModal from "./PatchingModal";
import { useTrevorSelector } from "../store";

import type {
	MidiDevice,
	MidiDeviceSection,
	MidiDeviceWithSection,
} from "../model";
import { buildSectionId, drawConnection } from "../utils/svgUtils";
import { AboutModal } from "./AboutModal";
import { SaveModal } from "./SaveModal";

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

	const devices = useTrevorSelector((state) => state.nallely.midi_devices);
	const [information, setInformation] = useState<ReactElement | null>(null);

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

	const handleSectionClick = (
		device: MidiDevice,
		section: MidiDeviceSection,
	) => {
		if (!associateMode) {
			setInformation(
				<>
					<p>
						{device.meta.name} {section.name}
					</p>
					{section.parameters.map((param) => (
						<p key={param.name}> - {param.name}</p>
					))}
				</>,
			);
			return;
		}

		setSelectedSections((prev) => {
			if (
				prev.find(
					(e) => e.device.id === device.id && e.section.name === section.name,
				)
			) {
				// Unselect if already selected
				return prev.filter(
					(s) => s.device.id !== device.id || s.section.name !== section.name,
				);
			}
			if (prev.length < 2) {
				// Add to selection if less than 2 sections are selected
				const newSelection = [...prev, { device, section }];
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
				return newSelection;
			}
			return prev;
		});
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
					devices={devices}
					height={rackRowHeight}
					rowIndex={0}
					onDeviceDrop={handleDeviceDrop}
					onSectionClick={handleSectionClick}
					onNonSectionClick={handleNonSectionClick}
					selectedSections={selectedSections.map((d) => d.section.name)}
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

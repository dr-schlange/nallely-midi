import { useEffect, useState, useRef, type ReactElement } from "react";
import { RackRow } from "./RackRow";
import PatchingModal from "./PatchingModal";
import { useTrevorSelector } from "../../store";
import type {
	MidiDevice,
	MidiDeviceSection,
	MidiDeviceWithSection,
} from "../../model";

const DevicePatching = () => {
	const mainSectionRef = useRef(null);
	const [rackRowHeight, setRackRowHeight] = useState(170); // Default height
	const [associateMode, setAssociateMode] = useState(false);
	const [selectedSections, setSelectedSections] = useState<
		MidiDeviceWithSection[]
	>([]);
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [selectedSection, setSelectedSection] = useState<{
		firstSection: MidiDeviceWithSection | null;
		secondSection: MidiDeviceWithSection | null;
	}>({ firstSection: null, secondSection: null });
	const [connections, setConnections] = useState<
		{ from: string; to: string }[]
	>([]); // Store connections

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
		setSelectedSections([]); // Reset selected sections, but keep associate mode active
	};

	const updateConnections = () => {
		const svg = document.querySelector(".device-patching-svg") as SVGSVGElement;
		if (!svg) return;

		svg.innerHTML = ""; // Clear existing lines

		for (const connection of connections) {
			const fromElement = document.querySelector(
				`[data-dp-section-id="${connection.from}"]`,
			);
			const toElement = document.querySelector(
				`[data-dp-section-id="${connection.to}"]`,
			);

			if (fromElement && toElement) {
				const fromRect = fromElement.getBoundingClientRect();
				const toRect = toElement.getBoundingClientRect();
				const svgRect = svg.getBoundingClientRect();

				const fromX = fromRect.right - svgRect.left; // Right side of the source
				const fromY = fromRect.top + fromRect.height / 2 - svgRect.top; // Center vertically
				const toX = toRect.left - svgRect.left; // Left side of the target
				const toY = toRect.top + toRect.height / 2 - svgRect.top; // Center vertically

				const line = document.createElementNS(
					"http://www.w3.org/2000/svg",
					"line",
				);
				line.setAttribute("x1", fromX.toString());
				line.setAttribute("y1", fromY.toString());
				line.setAttribute("x2", toX.toString());
				line.setAttribute("y2", toY.toString());
				line.setAttribute("stroke", "orange");
				line.setAttribute("stroke-width", "2");
				svg.appendChild(line);
			}
		}
	};

	useEffect(() => {
		updateConnections();
	}, [connections]); // Update lines when connections change

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
			<svg
				className="device-patching-svg"
				style={{
					position: "absolute",
					width: "100%",
					height: "100%",
					pointerEvents: "none",
				}}
			/>
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
				<div className="device-patching-bottom-panel" />
			</div>
			{isModalOpen && (
				<PatchingModal
					onClose={closeModal}
					firstSection={selectedSection.firstSection}
					secondSection={selectedSection.secondSection}
					onConnectionCreate={(newConnection) =>
						setConnections((prev) => [...prev, newConnection])
					}
				/>
			)}
		</div>
	);
};

export default DevicePatching;

import MidiDeviceComponent from "./DeviceComponent";
import type { MidiDevice, MidiDeviceSection } from "../../model";

export const RackRow = ({
	height,
	rowIndex,
	onDeviceDrop,
	onSectionClick,
	selectedSections,
	onNonSectionClick,
	devices,
}: {
	height: number;
	rowIndex: number;
	devices: MidiDevice[];
	onDeviceDrop: (
		draggedDevice: any,
		targetSlot: number,
		targetRow: number,
	) => void;
	onSectionClick: (device: MidiDevice, section: MidiDeviceSection) => void;
	selectedSections: string[];
	onNonSectionClick: () => void;
}) => {
	const slotWidth = 250;

	const handleDragStart = (event: React.DragEvent, device: any) => {
		event.dataTransfer.setData(
			"device",
			JSON.stringify({ ...device, rowIndex }),
		);
	};

	const handleDrop = (event: React.DragEvent, targetSlot: number) => {
		const draggedDevice = JSON.parse(event.dataTransfer.getData("device"));
		onDeviceDrop(draggedDevice, targetSlot, rowIndex);
	};

	const handleDragOver = (event: React.DragEvent) => {
		event.preventDefault();
	};

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
		<div
			className="rack-row"
			style={{
				height, // Fixed height for the RackRow
				width: "100%", // Fill the parent container horizontally
				position: "relative",
				overflow: "visible", // Allow overflow to simulate additional rows
				display: "flex",
				flexWrap: "wrap", // Wrap devices to the next "row" when overflowing
			}}
			onClick={(event) => {
				if (
					!(event.target as HTMLElement).classList.contains(
						"rack-section-box",
					) &&
					!(event.target as HTMLElement).classList.contains("rack-section-name")
				) {
					onNonSectionClick(); // Trigger deselection if clicking outside sections
				}
			}}
		>
			{devices.map((device, i) => (
				<div
					key={device.id}
					data-rack-slot={i}
					style={{
						position: "absolute",
						left: i * slotWidth + 5,
						top: "50%", // Center vertically
						transform: "translateY(-50%)", // Adjust to center the device properly
					}}
				>
					<MidiDeviceComponent
						height={height}
						device={device}
						onSectionClick={(section) => onSectionClick(device, section)}
						selectedSections={selectedSections}
					/>
				</div>
			))}
		</div>
	);
};

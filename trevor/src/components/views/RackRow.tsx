import DeviceComponent from "./DeviceComponent";
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
					onDrop={(event) => handleDrop(event, device.id)}
					onDragOver={handleDragOver}
					style={{
						width: slotWidth,
						height,
						boxSizing: "border-box",
					}}
				>
					<DeviceComponent
						slot={i}
						slotWidth={slotWidth}
						height={height}
						device={device}
						onDragStart={(event) => handleDragStart(event, device)}
						onDragEnd={() => {}}
						onSectionClick={(section) => onSectionClick(device, section)}
						selectedSections={selectedSections}
						onNonSectionClick={onNonSectionClick} // Pass the function
					/>
				</div>
			))}
		</div>
	);
};

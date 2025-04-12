import DeviceComponent from "./Device";
import type { MidiDevice } from "../../model";

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
	onSectionClick: (sectionId: string) => void;
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
				height,
				position: "relative",
				overflow: "hidden",
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
						position: "absolute",
						left: i * slotWidth,
						width: slotWidth,
						height: "100%",
					}}
				>
					<DeviceComponent
						slot={i}
						slotWidth={slotWidth}
						height={height}
						name={device.meta.name}
						sections={device.meta.sections}
						onDragStart={(event) => handleDragStart(event, device)}
						onDragEnd={() => {}}
						onSectionClick={onSectionClick}
						selectedSections={selectedSections}
						onNonSectionClick={onNonSectionClick} // Pass the function
					/>
				</div>
			))}
		</div>
	);
};

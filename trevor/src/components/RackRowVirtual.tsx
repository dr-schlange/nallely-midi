import type { VirtualDevice, VirtualParameter } from "../model";
import VirtualDeviceComponent from "./VirtualDeviceComponent";

export const RackRowVirtual = ({
	height,
	rowIndex,
	onDeviceDrop,
	onParameterClick,
	selectedSections,
	onNonSectionClick,
	devices,
	onSectionScroll,
}: {
	height: number;
	rowIndex: number;
	devices: VirtualDevice[];
	onDeviceDrop: (
		draggedDevice: any,
		targetSlot: number,
		targetRow: number,
	) => void;
	onParameterClick: (device: VirtualDevice, section?: VirtualParameter) => void;
	selectedSections: string[];
	onNonSectionClick: () => void;
	onSectionScroll?: () => void;
}) => {
	const slotWidth = 210;

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
					<VirtualDeviceComponent
						height={height}
						device={device}
						onParameterClick={(parameter) =>
							onParameterClick(device, parameter)
						}
						onDeviceClick={(device) => onParameterClick(device)}
						selectedSections={selectedSections}
						onSectionScroll={onSectionScroll}
					/>
				</div>
			))}
		</div>
	);
};

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
				<VirtualDeviceComponent
					key={device.id}
					// height={height}
					device={device}
					onParameterClick={(parameter) => onParameterClick(device, parameter)}
					onDeviceClick={(device) => onParameterClick(device)}
					selectedSections={selectedSections}
					onSectionScroll={onSectionScroll}
				/>
			))}
		</div>
	);
};

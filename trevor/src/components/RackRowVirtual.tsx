import { useMemo } from "react";
import type { VirtualDevice, VirtualParameter } from "../model";
import VirtualDeviceComponent from "./VirtualDeviceComponent";
import { useTrevorSelector } from "../store";
import { useTrevorWebSocket } from "../websockets/websocket";

export const RackRowVirtual = ({
	height,
	rowIndex,
	onDeviceDrop,
	onParameterClick,
	selectedSections,
	onNonSectionClick,
	devices,
	onSectionScroll,
	horizontal,
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
	horizontal?: boolean;
}) => {
	const virtualClasses = useTrevorSelector(
		(state) => state.nallely.classes.virtual,
	);

	const trevorSocket = useTrevorWebSocket();
	const handleDeviceClassClick = (deviceClass: string) => {
		trevorSocket?.createDevice(deviceClass);
	};

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
		<div
			className={`rack-row ${horizontal ? "horizontal" : ""}`}
			onScroll={() => onSectionScroll()}
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
			<select
				value={""}
				title="Adds a virtual device to the system"
				onChange={(e) => {
					const val = e.target.value;
					handleDeviceClassClick(val);
				}}
			>
				<option value={""}>--</option>
				{virtualClasses.map((cls) => (
					<option key={cls} value={cls}>
						{cls}
					</option>
				))}
			</select>
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
			{devices.length === 0 && (
				<p style={{ color: "#808080" }}>Virtual devices</p>
			)}
		</div>
	);
};

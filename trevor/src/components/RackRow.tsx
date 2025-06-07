import MidiDeviceComponent from "./DeviceComponent";
import type { MidiDevice, MidiDeviceSection } from "../model";
import { useTrevorSelector } from "../store";
import { useTrevorWebSocket } from "../websockets/websocket";

export const RackRow = ({
	rowIndex,
	onDeviceDrop,
	onSectionClick,
	selectedSections,
	onNonSectionClick,
	devices,
	onSectionScroll,
	onDeviceClick,
	horizontal,
}: {
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
	onSectionScroll?: () => void;
	onDeviceClick?: (device: MidiDevice) => void;
	horizontal?: boolean;
}) => {
	const midiClasses = useTrevorSelector((state) => state.nallely.classes.midi);

	const trevorSocket = useTrevorWebSocket();
	const handleDeviceClassClick = (deviceClass: string) => {
		trevorSocket?.createDevice(deviceClass);
	};

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
		<div
			className={`rack-row ${horizontal ? "horizontal" : ""}`}
			onScroll={() => onSectionScroll?.()}
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
				title="Adds a MIDI device to the system"
				onChange={(e) => {
					const val = e.target.value;
					handleDeviceClassClick(val);
				}}
			>
				<option value={""}>--</option>
				{midiClasses.map((cls) => (
					<option key={cls} value={cls}>
						{cls}
					</option>
				))}
			</select>
			{devices.map((device, i) => (
				<MidiDeviceComponent
					key={device.id}
					// height={height}
					device={device}
					onSectionClick={(section) => onSectionClick(device, section)}
					selectedSections={selectedSections}
					onDeviceClick={onDeviceClick}
				/>
			))}
			{devices.length === 0 && <p style={{ color: "#808080" }}>MIDI devices</p>}
		</div>
	);
};

import { useMemo } from "react";
import type {
	Connection,
	MidiDevice,
	MidiDeviceWithSection,
	VirtualDevice,
	VirtualDeviceWithSection,
} from "../model";
import { useTrevorSelector } from "../store";
import { useTrevorWebSocket } from "../websockets/websocket";
import { ConnectionList } from "./ConnectionList";
import { DeviceInfoPanel } from "./DeviceInfoPanel";
import { Button } from "./widgets/BaseComponents";

const ORIENTATIONS = {
	horizontal: "⇅",
	vertical: "⇄",
};

interface SidePanelProps {
	isExpanded: boolean;
	onToggleExpand: () => void;
	currentSelected: string | undefined;
	onDeviceSelect: (device: MidiDevice | VirtualDevice) => void;
	displayedSection:
		| MidiDeviceWithSection
		| VirtualDeviceWithSection
		| undefined;
	onSectionChange: (
		section: MidiDeviceWithSection | VirtualDeviceWithSection | undefined,
	) => void;
	selectedConnection: string | undefined;
	orientation: "horizontal" | "vertical";
	onToggleOrientation: () => void;
	isMemoryOpen: boolean;
	onOpenMemory: () => void;
	onSavePatch: () => void;
	onOpenPlayground: () => void;
	onResetAll: () => void;
	onOpenAbout: () => void;
	onDeleteAllConnections: () => void;
	onConnectionClick: (connection: Connection) => void;
	onDeselect: () => void;
	onMidiDeviceClick: (device: MidiDevice) => void;
}

export const SidePanel = ({
	isExpanded,
	onToggleExpand,
	currentSelected,
	onDeviceSelect,
	displayedSection,
	onSectionChange,
	selectedConnection,
	orientation,
	onToggleOrientation,
	isMemoryOpen,
	onOpenMemory,
	onSavePatch,
	onOpenPlayground,
	onResetAll,
	onOpenAbout,
	onDeleteAllConnections,
	onConnectionClick,
	onDeselect,
	onMidiDeviceClick,
}: SidePanelProps) => {
	const trevorSocket = useTrevorWebSocket();
	const midi_devices = useTrevorSelector((state) => state.nallely.midi_devices);
	const virtual_devices = useTrevorSelector(
		(state) => state.nallely.virtual_devices,
	);
	const currentAddress = useTrevorSelector(
		(state) => state.runTime.currentAddress,
	);

	const all_devices = useMemo(
		() => [...midi_devices, ...virtual_devices],
		[midi_devices, virtual_devices],
	);

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				gap: "2px",
				paddingLeft: "2px",
				...(isExpanded
					? {
							minWidth: "262px",
							overflowY: "auto",
							height: "100%",
							backgroundColor: "rgb(192, 192, 192)",
							zIndex: 35,
						}
					: {
							minWidth: "40px",
						}),
			}}
		>
			<Button
				text={isExpanded ? "»" : "«"}
				tooltip={isExpanded ? "Open panel" : "Close panel"}
				onClick={onToggleExpand}
				activated={isExpanded}
				style={{
					width: "inherit",
					textAlign: "left",
					paddingLeft: "4px",
					height: "20px",
				}}
			/>
			{isExpanded ? (
				<div className="device-patching-side-section">
					<div
						style={{
							display: "flex",
							gap: "4px",
							alignItems: "center",
							padding: "4px",
						}}
					>
						<Button
							text={"⟳"}
							tooltip="Pull full state"
							variant={"big"}
							style={{ backgroundColor: "var(--button-bg-color)" }}
							onClick={() => trevorSocket?.pullFullState()}
						/>
						<select
							style={{ width: "100%" }}
							value={currentSelected ?? ""}
							title="Select device to setup"
							onChange={(e) => {
								const val = e.target.value;
								const device = all_devices.find(
									(d) => `${d.id}::${d.repr}` === val,
								);
								if (!device) return;
								onDeviceSelect(device);
							}}
						>
							<option value={""} dir="ltr">
								--
							</option>
							{all_devices.map((device) => (
								<option
									key={device.repr}
									value={`${device.id}::${device.repr}`}
									dir="ltr"
								>
									{device.repr}
								</option>
							))}
						</select>
					</div>
					<div>
						<div className="device-patching-middle-panel">
							<div className="information-panel">
								<DeviceInfoPanel
									currentSelected={currentSelected}
									displayedSection={displayedSection}
									onDeselect={onDeselect}
									onMidiDeviceClick={onMidiDeviceClick}
									onSectionChange={onSectionChange}
								/>
							</div>
						</div>
						<div className="bottom-right-panel">
							<ConnectionList
								selectedConnection={selectedConnection}
								onConnectionClick={onConnectionClick}
								onDeleteAllConnections={onDeleteAllConnections}
							/>
						</div>
					</div>
					<div className="device-patching-top-panel">
						<Button
							text="Addresses"
							tooltip="Opens the memory manager"
							onClick={onOpenMemory}
							activated={isMemoryOpen}
							className="menu-button"
						/>
						<Button
							text={`Save at 0x${currentAddress?.hex ?? "????"}`}
							tooltip={`Save the session at address  0x${currentAddress?.hex ?? "????"}`}
							onClick={onSavePatch}
							className="menu-button"
						/>
					</div>
					<div className="device-patching-top-panel">
						<Button
							text="Open playground"
							tooltip="Opens the playground"
							onClick={onOpenPlayground}
							className="menu-button"
						/>
					</div>
					<div className="device-patching-top-panel">
						<Button
							text="Reset all"
							tooltip="Reset the session"
							onClick={onResetAll}
							className="menu-button"
						/>
					</div>
					<div className="device-patching-top-panel">
						<Button
							text="About"
							tooltip="Opens the about menu"
							onClick={onOpenAbout}
							className="menu-button"
						/>
					</div>
				</div>
			) : (
				<div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
					<Button
						text={ORIENTATIONS[orientation]}
						tooltip="Change orientation"
						onClick={onToggleOrientation}
						style={{
							width: "inherit",
							height: "37px",
						}}
					/>
					<Button
						text="💾"
						tooltip="Save patch"
						onClick={onSavePatch}
						style={{
							width: "inherit",
							height: "37px",
						}}
					/>
					<Button
						text={`0x${currentAddress?.hex ?? "????"}`}
						tooltip="Manage memory"
						onClick={onOpenMemory}
						style={{
							width: "inherit",
							height: "37px",
							fontSize: "11px",
							color: "var(--black)",
						}}
					/>
				</div>
			)}
		</div>
	);
};

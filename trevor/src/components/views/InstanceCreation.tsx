import { useState } from "react";
import MidiDeviceComponent from "./DeviceComponent";
import { useTrevorSelector } from "../../store";

const truncateName = (name: string, maxLength: number) => {
	return name.length > maxLength ? `${name.slice(0, maxLength)}...` : name;
};

const InstanceCreation = ({
	onDeviceCreate = () => {}, // Provide a default no-op function
}: {
	onDeviceCreate?: (device: any) => void; // Make onDeviceCreate optional
}) => {
	const midiInPorts = useTrevorSelector((state) => state.nallely.input_ports);
	const midiOutPorts = useTrevorSelector((state) => state.nallely.output_ports);
	const [selectedInfo, setSelectedInfo] = useState<string | null>(null);
	// const [devices, setDevices] = useState<
	// 	{ id: string; name: string; channel: number; sections: string[] }[]
	// >([]);
	const devices = useTrevorSelector((state) => state.nallely.midi_devices);
	const [selectedDevice, setSelectedDevice] = useState<{
		id: string;
		name: string;
		channel: number;
		sections: string[];
	} | null>(null);

	const deviceClasses = useTrevorSelector((state) => [
		...state.nallely.classes.midi,
		...state.nallely.classes.virtual,
	]);

	const handlePortClick = (info: string) => {
		setSelectedInfo(info);
	};

	const handleDeviceClassClick = (deviceClass: {
		name: string;
		info: string;
	}) => {
		const newDevice = {
			id: `device-${devices.length + 1}`,
			name: `${deviceClass.name} ${devices.length + 1}`,
			channel: 0,
			sections: ["Section 1", "Section 2", "Section 3"], // Example sections
		};
		setDevices((prev) => [...prev, newDevice]); // Add the device to the "Devices" zone
		setSelectedInfo(null); // Clear info panel
		setSelectedDevice(newDevice); // Automatically select the new device
	};

	const handleDeviceClick = (device: {
		id: string;
		name: string;
		channel: number;
		sections: string[];
	}) => {
		setSelectedDevice(device);
		setSelectedInfo(null); // Clear the info panel
	};

	const handleChannelChange = (deviceId: string, newChannel: number) => {
		setDevices((prev) =>
			prev.map((device) =>
				device.id === deviceId ? { ...device, channel: newChannel } : device,
			),
		);
		if (selectedDevice?.id === deviceId) {
			setSelectedDevice((prev) =>
				prev ? { ...prev, channel: newChannel } : null,
			);
		}
	};

	return (
		<div className="instance-creation">
			<div className="instance-creation-top-panel">
				<div className="instance-creation-midi-output">
					<h3>MIDI Output</h3>
					<div className="midi-ports-grid">
						{midiInPorts.map((port) => (
							// biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
							<div
								key={port}
								className="midi-port"
								title={port}
								onClick={() => handlePortClick(port)}
							>
								<span className="midi-port-name">{truncateName(port, 8)}</span>
								<div className="midi-port-circle" />
							</div>
						))}
					</div>
				</div>
				<div className="instance-creation-midi-inputs">
					<h3>MIDI Inputs</h3>
					<div className="midi-ports-grid">
						{midiOutPorts.map((port) => (
							// biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
							<div
								key={port}
								className="midi-port"
								title={port}
								onClick={() => handlePortClick(port)}
							>
								<span className="midi-port-name">{truncateName(port, 8)}</span>
								<div className="midi-port-circle" />
							</div>
						))}
					</div>
				</div>
				<div className="instance-creation-info-panel">
					<h3>Info</h3>
					<div className="info-content">
						{selectedDevice ? (
							<div>
								<p>Device: {selectedDevice.name}</p>
								<label>
									Channel:
									<input
										type="number"
										value={selectedDevice.channel}
										onChange={(e) =>
											handleChannelChange(
												selectedDevice.id,
												Number.parseInt(e.target.value, 10),
											)
										}
									/>
								</label>
							</div>
						) : (
							<p>Select a device to see its details.</p>
						)}
					</div>
				</div>
			</div>
			<div className="instance-creation-bottom-panel">
				<div className="device-class-left-panel">
					<h3>Devices</h3>
					<div
						className="device-list"
						style={{
							display: "flex",
							justifyContent: "center",
							alignItems: "center",
							height: "calc(100% - 40px)",
						}}
					>
						{devices.map((device, i) => (
							<div
								key={device.id}
								data-rack-slot={i}
								style={{
									position: "absolute",
									left: i * 250 + 5,
									transform: "translateY(-50%)", // Adjust to center the device properly
								}}
							>
								<MidiDeviceComponent
									classConnections
									key={device.id}
									slot={0} // Slot is irrelevant here
									slotWidth={250}
									height={170}
									device={device}
								/>
							</div>
						))}
					</div>
				</div>
				<div className="device-class-right-panel">
					<h3>Device Classes</h3>
					<ul className="device-class-list">
						{deviceClasses.map((deviceClass, index) => (
							// biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
							<li
								key={deviceClass}
								className="device-class-item"
								onClick={() => handleDeviceClassClick(deviceClass)}
							>
								{deviceClass}
							</li>
						))}
					</ul>
				</div>
			</div>
		</div>
	);
};

export default InstanceCreation;

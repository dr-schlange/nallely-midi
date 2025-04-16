import { useEffect, useMemo, useRef, useState } from "react";
import MidiDeviceComponent from "./DeviceComponent";
import { useTrevorSelector } from "../store";
import { drawConnection } from "../utils/svgUtils";
import { useTrevorWebSocket } from "../websocket";
import { MidiDevice } from "../model";

const truncateName = (name: string, maxLength: number) => {
	return name.length > maxLength ? `${name.slice(0, maxLength)}...` : name;
};

interface MidiPort {
	name: string;
	direction: string;
}

const InstanceCreation = () => {
	const svgRef = useRef<SVGSVGElement | null>(null);

	const trevorSocket = useTrevorWebSocket();
	const midiInPorts = useTrevorSelector((state) => state.nallely.input_ports);
	const midiOutPorts = useTrevorSelector((state) => state.nallely.output_ports);
	const devices = useTrevorSelector((state) => state.nallely.midi_devices);
	const virtualClasses = useTrevorSelector(
		(state) => state.nallely.classes.virtual,
	);
	const midiClasses = useTrevorSelector((state) => state.nallely.classes.midi);
	const deviceClasses = useMemo(
		() => [...midiClasses, ...virtualClasses],
		[midiClasses, virtualClasses],
	);
	const [selectedDevice, setSelectedDevice] = useState<MidiDevice | null>();
	const [selectedPort, setSelectedPort] = useState<MidiPort | null>();

	useEffect(() => {
		updateConnections();
	}, [devices]);

	const updateConnections = () => {
		if (!svgRef.current) {
			return;
		}
		const svg = svgRef.current;
		for (const line of svg.querySelectorAll("line")) {
			line.remove();
		}
		for (const device of devices) {
			const fromElement = document.querySelector(`[id="${device.id}"]`);
			const toInput = document.querySelector(
				`[id="input-${device.ports.input}"]`,
			);
			const toOutput = document.querySelector(
				`[id="output-${device.ports.output}"]`,
			);
			if (toInput) {
				drawConnection(svg, fromElement, toInput);
			}
			if (toOutput) {
				drawConnection(svg, toOutput, fromElement);
			}
		}
	};

	useEffect(() => {
		const handleResize = () => {
			updateConnections();
		};

		const observer = new ResizeObserver(handleResize);
		if (svgRef.current) {
			observer.observe(svgRef.current.parentElement as HTMLElement);
		}

		return () => {
			observer.disconnect();
		};
	}, [devices]);

	const establishConnection = (device: MidiDevice, port: MidiPort) => {
		trevorSocket?.associatePort(device, port.name, port.direction);
	};

	const handleDeviceClassClick = (deviceClass: string) => {
		trevorSocket?.createDevice(deviceClass);
	};

	const handlePortClick = (port: string, direction: string) => {
		if (selectedPort?.name === port && selectedPort?.direction === direction) {
			setSelectedPort(null);
			return;
		}

		if (selectedDevice) {
			establishConnection(selectedDevice, { name: port, direction });
			setSelectedDevice(null);
		} else {
			setSelectedPort({ name: port, direction });
		}
	};

	const selectDevice = (device: MidiDevice) => {
		if (device === selectedDevice) {
			setSelectedDevice(null);
			return;
		}
		if (selectedPort) {
			establishConnection(device, selectedPort);
			setSelectedPort(null);
		} else {
			setSelectedDevice(device);
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
								onClick={() => handlePortClick(port, "output")}
							>
								<span className="midi-port-name">{truncateName(port, 8)}</span>
								<div
									className="midi-port-circle"
									id={`output-${port}`}
									style={{
										borderColor:
											selectedPort?.name === port && selectedPort?.direction
												? "yellow"
												: "",
									}}
								/>
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
								onClick={() => handlePortClick(port, "input")}
							>
								<span className="midi-port-name">{truncateName(port, 8)}</span>
								<div
									className="midi-port-circle"
									id={`input-${port}`}
									style={{
										borderColor:
											selectedPort?.name === port && selectedPort?.direction
												? "yellow"
												: "",
									}}
								/>
							</div>
						))}
					</div>
				</div>
				{/* <div className="instance-creation-info-panel">
					<h3>Info</h3>
					<div className="info-content">
						{selectedDevice ? (
							<div>
								<p>Device: {selectedDevice.meta.name}</p>
								<p>Sections:</p>
								{selectedDevice.meta.sections.map((section) => (
									<p key={section.name}>{section.name}</p>
								))}
							</div>
						) : (
							<p>Select a device to see its details.</p>
						)}
					</div>
				</div> */}
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
							// biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
							<div
								key={device.id}
								style={{
									position: "absolute",
									left: i * 210 + 5,
									transform: "translateY(-50%)", // Adjust to center the device properly
								}}
								onClick={() => selectDevice(device)}
							>
								<MidiDeviceComponent
									classConnections
									key={device.id}
									device={device}
									selected={selectedDevice === device}
								/>
							</div>
						))}
					</div>
				</div>
				<div className="device-class-right-panel">
					<h3>Device Classes</h3>
					<ul className="device-class-list">
						{deviceClasses.map((deviceClass) => (
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
			<svg className="connection-svg" ref={svgRef}>
				<title>MIDI Device Port Mapping</title>
				<defs>
					<marker
						id="retro-arrowhead"
						markerWidth="6"
						markerHeight="6"
						refX="5"
						refY="3"
						orient="auto"
						markerUnits="strokeWidth"
					>
						<polygon
							points="0,0 5,3 0,6"
							fill="orange"
							stroke="white"
							stroke-width="1"
							stroke-opacity="0.3"
						/>
					</marker>
				</defs>
			</svg>
		</div>
	);
};

export default InstanceCreation;

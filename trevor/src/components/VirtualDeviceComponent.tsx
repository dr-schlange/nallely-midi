import { useState, useEffect, useId } from "react";
import type { VirtualDevice, VirtualParameter } from "../model";
import { useTrevorWebSocket } from "../websocket";
import { buildSectionId } from "../utils/utils";

const generateAcronym = (name: string): string => {
	return name
		.split(" ")
		.map((word) => {
			if (!word) return "";
			word = word.replace(/Section$/, "");
			if (word.length <= 3) {
				return word;
			}
			const firstChar = word[0];
			const rest = word.slice(1).replace(/[aeiou]/gi, "");
			return (firstChar + rest).slice(0, 3);
		})
		.join("")
		.toUpperCase();
};

const VirtualDeviceComponent = ({
	width = 220,
	margin = 5,
	height = 150,
	device,
	selected = false,
	onParameterClick,
	onDeviceClick,
	selectedSections,
	classConnections = false,
	onSectionScroll,
}: {
	width?: number;
	height?: number;
	margin?: number;
	device: VirtualDevice;
	onParameterClick?: (parameter: VirtualParameter) => void;
	onDeviceClick?: (device: VirtualDevice) => void;
	selectedSections?: string[];
	classConnections?: boolean;
	selected?: boolean;
	onSectionScroll?: () => void;
}) => {
	const [isNameOnLeft, setIsNameOnLeft] = useState(true); // Track the side of the name
	// const sections = Object.keys(device.config);
	const parameters = device.meta.parameters;
	const half = Math.ceil(parameters.length / 2); // Split sections into left and right sides
	const leftSections = parameters.slice(0, half);
	const rightSections = parameters.slice(half);
	const trevorSocket = useTrevorWebSocket();

	useEffect(() => {
		// Dynamically adjust the side of the name based on section positions
		setIsNameOnLeft(leftSections.length > rightSections.length);
	}, [leftSections, rightSections]);

	const pauseResume = (device: VirtualDevice) => {
		// We start the device if it wasn't
		trevorSocket?.toggle_device(device, /* start= */ !device.running);
	};

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: TODO
		<div
			className="device-component"
			style={{
				width: width - margin * 3,
				height: height - margin * 3,
				boxSizing: "border-box",
				borderColor: selected ? "yellow" : "",
			}}
			id={`${device.id}-__virtual__`}
			onClick={() => onDeviceClick?.(device)}
		>
			<div className={`device-name ${isNameOnLeft ? "left" : "right"}`}>
				{device.repr}
			</div>
			<div className="center-wrapper">
				<button
					type="button"
					className="amiga-button play-pause-button center-button"
					onClick={() => pauseResume(device)}
				>
					{!device.running || device.paused ? "▶" : "⏸"}
				</button>
			</div>

			<div className="device-sections" onScroll={onSectionScroll}>
				{/* Left side sections */}
				<div className="device-side left">
					{leftSections.map((parameter) => {
						const parameterId = buildSectionId(device.id, parameter.cv_name);
						const paramId = classConnections
							? `${parameterId}-class`
							: parameterId;
						return (
							// biome-ignore lint/a11y/useKeyWithClickEvents: TODO
							<div
								key={paramId}
								className={`device-section ${selectedSections?.includes(paramId) ? "selected" : ""}`}
								onClick={(event) => {
									event.stopPropagation();
									onParameterClick?.(parameter);
								}}
							>
								<div
									className="device-section-box"
									title={parameter.name}
									id={paramId}
								/>
								<span
									className="device-section-name left"
									title={parameter.name}
								>
									{generateAcronym(parameter.name)}
								</span>
							</div>
						);
					})}
				</div>
				{/* Right side sections */}
				<div className="device-side right">
					{rightSections.map((parameter) => {
						const sectionId = buildSectionId(device.id, parameter.cv_name);
						const paramId = classConnections ? `${sectionId}-class` : sectionId;
						return (
							// biome-ignore lint/a11y/useKeyWithClickEvents: TODO
							<div
								key={paramId}
								className={`device-section ${selectedSections?.includes(paramId) ? "selected" : ""}`}
								onClick={(event) => {
									event.stopPropagation();
									onParameterClick?.(parameter);
								}}
							>
								<span
									className="device-section-name right"
									title={parameter.name}
								>
									{generateAcronym(parameter.name)}
								</span>
								<div
									className="device-section-box"
									title={parameter.name}
									id={paramId}
								/>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
};

export default VirtualDeviceComponent;

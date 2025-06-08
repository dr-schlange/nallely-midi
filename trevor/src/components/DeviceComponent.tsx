import { useState, useEffect, useRef, ReactEventHandler } from "react";
import type { MidiDevice, MidiDeviceSection } from "../model";
import {
	buildSectionId,
	generateAcronym,
	isLogMode,
	setDebugMode,
} from "../utils/utils";

const MidiDeviceComponent = ({
	device,
	selected = false,
	onSectionClick,
	onDeviceClick,
	selectedSections,
	classConnections = false,
	onSectionScroll,
}: {
	margin?: number;
	device: MidiDevice;
	onSectionClick?: (section: MidiDeviceSection) => void;
	onDeviceClick?: (device: MidiDevice) => void;
	selectedSections?: string[];
	classConnections?: boolean;
	selected?: boolean;
	onSectionScroll?: () => void;
}) => {
	const [isNameOnLeft, setIsNameOnLeft] = useState(true); // Track the side of the name
	// const sections = Object.keys(device.config);
	const sections = device.meta.sections;
	const half = Math.ceil(sections.length / 2); // Split sections into left and right sides
	const leftSections = sections.slice(0, half);
	const rightSections = sections.slice(half);

	useEffect(() => {
		// Dynamically adjust the side of the name based on section positions
		setIsNameOnLeft(leftSections.length > rightSections.length);
	}, [leftSections, rightSections]);

	const handleDeviceClick = (device: MidiDevice) => {
		if (isLogMode()) {
			return;
		}
		onDeviceClick?.(device);
	};

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
		<div
			className="device-component"
			style={{
				boxSizing: "border-box",
				borderColor: selected ? "yellow" : "",
				position: "relative",
			}}
			id={`${device.id}`}
			onClick={() => handleDeviceClick(device)}
			onMouseEnter={(e) => setDebugMode(e, device.id, true)}
			onMouseLeave={(e) => setDebugMode(e, device.id, false)}
			onTouchStart={(e) => setDebugMode(e, device.id, true)}
			onTouchEnd={(e) => setDebugMode(e, device.id, true)}
		>
			<div className={`device-name ${isNameOnLeft ? "left" : "right"}`}>
				{device.repr}
			</div>
			<div className="device-sections" onScroll={onSectionScroll}>
				{/* Left side sections */}
				<div className="device-side left">
					{leftSections.map((section) => {
						const sectionId = buildSectionId(
							device.id,
							section.parameters[0]?.section_name ||
								section.pads_or_keys?.section_name ||
								"unknown",
						);
						const paramId = classConnections ? `${sectionId}-class` : sectionId;
						return (
							// biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
							<div
								key={paramId}
								className={`device-section ${selectedSections?.includes(paramId) ? "selected" : ""}`}
								onClick={(event) => {
									event.stopPropagation();
									onSectionClick?.(section);
								}}
							>
								<div
									className="device-section-box"
									title={section.name}
									id={paramId}
								/>
								<span className="device-section-name left" title={section.name}>
									{generateAcronym(section.name)}
								</span>
							</div>
						);
					})}
				</div>
				{/* Right side sections */}
				<div className="device-side right">
					{rightSections.map((section) => {
						const sectionId = buildSectionId(
							device.id,
							section.parameters[0]?.section_name ||
								section.pads_or_keys?.section_name ||
								"unknown",
						);
						const paramId = classConnections ? `${sectionId}-class` : sectionId;
						return (
							// biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
							<div
								key={paramId}
								className={`device-section ${selectedSections?.includes(paramId) ? "selected" : ""}`}
								onClick={(event) => {
									event.stopPropagation();
									onSectionClick?.(section);
								}}
							>
								<span
									className="device-section-name right"
									title={section.name}
								>
									{generateAcronym(section.name)}
								</span>
								<div
									className="device-section-box"
									title={section.name}
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

export default MidiDeviceComponent;

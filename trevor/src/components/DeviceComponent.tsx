import { useState, useEffect, useRef, ReactEventHandler, useMemo } from "react";
import type {
	MidiDevice,
	MidiDeviceSection,
	MidiParameter,
	Pitchwheel,
	PadsOrKeys,
} from "../model";
import {
	buildParameterId,
	buildSectionId,
	generateAcronym,
	isLogMode,
	setDebugMode,
} from "../utils/utils";
import { useTrevorSelector } from "../store";

const collectAllParameters = (device: MidiDevice) => {
	const parameters: (MidiParameter | PadsOrKeys | Pitchwheel)[] = [];
	for (const section of device.meta.sections) {
		if (section.pads_or_keys) {
			parameters.push(section.pads_or_keys);
		}
		if (section.pitchwheel) {
			parameters.push(section.pitchwheel);
		}
		parameters.push(...section.parameters);
	}
	return parameters.map((p) => buildParameterId(device.id, p));
};

const collectAllSections = (device: MidiDevice) => {
	const sections: string[] = [];
	for (const section of device.meta.sections) {
		sections.push(internalSectionName(section));
	}
	return sections.map((s) => buildSectionId(device.id, s));
};

const internalSectionName = (section) =>
	section.parameters?.[0]?.section_name ||
	section.pads_or_keys?.section_name ||
	section.pitchwheel?.section_name ||
	"unknown";

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
	const allSections = useMemo(() => collectAllSections(device), [device]);
	const allConnections = useTrevorSelector(
		(state) => state.nallely.connections,
	);
	const incomingConnections = useMemo(() => {
		return allConnections
			.filter((c) =>
				allSections.includes(
					buildSectionId(c.dest.device, c.dest.parameter.section_name),
				),
			)
			.map((c) => c.dest.parameter.section_name);
	}, [allConnections, allSections]);

	const outgoingConnections = useMemo(() => {
		return allConnections
			.filter((c) =>
				allSections.includes(
					buildSectionId(c.src.device, c.src.parameter.section_name),
				),
			)
			.map((c) => c.src.parameter.section_name);
	}, [allConnections, allSections]);

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
						const isectioname = internalSectionName(section);
						const sectionId = buildSectionId(device.id, isectioname);
						const paramId = classConnections ? `${sectionId}-class` : sectionId;
						const incoming = incomingConnections.includes(isectioname);
						const outgoing = outgoingConnections.includes(isectioname);
						const selected = selectedSections?.includes(paramId);
						return (
							// biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
							<div
								key={paramId}
								className={`device-section ${selected ? "selected" : ""}`}
								onClick={(event) => {
									event.stopPropagation();
									onSectionClick?.(section);
								}}
							>
								<div
									className={`device-section-box ${incoming || outgoing ? "occupied" : ""}`}
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
						const isectioname = internalSectionName(section);
						const sectionId = buildSectionId(device.id, isectioname);
						const paramId = classConnections ? `${sectionId}-class` : sectionId;
						const incoming = incomingConnections.includes(isectioname);
						const outgoing = outgoingConnections.includes(isectioname);
						const selected = selectedSections?.includes(paramId);
						return (
							// biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
							<div
								key={paramId}
								className={`device-section ${selected ? "selected" : ""}`}
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
									className={`device-section-box ${incoming || outgoing ? "occupied" : ""}`}
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

import { useState, useEffect } from "react";
import type { MidiDevice, MidiDeviceSection } from "../model";
import { buildSectionId } from "../utils/svgUtils";

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

const MidiDeviceComponent = ({
	width = 200,
	margin = 5,
	height = 150,
	device,
	selected = false,
	onSectionClick,
	selectedSections,
	classConnections = false,
}: {
	width?: number;
	height?: number;
	margin?: number;
	device: MidiDevice;
	onSectionClick?: (section: MidiDeviceSection) => void;
	selectedSections?: string[];
	classConnections?: boolean;
	selected?: boolean;
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

	return (
		<div
			className="device-component"
			style={{
				width: width - margin * 2,
				height: height - margin * 2,
				boxSizing: "border-box",
				borderColor: selected ? "yellow": ""
			}}
			id={`${device.id}`}
		>
			<div className={`device-name ${isNameOnLeft ? "left" : "right"}`}>
				{device.meta.name}
			</div>
			<div className="device-sections">
				{/* Left side sections */}
				<div className="device-side left">
					{leftSections.map((section) => {
						const sectionId = buildSectionId(
							device.id,
							section.parameters[0]?.section_name,
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
							section.parameters[0]?.section_name,
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

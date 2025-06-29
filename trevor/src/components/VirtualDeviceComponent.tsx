/** biome-ignore-all lint/a11y/noStaticElementInteractions: <explanation> */
import { useState, useEffect, useMemo } from "react";
import type { VirtualDevice, VirtualParameter } from "../model";
import { useTrevorWebSocket } from "../websockets/websocket";
import {
	buildParameterId,
	buildSectionId,
	generateAcronym,
	setDebugMode,
} from "../utils/utils";
import { useTrevorDispatch, useTrevorSelector } from "../store";
import { ClassBrowser } from "./modals/ClassBrowser";
import { setClassCodeMode } from "../store/runtimeSlice";

export interface VirtualDeviceComponentProps {
	margin?: number;
	device: VirtualDevice;
	onParameterClick?: (parameter: VirtualParameter) => void;
	onDeviceClick?: (device: VirtualDevice) => void;
	selectedSections?: string[];
	classConnections?: boolean;
	selected?: boolean;
	onSectionScroll?: () => void;
}

const collectAllParameters = (device: VirtualDevice) => {
	return device.meta.parameters.map((p) => buildParameterId(device.id, p));
};

const VirtualDeviceComponent = ({
	device,
	selected = false,
	onParameterClick,
	onDeviceClick,
	selectedSections,
	classConnections = false,
	onSectionScroll,
}: VirtualDeviceComponentProps) => {
	const [isNameOnLeft, setIsNameOnLeft] = useState(true); // Track the side of the name
	const parameters = device.meta.parameters;
	const half = Math.ceil(parameters.length / 2); // Split sections into left and right sides
	const leftSections = parameters.slice(0, half);
	const rightSections = parameters.slice(half);
	const trevorSocket = useTrevorWebSocket();
	const classCodeMode = useTrevorSelector(
		(state) => state.runTime.classCodeMode,
	);
	const dispatch = useTrevorDispatch();
	const [isCodeOpen, setIsCodeOpen] = useState<boolean>(false);
	const allParameters = useMemo(() => collectAllParameters(device), [device]);
	const allConnections = useTrevorSelector(
		(state) => state.nallely.connections,
	);
	const incomingConnections = useMemo(() => {
		return allConnections
			.filter((c) =>
				allParameters.includes(
					buildParameterId(c.dest.device, c.dest.parameter),
				),
			)
			.map((c) => c.dest.parameter.name);
	}, [allConnections, allParameters]);

	const outgoingConnections = useMemo(() => {
		return allConnections
			.filter((c) =>
				allParameters.includes(buildParameterId(c.src.device, c.src.parameter)),
			)
			.map((c) => c.src.parameter.name);
	}, [allConnections, allParameters]);

	useEffect(() => {
		// Dynamically adjust the side of the name based on section positions
		setIsNameOnLeft(leftSections.length > rightSections.length);
	}, [leftSections, rightSections]);

	const pauseResume = (device: VirtualDevice) => {
		// We start the device if it wasn't
		trevorSocket?.toggle_device(device, /* start= */ !device.running);
	};

	const handleDeviceClick = (device: VirtualDevice) => {
		if (classCodeMode) {
			setIsCodeOpen((prev) => !prev);
			dispatch(setClassCodeMode(false));
			return;
		}
		onDeviceClick?.(device);
	};

	const handleClassBrowserClose = () => {
		setIsCodeOpen(false);
	};

	const isSelected =
		selectedSections?.length > 0 &&
		selectedSections.some((s) => s.startsWith(device.id.toString()));
	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: TODO
		<div
			className="device-component"
			style={{
				// width: width - margin * 3,
				// height: height - margin * 3,
				boxSizing: "border-box",
				borderColor: isSelected ? "yellow" : "",
			}}
			id={`${device.id}-__virtual__`}
			onClick={() => handleDeviceClick(device)}
			onMouseEnter={(e) => setDebugMode(e, device.id, true)}
			onMouseLeave={(e) => setDebugMode(e, device.id, false)}
			onTouchStart={(e) => setDebugMode(e, device.id, true)}
			onTouchEnd={(e) => setDebugMode(e, device.id, true)}
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
						const incoming = incomingConnections.includes(parameter.name);
						const outgoing = outgoingConnections.includes(parameter.name);
						const selected = selectedSections?.includes(paramId);
						return (
							// biome-ignore lint/a11y/useKeyWithClickEvents: TODO
							<div
								key={paramId}
								className={`device-section ${selected ? "selected" : ""}`}
								onClick={(event) => {
									event.stopPropagation();
									onParameterClick?.(parameter);
								}}
							>
								<div
									className={`device-section-box ${incoming || outgoing ? "occupied" : ""}`}
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
						const incoming = incomingConnections.includes(parameter.name);
						const outgoing = outgoingConnections.includes(parameter.name);
						const selected = selectedSections?.includes(paramId);
						return (
							// biome-ignore lint/a11y/useKeyWithClickEvents: TODO
							<div
								key={paramId}
								className={`device-section ${selected ? "selected" : ""}`}
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
									className={`device-section-box ${incoming || outgoing ? "occupied" : ""}`}
									title={parameter.name}
									id={paramId}
								/>
							</div>
						);
					})}
				</div>
			</div>
			{isCodeOpen && (
				<ClassBrowser onClose={handleClassBrowserClose} device={device} />
			)}
		</div>
	);
};

export default VirtualDeviceComponent;

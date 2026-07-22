/** biome-ignore-all lint/a11y/noStaticElementInteractions: <explanation> */
/** biome-ignore-all lint/a11y/useKeyWithClickEvents: <explanation> */
import { createSelector } from "@reduxjs/toolkit";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
	Connection,
	MidiDevice,
	MidiDeviceWithSection,
	MidiParameter,
	PadOrKey,
	PadsOrKeys,
	Pitchwheel,
	VirtualDevice,
	VirtualDeviceWithSection,
	VirtualParameter,
} from "../../model";
import { useTrevorSelector } from "../../store";
import {
	drawCurvedConnection,
	findConnectorElement,
} from "../../utils/svgUtils";
import {
	buildParameterId,
	connectionId,
	connectionsOfInterest,
	internalSectionName,
	isPadsOrdKeys,
	isVirtualDevice,
	parameterUUID,
	rejectedClasses,
} from "../../utils/utils";
import {
	MidiSectionDevice,
	VDevice,
	VDevicePlaceholder,
} from "../VDevComponent";
import { Portal } from "../Portal";
import VDeviceSelectionModal from "./VirtualDeviceSelectionModal";
import { useTrevorWebSocket } from "../../websockets/websocket";
import { MidiGrid } from "../MidiGrid";
import { ScalerForm } from "../ScalerForm";
import {
	AcceptedValuesKnob,
	Button,
	CircularSlider,
} from "../widgets/BaseComponents";

const collectAllVirtualParameters = (device: VirtualDevice) => {
	return device.meta.parameters.map((p) => parameterUUID(device.id, p));
};

const collectAllMidiParameters = (device: MidiDevice) => {
	const parameters: (MidiParameter | PadsOrKeys | Pitchwheel)[] = [];
	for (const section of device.meta.sections) {
		if (section.pads_or_keys) {
			parameters.push(section.pads_or_keys);
		}
		// if (section.pitchwheel) {
		// 	parameters.push(section.pitchwheel);
		// }
		parameters.push(...section.pitchwheels);
		parameters.push(...section.parameters);
	}
	return parameters.map((p) => parameterUUID(device.id, p));
};

const collectAllParameters = (device: MidiDevice | VirtualDevice) => {
	if (isVirtualDevice(device)) {
		return collectAllVirtualParameters(device);
	}
	return collectAllMidiParameters(device);
};

const getSectionParameters = (sectionWrapper) => {
	if (!sectionWrapper) {
		return [];
	}
	const pitchwheels = sectionWrapper.section.pitchwheels
		? sectionWrapper.section.pitchwheels
		: [];
	const mainOutputIndex = sectionWrapper.section.parameters.findIndex(
		(e) => e.name === "output_cv",
	);
	const params = [...sectionWrapper.section.parameters];
	if (mainOutputIndex !== -1) {
		const output = params.splice(mainOutputIndex, 1);
		params.push(...output);
	}
	return [...params, ...pitchwheels];
};

const selectAllVirtualDeviceSection = createSelector(
	[(state) => state.nallely.virtual_devices],
	(devices) =>
		devices
			.filter((e) => !rejectedClasses.includes(e.meta.name))
			.flatMap(
				(device) =>
					({
						device,
						section: { parameters: device.meta.parameters },
					}) as VirtualDeviceWithSection,
			),
);

const selectAllMidiDeviceSection = createSelector(
	[(state) => state.nallely.midi_devices],
	(devices) =>
		devices.flatMap((d) =>
			d.meta.sections.map(
				(section) => ({ device: d, section }) as MidiDeviceWithSection,
			),
		),
);

const PatcheableParameter = ({
	currentValue,
	section,
	param,
	selected,
	occupied,
	reverse = false,
	onClick,
}: {
	currentValue: string | number | undefined;
	section: MidiDeviceWithSection | VirtualDeviceWithSection;
	param: MidiParameter | VirtualParameter;
	reverse?: boolean;
	selected?: boolean;
	occupied?: boolean;
	onClick?: (
		section: MidiDevice | VirtualDevice,
		param: MidiParameter | VirtualParameter,
	) => void;
}) => {
	const trevor = useTrevorWebSocket();
	const isPitchwheel =
		(section.section as { pitchwheels?: { name: string }[] }).pitchwheels?.some(
			(pw) => pw.name === param.name,
		) ?? false;
	const handleValueChange = (value: string | number) => {
		if (param.section_name === "__virtual__") {
			trevor?.setVirtualValue(
				section.device as VirtualDevice,
				param as VirtualParameter,
				value,
			);
		} else {
			trevor?.setParameterValue(
				section.device.id,
				param.section_name,
				param.name,
				value,
			);
		}
	};

	return (
		<div className="patcheable-parameter">
			{param.accepted_values?.length > 0 ? (
				<AcceptedValuesKnob
					param={param}
					value={currentValue}
					acronymeLimit={10}
					labelPosition={reverse ? "bottom" : "top"}
					disabled={isPitchwheel}
					onManualSliderChange={handleValueChange}
					stripPrefix={(section.device as VirtualDevice).proxy}
				/>
			) : (
				<CircularSlider
					param={param}
					value={currentValue as number}
					acronymeLimit={10}
					labelPosition={reverse ? "bottom" : "top"}
					disabled={isPitchwheel}
					onManualSliderChange={handleValueChange}
					minValue={param.range[0]}
					maxValue={param.range[1]}
					rounded={
						!isVirtualDevice(section.device) ||
						(param as VirtualParameter).conversion_policy !== null
					}
					stripPrefix={(section.device as VirtualDevice).proxy}
				/>
			)}
			<div
				key={param.name}
				className={`parameter-box ${selected ? "selected" : ""} ${occupied ? "occupied" : ""}`}
				id={`pb-${buildParameterId(section.device.id, param)}`}
				onClick={() => onClick(section.device, param)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						onClick(section.device, param);
					}
				}}
			/>
		</div>
	);
};

interface PatchingModalProps {
	onClose: () => void;
	firstSection: MidiDeviceWithSection | VirtualDeviceWithSection | null;
	secondSection: MidiDeviceWithSection | VirtualDeviceWithSection | null;
	onSettingsClick?: (
		device: MidiDeviceWithSection | VirtualDeviceWithSection,
	) => void;
	selectedSettings?:
		| MidiDeviceWithSection
		| VirtualDeviceWithSection
		| undefined;
	onSectionChange?: (
		section: MidiDeviceWithSection | VirtualDeviceWithSection,
	) => void;
}

const PatchingModal = ({
	onClose,
	firstSection,
	secondSection,
	onSettingsClick,
	selectedSettings,
	onSectionChange,
}: PatchingModalProps) => {
	const portraitMode = useRef(
		window.matchMedia("(orientation: portrait)").matches,
	);
	useEffect(() => {
		const handleOrientationChange = () => {
			portraitMode.current = window.matchMedia(
				"(orientation: portrait)",
			).matches;
			updateConnections();
		};

		window.addEventListener("orientationchange", handleOrientationChange);
		return () => {
			window.removeEventListener("orientationchange", handleOrientationChange);
		};
	});

	const [selectedParameters, setSelectedParameters] = useState<
		{
			device: MidiDevice | VirtualDevice;
			parameter: MidiParameter | VirtualParameter | PadsOrKeys | PadOrKey;
		}[]
	>([]);
	const [addModuleOpen, setAddModuleOpen] = useState(false);
	const websocket = useTrevorWebSocket();
	const allConnections = useTrevorSelector(
		(state) => state.nallely.connections,
	);
	const [currentFirstSection, setCurrentFirstSection] = useState(firstSection);
	const [currentSecondSection, setCurrentSecondSection] =
		useState(secondSection);

	const firstDeviceId = currentFirstSection?.device.id;
	const secondDeviceId = currentSecondSection?.device.id;
	const liveFirstDevice = useTrevorSelector((state) => {
		return (
			state.nallely.midi_devices.find((d) => d.id === firstDeviceId) ??
			state.nallely.virtual_devices.find((d) => d.id === firstDeviceId)
		);
	});
	const liveSecondDevice = useTrevorSelector((state) => {
		return (
			state.nallely.midi_devices.find((d) => d.id === secondDeviceId) ??
			state.nallely.virtual_devices.find((d) => d.id === secondDeviceId)
		);
	});

	const firstSectionName = internalSectionName(currentFirstSection?.section);
	const secondSectionName = internalSectionName(currentSecondSection?.section);

	const connections = useMemo(
		() =>
			allConnections.filter(
				(f) =>
					connectionsOfInterest(
						f,
						currentFirstSection?.device.id,
						firstSectionName,
					) ||
					connectionsOfInterest(
						f,
						currentSecondSection?.device.id,
						secondSectionName,
					),
			),
		[
			allConnections,
			currentFirstSection?.device.id,
			firstSectionName,
			currentSecondSection?.device.id,
			secondSectionName,
		],
	);

	const [selectedConnection, setSelectedConnection] = useState<string | null>(
		null,
	);
	const [isMouseInteracting, setIsMouseInteracting] = useState(false);
	const allMidiDeviceSection = useTrevorSelector(selectAllMidiDeviceSection);
	const allVirtualDeviceSection = useTrevorSelector(
		selectAllVirtualDeviceSection,
	);
	const allSections = [...allMidiDeviceSection, ...allVirtualDeviceSection];
	const svgRef = useRef<SVGSVGElement>(null);
	const modalRef = useRef<HTMLDivElement>(null);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const [dropdownHeight, setDropdownHeight] = useState(0);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [onClose]);

	const handleParameterClick = useCallback(
		(
			device: MidiDevice | VirtualDevice,
			param: MidiParameter | VirtualParameter,
		) => {
			setSelectedConnection(null); // Deselect the connection
			setSelectedParameters((prev) => {
				if (prev.length === 0) {
					return [{ device, parameter: param }];
				}

				if (prev[0].parameter === param) {
					return [];
				}

				const firstParameter = prev[0];
				const firstParameterUUID = parameterUUID(
					firstParameter.device,
					firstParameter.parameter,
				);

				websocket?.associateParameters(
					firstParameter.device,
					firstParameter.parameter,
					device,
					param,
					connections.some(
						(c) =>
							parameterUUID(c.src.device, c.src.parameter) ===
								firstParameterUUID &&
							parameterUUID(c.dest.device, c.dest.parameter) ===
								parameterUUID(device, param),
					),
				);
				return [];
			});
		},
		[websocket, connections],
	);

	const handleConnectionClick = useCallback(
		(connection: Connection) => {
			if (selectedConnection === connectionId(connection)) {
				setSelectedConnection(null);
				return;
			}
			setSelectedConnection(connectionId(connection));
			setSelectedParameters([]);
		},
		[selectedConnection],
	);

	const handleKeySectionClick = useCallback(
		(device: MidiDevice | VirtualDevice, keys: PadsOrKeys) => {
			setSelectedConnection(null); // Deselect the connection
			setSelectedParameters((prev) => {
				if (prev.length === 0) {
					return [{ device, parameter: keys }];
				}
				const firstParameter = prev[0];
				if (
					firstParameter.device === device &&
					firstParameter.parameter.section_name === keys.section_name
				) {
					return [];
				}
				const firstParameterUUID = parameterUUID(
					firstParameter.device,
					firstParameter.parameter,
				);
				websocket?.associateParameters(
					firstParameter.device,
					firstParameter.parameter,
					device,
					keys,
					connections.some(
						(c) =>
							parameterUUID(c.src.device, c.src.parameter) ===
								firstParameterUUID &&
							parameterUUID(c.dest.device, c.dest.parameter) ===
								parameterUUID(device, keys),
					), // if a connection already exist, we remove it
				);
				return [];
			});
		},
		[websocket, connections],
	);

	const handleKeyClick = useCallback(
		(device: MidiDevice | VirtualDevice, key: PadOrKey) => {
			setSelectedConnection(null); // Deselect the connection
			setSelectedParameters((prev) => {
				if (prev.length === 0) {
					return [{ device, parameter: key }];
				}
				const firstParameter = prev[0];
				if (
					firstParameter.device === device &&
					firstParameter.parameter.section_name === key.section_name &&
					(firstParameter.parameter as PadOrKey).note === key.note
				) {
					return []; // Deselect if the same parameter is clicked twice
				}
				const firstParameterUUID = parameterUUID(
					firstParameter.device,
					firstParameter.parameter,
				);
				websocket?.associateParameters(
					firstParameter.device,
					firstParameter.parameter,
					device,
					key,
					connections.some(
						(c) =>
							parameterUUID(c.src.device, c.src.parameter) ===
								firstParameterUUID &&
							parameterUUID(c.dest.device, c.dest.parameter) ===
								parameterUUID(device, key),
					), // if a connection already exist, we remove it
				);
				return [];
			});
		},
		[websocket, connections],
	);

	const updateConnections = useCallback(() => {
		if (isMouseInteracting) {
			return;
		}

		if (!svgRef.current) return;

		const svg = svgRef.current;
		svg.innerHTML = "";
		const sortedConnections = [...connections].sort((a, b) => {
			const isSelected = (x) => connectionId(x) === selectedConnection;
			if (isSelected(a) && !isSelected(b)) return 1;
			if (!isSelected(a) && isSelected(b)) return -1;
			return 0;
		});
		for (const connection of sortedConnections) {
			const [fromElement, toElement] = findConnectorElement(
				connection,
				modalRef.current ?? document,
				"pb-",
			);
			drawCurvedConnection(
				svg,
				fromElement,
				toElement,
				connectionId(connection) === selectedConnection,
				{ bouncy: connection.bouncy, muted: connection.muted },
				connection.id,
				(event) => {
					const x = event.clientX;
					const y = event.clientY;
					const elements = document.elementsFromPoint(x, y);
					const underDiv = elements.find((el) =>
						el.id.match(/^\d+::\w+::\w+$/),
					);
					if (underDiv instanceof HTMLElement) {
						underDiv.click();
						return;
					}

					event.stopPropagation();
					handleConnectionClick(connection);
				},
				setIsMouseInteracting,
				// portraitMode.current ? "vertical" : "horizontal",
			);
		}
	}, [
		connections,
		selectedConnection,
		handleConnectionClick,
		isMouseInteracting,
	]);

	useEffect(() => {
		const raf = requestAnimationFrame(() => updateConnections());
		return () => cancelAnimationFrame(raf);
	}, [
		updateConnections,
		dropdownHeight,
		currentFirstSection,
		currentSecondSection,
	]);

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
	}, [updateConnections]);

	useEffect(() => {
		if (!dropdownRef.current) return;
		const remeasure = () => {
			requestAnimationFrame(() => {
				setDropdownHeight(dropdownRef.current?.offsetHeight ?? 0);
			});
		};
		const observer = new ResizeObserver(remeasure);
		observer.observe(dropdownRef.current);
		setDropdownHeight(dropdownRef.current.offsetHeight);
		const details = dropdownRef.current.querySelector("details");
		details?.addEventListener("toggle", remeasure);
		return () => {
			observer.disconnect();
			details?.removeEventListener("toggle", remeasure);
		};
	}, []);

	const handleGridOpen = useCallback(() => {
		setTimeout(() => updateConnections(), 0);
	}, [updateConnections]);

	const handleContainerClick = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			const target = e.target as Element;
			if (
				target.closest(".parameter-box") ||
				target.closest(".patcheable-parameter")
			)
				return;
			if (!svgRef.current) return;
			const svg = svgRef.current;
			const svgRect = svg.getBoundingClientRect();
			const px = e.clientX - svgRect.left;
			const py = e.clientY - svgRect.top;
			const HIT2 = 15 * 15;
			const paths = svg.querySelectorAll<SVGGeometryElement>(
				"path:not([id$='-hit'])",
			);
			for (const path of paths) {
				const len = path.getTotalLength();
				const steps = Math.min(Math.ceil(len / 4), 400);
				let hit = false;
				for (let i = 0; i <= steps; i++) {
					const sp = path.getPointAtLength((i / steps) * len);
					const dx = sp.x - px;
					const dy = sp.y - py;
					if (dx * dx + dy * dy <= HIT2) {
						hit = true;
						break;
					}
				}
				if (hit) {
					const conn = connections.find((c) => {
						const [from, to] = findConnectorElement(
							c,
							modalRef.current ?? document,
							"pb-",
						);
						return from && to && `${from.id}::${to.id}` === path.id;
					});
					if (conn) {
						handleConnectionClick(conn);
						return;
					}
				}
			}
		},
		[connections, handleConnectionClick],
	);

	const selectedConnectionInstance = useMemo(
		() => allConnections.find((c) => connectionId(c) === selectedConnection),
		[allConnections, selectedConnection],
	);

	const shouldHighlight = useCallback(
		(device: MidiDevice | VirtualDevice) => {
			if (selectedParameters.length === 0) {
				return "";
			}
			const param = selectedParameters[0];
			if (device.id === param.device.id) {
				return (
					(param?.parameter as PadOrKey)?.note ||
					((param?.parameter as PadsOrKeys)?.keys != null && "__pads_or_keys__")
				);
			}
			return "";
		},
		[selectedParameters],
	);

	// const srcPadsOrKey = currentFirstSection?.section.pads_or_keys;
	const srcAllParameters = useMemo(
		() => collectAllParameters(currentFirstSection.device),
		[currentFirstSection.device],
	);
	const srcAllIncoming = useMemo(
		() =>
			allConnections
				.filter((c) =>
					srcAllParameters.includes(
						parameterUUID(c.dest.device, c.dest.parameter),
					),
				)
				.map((c) => parameterUUID(c.dest.device, c.dest.parameter)),
		[srcAllParameters, allConnections],
	);
	const srcAllOutgoing = useMemo(
		() =>
			allConnections
				.filter((c) =>
					srcAllParameters.includes(
						parameterUUID(c.src.device, c.src.parameter),
					),
				)
				.map((c) => parameterUUID(c.src.device, c.src.parameter)),
		[srcAllParameters, allConnections],
	);

	// const dstPadsOrKey = currentSecondSection?.section.pads_or_keys;
	const dstAllParameters = useMemo(
		() => collectAllParameters(currentSecondSection.device),
		[currentSecondSection.device],
	);
	const dstAllIncoming = useMemo(
		() =>
			allConnections
				.filter((c) =>
					dstAllParameters.includes(
						parameterUUID(c.dest.device, c.dest.parameter),
					),
				)
				.map((c) => parameterUUID(c.dest.device, c.dest.parameter)),
		[dstAllParameters, allConnections],
	);
	const dstAllOutgoing = useMemo(
		() =>
			allConnections
				.filter((c) =>
					dstAllParameters.includes(
						parameterUUID(c.src.device, c.src.parameter),
					),
				)
				.map((c) => parameterUUID(c.src.device, c.src.parameter)),
		[dstAllParameters, allConnections],
	);

	const firstSectionParameters = useMemo(
		() => getSectionParameters(currentFirstSection),
		[currentFirstSection],
	);

	const secondSectionParameters = useMemo(
		() => getSectionParameters(currentSecondSection),
		[currentSecondSection],
	);

	const buildDropDown = (
		currentSection: MidiDeviceWithSection | VirtualDeviceWithSection,
		setSection,
	) => {
		const handleSelect = (
			section: MidiDeviceWithSection | VirtualDeviceWithSection,
		) => {
			setSection(section);
			onSectionChange?.(section);
		};
		const sectionName = internalSectionName(currentSection.section);
		const label =
			sectionName !== "__virtual__"
				? `${currentSection.device.repr} - ${sectionName}`
				: currentSection.device.repr;
		return (
			<>
				<details className="details-block panel-dropdown">
					<summary>{label}</summary>
					<div
						style={{
							display: "flex",
							flexDirection: "row",
							overflowX: "auto",
							gap: "4px",
							padding: "4px",
							alignItems: "flex-start",
						}}
					>
						{allVirtualDeviceSection.map((vs) => (
							<div
								key={`${vs.device.id}`}
								style={{
									display: "flex",
									flexDirection: "column",
									alignItems: "center",
									gap: "2px",
								}}
							>
								<VDevice
									device={vs.device}
									selected={currentSection.device.id === vs.device.id}
									onClick={(_dev) => handleSelect(vs)}
									onDoubleClick={(_dev) => {}}
									debounceClick={false}
									noPortIds={true}
								/>
								<span
									style={{
										fontSize: "9px",
										color: "gray",
										maxWidth: "80px",
										textAlign: "center",
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap",
									}}
								>
									{vs.device.repr}
								</span>
							</div>
						))}
						{allMidiDeviceSection.map((ms) => (
							<div
								key={`${ms.device.id}::${ms.section.name}`}
								style={{
									display: "flex",
									flexDirection: "column",
									alignItems: "center",
									gap: "2px",
								}}
							>
								<MidiSectionDevice
									device={ms.device}
									section={ms.section}
									selected={
										currentSection.device.id === ms.device.id &&
										internalSectionName(currentSection.section) ===
											ms.section.name
									}
									onClick={(_dev, _sec) => handleSelect(ms)}
									debounceClick={false}
									noPortIds={true}
								/>
								<span
									style={{
										fontSize: "9px",
										color: "gray",
										maxWidth: "80px",
										textAlign: "center",
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap",
									}}
								>
									{ms.device.repr}
								</span>
							</div>
						))}
						<VDevicePlaceholder
							slots={3}
							onClick={() => setAddModuleOpen(true)}
						/>
					</div>
				</details>
				{addModuleOpen && (
					<Portal>
						<VDeviceSelectionModal onClose={() => setAddModuleOpen(false)} />
					</Portal>
				)}
			</>
		);
	};

	return (
		<div className="patching-modal" ref={modalRef}>
			<div className="modal-header">
				<Button
					text="close"
					tooltip="Close"
					variant="big"
					style={{ width: "auto", padding: "0 6px" }}
					onClick={onClose}
				/>
				<Button
					text="refresh"
					style={{ width: "auto", padding: "0 6px" }}
					tooltip="Refresh current state"
					variant="big"
					onClick={() => websocket?.pullFullState()}
				/>
			</div>
			<div className="modal-body patching">
				<div
					style={{ position: "relative", flex: 1, overflow: "hidden" }}
					onClick={handleContainerClick}
				>
					<svg
						className="connection-svg modal"
						ref={svgRef}
						style={{
							top: dropdownHeight,
							height: `calc(100% - ${dropdownHeight}px)`,
						}}
					>
						<title>Connection diagram</title>
					</svg>
					<div className="left-panel">
						<div
							className="top-left-panel"
							onScroll={updateConnections}
							onClick={(e) => {
								const t = e.target as Element;
								if (
									!t.closest(".patcheable-parameter") &&
									!t.closest("svg") &&
									selectedParameters[0]?.device.id ===
										currentFirstSection.device.id &&
									selectedParameters[0]?.parameter.section_name ===
										internalSectionName(currentFirstSection.section)
								)
									setSelectedParameters([]);
							}}
						>
							<div ref={dropdownRef} style={{ width: "100%" }}>
								{buildDropDown(currentFirstSection, setCurrentFirstSection)}
							</div>

							<div
								className="parameters-grid left"
								onScroll={updateConnections}
							>
								{currentFirstSection?.section.pads_or_keys && (
									<div className="left-midi">
										<MidiGrid
											device={currentFirstSection.device}
											section={currentFirstSection.section}
											onKeysClick={handleKeySectionClick}
											onNoteClick={handleKeyClick}
											onGridOpen={handleGridOpen}
											highlight={shouldHighlight(currentFirstSection.device)}
										/>
									</div>
								)}
								{firstSectionParameters.map((param) => {
									const incoming = srcAllIncoming.includes(
										parameterUUID(currentFirstSection.device.id, param),
									);
									const outgoing = srcAllOutgoing.includes(
										parameterUUID(currentFirstSection.device.id, param),
									);
									const hasSectionName = param.section_name !== "__virtual__";
									return (
										<PatcheableParameter
											section={currentFirstSection}
											reverse
											param={param}
											currentValue={
												hasSectionName
													? liveFirstDevice?.config[param.section_name]?.[
															param?.name
														]
													: liveFirstDevice?.config[param?.name]
											}
											key={param.name}
											selected={selectedParameters[0]?.parameter === param}
											onClick={handleParameterClick}
											occupied={incoming || outgoing}
										/>
									);
								})}
							</div>
						</div>
						<div
							className="bottom-left-panel"
							onScroll={updateConnections}
							onClick={(e) => {
								const t = e.target as Element;
								if (
									!t.closest(".patcheable-parameter") &&
									!t.closest("svg") &&
									selectedParameters[0]?.device.id ===
										currentSecondSection.device.id &&
									selectedParameters[0]?.parameter.section_name ===
										internalSectionName(currentSecondSection.section)
								)
									setSelectedParameters([]);
							}}
						>
							{buildDropDown(currentSecondSection, setCurrentSecondSection)}
							<div
								className="parameters-grid right"
								onScroll={updateConnections}
							>
								{currentSecondSection?.section.pads_or_keys && (
									<div className="right-midi">
										<MidiGrid
											device={currentSecondSection.device}
											section={currentSecondSection.section}
											onKeysClick={handleKeySectionClick}
											onNoteClick={handleKeyClick}
											onGridOpen={handleGridOpen}
											highlight={shouldHighlight(currentSecondSection.device)}
										/>
									</div>
								)}

								{secondSectionParameters.map((param) => {
									const incoming = dstAllIncoming.includes(
										parameterUUID(currentSecondSection.device.id, param),
									);
									const outgoing = dstAllOutgoing.includes(
										parameterUUID(currentSecondSection.device.id, param),
									);
									const hasSectionName = param.section_name !== "__virtual__";
									return (
										<PatcheableParameter
											section={currentSecondSection}
											param={param}
											reverse
											currentValue={
												hasSectionName
													? liveSecondDevice?.config[param.section_name]?.[
															param?.name
														]
													: liveSecondDevice?.config[param?.name]
											}
											key={param.name}
											selected={selectedParameters[0]?.parameter === param}
											onClick={handleParameterClick}
											occupied={incoming || outgoing}
										/>
									);
								})}
							</div>
						</div>
					</div>
				</div>
				<div className="right-panel">
					<div className="top-right-panel">
						{selectedConnection && selectedConnectionInstance ? (
							<ScalerForm connection={selectedConnectionInstance} />
						) : (
							<div className="parameter-info">
								<h3>Existing connections</h3>
								{selectedParameters.length === 1 &&
									(() => {
										const sel = selectedParameters[0];
										const selUUID = parameterUUID(sel.device, sel.parameter);
										const paramName =
											(sel.parameter as MidiParameter)?.name ||
											(isPadsOrdKeys(sel.parameter) &&
												`Section ${(sel.parameter as PadsOrKeys).section_name}`) ||
											`Key/Pad ${(sel.parameter as PadOrKey).note}`;
										const sectionName =
											sel.parameter.section_name !== "__virtual__"
												? sel.parameter.section_name
												: null;
										const outgoing = allConnections.filter(
											(c) =>
												parameterUUID(c.src.device, c.src.parameter) ===
												selUUID,
										);
										const incoming = allConnections.filter(
											(c) =>
												parameterUUID(c.dest.device, c.dest.parameter) ===
												selUUID,
										);
										return (
											<>
												<p
													style={{
														margin: "4px 0",
														fontWeight: "bold",
														fontSize: "12px",
													}}
												>
													{sel.device.repr}
													{sectionName ? ` - ${sectionName}` : ""}
													{" - "}
													{paramName}
												</p>
												{outgoing.length > 0 && (
													<>
														<p
															style={{
																margin: "4px 0 2px",
																fontSize: "11px",
																color: "gray",
															}}
														>
															→ output to:
														</p>
														<ul style={{ margin: 0, paddingLeft: "12px" }}>
															{outgoing.map((c) => {
																const p = c.dest.parameter;
																const sec =
																	p.section_name !== "__virtual__"
																		? ` - ${p.section_name}`
																		: "";
																return (
																	<li key={c.id} style={{ fontSize: "11px" }}>
																		{c.dest.repr}
																		{sec} - {p.name}
																	</li>
																);
															})}
														</ul>
													</>
												)}
												{incoming.length > 0 && (
													<>
														<p
															style={{
																margin: "4px 0 2px",
																fontSize: "11px",
																color: "gray",
															}}
														>
															← input from:
														</p>
														<ul style={{ margin: 0, paddingLeft: "12px" }}>
															{incoming.map((c) => {
																const p = c.src.parameter;
																const sec =
																	p.section_name !== "__virtual__"
																		? ` - ${p.section_name}`
																		: "";
																return (
																	<li key={c.id} style={{ fontSize: "11px" }}>
																		{c.src.repr}
																		{sec} - {p.name}
																	</li>
																);
															})}
														</ul>
													</>
												)}
												{outgoing.length === 0 && incoming.length === 0 && (
													<p style={{ fontSize: "11px", color: "gray" }}>
														No connections
													</p>
												)}
											</>
										);
									})()}
							</div>
						)}
					</div>
					{/*<div className="bottom-right-panel">
						<h3>Connections</h3>
						<ul className="connections-list">
							{connections.map((connection) => {
								return (
									<li
										key={buildConnectionName(connection)}
										onClick={() => handleConnectionClick(connection)}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												handleConnectionClick(connection);
											}
										}}
										onKeyUp={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
											}
										}}
										className={`connection-item ${
											selectedConnection === connectionId(connection)
												? "selected"
												: ""
										}`}
									>
										{buildConnectionName(connection)}
									</li>
								);
							})}
						</ul>
					</div>*/}
				</div>
			</div>
		</div>
	);
};

export default PatchingModal;

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import type {
	MidiConnection,
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
import { drawConnection, findConnectorElement } from "../../utils/svgUtils";
import { ScalerForm } from "../ScalerForm";
import { useTrevorWebSocket } from "../../websockets/websocket";
import {
	buildConnectionName,
	buildParameterId,
	connectionId,
	connectionsOfInterest,
	devUID,
	internalSectionName,
	isPadsOrdKeys,
	isVirtualDevice,
	parameterUUID,
} from "../../utils/utils";
import { MidiGrid } from "../MidiGrid";
import { Button } from "../widgets/BaseComponents";
import { createSelector } from "@reduxjs/toolkit";

const collectAllVirtualParameters = (device: VirtualDevice) => {
	return device.meta.parameters.map((p) => parameterUUID(device.id, p));
};

const collectAllMidiParameters = (device: MidiDevice) => {
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
	return parameters.map((p) => parameterUUID(device.id, p));
};

const collectAllParameters = (device: MidiDevice | VirtualDevice) => {
	if (isVirtualDevice(device)) {
		return collectAllVirtualParameters(device);
	}
	return collectAllMidiParameters(device);
};

const getSectionParameters = (sectionWrapper, reverseOrder = false) => {
	if (!sectionWrapper) {
		return [];
	}
	const pitchwheel = sectionWrapper.section.pitchwheel
		? [sectionWrapper.section.pitchwheel]
		: [];
	const mainOutputIndex = sectionWrapper.section.parameters.findIndex(
		(e) => e.name === "output_cv",
	);
	const params = [...sectionWrapper.section.parameters];
	if (mainOutputIndex !== -1) {
		const output = params.splice(mainOutputIndex, 1);
		params.push(...output);
	}
	if (reverseOrder) {
		return [...params.reverse(), ...pitchwheel];
	}
	return [...params, ...pitchwheel];
};

const selectAllVirtualDeviceSection = createSelector(
	[(state) => state.nallely.virtual_devices],
	(devices) =>
		devices
			.filter(
				(e) => e.meta.name !== "TrevorBus" && e.meta.name !== "WebSocketBus",
			)
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

	const [refresh, setRefresh] = useState(0);
	const [selectedParameters, setSelectedParameters] = useState<
		{
			device: MidiDevice | VirtualDevice;
			parameter: MidiParameter | VirtualParameter | PadsOrKeys | PadOrKey;
		}[]
	>([]);
	const websocket = useTrevorWebSocket();
	const allConnections = useTrevorSelector(
		(state) => state.nallely.connections,
	);
	const [currentFirstSection, setCurrentFirstSection] = useState(firstSection);
	const [currentSecondSection, setCurrentSecondSection] =
		useState(secondSection);

	const firstSectionName =
		currentFirstSection?.section.parameters[0]?.section_name ||
		currentFirstSection?.section.pads_or_keys?.section_name ||
		currentFirstSection?.section.pitchwheel?.section_name;

	const secondSectionName =
		currentSecondSection?.section.parameters[0]?.section_name ||
		currentSecondSection?.section.pads_or_keys?.section_name ||
		currentSecondSection?.section.pitchwheel?.section_name;

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
		(connection: MidiConnection) => {
			if (selectedConnection === connectionId(connection)) {
				setSelectedConnection(null);
				return;
			}
			setSelectedConnection(connectionId(connection));
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

	const updateConnections = () => {
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
			const [fromElement, toElement] = findConnectorElement(connection);
			drawConnection(
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
				portraitMode.current ? "vertical" : "horizontal",
			);
		}
	};

	useEffect(() => {
		updateConnections();
	}, [connections, refresh]);

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
	}, [connections]);

	const handleGridOpen = () => {
		// drawConnections();
		setRefresh((refresh + 1) % 2);
	};

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
		() => getSectionParameters(currentFirstSection, true),
		[currentFirstSection],
	);

	const secondSectionParameters = useMemo(
		() => getSectionParameters(currentSecondSection),
		[currentSecondSection],
	);

	const buildDropDown = (
		currentSection: MidiDeviceWithSection | VirtualDeviceWithSection,
		setSection,
		otherSection: MidiDeviceWithSection | VirtualDeviceWithSection,
	) => {
		return (
			<div
				style={{
					textAlign: "center",
					cursor: "pointer",
					display: "flex",
					justifyContent: "flex-end",
					flexDirection: "row",
					gap: "4px",
				}}
				className="panel-dropdown"
			>
				<Button
					text="⚙"
					activated={
						selectedSettings?.device.id === currentSection?.device.id &&
						selectedSettings.section.name === currentSection?.section.name
					}
					onClick={() => onSettingsClick?.(currentSection)}
					tooltip="Toggle cyclic mode"
					variant="big"
				/>
				<select
					value={`${devUID(currentSection.device)}::${currentSection.section.name ?? currentSection.device.repr}`}
					title="Change tab section"
					onChange={(e) => {
						const change = e.target.value;
						const selected = allSections
							.filter((s) => !s.device.repr.includes("WebSocketBus"))
							.find(
								(s) =>
									`${devUID(s.device)}::${s.section.name ?? s.device.repr}` ===
									change,
							);
						setSection(selected);
						onSectionChange?.(selected);
					}}
				>
					{allSections.map((s) => {
						const allIncoming = allConnections.filter(
							(c) =>
								c.dest.parameter.section_name ===
									internalSectionName(s.section) &&
								c.dest.device === s.device.id,
						);
						const allOutgoing = allConnections.filter(
							(c) =>
								c.src.parameter.section_name ===
									internalSectionName(s.section) &&
								c.src.device === s.device.id,
						);
						const incomingLinks = allConnections.filter(
							(c) =>
								c.src.device === otherSection.device.id &&
								c.src.parameter.section_name ===
									internalSectionName(otherSection.section) &&
								c.dest.parameter.section_name ===
									internalSectionName(s.section) &&
								c.dest.device === s.device.id,
						);
						const outgoingLinks = allConnections.filter(
							(c) =>
								c.dest.device === otherSection.device.id &&
								c.dest.parameter.section_name ===
									internalSectionName(otherSection.section) &&
								c.src.parameter.section_name ===
									internalSectionName(s.section) &&
								c.src.device === s.device.id,
						);
						let linkageStatus = `⬊${allIncoming.length}`;
						if (incomingLinks.length > 0) {
							linkageStatus += `(${incomingLinks.length})`;
						}
						linkageStatus += `-⬈${allOutgoing.length}`;
						if (outgoingLinks.length > 0) {
							linkageStatus += `(${outgoingLinks.length})`;
						}

						const sectionName = s.section.name ?? s.device.repr;
						return (
							<option
								key={`${devUID(s.device)}::${sectionName}`}
								value={`${devUID(s.device)}::${sectionName}`}
							>
								{s.section.name
									? `${s.device.repr} - ${s.section.name} [${linkageStatus}]`
									: `${s.device.repr} [${linkageStatus}]`}
							</option>
						);
					})}
				</select>
			</div>
		);
	};

	return (
		<div className="patching-modal">
			<div className="modal-header">
				<button type="button" className="close-button" onClick={onClose}>
					Close
				</button>
			</div>
			<div className="modal-body patching">
				<svg className="connection-svg modal" ref={svgRef}>
					<title>Connection diagram</title>
				</svg>
				<div className="left-panel">
					<div className="top-left-panel" onScroll={updateConnections}>
						{/* <h3>
							{currentFirstSection?.device.repr}{" "}
							{currentFirstSection?.section.name}
						</h3> */}
						{buildDropDown(
							currentFirstSection,
							setCurrentFirstSection,
							currentSecondSection,
						)}

						<div className="parameters-grid left" onScroll={updateConnections}>
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
							{/* {currentFirstSection?.section.parameters.map((param) => { */}
							{firstSectionParameters.map((param) => {
								const incoming = srcAllIncoming.includes(
									parameterUUID(currentFirstSection.device.id, param),
								);
								const outgoing = srcAllOutgoing.includes(
									parameterUUID(currentFirstSection.device.id, param),
								);
								return (
									<div
										key={param.name}
										className={`parameter ${
											selectedParameters[0]?.parameter === param
												? "selected"
												: ""
										}`}
										id={buildParameterId(currentFirstSection.device.id, param)}
										onClick={() =>
											handleParameterClick(currentFirstSection.device, param)
										}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												handleParameterClick(currentFirstSection.device, param);
											}
										}}
									>
										<div
											className={`parameter-box ${incoming || outgoing ? "occupied" : ""}`}
											id={`${buildParameterId(currentFirstSection.device.id, param)}`}
										/>
										<div className="text-wrapper">
											<span className="parameter-name left">{param.name}</span>
										</div>
									</div>
								);
							})}
						</div>
					</div>
					<div className="bottom-left-panel" onScroll={updateConnections}>
						{/* <h3>
							{currentSecondSection?.device.repr}{" "}
							{currentSecondSection?.section.name}
						</h3> */}
						{buildDropDown(
							currentSecondSection,
							setCurrentSecondSection,
							currentFirstSection,
						)}
						<div className="parameters-grid right" onScroll={updateConnections}>
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
								return (
									<div
										key={param.name}
										className={`parameter ${
											selectedParameters[0]?.parameter === param
												? "selected"
												: ""
										}`}
										id={buildParameterId(currentSecondSection.device.id, param)}
										onClick={() =>
											handleParameterClick(currentSecondSection.device, param)
										}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												handleParameterClick(
													currentSecondSection.device,
													param,
												);
											}
										}}
										onKeyUp={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
											}
										}}
									>
										<div
											className={`parameter-box ${incoming || outgoing ? "occupied" : ""}`}
											id={`${buildParameterId(currentSecondSection.device.id, param)}`}
										/>
										<span className="parameter-name right">{param.name}</span>
									</div>
								);
							})}
						</div>
					</div>
				</div>
				<div className="right-panel">
					<div className="top-right-panel">
						{selectedConnection && selectedConnectionInstance ? (
							<ScalerForm connection={selectedConnectionInstance} />
						) : (
							<div className="parameter-info">
								<h3>Parameter Info</h3>
								{selectedParameters.length === 1 && (
									<p>
										{(selectedParameters[0].parameter as MidiParameter)?.name ||
											(isPadsOrdKeys(selectedParameters[0].parameter) &&
												`Section ${(selectedParameters[0].parameter as PadsOrKeys).section_name}`) ||
											`Key/Pad ${(selectedParameters[0].parameter as PadOrKey).note}`}
									</p>
								)}
							</div>
						)}
					</div>
					<div className="bottom-right-panel">
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
					</div>
				</div>
			</div>
		</div>
	);
};

export default PatchingModal;

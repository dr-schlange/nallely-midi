/** biome-ignore-all lint/a11y/noStaticElementInteractions: <explanation> */
/** biome-ignore-all lint/a11y/useKeyWithClickEvents: <explanation> */
import { createSelector } from "@reduxjs/toolkit";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type {
	Connection,
	MidiDevice,
	MidiDeviceSection,
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
	devUID,
	internalSectionName,
	isPadsOrdKeys,
	isVirtualDevice,
	isVirtualParameter,
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
import { useScopeManager, TMP_SCOPE_ID } from "../../hooks/useScopeManager";
import { useTrevorWebSocket } from "../../websockets/websocket";
import { MidiGrid } from "../MidiGrid";
import { ScalerForm } from "../ScalerForm";
import {
	AcceptedValuesKnob,
	Button,
	CircularSlider,
} from "../widgets/BaseComponents";
import { MultiChanScope } from "../widgets/MultiChanScope";

const TmpScopeOverlay = ({
	onClose,
	numChannels,
	portElemIds,
	refreshKey,
}: {
	onClose: () => void;
	numChannels: number;
	portElemIds: string[];
	refreshKey?: string;
}) => {
	const scopeRef = useRef<HTMLDivElement>(null);
	const [paths, setPaths] = useState<string[]>([]);
	const [sizeKey, setSizeKey] = useState(0);
	const portElemIdsKey = portElemIds.join(",");

	useEffect(() => {
		const onResize = () => setSizeKey((k) => k + 1);
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);

	const portrait = window.innerWidth <= window.innerHeight;
	const outerStyle: React.CSSProperties = portrait
		? {
				position: "fixed",
				top: 8,
				left: "50%",
				transform: "translateX(-50%)",
				zIndex: 9999,
				pointerEvents: "none",
			}
		: {
				position: "fixed",
				top: "50%",
				right: 8,
				transform: "translateY(-50%)",
				zIndex: 9999,
				pointerEvents: "none",
			};

	useLayoutEffect(() => {
		if (!scopeRef.current) return;
		const scopeRect = scopeRef.current.getBoundingClientRect();
		const x1 = scopeRect.left + scopeRect.width / 2;
		const y1 = scopeRect.bottom;
		const newPaths: string[] = [];
		for (const id of portElemIds) {
			const portEl = document.getElementById(id);
			if (!portEl) continue;
			const portRect = portEl.getBoundingClientRect();
			const x2 = portRect.left + portRect.width / 2;
			const y2 = portRect.top + portRect.height / 2;
			newPaths.push(`M ${x1},${y1} L ${x2},${y2}`);
		}
		setPaths(newPaths);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [portElemIdsKey, refreshKey, sizeKey]);

	return (
		<>
			<div ref={scopeRef} style={outerStyle}>
				<div
					style={{ position: "relative", pointerEvents: "auto" }}
					onClick={(e) => e.stopPropagation()}
					onPointerDown={(e) => e.stopPropagation()}
					onPointerUp={(e) => e.stopPropagation()}
				>
					<MultiChanScope
						id={TMP_SCOPE_ID}
						num={0}
						onClose={onClose}
						numChannels={numChannels}
					/>
				</div>
			</div>
			{paths.length > 0 && (
				<svg
					style={{
						position: "fixed",
						top: 0,
						left: 0,
						width: "100vw",
						height: "100vh",
						pointerEvents: "none",
						zIndex: 9998,
					}}
				>
					{paths.map((d, i) => (
						<path
							key={i}
							d={d}
							fill="none"
							stroke="gray"
							strokeWidth="2"
							strokeDasharray="5,5"
							strokeOpacity="0.8"
						/>
					))}
				</svg>
			)}
		</>
	);
};

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
	const pitchwheels = sectionWrapper.section.pitchwheels ?? [];
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

const SectionDropdown = ({
	currentSection,
	onSelect,
}: {
	currentSection: MidiDeviceWithSection | VirtualDeviceWithSection;
	onSelect: (section: MidiDeviceWithSection | VirtualDeviceWithSection) => void;
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const [addModuleOpen, setAddModuleOpen] = useState(false);
	const allVirtualDeviceSection = useTrevorSelector(
		selectAllVirtualDeviceSection,
	);
	const allMidiDeviceSection = useTrevorSelector(selectAllMidiDeviceSection);

	const sectionName = internalSectionName(currentSection.section);
	const label =
		sectionName !== "__virtual__"
			? `${currentSection.device.repr} - ${sectionName}`
			: currentSection.device.repr;

	const handleSelect = (
		section: MidiDeviceWithSection | VirtualDeviceWithSection,
	) => {
		onSelect(section);
		setIsOpen(false);
	};

	const currentUID = devUID(currentSection.device);

	return (
		<>
			<details
				className="details-block panel-dropdown"
				open={isOpen}
				onToggle={(e) =>
					setIsOpen((e.currentTarget as HTMLDetailsElement).open)
				}
			>
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
							key={devUID(vs.device)}
							style={{
								display: "flex",
								flexDirection: "column",
								alignItems: "center",
								gap: "2px",
							}}
						>
							<VDevice
								device={vs.device}
								selected={currentUID === devUID(vs.device)}
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
							key={`${devUID(ms.device)}::${ms.section.name}`}
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
									currentUID === devUID(ms.device) &&
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

const PatcheableParameter = ({
	currentValue,
	section,
	param,
	selected,
	occupied,
	reverse = false,
	onClick,
	onLongPress,
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
	onLongPress?: (srcId: string, portElemId: string, pointerId: number) => void;
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

	const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const srcId = isVirtualParameter(param)
		? `${section.device.id}::__virtual__::${param.cv_name}`
		: `${section.device.id}::${param.section_name}::${param.name}`;

	const portElemId = `pb-${buildParameterId(section.device.id, param)}`;

	const handlePortPointerDown = useCallback(
		(e: React.PointerEvent) => {
			e.stopPropagation();
			if (!onLongPress) return;
			const capturedPointerId = e.pointerId;
			if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
			longPressTimerRef.current = setTimeout(() => {
				longPressTimerRef.current = null;
				onLongPress(srcId, portElemId, capturedPointerId);
			}, 500);
		},
		[onLongPress, srcId, portElemId],
	);

	const handlePortPointerUp = useCallback((e: React.PointerEvent) => {
		e.stopPropagation();
		if (longPressTimerRef.current) {
			clearTimeout(longPressTimerRef.current);
			longPressTimerRef.current = null;
		}
	}, []);

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
					onTap={() => onClick?.(section.device, param)}
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
					onTap={() => onClick?.(section.device, param)}
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
				id={portElemId}
				onClick={() => onClick(section.device, param)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						onClick(section.device, param);
					}
				}}
				onPointerDown={handlePortPointerDown}
				onPointerUp={handlePortPointerUp}
				onPointerCancel={(e) => {
					e.stopPropagation();
					if (longPressTimerRef.current) {
						clearTimeout(longPressTimerRef.current);
						longPressTimerRef.current = null;
					}
				}}
			/>
		</div>
	);
};

const SectionPanel = ({
	section,
	liveDevice,
	parameters,
	selectedParameter,
	highlight,
	side,
	dropdownRef,
	onSectionSelect,
	onParameterClick,
	onScopeLongPress,
	onKeysClick,
	onNoteClick,
	onGridOpen,
	onScroll,
	onDeselect,
}: {
	section: MidiDeviceWithSection | VirtualDeviceWithSection;
	liveDevice: MidiDevice | VirtualDevice | undefined;
	parameters: (MidiParameter | VirtualParameter)[];
	selectedParameter:
		| {
				device: MidiDevice | VirtualDevice;
				parameter: MidiParameter | VirtualParameter | PadsOrKeys | PadOrKey;
		  }
		| undefined;
	highlight: string | number | false;
	side: "left" | "right";
	dropdownRef?: React.RefObject<HTMLDivElement>;
	onSectionSelect: (
		section: MidiDeviceWithSection | VirtualDeviceWithSection,
	) => void;
	onParameterClick: (
		device: MidiDevice | VirtualDevice,
		param: MidiParameter | VirtualParameter,
	) => void;
	onScopeLongPress: (
		srcId: string,
		portElemId: string,
		pointerId: number,
	) => void;
	onKeysClick: (device: MidiDevice | VirtualDevice, keys: PadsOrKeys) => void;
	onNoteClick: (device: MidiDevice | VirtualDevice, key: PadOrKey) => void;
	onGridOpen: () => void;
	onScroll: () => void;
	onDeselect: () => void;
}) => {
	const allConnections = useTrevorSelector(
		(state) => state.nallely.connections,
	);
	const allParameters = useMemo(
		() => collectAllParameters(section.device),
		[section.device],
	);
	const allIncoming = useMemo(() => {
		const s = new Set<string>();
		for (const c of allConnections) {
			const uuid = parameterUUID(c.dest.device, c.dest.parameter);
			if (allParameters.includes(uuid)) s.add(uuid);
		}
		return s;
	}, [allParameters, allConnections]);
	const allOutgoing = useMemo(() => {
		const s = new Set<string>();
		for (const c of allConnections) {
			const uuid = parameterUUID(c.src.device, c.src.parameter);
			if (allParameters.includes(uuid)) s.add(uuid);
		}
		return s;
	}, [allParameters, allConnections]);

	const padsOrKeys = section.section.pads_or_keys;
	const midiOccupied = padsOrKeys
		? allIncoming.has(parameterUUID(section.device.id, padsOrKeys)) ||
			allOutgoing.has(parameterUUID(section.device.id, padsOrKeys))
		: false;

	const outerClass = side === "left" ? "top-left-panel" : "bottom-left-panel";
	const gridClass = `parameters-grid ${side}`;
	const midiClass = `${side}-midi`;

	const dropdownNode = (
		<SectionDropdown currentSection={section} onSelect={onSectionSelect} />
	);

	return (
		<div
			className={outerClass}
			onScroll={onScroll}
			onClick={(e) => {
				const t = e.target as Element;
				if (
					!t.closest(".patcheable-parameter") &&
					!t.closest("svg") &&
					selectedParameter?.device.id === section.device.id &&
					selectedParameter?.parameter.section_name ===
						internalSectionName(section.section)
				)
					onDeselect();
			}}
		>
			{dropdownRef ? (
				<div ref={dropdownRef} style={{ width: "100%" }}>
					{dropdownNode}
				</div>
			) : (
				dropdownNode
			)}
			<div className={gridClass} onScroll={onScroll}>
				{section.section.pads_or_keys && (
					<div className={midiClass}>
						<MidiGrid
							device={section.device as MidiDevice}
							section={section.section as MidiDeviceSection}
							onKeysClick={onKeysClick}
							onNoteClick={onNoteClick}
							onGridOpen={onGridOpen}
							highlight={highlight || undefined}
							occupied={midiOccupied}
						/>
					</div>
				)}
				{parameters.map((param) => {
					const pUUID = parameterUUID(section.device.id, param);
					const incoming = allIncoming.has(pUUID);
					const outgoing = allOutgoing.has(pUUID);
					const hasSectionName = param.section_name !== "__virtual__";
					const config = liveDevice?.config as
						| Record<string, Record<string, unknown> | unknown>
						| undefined;
					const currentValue = hasSectionName
						? (config?.[param.section_name] as Record<string, unknown>)?.[
								param.name
							]
						: config?.[param.name];
					return (
						<PatcheableParameter
							key={param.name}
							section={section}
							reverse
							param={param}
							currentValue={currentValue as string | number | undefined}
							selected={selectedParameter?.parameter === param}
							onClick={onParameterClick}
							occupied={incoming || outgoing}
							onLongPress={onScopeLongPress}
						/>
					);
				})}
			</div>
		</div>
	);
};

const PortInfoPanel = ({
	selectedConnection,
	selectedParameters,
	firstDeviceId,
	secondDeviceId,
	navigateToDevice,
	onHighlightConnection,
	onSelectParameter,
}: {
	selectedConnection: string | null;
	selectedParameters: {
		device: MidiDevice | VirtualDevice;
		parameter: MidiParameter | VirtualParameter | PadsOrKeys | PadOrKey;
	}[];
	firstDeviceId: number | undefined;
	secondDeviceId: number | undefined;
	navigateToDevice: (
		deviceId: number,
		sectionName: string,
		parameter: MidiParameter | VirtualParameter,
	) => void;
	onHighlightConnection: (id: string) => void;
	onSelectParameter: (
		device: MidiDevice | VirtualDevice,
		parameter: MidiParameter | VirtualParameter,
	) => void;
}) => {
	const allConnections = useTrevorSelector(
		(state) => state.nallely.connections,
	);
	const allVirtualDeviceSection = useTrevorSelector(
		selectAllVirtualDeviceSection,
	);
	const allMidiDeviceSection = useTrevorSelector(selectAllMidiDeviceSection);

	const selectedConnectionInstance = useMemo(
		() => allConnections.find((c) => connectionId(c) === selectedConnection),
		[allConnections, selectedConnection],
	);

	const selectPort = useCallback(
		(
			deviceId: number,
			parameter: MidiParameter | VirtualParameter,
			connection: Connection,
		) => {
			const vSection = allVirtualDeviceSection.find(
				(vs) =>
					vs.device.id === deviceId &&
					(isVirtualParameter(parameter)
						? vs.device.meta.parameters.some(
								(p) => p.cv_name === (parameter as VirtualParameter).cv_name,
							)
						: true),
			);
			const mSection =
				vSection == null
					? allMidiDeviceSection.find(
							(ms) =>
								ms.device.id === deviceId &&
								internalSectionName(ms.section) === parameter.section_name,
						)
					: undefined;
			const device = vSection?.device ?? mSection?.device;
			if (!device) return;
			let actualParam: MidiParameter | VirtualParameter | undefined;
			if (isVirtualParameter(parameter) && vSection) {
				actualParam = vSection.device.meta.parameters.find(
					(p) => p.cv_name === (parameter as VirtualParameter).cv_name,
				);
			} else if (mSection) {
				for (const s of mSection.device.meta.sections) {
					actualParam = s.parameters.find(
						(p) =>
							p.name === parameter.name &&
							p.section_name === parameter.section_name,
					);
					if (actualParam) break;
				}
			}
			const resolved = actualParam ?? parameter;
			onHighlightConnection(connectionId(connection));
			onSelectParameter(device, resolved);
			const el = document.getElementById(
				`pb-${buildParameterId(deviceId, resolved)}`,
			);
			el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
		},
		[
			allVirtualDeviceSection,
			allMidiDeviceSection,
			onHighlightConnection,
			onSelectParameter,
		],
	);

	const sel = selectedParameters[0];
	const selUUID = sel ? parameterUUID(sel.device, sel.parameter) : null;
	const outgoing = useMemo(
		() =>
			selUUID
				? allConnections.filter(
						(c) => parameterUUID(c.src.device, c.src.parameter) === selUUID,
					)
				: [],
		[allConnections, selUUID],
	);
	const incoming = useMemo(
		() =>
			selUUID
				? allConnections.filter(
						(c) => parameterUUID(c.dest.device, c.dest.parameter) === selUUID,
					)
				: [],
		[allConnections, selUUID],
	);

	return (
		<div className="top-right-panel">
			{selectedConnectionInstance ? (
				<ScalerForm connection={selectedConnectionInstance} />
			) : (
				<div className="parameter-info">
					{sel ? (
						<>
							<p
								style={{
									margin: "4px 0",
									fontWeight: "bold",
									fontSize: "12px",
								}}
							>
								{sel.device.repr}
								{sel.parameter.section_name !== "__virtual__"
									? ` - ${sel.parameter.section_name}`
									: ""}
								{" - "}
								{(sel.parameter as MidiParameter)?.name ||
									(isPadsOrdKeys(sel.parameter) &&
										`Section ${(sel.parameter as PadsOrKeys).section_name}`) ||
									`Key/Pad ${(sel.parameter as PadOrKey).note}`}
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
											const inPair =
												c.dest.device === firstDeviceId ||
												c.dest.device === secondDeviceId;
											return (
												<li
													key={c.id}
													style={{
														fontSize: "11px",
														display: "flex",
														alignItems: "center",
														gap: "4px",
													}}
												>
													{inPair && (
														<Button
															text=">>"
															tooltip="Select destination port"
															variant="small"
															style={{ padding: "2px 4px" }}
															onClick={() => selectPort(c.dest.device, p, c)}
														/>
													)}
													<span
														style={{
															cursor: "pointer",
															textDecoration: "underline dotted",
														}}
														onClick={() =>
															navigateToDevice(c.dest.device, p.section_name, p)
														}
													>
														{c.dest.repr}
														{sec} - {p.name}
													</span>
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
										input from → :
									</p>
									<ul style={{ margin: 0, paddingLeft: "12px" }}>
										{incoming.map((c) => {
											const p = c.src.parameter;
											const sec =
												p.section_name !== "__virtual__"
													? ` - ${p.section_name}`
													: "";
											const inPair =
												c.src.device === firstDeviceId ||
												c.src.device === secondDeviceId;
											return (
												<li
													key={c.id}
													style={{
														fontSize: "11px",
														display: "flex",
														alignItems: "center",
														gap: "4px",
													}}
												>
													<span
														style={{
															cursor: "pointer",
															textDecoration: "underline dotted",
														}}
														onClick={() =>
															navigateToDevice(c.src.device, p.section_name, p)
														}
													>
														{c.src.repr}
														{sec} - {p.name}
													</span>
													{inPair && (
														<Button
															text=">>"
															tooltip="Select source port"
															variant="small"
															style={{ padding: "2px 4px" }}
															onClick={() => selectPort(c.src.device, p, c)}
														/>
													)}
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
					) : (
						<p>Select a connection or a port to see details</p>
					)}
				</div>
			)}
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
		};
		window.addEventListener("orientationchange", handleOrientationChange);
		return () => {
			window.removeEventListener("orientationchange", handleOrientationChange);
		};
	}, []);

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

	const {
		numScopeChannels,
		isScopeOpen,
		handleScopeLongPress,
		closeAllScopeChannels,
		scopePortElemIds,
	} = useScopeManager();

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
	const [highlightedConnection, setHighlightedConnection] = useState<
		string | null
	>(null);
	const [isMouseInteracting, setIsMouseInteracting] = useState(false);
	const allMidiDeviceSection = useTrevorSelector(selectAllMidiDeviceSection);
	const allVirtualDeviceSection = useTrevorSelector(
		selectAllVirtualDeviceSection,
	);
	const navigateToDevice = useCallback(
		(
			deviceId: number,
			sectionName: string,
			parameter: MidiParameter | VirtualParameter,
		) => {
			const cvName = isVirtualParameter(parameter)
				? (parameter as VirtualParameter).cv_name
				: null;
			const target =
				(cvName
					? allVirtualDeviceSection.find(
							(vs) =>
								vs.device.id === deviceId &&
								vs.device.meta.parameters.some((p) => p.cv_name === cvName),
						)
					: undefined) ??
				allVirtualDeviceSection.find(
					(vs) => vs.device.id === deviceId && !vs.device.proxy,
				) ??
				allVirtualDeviceSection.find((vs) => vs.device.id === deviceId) ??
				allMidiDeviceSection.find(
					(ms) =>
						ms.device.id === deviceId &&
						internalSectionName(ms.section) === sectionName,
				);
			if (!target) return;
			const selectedDeviceId = selectedParameters[0]?.device.id;
			const activeIsFirst = currentFirstSection?.device.id === selectedDeviceId;
			if (activeIsFirst) {
				setCurrentSecondSection(target);
			} else {
				setCurrentFirstSection(target);
			}
		},
		[
			allVirtualDeviceSection,
			allMidiDeviceSection,
			currentFirstSection,
			currentSecondSection,
			selectedParameters,
		],
	);
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
			setSelectedConnection(null);
			setHighlightedConnection(null);
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
			setHighlightedConnection(null);
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
					devUID(firstParameter.device) === devUID(device) &&
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
					devUID(firstParameter.device) === devUID(device) &&
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
			const isSelected = (x) =>
				connectionId(x) === selectedConnection ||
				connectionId(x) === highlightedConnection;
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
				connectionId(connection) === selectedConnection ||
					connectionId(connection) === highlightedConnection,
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
		highlightedConnection,
		handleConnectionClick,
		isMouseInteracting,
	]);

	useEffect(() => {
		const onResize = () => {
			requestAnimationFrame(() =>
				requestAnimationFrame(() => updateConnections()),
			);
		};
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, [updateConnections]);

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

	const handleSelectParameter = useCallback(
		(
			device: MidiDevice | VirtualDevice,
			parameter: MidiParameter | VirtualParameter,
		) => {
			setSelectedParameters([{ device, parameter }]);
		},
		[],
	);

	// const srcPadsOrKey = currentFirstSection?.section.pads_or_keys;
	const firstSectionParameters = useMemo(
		() => getSectionParameters(currentFirstSection),
		[currentFirstSection],
	);

	const secondSectionParameters = useMemo(
		() => getSectionParameters(currentSecondSection),
		[currentSecondSection],
	);

	return (
		<div className="patching-modal" ref={modalRef}>
			<div className="modal-header">
				<Button
					text="close"
					tooltip="Close"
					variant="big"
					style={{ width: "auto", padding: "0 6px", color: "var(--black)" }}
					onClick={onClose}
				/>
				<Button
					text="refresh"
					style={{ width: "auto", padding: "0 6px", color: "var(--black)" }}
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
						<SectionPanel
							section={currentFirstSection}
							liveDevice={liveFirstDevice}
							parameters={firstSectionParameters}
							selectedParameter={selectedParameters[0]}
							highlight={shouldHighlight(currentFirstSection.device)}
							side="left"
							dropdownRef={dropdownRef}
							onSectionSelect={(section) => {
								setCurrentFirstSection(section);
								onSectionChange?.(section);
							}}
							onParameterClick={handleParameterClick}
							onScopeLongPress={handleScopeLongPress}
							onKeysClick={handleKeySectionClick}
							onNoteClick={handleKeyClick}
							onGridOpen={handleGridOpen}
							onScroll={updateConnections}
							onDeselect={() => setSelectedParameters([])}
						/>
						<SectionPanel
							section={currentSecondSection}
							liveDevice={liveSecondDevice}
							parameters={secondSectionParameters}
							selectedParameter={selectedParameters[0]}
							highlight={shouldHighlight(currentSecondSection.device)}
							side="right"
							onSectionSelect={(section) => {
								setCurrentSecondSection(section);
								onSectionChange?.(section);
							}}
							onParameterClick={handleParameterClick}
							onScopeLongPress={handleScopeLongPress}
							onKeysClick={handleKeySectionClick}
							onNoteClick={handleKeyClick}
							onGridOpen={handleGridOpen}
							onScroll={updateConnections}
							onDeselect={() => setSelectedParameters([])}
						/>
					</div>
				</div>
				<div className="right-panel">
					<PortInfoPanel
						selectedConnection={selectedConnection}
						selectedParameters={selectedParameters}
						firstDeviceId={currentFirstSection?.device.id}
						secondDeviceId={currentSecondSection?.device.id}
						navigateToDevice={navigateToDevice}
						onHighlightConnection={setHighlightedConnection}
						onSelectParameter={handleSelectParameter}
					/>
				</div>
			</div>
			{isScopeOpen && (
				<Portal>
					<TmpScopeOverlay
						onClose={closeAllScopeChannels}
						numChannels={numScopeChannels}
						portElemIds={scopePortElemIds}
						refreshKey={`${currentFirstSection?.device.id}-${internalSectionName(currentFirstSection?.section)}-${currentSecondSection?.device.id}-${internalSectionName(currentSecondSection?.section)}`}
					/>
				</Portal>
			)}
		</div>
	);
};

export default PatchingModal;

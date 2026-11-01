/** biome-ignore-all lint/a11y/noStaticElementInteractions: <explanation> */
/** biome-ignore-all lint/a11y/useKeyWithClickEvents: <explanation> */
import {
	closestCenter,
	DndContext,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	horizontalListSortingStrategy,
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useEffect, useState } from "react";
import type {
	MidiDevice,
	MidiDeviceSection,
	MidiParameter,
	VirtualDevice,
} from "../model";
import { useBarLinking } from "../hooks/useBarLinking";
import { useHighlightUnit } from "../hooks/useHighlightUnit";
import { useLinkedIds } from "../hooks/useLinkedIds";
import { useTrevorDispatch, useTrevorSelector } from "../store";
import { updateCCState } from "../store/runtimeSlice";
import {
	internalSectionName,
	isFloatRange,
	parameterUUID,
	mergeDevicesPreservingOrder,
	saveDeviceOrder,
} from "../utils/utils";
import { useTrevorWebSocket } from "../websockets/websocket";
import MidiDeviceComponent from "./DeviceComponent";
import { PortDot } from "./PortDot";
import {
	DragHandle,
	type DragHandleProps,
	InlinedSortableList,
} from "./InlinedSortableList";
import { barGridStyle, HORIZONTAL_ROWS } from "./RackRowVirtual";
import {
	BarSlider,
	Button,
	KeysBar,
	lightButtonStyle,
} from "./widgets/BaseComponents";

interface RackRowProps {
	devices: MidiDevice[];
	onDeviceDrop?: (draggedDevice: MidiDevice, targetIndex: number) => void;
	onDragEnd?: () => void;
	onSectionClick: (device: MidiDevice, section: MidiDeviceSection) => void;
	selectedSections: string[];
	onNonSectionClick: () => void;
	onSectionScroll?: () => void;
	onDeviceClick?: (device: MidiDevice) => void;
	// opens the side panel on a device
	onOpenPanel?: (device: MidiDevice | VirtualDevice) => void;
	// the device shown in the open side panel ("id::repr"), if it is open
	openPanelDevice?: string;
	orientation?: "horizontal" | "vertical";
}

export const RackRow = ({
	devices,
	onDeviceDrop,
	onDragEnd,
	onSectionClick,
	selectedSections,
	onNonSectionClick,
	onSectionScroll,
	onDeviceClick,
	onOpenPanel,
	openPanelDevice,
	orientation,
}: RackRowProps) => {
	const midiClasses = useTrevorSelector((state) => state.nallely.classes.midi);
	const oldView = useTrevorSelector((state) => state.runTime.oldView);
	const [localDeviceOrder, setLocalDeviceOrder] =
		useState<MidiDevice[]>(devices);

	const trevorSocket = useTrevorWebSocket();
	const handleDeviceClassClick = (deviceClass: string) => {
		trevorSocket?.createDevice(deviceClass);
	};

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
	);

	const handleDragEnd = (event) => {
		const { active, over } = event;
		if (!over || active.id === over.id) {
			setTimeout(() => {
				onDragEnd?.();
			}, 10);
			return;
		}

		const draggedIndex = localDeviceOrder.findIndex((d) => d.id === active.id);
		const targetIndex = localDeviceOrder.findIndex((d) => d.id === over.id);

		if (draggedIndex === -1 || targetIndex === -1) {
			setTimeout(() => {
				onDragEnd?.();
			}, 10);
			return;
		}

		const newOrder = arrayMove(localDeviceOrder, draggedIndex, targetIndex);
		setLocalDeviceOrder(newOrder);

		saveDeviceOrder(
			"midi",
			newOrder.map((d) => d.id),
		);

		// Add delay to allow DOM to settle after drag operation
		setTimeout(() => {
			onDeviceDrop?.(localDeviceOrder[targetIndex], targetIndex);
			onDragEnd?.();
		}, 10);
	};

	useEffect(() => {
		setLocalDeviceOrder(mergeDevicesPreservingOrder("midi", devices));
	}, [devices]);

	return (
		<div
			className={`rack-row ${orientation}`}
			onScroll={() => onSectionScroll?.()}
			onClick={() => {
				onNonSectionClick();
			}}
		>
			<div className="rack-top-bar">
				<select
					value=""
					title="Adds a MIDI device to the system"
					onChange={(e) => {
						const val = e.target.value;
						if (val) handleDeviceClassClick(val);
					}}
				>
					<option value="" dir="ltr">
						--
					</option>
					{midiClasses.map((cls) => (
						<option key={cls} value={cls} dir="ltr">
							{cls}
						</option>
					))}
				</select>
			</div>
			<div className={"inner-rack-row"} onScroll={() => onSectionScroll?.()}>
				{!oldView && (
					<>
						<InlinedSortableList
							items={localDeviceOrder}
							getId={(d) => d.id}
							orientation={orientation}
							onReorder={(activeId, overId) =>
								handleDragEnd({
									active: { id: activeId },
									over: overId === null ? null : { id: overId },
								})
							}
							renderItem={(device, handleProps, index) => (
								<InlinedMidiDevice
									device={device}
									orientation={orientation}
									handleProps={handleProps}
									mirrored={index % 2 === 1}
									onOpenPanel={onOpenPanel}
									openPanelDevice={openPanelDevice}
								/>
							)}
						/>
						{localDeviceOrder.length === 0 && (
							<p style={{ color: "gray" }}>MIDI devices</p>
						)}
					</>
				)}
				{oldView && (
					<DndContext
						sensors={sensors}
						collisionDetection={closestCenter}
						onDragEnd={handleDragEnd}
						onDragMove={onSectionScroll}
						modifiers={[
							orientation === "horizontal"
								? restrictToHorizontalAxis
								: restrictToVerticalAxis,
							restrictToParentElement,
						]}
					>
						<SortableContext
							items={localDeviceOrder.map((d) => d.id)}
							strategy={
								orientation === "horizontal"
									? horizontalListSortingStrategy
									: verticalListSortingStrategy
							}
						>
							{localDeviceOrder.map((device) => (
								<SortableComponent
									component={MidiDeviceComponent}
									key={device.id}
									device={device}
									onSectionClick={(section) => onSectionClick(device, section)}
									selectedSections={selectedSections}
									onDeviceClick={onDeviceClick}
								/>
							))}

							{localDeviceOrder.length === 0 && (
								<p style={{ color: "gray" }}>MIDI devices</p>
							)}
						</SortableContext>
					</DndContext>
				)}
			</div>
		</div>
	);
};

const toCCValue = (p: MidiParameter, v: number | string): number => {
	if (typeof v === "number") return v;
	const index = p.accepted_values?.findIndex((av) => av.toString() === v) ?? -1;
	if (index < 0) return p.init_value;
	return index * Math.floor((p.range[1] + 1) / p.accepted_values.length);
};

// the linkable parameters of a section: keys, parameters, pitchwheels
const sectionPortItems = (device: MidiDevice, section: MidiDeviceSection) => [
	...(section.pads_or_keys
		? [
				{
					id: parameterUUID(device.id, section.pads_or_keys),
					name: section.pads_or_keys.name,
				},
			]
		: []),
	...[...section.parameters, ...(section.pitchwheels ?? [])].map((p) => ({
		id: parameterUUID(device.id, p),
		name: p.name,
	})),
];

const InlinedMidiSection = ({
	device,
	section,
	horizontal,
	mirrored,
	continuous,
}: {
	device: MidiDevice;
	section: MidiDeviceSection;
	horizontal: boolean;
	mirrored: boolean;
	continuous: boolean;
}) => {
	const sectionName = internalSectionName(section);
	const parameters = [
		...section.parameters,
		...(section.pitchwheels ?? []),
	] as MidiParameter[];
	const [isOpen, setIsOpen] = useState(false);
	// opened when one of its parameters has to be brought in view
	const revealTarget = useTrevorSelector((state) => state.runTime.revealTarget);
	useEffect(() => {
		if (
			revealTarget &&
			sectionPortItems(device, section).some((i) => i.id === revealTarget.id)
		)
			setIsOpen(true);
	}, [revealTarget]);
	// vertical racks keep the label on the left and the port on the right; the swap is for
	// the turned headers of horizontal racks, and for collapsed ones only
	const flipped = horizontal && mirrored && !isOpen;
	const trevorSocket = useTrevorWebSocket();
	// only this section's slice: a CC elsewhere doesn't redraw it
	const sectionCCValues = useTrevorSelector(
		(state) =>
			state.runTime.ccValues?.[device.id]?.[device.repr]?.[sectionName],
	);
	const dispatch = useTrevorDispatch();
	const linking = useBarLinking();
	const linked = useLinkedIds();
	const sectionHighlight = useHighlightUnit(`${device.id}::${sectionName}`);
	const ports = sectionPortItems(device, section).filter((i) =>
		linked.has(i.id),
	);

	return (
		<div
			data-link-section={`${device.id}::${sectionName}`}
			style={{
				display: "flex",
				flexDirection: horizontal ? "row" : "column",
				width: horizontal ? undefined : "100%",
				height: horizontal ? "100%" : undefined,
				boxSizing: "border-box",
			}}
		>
			<p
				data-link-header
				title={sectionName}
				style={{
					fontSize: "12px",
					backgroundColor: "orange",
					color: "#7b550f",
					width: horizontal ? undefined : "100%",
					boxSizing: "border-box",
					margin: "0",
					padding: "3px",
					// turned like the device title: reads bottom to top
					writingMode: horizontal ? "vertical-rl" : undefined,
					transform: horizontal ? "rotate(180deg)" : undefined,
					cursor: "pointer",
					// a long press on a title must not select its text
					userSelect: "none",
					WebkitUserSelect: "none",
					WebkitTouchCallout: "none",
					display: "flex",
					flexDirection: flipped ? "row-reverse" : "row",
					alignItems: "center",
				}}
				{...sectionHighlight.handlers}
				onClick={(event) => {
					if (sectionHighlight.consumeClick(event)) return;
					setIsOpen((prev) => !prev);
				}}
			>
				<span data-link-wall>{sectionName}</span>
				<PortDot
					unit={`${device.id}::${sectionName}`}
					show={!isOpen && ports.length > 0}
					name={sectionName}
					mirrored={flipped}
				/>
			</p>
			<div
				data-link-frame
				style={{
					display: isOpen ? "grid" : "none",
					gap: "2px",
					...barGridStyle(horizontal, HORIZONTAL_ROWS),
					padding: "2px",
				}}
			>
				{section.pads_or_keys && (
					<KeysBar
						vertical={horizontal}
						keys={section.pads_or_keys}
						linkId={parameterUUID(device.id, section.pads_or_keys)}
						linked={
							linking.selected ===
							parameterUUID(device.id, section.pads_or_keys)
						}
						onTap={() =>
							linking.onTap(
								parameterUUID(
									device.id,
									section.pads_or_keys as NonNullable<
										typeof section.pads_or_keys
									>,
								),
							)
						}
					/>
				)}
				{parameters.map((p) => {
					const range: [number, number] = p.range ?? [0, 127];
					return (
						<BarSlider
							vertical={horizontal}
							key={`${device.id}::${p.section_name}::${p.name}`}
							param={p}
							minValue={range[0]}
							maxValue={range[1]}
							rounded={!isFloatRange(range)}
							bipolar={p.high_res === "bipolar"}
							continuous={continuous}
							linkId={parameterUUID(device.id, p)}
							selected={linking.selected === parameterUUID(device.id, p)}
							onTap={() => linking.onTap(parameterUUID(device.id, p))}
							onManualSliderChange={(v) => {
								trevorSocket?.setParameterValue(
									device.id,
									p.section_name,
									p.name,
									v,
								);
								// live values more prio than device.config, keep them sync with what was sent
								dispatch(
									updateCCState({
										device_id: device.id,
										device: device.repr,
										section: p.section_name,
										parameter: p.name,
										value: toCCValue(p, v),
									}),
								);
							}}
							value={
								sectionCCValues?.[p.name] ??
								device.config?.[p.section_name]?.[p.name] ??
								p.init_value ??
								(range[0] + range[1]) / 2 // pitchwheels have no init_value: rest in the middle
							}
						/>
					);
				})}
			</div>
		</div>
	);
};

const InlinedMidiDevice = ({
	device,
	orientation,
	handleProps,
	mirrored,
	onOpenPanel,
	openPanelDevice,
}: {
	device: MidiDevice;
	orientation?: "horizontal" | "vertical";
	handleProps: DragHandleProps;
	// name on the right and dots on the left, alternating along the rack
	mirrored: boolean;
	onOpenPanel?: (device: MidiDevice | VirtualDevice) => void;
	openPanelDevice?: string;
}) => {
	const [isOpen, setIsOpen] = useState(false);
	// opened when one of its parameters has to be brought in view
	const revealTarget = useTrevorSelector((state) => state.runTime.revealTarget);
	useEffect(() => {
		if (
			revealTarget &&
			device.meta.sections.some((section) =>
				sectionPortItems(device, section).some((i) => i.id === revealTarget.id),
			)
		)
			setIsOpen(true);
	}, [revealTarget]);
	const flipped = mirrored && !isOpen;
	const linked = useLinkedIds();
	const deviceHighlight = useHighlightUnit(`${device.id}`);
	const [continuous, setContinuous] = useState(false);
	const trevorSocket = useTrevorWebSocket();
	const devicePorts = device.meta.sections
		.flatMap((section) => sectionPortItems(device, section))
		.filter((i) => linked.has(i.id));
	const horizontal = orientation === "horizontal";

	return (
		<div
			data-link-device={device.id}
			style={{
				backgroundColor: "#e0e0e0",
				border: "3px solid #808080",
				width: horizontal ? undefined : "100%",
				height: horizontal ? "calc(100% - 4px)" : undefined,
				boxSizing: "border-box",
				margin: horizontal ? "2px" : "2px 0", // 2px each side: the gap between devices turns too
				display: horizontal ? "flex" : "block",
				padding: "1px",
			}}
		>
			<p
				data-link-header
				style={{
					fontSize: "16px",
					margin: "0",
					padding: "4px",
					writingMode: horizontal ? "vertical-rl" : undefined,
					transform: horizontal ? "rotate(180deg)" : undefined,
					backgroundColor: "gray",
					color: "lightgray",
					cursor: "pointer",
					// a long press on a title must not select its text
					userSelect: "none",
					WebkitUserSelect: "none",
					WebkitTouchCallout: "none",
					display: "flex",
					alignItems: "center",
				}}
				{...deviceHighlight.handlers}
				onClick={(event) => {
					if (deviceHighlight.consumeClick(event)) return;
					setIsOpen((prev) => !prev);
				}}
			>
				<DragHandle {...handleProps} />
				<span
					style={{
						display: "flex",
						flex: "1 1 0",
						minWidth: 0,
						flexDirection: flipped ? "row-reverse" : "row",
						alignItems: "center",
					}}
				>
					<span data-link-wall>{device.repr}</span>
					<PortDot
						unit={`${device.id}`}
						show={!isOpen && devicePorts.length > 0}
						name={device.repr}
						mirrored={flipped}
					/>
				</span>
				{isOpen && (
					<>
						<Button
							text="F"
							tooltip="Force all notes off"
							onClick={() => trevorSocket?.forceNoteOff(device.id)}
							style={lightButtonStyle(false, true)}
						/>
						<Button
							text="C"
							tooltip="Send every value while dragging, not only the last one"
							activated={continuous}
							onClick={() => setContinuous((prev) => !prev)}
							style={lightButtonStyle(continuous, true)}
						/>
						<Button
							text="«"
							tooltip="Open or close the side panel on this device"
							activated={openPanelDevice === `${device.id}::${device.repr}`}
							onClick={() => onOpenPanel?.(device)}
							style={lightButtonStyle(
								openPanelDevice === `${device.id}::${device.repr}`,
								true,
							)}
						/>
					</>
				)}
			</p>
			<div
				data-link-frame
				style={{
					display: isOpen ? "flex" : "none",
					flexDirection: horizontal ? "row" : "column",
				}}
			>
				{device.meta.sections
					.filter(
						(section) =>
							section.parameters?.length > 0 ||
							section.pitchwheels?.length > 0 ||
							section.pads_or_keys,
					)
					.map((section) => (
						<InlinedMidiSection
							key={internalSectionName(section)}
							device={device}
							section={section}
							horizontal={horizontal}
							mirrored={mirrored}
							continuous={continuous}
						/>
					))}
			</div>
		</div>
	);
};

// for sortable components
import {
	restrictToHorizontalAxis,
	restrictToParentElement,
	restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { HasId } from "../utils/utils";

type SortableComponentProps<T extends HasId> = {
	device: T;
	onDeviceClick?: (device: T) => void;
	selectedSections: string[];
	onSectionClick: (section: any) => void;
	onSectionScroll?: () => void;
	component: React.ComponentType<{
		device: T;
		onDeviceClick?: (device: T) => void;
		selectedSections: string[];
		onSectionClick: (section: any) => void;
		onSectionScroll?: () => void;
	}>;
};

function SortableComponent<T extends HasId>({
	device,
	onSectionClick,
	selectedSections,
	onDeviceClick,
	component: DeviceComponent,
	onSectionScroll,
}: SortableComponentProps<T>) {
	const { attributes, listeners, setNodeRef, transform, transition } =
		useSortable({ id: device.id });

	const style: React.CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition,
		position: "relative",
	} as const satisfies React.CSSProperties;

	return (
		<div ref={setNodeRef} style={style}>
			<div
				{...attributes}
				{...listeners}
				style={{
					position: "absolute",
					top: 5,
					left: 7,
					zIndex: 1,
					cursor: "grab",
					fontSize: "23px",
					color: "gray",
					width: "20px",
					height: "20px",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					touchAction: "none",
				}}
			>
				=
			</div>
			<DeviceComponent
				device={device}
				onSectionClick={onSectionClick}
				selectedSections={selectedSections}
				onDeviceClick={onDeviceClick}
				onSectionScroll={onSectionScroll}
			/>
		</div>
	);
}

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
import type { MidiDevice, MidiDeviceSection, MidiParameter } from "../model";
import { useTrevorDispatch, useTrevorSelector } from "../store";
import { updateCCState } from "../store/runtimeSlice";
import {
	internalSectionName,
	isFloatRange,
	mergeDevicesPreservingOrder,
	saveDeviceOrder,
} from "../utils/utils";
import { useTrevorWebSocket } from "../websockets/websocket";
import MidiDeviceComponent from "./DeviceComponent";
import {
	DragHandle,
	type DragHandleProps,
	InlinedSortableList,
} from "./InlinedSortableList";
import { barGridStyle, HORIZONTAL_ROWS } from "./RackRowVirtual";
import { BarSlider, KeysBar } from "./widgets/BaseComponents";

interface RackRowProps {
	devices: MidiDevice[];
	onDeviceDrop?: (draggedDevice: MidiDevice, targetIndex: number) => void;
	onDragEnd?: () => void;
	onSectionClick: (device: MidiDevice, section: MidiDeviceSection) => void;
	selectedSections: string[];
	onNonSectionClick: () => void;
	onSectionScroll?: () => void;
	onDeviceClick?: (device: MidiDevice) => void;
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
	orientation,
}: RackRowProps) => {
	const midiClasses = useTrevorSelector((state) => state.nallely.classes.midi);
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
					renderItem={(device, handleProps) => (
						<InlinedMidiDevice
							device={device}
							orientation={orientation}
							handleProps={handleProps}
						/>
					)}
				/>
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

const MIDI_SECTION_ROWS = HORIZONTAL_ROWS - 1; // the section header takes one bar row

const InlinedMidiSection = ({
	device,
	section,
	horizontal,
}: {
	device: MidiDevice;
	section: MidiDeviceSection;
	horizontal: boolean;
}) => {
	const sectionName = internalSectionName(section);
	const parameters = [
		...section.parameters,
		...(section.pitchwheels ?? []),
	] as MidiParameter[];
	const [isOpen, setIsOpen] = useState(false);
	const trevorSocket = useTrevorWebSocket();
	const ccValues = useTrevorSelector((state) => state.runTime.ccValues);
	const dispatch = useTrevorDispatch();

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				width: horizontal ? undefined : "100%",
				height: horizontal ? "100%" : undefined,
				boxSizing: "border-box",
			}}
		>
			<p
				title={sectionName}
				style={{
					fontSize: "12px",
					backgroundColor: "orange",
					color: "#7b550f",
					width: "100%",
					boxSizing: "border-box",
					margin: "0",
					padding: horizontal ? "2px" : "3px",
					cursor: "pointer",
					borderTop: horizontal ? "2px solid gray" : "unset",
				}}
				onClick={() => setIsOpen((prev) => !prev)}
			>
				{sectionName}
			</p>
			<div
				style={{
					display: isOpen ? "grid" : "none",
					gap: "2px",
					...barGridStyle(horizontal, MIDI_SECTION_ROWS),
					padding: "5px",
				}}
			>
				{section.pads_or_keys && <KeysBar keys={section.pads_or_keys} />}
				{parameters.map((p) => {
					const range: [number, number] = p.range ?? [0, 127];
					return (
						<BarSlider
							key={`${device.id}::${p.section_name}::${p.name}`}
							param={p}
							minValue={range[0]}
							maxValue={range[1]}
							rounded={!isFloatRange(range)}
							bipolar={p.high_res === "bipolar"}
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
								ccValues?.[device.id]?.[device.repr]?.[p.section_name]?.[
									p.name
								] ??
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
}: {
	device: MidiDevice;
	orientation?: "horizontal" | "vertical";
	handleProps: DragHandleProps;
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const horizontal = orientation === "horizontal";

	return (
		<div
			style={{
				backgroundColor: "#e0e0e0",
				border: "3px solid #808080",
				width: horizontal ? undefined : "100%",
				height: horizontal ? "calc(100% - 10px)" : undefined,
				boxSizing: "border-box",
				margin: "5px 0",
				display: horizontal ? "flex" : "block",
				padding: horizontal ? "0" : "1px",
			}}
		>
			<p
				style={{
					fontSize: "16px",
					margin: "0",
					padding: horizontal ? "4px 2px" : "4px",
					writingMode: horizontal ? "vertical-rl" : undefined,
					transform: horizontal ? "rotate(180deg)" : undefined,
					backgroundColor: "gray",
					color: "lightgray",
					cursor: "pointer",
				}}
				onClick={() => setIsOpen((prev) => !prev)}
			>
				<DragHandle {...handleProps} />
				{device.repr}
			</p>
			<div
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

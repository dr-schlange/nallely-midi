import MidiDeviceComponent from "./DeviceComponent";
import type { MidiDevice, MidiDeviceSection } from "../model";
import { useTrevorSelector } from "../store";
import { useTrevorWebSocket } from "../websockets/websocket";
import {
	DndContext,
	closestCenter,
	useSensor,
	useSensors,
	PointerSensor,
} from "@dnd-kit/core";
import { SortableContext, arrayMove } from "@dnd-kit/sortable";
import { useEffect, useState } from "react";
import { mergeDevicesPreservingOrder, saveDeviceOrder } from "../utils/utils";

interface RackRowProps {
	devices: MidiDevice[];
	onDeviceDrop?: (draggedDevice: MidiDevice, targetIndex: number) => void;
	onSectionClick: (device: MidiDevice, section: MidiDeviceSection) => void;
	selectedSections: string[];
	onNonSectionClick: () => void;
	onSectionScroll?: () => void;
	onDeviceClick?: (device: MidiDevice) => void;
	horizontal?: boolean;
}

export const RackRow = ({
	devices,
	onDeviceDrop,
	onSectionClick,
	selectedSections,
	onNonSectionClick,
	onSectionScroll,
	onDeviceClick,
	horizontal,
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
		if (!over || active.id === over.id) return;

		const draggedIndex = localDeviceOrder.findIndex((d) => d.id === active.id);
		const targetIndex = localDeviceOrder.findIndex((d) => d.id === over.id);

		if (draggedIndex === -1 || targetIndex === -1) return;

		const newOrder = arrayMove(localDeviceOrder, draggedIndex, targetIndex);
		setLocalDeviceOrder(newOrder);

		saveDeviceOrder(
			"midi",
			newOrder.map((d) => d.id),
		);

		onDeviceDrop?.(localDeviceOrder[targetIndex], targetIndex);
	};

	useEffect(() => {
		setLocalDeviceOrder(mergeDevicesPreservingOrder("midi", devices));
	}, [devices]);

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			onDragEnd={handleDragEnd}
			onDragMove={onSectionScroll}
			modifiers={[
				horizontal ? restrictToHorizontalAxis : restrictToVerticalAxis,
				restrictToParentElement,
			]}
		>
			<SortableContext items={localDeviceOrder.map((d) => d.id)}>
				{/* biome-ignore lint/a11y/useKeyWithClickEvents: <explanation> */}
				<div
					className={`rack-row ${horizontal ? "horizontal" : ""}`}
					onScroll={() => onSectionScroll?.()}
					onClick={(event) => {
						if (
							!(event.target as HTMLElement).classList.contains(
								"rack-section-box",
							) &&
							!(event.target as HTMLElement).classList.contains(
								"rack-section-name",
							)
						) {
							onNonSectionClick();
						}
					}}
				>
					<select
						value=""
						title="Adds a MIDI device to the system"
						onChange={(e) => {
							const val = e.target.value;
							if (val) handleDeviceClassClick(val);
						}}
					>
						<option value="">--</option>
						{midiClasses.map((cls) => (
							<option key={cls} value={cls}>
								{cls}
							</option>
						))}
					</select>

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
						<p style={{ color: "#808080" }}>MIDI devices</p>
					)}
				</div>
			</SortableContext>
		</DndContext>
	);
};

// for sortable components
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { HasId } from "../utils/utils";
import {
	restrictToHorizontalAxis,
	restrictToParentElement,
	restrictToVerticalAxis,
} from "@dnd-kit/modifiers";

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
		touchAction: "none",
		position: "relative",
	} as const satisfies React.CSSProperties;

	return (
		<div ref={setNodeRef} style={style} {...attributes}>
			<div
				{...listeners}
				style={{
					position: "absolute",
					top: 3,
					left: 7,
					zIndex: 1,
					cursor: "grab",
					fontSize: "15px",
					color: "gray",
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

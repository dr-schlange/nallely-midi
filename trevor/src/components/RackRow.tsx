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
import type { MidiDevice, MidiDeviceSection } from "../model";
import { useTrevorSelector } from "../store";
import { mergeDevicesPreservingOrder, saveDeviceOrder } from "../utils/utils";
import { useTrevorWebSocket } from "../websockets/websocket";
import MidiDeviceComponent from "./DeviceComponent";

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
			onClick={(event) => {
				if (
					!(event.target as HTMLElement).classList.contains(
						"rack-section-box",
					) &&
					!(event.target as HTMLElement).classList.contains("rack-section-name")
				) {
					onNonSectionClick();
				}
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
					<option value="">--</option>
					{midiClasses.map((cls) => (
						<option key={cls} value={cls}>
							{cls}
						</option>
					))}
				</select>
			</div>
			<div className={"inner-rack-row"} onScroll={() => onSectionScroll?.()}>
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
							<p style={{ color: "#808080" }}>MIDI devices</p>
						)}
					</SortableContext>
				</DndContext>
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

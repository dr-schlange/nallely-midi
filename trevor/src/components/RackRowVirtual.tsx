import { useEffect, useState } from "react";
import type { VirtualDevice, VirtualParameter } from "../model";
import VirtualDeviceComponent from "./VirtualDeviceComponent";
import { useTrevorSelector } from "../store";
import { useTrevorWebSocket } from "../websockets/websocket";
import {
	closestCenter,
	DndContext,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { arrayMove, SortableContext } from "@dnd-kit/sortable";
import { mergeDevicesPreservingOrder, saveDeviceOrder } from "../utils/utils";

interface RackRowVirtualProps {
	devices: VirtualDevice[];
	onDeviceDrop?: (draggedDevice: VirtualDevice, targetIndex: number) => void;
	onParameterClick: (device: VirtualDevice, section?: VirtualParameter) => void;
	selectedSections: string[];
	onNonSectionClick: () => void;
	onSectionScroll?: () => void;
	horizontal?: boolean;
}

export const RackRowVirtual = ({
	devices,
	onDeviceDrop,
	onParameterClick,
	selectedSections,
	onNonSectionClick,
	onSectionScroll,
	horizontal,
}: RackRowVirtualProps) => {
	const virtualClasses = useTrevorSelector(
		(state) => state.nallely.classes.virtual,
	);
	const [localDeviceOrder, setLocalDeviceOrder] =
		useState<VirtualDevice[]>(devices);

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
			"virtuals",
			newOrder.map((d) => d.id),
		);

		onDeviceDrop?.(localDeviceOrder[targetIndex], targetIndex);
	};

	useEffect(() => {
		setLocalDeviceOrder(mergeDevicesPreservingOrder("virtuals", devices));
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
					onScroll={() => onSectionScroll()}
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
						value={""}
						title="Adds a virtual device to the system"
						onChange={(e) => {
							const val = e.target.value;
							handleDeviceClassClick(val);
						}}
					>
						<option value={""}>--</option>
						{virtualClasses.map((cls) => (
							<option key={cls} value={cls}>
								{cls}
							</option>
						))}
					</select>
					{localDeviceOrder.map((device, i) => (
						<SortableVirtualDeviceComponent
							key={device.id}
							device={device}
							onParameterClick={(parameter) =>
								onParameterClick(device, parameter)
							}
							onDeviceClick={(device) => onParameterClick(device)}
							selectedSections={selectedSections}
							onSectionScroll={onSectionScroll}
						/>
					))}
					{devices.length === 0 && (
						<p style={{ color: "#808080" }}>Virtual devices</p>
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

type SortableComponentProps = {
	device: VirtualDevice;
	onDeviceClick?: (device: VirtualDevice) => void;
	selectedSections: string[];
	onSectionScroll?: () => void;
	onParameterClick?: (parameter: VirtualParameter) => void;
};

function SortableVirtualDeviceComponent<T extends HasId>({
	device,
	selectedSections,
	onDeviceClick,
	onSectionScroll,
	onParameterClick,
}: SortableComponentProps) {
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
					top: 5,
					left: 7,
					zIndex: 1,
					cursor: "grab",
					fontSize: "23px",
					color: "gray",
				}}
			>
				=
			</div>
			<VirtualDeviceComponent
				device={device}
				selectedSections={selectedSections}
				onDeviceClick={onDeviceClick}
				onSectionScroll={onSectionScroll}
				onParameterClick={onParameterClick}
			/>
		</div>
	);
}

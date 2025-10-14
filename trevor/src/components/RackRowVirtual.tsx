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
import {
	arrayMove,
	horizontalListSortingStrategy,
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
	mergeDevicesPreservingOrder,
	saveDeviceOrder,
	devUID,
} from "../utils/utils";
import { MiniRack, moduleWeight, moduleWeights } from "./VDevComponent";

const groupBySumLimit = (arr, limit) => {
	const result = [];
	let current = [];
	let sum = 0;

	for (const item of arr) {
		const value = moduleWeight(item)[1];

		if (sum + value > limit) {
			result.push(current);
			current = [item];
			sum = value;
		} else {
			current.push(item);
			sum += value;
		}
	}

	if (current.length) result.push(current);
	return result;
};

interface RackRowVirtualProps {
	devices: VirtualDevice[];
	onDeviceDrop?: (draggedDevice: VirtualDevice, targetIndex: number) => void;
	onDragEnd?: () => void;
	onParameterClick: (device: VirtualDevice) => void;
	selectedSections: string[];
	onNonSectionClick: () => void;
	onSectionScroll?: () => void;
	horizontal?: boolean;
}

export const RackRowVirtual = ({
	devices,
	onDeviceDrop,
	onDragEnd,
	onParameterClick,
	selectedSections,
	onNonSectionClick,
	onSectionScroll,
	horizontal,
}: RackRowVirtualProps) => {
	const [selectorOpened, setSelectorOpened] = useState(false);
	const [detailOpened, setDetailOpened] = useState(false);
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
		if (!over || active.id === over.id) {
			setTimeout(() => {
				onDragEnd?.();
			}, 10);
			return;
		}

		const draggedIndex = localDeviceOrder.findIndex(
			(d) => devUID(d) === active.id,
		);
		const targetIndex = localDeviceOrder.findIndex(
			(d) => devUID(d) === over.id,
		);

		if (draggedIndex === -1 || targetIndex === -1) {
			setTimeout(() => {
				onDragEnd?.();
			}, 10);
			return;
		}

		const newOrder = arrayMove(localDeviceOrder, draggedIndex, targetIndex);
		setLocalDeviceOrder(newOrder);

		saveDeviceOrder(
			"virtuals",
			newOrder.map((d) => devUID(d)),
		);

		// Add delay to allow DOM to settle after drag operation
		onDeviceDrop?.(localDeviceOrder[targetIndex], targetIndex);
		setTimeout(() => {
			onDragEnd?.();
		}, 10);
	};

	useEffect(() => {
		setLocalDeviceOrder(mergeDevicesPreservingOrder("virtuals", devices));
	}, [devices]);

	console.debug(moduleWeights(localDeviceOrder));
	return (
		<>
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
				<div className="rack-top-bar">
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
					<Button
						text="Add many"
						tooltip="Add multiple virtual devices at once"
						variant="small"
						style={{
							width: "100%",
							height: "87%",
							color: "black",
						}}
						onClick={() => setSelectorOpened((prev) => !prev)}
					/>
				</div>
				<div className={"inner-rack-row"} onScroll={() => onSectionScroll?.()}>
					{groupBySumLimit(localDeviceOrder, 6).map((rack, i) => (
						<MiniRack
							key={`mini-rack-${i}`}
							devices={rack}
							rackId={`${i}`}
							onDeviceClick={onParameterClick}
							onPlaceholderClick={() => setSelectorOpened((prev) => !prev)}
							selectedSections={selectedSections}
						/>
					))}
					<Button
						text={`${detailOpened ? "hide" : "show"} details`}
						tooltip="Open full size devices for reordering"
						variant="small"
						style={{
							width: "187px",
							height: "90%",
							justifyContent: "flex-start",
						}}
						activated={detailOpened}
						onClick={() => setDetailOpened((prev) => !prev)}
					/>
					{detailOpened && (
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
							<SortableContext
								items={localDeviceOrder.map((d) => devUID(d))}
								strategy={
									horizontal
										? horizontalListSortingStrategy
										: verticalListSortingStrategy
								}
							>
								{localDeviceOrder.map((device, i) => (
									<SortableVirtualDeviceComponent
										key={devUID(device)}
										device={device}
										onParameterClick={(device) => onParameterClick(device)}
										onDeviceClick={(device) => onParameterClick(device)}
										selectedSections={selectedSections}
										onSectionScroll={onSectionScroll}
									/>
								))}
								{devices.length === 0 && (
									<p style={{ color: "#808080" }}>Virtual devices</p>
								)}
							</SortableContext>
						</DndContext>
					)}
				</div>
			</div>
			{selectorOpened && (
				<VDeviceSelectionModal
					onClose={() => setSelectorOpened((prev) => !prev)}
				/>
			)}
		</>
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
import { Button } from "./widgets/BaseComponents";
import VDeviceSelectionModal from "./modals/VirtualDeviceSelectionModal";

type SortableComponentProps = {
	device: VirtualDevice;
	onDeviceClick?: (device: VirtualDevice) => void;
	selectedSections: string[];
	onSectionScroll?: () => void;
	onParameterClick?: (
		device: VirtualDevice,
		parameter: VirtualParameter,
	) => void;
};

function SortableVirtualDeviceComponent<T extends HasId>({
	device,
	selectedSections,
	onDeviceClick,
	onSectionScroll,
	onParameterClick,
}: SortableComponentProps) {
	const { attributes, listeners, setNodeRef, transform, transition } =
		useSortable({
			id: devUID(device),
		});

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

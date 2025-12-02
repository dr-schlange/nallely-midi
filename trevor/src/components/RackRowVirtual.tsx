/** biome-ignore-all lint/a11y/noStaticElementInteractions: <explanation> */
/** biome-ignore-all lint/a11y/useKeyWithClickEvents: <explanation> */
import { useEffect, useState } from "react";
import type { VirtualDevice } from "../model";
import { useTrevorSelector } from "../store";
import { useTrevorWebSocket } from "../websockets/websocket";
import {
	DndContext,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	rectSortingStrategy,
	horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
	mergeDevicesPreservingOrder,
	saveDeviceOrder,
	devUID,
} from "../utils/utils";
import { MiniRack, moduleWeight } from "./VDevComponent";
import { Button } from "./widgets/BaseComponents";
import VDeviceSelectionModal from "./modals/VirtualDeviceSelectionModal";
import {
	restrictToHorizontalAxis,
	restrictToVerticalAxis,
	restrictToParentElement,
} from "@dnd-kit/modifiers";
import { ClassBrowser } from "./modals/ClassBrowser";

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

export class CustomPointerSensor extends PointerSensor {
	static activators = [
		{
			eventName: "onPointerDown" as const,
			handler: ({ nativeEvent }: { nativeEvent: PointerEvent }) => {
				const target = nativeEvent.target as HTMLElement | null;

				if (target?.closest("[data-no-dnd]")) {
					return false;
				}

				return true;
			},
		},
	];
}

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
	const [codeEditorOpened, setCodeEditorOpened] = useState(false);
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
		useSensor(CustomPointerSensor, {
			activationConstraint: {
				delay: 250,
				tolerance: 5,
			},
		}),
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

	const handleCreateNew = () => {
		trevorSocket?.createNewDevice("MyDevice");
		setCodeEditorOpened((prev) => !prev);
	};

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
					<Button
						text="Create"
						tooltip="Create a new virtual device"
						variant="small"
						style={{
							width: "100%",
							height: "87%",
							color: "black",
						}}
						onClick={() => handleCreateNew()}
					/>
				</div>
				<div className={"inner-rack-row"} onScroll={() => onSectionScroll?.()}>
					<DndContext
						sensors={sensors}
						onDragEnd={handleDragEnd}
						modifiers={horizontal ? [restrictToHorizontalAxis] : []}
					>
						<SortableContext
							items={localDeviceOrder.map((d) => devUID(d))}
							strategy={
								horizontal ? horizontalListSortingStrategy : rectSortingStrategy
							}
						>
							{groupBySumLimit(localDeviceOrder, 6).map((rack, i) => (
								<MiniRack
									key={`mini-rack-${i}`}
									devices={rack}
									rackId={`${i}`}
									onDeviceClick={onParameterClick}
									onPlaceholderClick={() => setSelectorOpened((prev) => !prev)}
									selectedSections={selectedSections}
									onDrag={onSectionScroll}
								/>
							))}
						</SortableContext>
					</DndContext>
				</div>
			</div>
			{selectorOpened && (
				<VDeviceSelectionModal
					onClose={() => setSelectorOpened((prev) => !prev)}
				/>
			)}
			{/* {codeEditorOpened && (
				<ClassBrowser onClose={() => setSelectorOpened((prev) => !prev)} />
			)} */}
		</>
	);
};

// for sortable components

/** biome-ignore-all lint/a11y/noStaticElementInteractions: <explanation> */
/** biome-ignore-all lint/a11y/useKeyWithClickEvents: <explanation> */
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import { Portal } from "./Portal";

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

	const handleDragEnd = useCallback(
		(event) => {
			const { active, over } = event;

			if (!over || active.id === over.id) {
				setTimeout(() => onDragEnd?.(), 100);
				return;
			}

			setLocalDeviceOrder((prevOrder) => {
				const draggedIndex = prevOrder.findIndex(
					(d) => devUID(d) === active.id,
				);
				const targetIndex = prevOrder.findIndex((d) => devUID(d) === over.id);

				if (draggedIndex === -1 || targetIndex === -1) {
					setTimeout(() => onDragEnd?.(), 10);
					return prevOrder;
				}

				const newOrder = arrayMove(prevOrder, draggedIndex, targetIndex);

				saveDeviceOrder(
					"virtuals",
					newOrder.map((d) => devUID(d)),
				);

				onDeviceDrop?.(newOrder[targetIndex], targetIndex);

				setTimeout(() => onDragEnd?.(), 100);

				return newOrder;
			});
		},
		[onDeviceDrop, onDragEnd],
	);

	useEffect(() => {
		setLocalDeviceOrder(mergeDevicesPreservingOrder("virtuals", devices));
	}, [devices]);

	const handleCreateNew = () => {
		trevorSocket?.createNewDevice("MyDevice");
		setCodeEditorOpened((prev) => !prev);
	};

	const groupedDevices = useMemo(
		() => groupBySumLimit(localDeviceOrder, 6),
		[localDeviceOrder],
	);

	const handlePlaceholderClick = useCallback(() => {
		setSelectorOpened((prev) => !prev);
	}, []);

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
							{groupedDevices.map((rack, i) => (
								<MiniRack
									key={`mini-rack-${i}`}
									devices={rack}
									rackId={`${i}`}
									onDeviceClick={onParameterClick}
									onPlaceholderClick={handlePlaceholderClick}
									selectedSections={selectedSections}
									onDrag={onSectionScroll}
								/>
							))}
						</SortableContext>
					</DndContext>
				</div>
			</div>
			{selectorOpened && (
				<Portal>
					<VDeviceSelectionModal
						onClose={() => setSelectorOpened((prev) => !prev)}
					/>
				</Portal>
			)}
		</>
	);
};

// for sortable components

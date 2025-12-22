/** biome-ignore-all lint/a11y/noStaticElementInteractions: <explanation> */
/** biome-ignore-all lint/a11y/useKeyWithClickEvents: <explanation> */
import { useEffect, useState, memo, useCallback, useMemo } from "react";
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

export const RackRowVirtual = memo(
	({
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

		const toggleSelector = useCallback(() => {
			setSelectorOpened((prev) => !prev);
		}, []);

		const handleNonSectionClickInternal = useCallback(
			(event: React.MouseEvent) => {
				if (
					!(event.target as HTMLElement).classList.contains(
						"rack-section-box",
					) &&
					!(event.target as HTMLElement).classList.contains("rack-section-name")
				) {
					onNonSectionClick();
				}
			},
			[onNonSectionClick],
		);

		const handleSectionScroll = useCallback(() => {
			onSectionScroll?.();
		}, [onSectionScroll]);

		const groupedRacks = useMemo(
			() => groupBySumLimit(localDeviceOrder, 6),
			[localDeviceOrder],
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

		const handleCreateNew = useCallback(() => {
			trevorSocket?.createNewDevice("MyDevice");
			setCodeEditorOpened((prev) => !prev);
		}, [trevorSocket]);

		return (
			<>
				<div
					className={`rack-row ${horizontal ? "horizontal" : ""}`}
					onScroll={handleSectionScroll}
					onClick={handleNonSectionClickInternal}
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
							onClick={toggleSelector}
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
							onClick={handleCreateNew}
						/>
					</div>
					<div className={"inner-rack-row"} onScroll={handleSectionScroll}>
						<DndContext
							sensors={sensors}
							onDragEnd={handleDragEnd}
							modifiers={horizontal ? [restrictToHorizontalAxis] : []}
						>
							<SortableContext
								items={localDeviceOrder.map((d) => devUID(d))}
								strategy={
									horizontal
										? horizontalListSortingStrategy
										: rectSortingStrategy
								}
							>
								{groupedRacks.map((rack, i) => (
									<MiniRack
										key={`mini-rack-${i}`}
										devices={rack}
										rackId={`${i}`}
										onDeviceClick={onParameterClick}
										onPlaceholderClick={toggleSelector}
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
						<VDeviceSelectionModal onClose={toggleSelector} />
					</Portal>
				)}
			</>
		);
	},
);

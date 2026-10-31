/** biome-ignore-all lint/a11y/noStaticElementInteractions: <explanation> */
/** biome-ignore-all lint/a11y/useKeyWithClickEvents: <explanation> */
import {
	DndContext,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import {
	arrayMove,
	horizontalListSortingStrategy,
	rectSortingStrategy,
	SortableContext,
} from "@dnd-kit/sortable";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { VirtualDevice } from "../model";
import { useTrevorSelector } from "../store";
import {
	devUID,
	generateAcronym,
	mergeDevicesPreservingOrder,
	saveDeviceOrder,
} from "../utils/utils";
import { useTrevorWebSocket } from "../websockets/websocket";
import {
	DragHandle,
	type DragHandleProps,
	InlinedSortableList,
} from "./InlinedSortableList";
import VDeviceSelectionModal from "./modals/VirtualDeviceSelectionModal";
import { Portal } from "./Portal";
import { MiniRack, moduleWeight } from "./VDevComponent";
import { BarSlider, Button } from "./widgets/BaseComponents";

const groupBySumLimit = (arr, limit, connections) => {
	const result = [];
	let current = [];
	let sum = 0;

	for (const item of arr) {
		const value = moduleWeight(item, connections)[1];

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
	orientation?: "vertical" | "horizontal";
}

export const RackRowVirtual = ({
	devices,
	onDeviceDrop,
	onDragEnd,
	onParameterClick,
	selectedSections,
	onNonSectionClick,
	onSectionScroll,
	orientation,
}: RackRowVirtualProps) => {
	const [selectorOpened, setSelectorOpened] = useState(false);
	const [_, setCodeEditorOpened] = useState(false);
	// const virtualClasses = useTrevorSelector(
	// 	(state) => state.nallely.classes.virtual,
	// );
	const connections = useTrevorSelector((state) => state.nallely.connections);
	const [localDeviceOrder, setLocalDeviceOrder] =
		useState<VirtualDevice[]>(devices);

	const trevorSocket = useTrevorWebSocket();
	// const handleDeviceClassClick = (deviceClass: string) => {
	// 	trevorSocket?.createDevice(deviceClass);
	// };

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
		() => groupBySumLimit(localDeviceOrder, 6, connections),
		[localDeviceOrder, connections],
	);

	const handlePlaceholderClick = useCallback(() => {
		setSelectorOpened((prev) => !prev);
	}, []);

	return (
		<>
			<div
				className={`rack-row ${orientation}`}
				onScroll={() => onSectionScroll()}
				onClick={() => {
					onNonSectionClick();
				}}
			>
				<div className="rack-top-bar">
					<Button
						text="Add many"
						tooltip="Add multiple virtual devices at once"
						variant="small"
						style={{
							color: "var(--black)",
						}}
						onClick={() => setSelectorOpened((prev) => !prev)}
					/>
					<Button
						text="Create"
						tooltip="Create a new virtual device"
						variant="small"
						style={{
							color: "var(--black)",
						}}
						onClick={() => handleCreateNew()}
					/>
				</div>
				<div className={"inner-rack-row"} onScroll={() => onSectionScroll?.()}>
					<InlinedSortableList
						items={localDeviceOrder}
						getId={devUID}
						orientation={orientation}
						onReorder={(activeId, overId) =>
							handleDragEnd({
								active: { id: activeId },
								over: overId === null ? null : { id: overId },
							})
						}
						renderItem={(d, handleProps) => (
							<InlinedVDev
								vdev={d}
								orientation={orientation}
								handleProps={handleProps}
							/>
						)}
					/>
					<DndContext
						sensors={sensors}
						onDragEnd={handleDragEnd}
						modifiers={
							orientation === "horizontal" ? [restrictToHorizontalAxis] : []
						}
					>
						<SortableContext
							items={localDeviceOrder.map((d) => devUID(d))}
							strategy={
								orientation === "horizontal"
									? horizontalListSortingStrategy
									: rectSortingStrategy
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

interface InlineVDevProps {
	vdev: VirtualDevice;
	orientation?: "vertical" | "horizontal";
	handleProps: DragHandleProps;
}

export const barGridStyle = (
	horizontal: boolean,
	rows: number,
): React.CSSProperties =>
	horizontal
		? {
				gridTemplateRows: `repeat(${rows}, auto)`,
				gridAutoFlow: "column",
				justifyContent: "flex-start",
				alignContent: "space-around",
			}
		: {
				gridTemplateColumns: "repeat(auto-fill, 88px)",
				justifyContent: "space-between",
			};

export const HORIZONTAL_ROWS = 4;

const InlinedVDev = ({ vdev, orientation, handleProps }: InlineVDevProps) => {
	const [isOpen, setIsOpen] = useState(false);
	const trevorSocket = useTrevorWebSocket();
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
				{generateAcronym(vdev.repr, 10, true)}
			</p>
			<div
				style={{
					display: isOpen ? "grid" : "none",
					gap: "2px",
					...barGridStyle(horizontal, HORIZONTAL_ROWS),
					padding: "5px",
				}}
			>
				{vdev.meta.parameters.map((p) => (
					<BarSlider
						key={p.cv_name}
						param={p}
						minValue={p.range[0]}
						maxValue={p.range[1]}
						rounded={p.conversion_policy !== null}
						onManualSliderChange={(v) =>
							trevorSocket?.setVirtualValue(vdev, p, v)
						}
						value={vdev.config[p.name] ?? p.default ?? undefined}
					/>
				))}
			</div>
		</div>
	);
};

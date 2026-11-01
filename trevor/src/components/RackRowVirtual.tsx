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
import {
	lazy,
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { VirtualDevice } from "../model";
import { useTrevorDispatch, useTrevorSelector } from "../store";
import { setClassCodeMode } from "../store/runtimeSlice";
import {
	devUID,
	generateAcronym,
	mergeDevicesPreservingOrder,
	parameterUUID,
	saveDeviceOrder,
} from "../utils/utils";
import { useCounterZoom } from "../hooks/RackScaleContext";
import { useBarLinking } from "../hooks/useBarLinking";
import { useHighlightUnit } from "../hooks/useHighlightUnit";
import { useLinkedIds } from "../hooks/useLinkedIds";
import { useTrevorWebSocket } from "../websockets/websocket";
import {
	DragHandle,
	type DragHandleProps,
	InlinedSortableList,
} from "./InlinedSortableList";
import { PortDot } from "./PortDot";
import VDeviceSelectionModal from "./modals/VirtualDeviceSelectionModal";
import { DeviceMenu } from "./ParameterMenu";
import { Portal } from "./Portal";

const ClassBrowser = lazy(() =>
	import("./modals/ClassBrowser").then((module) => ({
		default: module.ClassBrowser,
	})),
);
import { MiniRack, moduleWeight } from "./VDevComponent";
import { BarSlider, Button, lightButtonStyle } from "./widgets/BaseComponents";

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
	// opens the side panel on a device
	onOpenPanel?: (device: VirtualDevice) => void;
	// the device shown in the open side panel ("id::repr"), if it is open
	openPanelDevice?: string;
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
	onOpenPanel,
	openPanelDevice,
	selectedSections,
	onNonSectionClick,
	onSectionScroll,
	orientation,
}: RackRowVirtualProps) => {
	const [selectorOpened, setSelectorOpened] = useState(false);
	const connections = useTrevorSelector((state) => state.nallely.connections);
	const oldView = useTrevorSelector((state) => state.runTime.oldView);
	const counterZoom = useCounterZoom();
	const [localDeviceOrder, setLocalDeviceOrder] =
		useState<VirtualDevice[]>(devices);

	const trevorSocket = useTrevorWebSocket();
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
				<div className="rack-top-bar" style={counterZoom}>
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
					{!oldView && (
						<>
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
								renderItem={(d, handleProps, index) => (
									<InlinedVDev
										vdev={d}
										orientation={orientation}
										handleProps={handleProps}
										mirrored={index % 2 === 1}
										onOpenPanel={onOpenPanel}
										openPanelDevice={openPanelDevice}
									/>
								)}
							/>
							{localDeviceOrder.length === 0 && (
								<p style={{ color: "gray" }}>Virtual devices</p>
							)}
						</>
					)}
					{oldView && (
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
					)}
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
	// name on the right and dots on the left, alternating along the rack
	mirrored: boolean;
	onOpenPanel?: (device: VirtualDevice) => void;
	openPanelDevice?: string;
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

// rows of turned bars in horizontal racks (the rack height is in index.css)
export const HORIZONTAL_ROWS = 2;

const InlinedVDev = ({
	vdev,
	orientation,
	handleProps,
	mirrored,
	onOpenPanel,
	openPanelDevice,
}: InlineVDevProps) => {
	const [isOpen, setIsOpen] = useState(false);
	// with the C button (class code mode) active, a click on the title opens the code editor
	const classCodeMode = useTrevorSelector(
		(state) => state.runTime.classCodeMode,
	);
	const dispatch = useTrevorDispatch();
	const [isCodeOpen, setIsCodeOpen] = useState(false);
	// opened when one of its parameters has to be brought in view
	const revealTarget = useTrevorSelector((state) => state.runTime.revealTarget);
	useEffect(() => {
		if (
			revealTarget &&
			vdev.meta.parameters.some(
				(p) => parameterUUID(vdev.id, p) === revealTarget.id,
			)
		)
			setIsOpen(true);
	}, [revealTarget]);
	// an expanded title keeps its name on the left: the swap is for collapsed ones
	const flipped = mirrored && !isOpen;

	const trevorSocket = useTrevorWebSocket();
	const linking = useBarLinking();
	const linked = useLinkedIds();
	const vdevHighlight = useHighlightUnit(`${vdev.id}`);
	const headerRef = useRef<HTMLParagraphElement>(null);
	const highlighted = useTrevorSelector(
		(state) => state.runTime.highlightedUnit === `${vdev.id}`,
	);
	const [continuous, setContinuous] = useState(false);
	const ports = vdev.meta.parameters
		.map((p) => ({ id: parameterUUID(vdev.id, p), name: p.name }))
		.filter((i) => linked.has(i.id));
	const horizontal = orientation === "horizontal";
	return (
		<div
			data-link-device={vdev.id}
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
				ref={headerRef}
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
				{...vdevHighlight.handlers}
				onClick={(event) => {
					if (vdevHighlight.consumeClick(event)) return;
					if (classCodeMode) {
						setIsCodeOpen((prev) => !prev);
						dispatch(setClassCodeMode(false));
						return;
					}
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
					<span data-link-wall>{generateAcronym(vdev.repr, 10, true)}</span>
					<PortDot
						unit={`${vdev.id}`}
						show={!isOpen && ports.length > 0}
						name={vdev.repr}
						mirrored={flipped}
					/>
				</span>
				{isOpen && (
					<>
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
							activated={openPanelDevice === `${vdev.id}::${vdev.repr}`}
							onClick={() => onOpenPanel?.(vdev)}
							style={lightButtonStyle(
								openPanelDevice === `${vdev.id}::${vdev.repr}`,
								true,
							)}
						/>
					</>
				)}
			</p>
			{highlighted && (
				<DeviceMenu
					id={vdev.id}
					anchorRef={headerRef}
					cloneable={!vdev.proxy}
				/>
			)}
			<div
				data-link-frame
				data-link-section={`${vdev.id}::__virtual__`}
				style={{
					display: isOpen ? "grid" : "none",
					gap: "2px",
					...barGridStyle(horizontal, HORIZONTAL_ROWS),
					padding: "2px",
				}}
			>
				{vdev.meta.parameters.map((p) => (
					<BarSlider
						vertical={horizontal}
						// a proxy's parameters start with the device name: the patching modal drops it too
						stripPrefix={vdev.proxy}
						key={p.cv_name}
						param={p}
						minValue={p.range[0]}
						maxValue={p.range[1]}
						rounded={p.conversion_policy !== null}
						continuous={continuous}
						onManualSliderChange={(v) =>
							trevorSocket?.setVirtualValue(vdev, p, v)
						}
						value={vdev.config[p.name] ?? p.default ?? undefined}
						linkId={parameterUUID(vdev.id, p)}
						selected={linking.selected === parameterUUID(vdev.id, p)}
						onTap={() => linking.onTap(parameterUUID(vdev.id, p))}
					/>
				))}
			</div>
			{isCodeOpen && (
				<Portal>
					<Suspense fallback={null}>
						<ClassBrowser onClose={() => setIsCodeOpen(false)} device={vdev} />
					</Suspense>
				</Portal>
			)}
		</div>
	);
};

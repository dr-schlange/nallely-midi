import { forwardRef, ReactElement, useImperativeHandle, useState } from "react";
import { Scope } from "./widgets/Oscilloscope";
import { XYScope } from "./widgets/XYScope";
import { XYZScope } from "./widgets/XYZScope";

interface WidgetRackProps {
	onRackScroll?: () => void;
	onDragEnd?: () => void;
	horizontal?: boolean;
	onAddWidget?: (id: string, component: ReactElement) => void;
}

export interface RackRowWidgetRef {
	resetAll: () => void;
}

interface RackRowWidget {
	id: string;
}

const WidgetComponents = {
	Scope,
	XYScope,
	XYZScope,
	// WindowWidget: (props) => (
	// 	<WindowWidget url="http://localhost:8000/finger-tracking.html" {...props} />
	// ),
	Sliders,
	Buttons,
};

export const RackRowWidgets = forwardRef<RackRowWidgetRef, WidgetRackProps>(
	(
		{ onRackScroll, onDragEnd, horizontal, onAddWidget }: WidgetRackProps,
		ref,
	) => {
		const [widgets, setWidgets] = useState<
			{ num: number; id: string; type: string; component: React.FC<any> }[]
		>([]);
		const [typeIds, setTypeIds] = useState<Record<string, number>>({});

		const sensors = useSensors(
			useSensor(PointerSensor, {
				activationConstraint: {
					distance: 8,
				},
			}),
		);

		const addWidget = (Component, widgetType: string) => {
			setWidgets((oldWidgets) => {
				const idsUsed = oldWidgets
					.filter((w) => w.type === widgetType)
					.map((w) => w.num);
				const nextId = findFirstMissingValue(idsUsed);
				const widgetId = `${widgetType}::${nextId}`;
				setTimeout(() => {
					onAddWidget?.(widgetId, Component);
				}, 10);
				return [
					...oldWidgets,
					{
						id: widgetId,
						num: nextId,
						type: widgetType,
						component: Component,
					},
				];
			});
		};

		useImperativeHandle(ref, () => ({
			resetAll() {
				setWidgets([]);
				setTypeIds({});
			},
		}));

		const handleDragEnd = (event) => {
			const { active, over } = event;
			if (!over || active.id === over.id) return;

			const oldIndex = widgets.findIndex((w) => w.id === active.id);
			const newIndex = widgets.findIndex((w) => w.id === over.id);
			setWidgets(arrayMove(widgets, oldIndex, newIndex));

			// Call the callback to update connections with a small delay
			// to allow DOM to settle after drag operation
			setTimeout(() => {
				onDragEnd?.();
			}, 10);
		};
		const closeWidget = (id: string) => {
			setWidgets((prev) =>
				prev.filter((w) => w.id !== id && w.id.replace("::", "") !== id),
			);
			setTimeout(() => {
				onDragEnd?.();
			}, 10);
		};

		return (
			<div
				className={`rack-row ${horizontal ? "horizontal" : ""}`}
				onScroll={() => onRackScroll?.()}
			>
				<select
					value={""}
					title="Adds a new widget to the system"
					onChange={(e) => {
						const val = e.target.value;
						if (val && WidgetComponents[val]) {
							addWidget(WidgetComponents[val], val.toLocaleLowerCase());
						}
					}}
				>
					<option value={""}>--</option>
					{Object.keys(WidgetComponents).map((name) => (
						<option key={name} value={name}>
							{name}
						</option>
					))}
				</select>
				<div className={"inner-rack-row"} onScroll={() => onRackScroll?.()}>
					<DndContext
						sensors={sensors}
						collisionDetection={closestCenter}
						onDragEnd={handleDragEnd}
						onDragMove={onRackScroll}
						modifiers={[
							horizontal ? restrictToHorizontalAxis : restrictToVerticalAxis,
							restrictToParentElement,
						]}
					>
						<SortableContext
							items={widgets.map((w) => w.id)}
							strategy={
								horizontal
									? horizontalListSortingStrategy
									: verticalListSortingStrategy
							}
						>
							{widgets.map(({ id, num, component: Widget }) => (
								<SortableWidget key={id} id={id}>
									<Widget
										id={id.replace("::", "")}
										num={num}
										onClose={closeWidget}
									/>
								</SortableWidget>
							))}

							{widgets.length === 0 && (
								<p style={{ color: "#808080" }}>Widgets</p>
							)}
						</SortableContext>
					</DndContext>
				</div>
			</div>
		);
	},
);

// for sortable components
import {
	arrayMove,
	horizontalListSortingStrategy,
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	restrictToHorizontalAxis,
	restrictToParentElement,
	restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
	closestCenter,
	DndContext,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { findFirstMissingValue } from "../utils/utils";
import { WindowWidget } from "./widgets/BaseWindowWidget";
import { Sliders } from "./widgets/SlidersWidget";
import { Buttons } from "./widgets/TouchButtonsWidget";

const SortableWidget = ({
	id,
	children,
}: {
	id: string;
	children: React.ReactNode;
}) => {
	const { attributes, listeners, setNodeRef, transform, transition } =
		useSortable({ id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		position: "relative",
	} as const satisfies React.CSSProperties;

	return (
		<div ref={setNodeRef} style={style} id={id.replace("::", "")}>
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
			{children}
		</div>
	);
};

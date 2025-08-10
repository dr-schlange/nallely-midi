import { forwardRef, useImperativeHandle, useState } from "react";
import { Scope } from "./widgets/Oscilloscope";
import { XYScope } from "./widgets/XYScope";
import { XYZScope } from "./widgets/XYZScope";

interface WidgetRackProps {
	onRackScroll?: () => void;
	horizontal?: boolean;
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
};

const findFirstMissingValue = (arr: number[]): number => {
	if (arr.length === 0) return 0;
	console.debug("Finding first missing value in", arr);

	const max = Math.max(...arr);
	const set = new Set(arr);

	for (let i = 0; i <= max; i++) {
		if (!set.has(i)) {
			return i;
		}
	}

	return max + 1;
};

export const RackRowWidgets = forwardRef<RackRowWidgetRef, WidgetRackProps>(
	({ onRackScroll, horizontal }: WidgetRackProps, ref) => {
		const [widgets, setWidgets] = useState<
			{ num: number; id: string; type: string; component: React.FC<any> }[]
		>([]);
		const [typeIds, setTypeIds] = useState<Record<string, number>>({});

		const sensors = useSensors(
			useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
		);

		const addWidget = (Component, widgetType: string) => {
			setWidgets((oldWidgets) => {
				const idsUsed = oldWidgets
					.filter((w) => w.type === widgetType)
					.map((w) => w.num);
				const nextId = findFirstMissingValue(idsUsed);
				console.debug("Adding widget", widgetType, "with ID", nextId);
				return [
					...oldWidgets,
					{
						id: `${widgetType}-${nextId}`,
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
		};

		const closeWidget = (id: string) => {
			console.debug("Closing widget with ID", id);
			setWidgets((prev) => prev.filter((w) => w.id !== id));
		};

		return (
			<DndContext
				sensors={sensors}
				collisionDetection={closestCenter}
				onDragEnd={handleDragEnd}
				modifiers={[
					horizontal ? restrictToHorizontalAxis : restrictToVerticalAxis,
				]}
			>
				<SortableContext
					items={widgets.map((w) => `${w.type}-${w.id}`)} // unique string ids
					strategy={
						horizontal
							? horizontalListSortingStrategy
							: verticalListSortingStrategy
					}
				>
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
									addWidget(WidgetComponents[val], val);
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

						{widgets.map(({ id, num, component: Widget }) => (
							<SortableWidget key={id} id={id}>
								<Widget id={id} num={num} onClose={closeWidget} />
							</SortableWidget>
						))}

						{widgets.length === 0 && (
							<p style={{ color: "#808080" }}>Widgets</p>
						)}
					</div>
				</SortableContext>
			</DndContext>
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
	restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
	closestCenter,
	DndContext,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";

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
			{children}
		</div>
	);
};

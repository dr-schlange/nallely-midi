import { forwardRef, useImperativeHandle, useState } from "react";
import { Scope } from "./Oscilloscope";

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
};

const findFirstMissingValue = (arr: number[]): number => {
	if (arr.length === 0) return 0;

	const min = Math.min(...arr);
	const max = Math.max(...arr);
	const set = new Set(arr);

	for (let i = min; i <= max; i++) {
		if (!set.has(i)) {
			return i;
		}
	}

	return max + 1;
};

export const RackRowWidgets = forwardRef<RackRowWidgetRef, WidgetRackProps>(
	({ onRackScroll, horizontal }: WidgetRackProps, ref) => {
		const [widgets, setWidgets] = useState<
			{ id: number; component: React.FC<any> }[]
		>([]);

		const sensors = useSensors(
			useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
		);

		const addWidget = (Component) => {
			setWidgets([
				...widgets,
				{
					id: findFirstMissingValue(widgets.map((w) => w.id)),
					component: Component,
				},
			]);
		};

		useImperativeHandle(ref, () => ({
			resetAll() {
				setWidgets([]);
			},
		}));

		const handleDragEnd = (event) => {
			const { active, over } = event;
			if (!over || active.id === over.id) return;

			const oldIndex = widgets.findIndex((w) => w.id === active.id);
			const newIndex = widgets.findIndex((w) => w.id === over.id);
			setWidgets(arrayMove(widgets, oldIndex, newIndex));
		};

		const closeWidget = (id: number) => {
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
					items={widgets.map((w) => w.id)}
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
								addWidget(WidgetComponents[val]);
							}}
						>
							<option value={""}>--</option>
							{Object.keys(WidgetComponents).map((name) => (
								<option key={name} value={name}>
									{name}
								</option>
							))}
						</select>

						{widgets.map(({ id, component: Widget }) => (
							<SortableWidget key={id} id={id}>
								<Widget id={id} onClose={closeWidget} />
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
	id: number;
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

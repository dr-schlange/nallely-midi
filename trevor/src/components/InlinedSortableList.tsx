// LLM generated
import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	restrictToHorizontalAxis,
	restrictToParentElement,
	restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
	horizontalListSortingStrategy,
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";

export type DragHandleProps = React.HTMLAttributes<HTMLElement>;

// ids are prefixed so they never clash with the ids of the other sortable list of the rack
const sortableId = (id: string | number) => `inlined-${id}`;

const SortableItem = ({
	id,
	horizontal,
	children,
}: {
	id: string;
	horizontal: boolean;
	children: (handleProps: DragHandleProps) => ReactNode;
}) => {
	const { attributes, listeners, setNodeRef, transform, transition } =
		useSortable({ id });
	return (
		<div
			ref={setNodeRef}
			style={{
				transform: CSS.Translate.toString(transform),
				transition,
				width: horizontal ? undefined : "100%",
				height: horizontal ? "100%" : undefined,
			}}
		>
			{children({ ...attributes, ...listeners })}
		</div>
	);
};

export const DragHandle = (props: DragHandleProps) => (
	<span
		{...props}
		data-drag-handle
		data-link-wall
		onClick={(e) => e.stopPropagation()}
		style={{
			cursor: "grab",
			touchAction: "none",
			userSelect: "none",
			WebkitTouchCallout: "none",
			// finger-sized hit area; the negative margins keep the title size unchanged
			display: "inline-block",
			paddingBlock: "8px",
			paddingInline: "12px",
			marginBlock: "-8px",
			marginInline: "-8px 6px",
		}}
	>
		=
	</span>
);

export function InlinedSortableList<T>({
	items,
	getId,
	orientation,
	onReorder,
	renderItem,
}: {
	items: T[];
	getId: (item: T) => string | number;
	orientation?: "horizontal" | "vertical";
	// called with the ids given by getId; overId is null when dropped nowhere
	onReorder: (
		activeId: string | number,
		overId: string | number | null,
	) => void;
	renderItem: (
		item: T,
		handleProps: DragHandleProps,
		index: number,
	) => ReactNode;
}) {
	const horizontal = orientation === "horizontal";
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
	);
	const originalId = (id: string | number | undefined) => {
		const item = items.find((i) => sortableId(getId(i)) === id);
		return item === undefined ? null : getId(item);
	};

	const handleDragEnd = ({ active, over }: DragEndEvent) => {
		const activeId = originalId(active.id);
		if (activeId !== null) onReorder(activeId, originalId(over?.id));
	};

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			onDragEnd={handleDragEnd}
			modifiers={[
				horizontal ? restrictToHorizontalAxis : restrictToVerticalAxis,
				restrictToParentElement,
			]}
		>
			<SortableContext
				items={items.map((i) => sortableId(getId(i)))}
				strategy={
					horizontal
						? horizontalListSortingStrategy
						: verticalListSortingStrategy
				}
			>
				{items.map((item, index) => (
					<SortableItem
						key={sortableId(getId(item))}
						id={sortableId(getId(item))}
						horizontal={horizontal}
					>
						{(handleProps) => renderItem(item, handleProps, index)}
					</SortableItem>
				))}
			</SortableContext>
		</DndContext>
	);
}

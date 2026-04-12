/** biome-ignore-all lint/a11y/noStaticElementInteractions: <explanation> */
/** biome-ignore-all lint/a11y/useKeyWithClickEvents: <explanation> */
import {
	forwardRef,
	type ReactElement,
	useImperativeHandle,
	useMemo,
	useState,
} from "react";
import { WindowWidget } from "./widgets/BaseWindowWidget";
import { Scope } from "./widgets/Oscilloscope";
import { Pads } from "./widgets/PadsWidget";
import { Sliders } from "./widgets/SlidersWidget";
import { XYPad } from "./widgets/XYPadWidget";
import { XYScope } from "./widgets/XYScope";
import { XYZScope } from "./widgets/XYZScope";

interface WidgetRackProps {
	onRackScroll?: () => void;
	onDragEnd?: () => void;
	orientation?: "vertical" | "horizontal";
	onAddWidget?: (id: string, component: ReactElement) => void;
	onNonSectionClick: () => void;
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
	Sliders,
	Pads,
	XYPad,
	Keyboard,
	GBEmu: (props) => (
		<WindowWidget
			url={`http://${window.location.hostname}:3000/gb.html`}
			expandable
			{...props}
		/>
	),
	GPControl,
	GPS: (props) => (
		<WindowWidget
			url={`http://${window.location.hostname}:3000/gps.html`}
			allow="geolocation"
			expandable
			{...props}
		/>
	),
	MicAnalyzer: (props) => (
		<WindowWidget
			url={`http://${window.location.hostname}:3000/audio-analysis.html`}
			allow="microphone"
			{...props}
		/>
	),
	ViewMatrix,
	Webcam: (props) => (
		<WindowWidget
			url={`http://${window.location.hostname}:3000/webcam.html`}
			allow="camera"
			expandable
			{...props}
		/>
	),
	Window: (props) => (
		<WindowWidget
			urlBar
			expandable
			{...props}
			allow="camera; microphone; geolocation"
		/>
	),
	// SSynth: (props) => (
	// 	<WindowWidget
	// 		url={`http://${window.location.hostname}:3000/synth.html`}
	//		expandable
	// 		{...props}
	// 	/>
	// ),
};

export const RackRowWidgets = forwardRef<RackRowWidgetRef, WidgetRackProps>(
	(
		{
			onRackScroll,
			onDragEnd,
			orientation,
			onAddWidget,
			onNonSectionClick,
		}: WidgetRackProps,
		ref,
	) => {
		const [widgets, setWidgets] = useState<
			{ num: number; id: string; type: string; component: React.FC<any> }[]
		>([]);
		const [typeIds, setTypeIds] = useState<Record<string, number>>({});
		const waitingServices = useTrevorSelector(
			(state) => state.nallely.waiting_services,
		);
		const proxyWidgetCandidates = useMemo(() => {
			const components = Object.keys(WidgetComponents);

			const uniqueServices = new Map();
			waitingServices
				.map(({ key }) => key)
				.forEach((service) => {
					for (const candidate of components) {
						const cName = candidate.toLocaleLowerCase();
						const regex = new RegExp(`^(${cName})([0-9]+)$`);
						const serviceId = service.replace(regex, "$1::$2");
						if (service.match(regex) && !uniqueServices.has(serviceId)) {
							uniqueServices.set(serviceId, [candidate, serviceId]);
						}
					}
				});
			return [...uniqueServices.values()];
		}, [waitingServices]);
		const [displayWaitingServices, setDisplayWaitingServices] = useState(false);

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

		const loadWidget = (componentKey: string, widgetId: string) => {
			setWidgets((oldWidgets) => {
				const [widgetType, idNum] = widgetId.split("::");
				const Component = WidgetComponents[componentKey];
				setTimeout(() => {
					onAddWidget?.(widgetId, Component);
				}, 10);
				return [
					...oldWidgets,
					{
						id: widgetId,
						num: Number.parseInt(idNum, 10),
						type: widgetType,
						component: Component,
					},
				];
			});
		};

		useImperativeHandle(ref, () => ({
			resetAll() {
				setWidgets([]);
				setWidgets([]);
				setTypeIds({});
				setDisplayWaitingServices(false);
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
				className={`rack-row ${orientation}`}
				onScroll={() => onRackScroll?.()}
				onClick={() => {
					onNonSectionClick();
				}}
			>
				<div className="rack-top-bar">
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
					<Button
						text={`Waiting ${proxyWidgetCandidates.length === 0 ? "" : `[${proxyWidgetCandidates.length}]`}`}
						tooltip="Show waiting services"
						disabled={proxyWidgetCandidates.length === 0}
						activated={
							displayWaitingServices && proxyWidgetCandidates.length > 0
						}
						variant="small"
						style={{
							color: "var(--black)",
						}}
						onClick={() => setDisplayWaitingServices((prev) => !prev)}
					/>
				</div>
				<div className={"inner-rack-row"} onScroll={() => onRackScroll?.()}>
					<DndContext
						sensors={sensors}
						collisionDetection={closestCenter}
						onDragEnd={handleDragEnd}
						onDragMove={onRackScroll}
						modifiers={[
							orientation === "horizontal"
								? restrictToHorizontalAxis
								: restrictToVerticalAxis,
							restrictToParentElement,
						]}
					>
						<SortableContext
							items={widgets.map((w) => w.id)}
							strategy={
								orientation === "horizontal"
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
							{proxyWidgetCandidates.map(([component, service]) => (
								<PlaceholderWidget
									key={service}
									id={service}
									onClose={closeWidget}
									onClickLoad={loadWidget}
									componentKey={component}
									removeCloseButton
									visible={displayWaitingServices}
								>
									<p>Placeholder for {service.replace("::", "")}</p>
								</PlaceholderWidget>
							))}
							{widgets.length === 0 && proxyWidgetCandidates.length === 0 && (
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
	closestCenter,
	DndContext,
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
	arrayMove,
	horizontalListSortingStrategy,
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTrevorSelector } from "../store";
import { findFirstMissingValue } from "../utils/utils";
import { Button, PlaceholderWidget } from "./widgets/BaseComponents";
import { GPControl } from "./widgets/GPControlWidget";
import { Keyboard } from "./widgets/KeyboardWidget";
import { ViewMatrix } from "./widgets/ViewMatrix";

const SortableWidget = ({
	id,
	children,
	hidden = false,
}: {
	id: string;
	children: React.ReactNode;
	hidden?: boolean;
}) => {
	const { attributes, listeners, setNodeRef, transform, transition } =
		useSortable({ id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		position: "relative",
		display: hidden ? "none" : "block",
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

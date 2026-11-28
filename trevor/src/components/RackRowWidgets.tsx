/** biome-ignore-all lint/a11y/noStaticElementInteractions: <explanation> */
/** biome-ignore-all lint/a11y/useKeyWithClickEvents: <explanation> */
import {
	forwardRef,
	type ReactElement,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import { useCounterZoom } from "../hooks/RackScaleContext";
import { useScope } from "../hooks/ScopeContext";
import { FloatingWidgetLinks } from "./FloatingWidgetLinks";
import { WindowWidget } from "./widgets/BaseWindowWidget";
import { BipolarKnobs, UnipolarKnobs } from "./widgets/KnobsWidget";
import { MultiChanScope } from "./widgets/MultiChanScope";
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
	MultiChanScope,
	XYScope,
	XYZScope,
	Sliders,
	Pads,
	UnipolarKnobs,
	BipolarKnobs,
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
			{
				num: number;
				id: string;
				type: string;
				component: React.FC<any>;
				props?: Record<string, unknown>;
			}[]
		>([]);
		const [typeIds, setTypeIds] = useState<Record<string, number>>({});
		const counterZoom = useCounterZoom();
		const [floating, setFloating] = useState(false);
		const [positions, setPositions] = useState<
			Record<string, { x: number; y: number }>
		>({});
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

		const sensors = useSensors(
			useSensor(CustomPointerSensor, {
				activationConstraint: {
					distance: 8,
				},
			}),
		);

		const addWidget = (
			Component,
			widgetType: string,
			props?: Record<string, unknown>,
		) => {
			const idsUsed = widgets
				.filter((w) => w.type === widgetType)
				.map((w) => w.num);
			const nextId = findFirstMissingValue(idsUsed);
			const widgetId = `${widgetType}::${nextId}`;
			setWidgets((oldWidgets) => [
				...oldWidgets,
				{
					id: widgetId,
					num: nextId,
					type: widgetType,
					component: Component,
					props,
				},
			]);
			setTimeout(() => {
				onAddWidget?.(widgetId, Component);
			}, 10);
			return widgetId;
		};

		const scope = useScope();
		const lastSpawn = useRef(0);
		// biome-ignore lint/correctness/useExhaustiveDependencies: only a new spawns
		useEffect(() => {
			const spawn = scope?.manager.spawn;
			if (!spawn || spawn.token === lastSpawn.current) return;
			lastSpawn.current = spawn.token;
			const widgetId = addWidget(MultiChanScope, "multichanscope", {
				numChannels: spawn.channels,
			});
			scope?.manager.registerSpawned(widgetId.replace("::", ""));
		}, [scope?.manager.spawn]);

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
				<div
					className="rack-top-bar"
					style={{ flexDirection: "row-reverse", ...counterZoom }}
				>
					<Button
						text="Float"
						tooltip="Floats the widgets over the page instead of keeping them in this rack"
						activated={floating}
						onClick={() => {
							setFloating((prev) => !prev);
							setTimeout(() => onDragEnd?.(), 10);
						}}
					/>
					<DropdownButton
						text={`Waiting ${proxyWidgetCandidates.length === 0 ? "" : `[${proxyWidgetCandidates.length}]`}`}
						tooltip="Load a widget for a service that waits for it"
						disabled={proxyWidgetCandidates.length === 0}
						placement={orientation === "horizontal" ? "right" : "below"}
						options={proxyWidgetCandidates.map(([, service]) => ({
							key: service,
							label: service.replace("::", ""),
						}))}
						onSelect={(service) => {
							const candidate = proxyWidgetCandidates.find(
								([, candidateService]) => candidateService === service,
							);
							if (candidate) loadWidget(candidate[0], service);
						}}
					/>
					<DropdownButton
						text="+"
						tooltip="Adds a new widget to the system"
						placement={orientation === "horizontal" ? "right" : "below"}
						options={Object.keys(WidgetComponents).map((name) => ({
							key: name,
							label: name,
						}))}
						onSelect={(name) =>
							addWidget(WidgetComponents[name], name.toLocaleLowerCase())
						}
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
							items={floating ? [] : widgets.map((w) => w.id)}
							strategy={
								orientation === "horizontal"
									? horizontalListSortingStrategy
									: verticalListSortingStrategy
							}
						>
							{!floating &&
								widgets.map(({ id, num, component: Widget, props }) => (
									<SortableWidget key={id} id={id}>
										<Widget
											id={id.replace("::", "")}
											num={num}
											onClose={closeWidget}
											{...props}
										/>
									</SortableWidget>
								))}
							{widgets.length === 0 && <p style={{ color: "gray" }}>Widgets</p>}
						</SortableContext>
					</DndContext>
					{floating && (
						<FloatingWidgetLinks
							widgetIds={widgets.map((w) => w.id.replace("::", ""))}
						/>
					)}
					{floating &&
						widgets.map(({ id, num, component: Widget, props }, index) => (
							<FloatingWindow
								key={id}
								id={id.replace("::", "")}
								position={
									positions[id] ?? { x: 24 + 28 * index, y: 90 + 28 * index }
								}
								onMove={(position) => {
									setPositions((prev) => ({ ...prev, [id]: position }));
									onRackScroll?.();
								}}
							>
								<Widget
									id={id.replace("::", "")}
									num={num}
									onClose={closeWidget}
									{...props}
								/>
							</FloatingWindow>
						))}
				</div>
			</div>
		);
	},
);

// for sortable components
import {
	closestCenter,
	DndContext,
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
import { CustomPointerSensor } from "./RackRowVirtual";
import {
	Button,
	DropdownButton,
	FloatingWindow,
} from "./widgets/BaseComponents";
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

/** biome-ignore-all lint/a11y/useKeyWithClickEvents: <explanation> */
/** biome-ignore-all lint/a11y/noStaticElementInteractions: <explanation> */
import React, {
	lazy,
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type {
	MidiDevice,
	MidiDeviceSection,
	MidiParameter,
	VirtualDevice,
	VirtualParameter,
} from "../model";
import {
	buildParameterId,
	clamp,
	devUID,
	generateAcronym,
	isClassCodeMode,
	useLongPress,
} from "../utils/utils";

export const SMALL_PORTS_LIMIT = 6;
export const PORTS_LIMIT = 12;

export const SMALLSIZE = SMALL_PORTS_LIMIT;
export const MEDIUMSIZE = PORTS_LIMIT + SMALL_PORTS_LIMIT;
export const LARGESIZE = PORTS_LIMIT * 2 + SMALL_PORTS_LIMIT;
export const FULLSIZE = PORTS_LIMIT * 3 + SMALL_PORTS_LIMIT;

export const moduleWeight = (device: VirtualDevice): [string, number] => {
	const nbParams = device.meta.parameters.length;
	if (nbParams <= SMALLSIZE) {
		return ["small", 1];
	}
	if (nbParams <= MEDIUMSIZE) {
		return ["medium", 2];
	}
	if (nbParams <= LARGESIZE) {
		return ["large", 3];
	}
	return ["full", 4];
};

export const moduleWeights = (devices: VirtualDevice[]) => {
	const weights = {
		small: [], // 1
		medium: [], // 2
		large: [], // 3
		full: [], // 4
	};
	for (const device of devices) {
		const [weight] = moduleWeight(device);
		weights[weight].push(device);
	}
	return weights;
};

export const totalWeightModules = (devices: VirtualDevice[]) => {
	const weights = moduleWeights(devices);
	return (
		weights.small.length +
		weights.medium.length * 2 +
		weights.large.length * 3 +
		weights.full.length * 4
	);
};

export const weightList = (devices: VirtualDevice[]) => {
	return devices.map((d) => moduleWeight(d)[1]);
};

const chunkArray = (arr, size) =>
	arr.reduce(
		(acc, _, i) => (i % size ? acc : [...acc, arr.slice(i, i + size)]),
		[],
	);

interface MiniRackProps {
	devices: VirtualDevice[];
	rackId: string;
	selectedSections: string[];
	onDeviceClick?: (device: VirtualDevice) => void;
	onPlaceholderClick?: () => void;
	onDrag?: (device: VirtualDevice) => void;
}

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTrevorDispatch, useTrevorSelector } from "../store";
import { setClassCodeMode } from "../store/runtimeSlice";
import { useTrevorWebSocket } from "../websockets/websocket";
// import { ClassBrowser } from "./modals/ClassBrowser";
import { Portal } from "./Portal";

const ClassBrowser = lazy(() =>
	import("./modals/ClassBrowser").then((module) => ({
		default: module.ClassBrowser,
	})),
);

export const MiniRack = ({
	devices,
	rackId,
	onPlaceholderClick,
	onDeviceClick,
	selectedSections,
	onDrag,
}: MiniRackProps) => {
	const totalRackSlots = 6;

	const nbPlaceHolders = useMemo(
		() => totalRackSlots - totalWeightModules(devices),
		[devices],
	);
	const slots = [
		...devices.map((device) => (
			<SortableVDevice
				key={devUID(device)}
				device={device}
				onClick={onDeviceClick}
				selectedSections={selectedSections}
				onDrag={onDrag}
			/>
		)),
		nbPlaceHolders > 0 && (
			<VDevicePlaceholder
				key={`placeholder-${rackId}`}
				slots={nbPlaceHolders}
				onClick={onPlaceholderClick}
			/>
		),
	];

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				justifyContent: "flex-end",
				gap: "1px",
				borderTop: "5px solid grey",
				borderBottom: "5px solid grey",
				padding: "2px",
				backgroundColor: "#d0d0d0",
				width: "194px",
			}}
		>
			<div
				style={{
					display: "flex",
					gap: "1px",
					justifyContent: "space-around",
				}}
			>
				{slots}
			</div>
		</div>
	);
};

const Port = React.memo(
	({
		deviceId,
		parameter,
		isProxy = false,
		reverse = false,
		noId = false,
	}: {
		deviceId: number;
		parameter: VirtualParameter | MidiParameter;
		isProxy?: boolean;
		reverse?: boolean;
		noId?: boolean;
	}) => {
		const paramName = isProxy
			? parameter.name.slice(parameter.name.indexOf("_") + 1)
			: parameter.name;
		return (
			<div
				style={{
					display: "flex",
					flexDirection: reverse ? "row-reverse" : "row",
					alignItems: "center",
					justifyContent: "flex-end",
					gap: "2px",
				}}
			>
				<p
					style={{
						fontSize: "8px",
						margin: 0,
						color: "gray",
					}}
					title={paramName}
				>
					{generateAcronym(paramName, 4)}
				</p>
				<div
					style={{
						width: "4px",
						height: "4px",
						backgroundColor: "orange",
						borderRadius: "50%",
					}}
					id={noId ? undefined : buildParameterId(deviceId, parameter)}
				/>
			</div>
		);
	},
);

const generateNameWithAcronym = (
	name: string,
	maxLength: number = 10,
): string => {
	if (name.length <= maxLength) {
		return name;
	}

	const match = name.match(/(\D*)(\d+)$/);
	if (!match) return name.slice(0, maxLength);

	const letters = match[1];
	const number = match[2];

	const remainingLength = maxLength - number.length;

	let acronym = letters;
	if (letters.length > remainingLength) {
		acronym = generateAcronym(letters, remainingLength, true);
	}

	return acronym + number;
};

const HIDE = new Set<string>(["set_pause"]);
const MAX_ROWS = 2;

interface DeviceCardProps {
	deviceId: number;
	deviceName: string;
	parameters: (VirtualParameter | MidiParameter)[];
	selected?: boolean;
	borderColor: string;
	borderStyle: "solid" | "dashed";
	backgroundColor: string;
	isProxy?: boolean;
	noPortIds?: boolean;
	unhide?: Set<string>;
	onClick?: (e: React.MouseEvent | React.TouchEvent) => void;
	longPressEvents?: object;
	children?: React.ReactNode;
}

export const DeviceCard = React.memo(
	({
		deviceId,
		deviceName,
		parameters,
		borderColor,
		borderStyle,
		backgroundColor,
		isProxy = false,
		noPortIds = false,
		unhide,
		onClick,
		longPressEvents = {},
		children,
	}: DeviceCardProps) => {
		const leftLabelLimit = 8;
		const clipping = deviceName.length >= leftLabelLimit;

		const filtered = useMemo(
			() => parameters.filter((e) => !HIDE.has(e.name) || unhide?.has(e.name)),
			[parameters, unhide],
		);

		const nbParameters = clamp(filtered.length, 0, FULLSIZE);
		const width =
			nbParameters <= SMALL_PORTS_LIMIT ? 25 : nbParameters > 19 ? 81 : 58;

		const params = useMemo(
			() => ({
				head: filtered.slice(0, SMALL_PORTS_LIMIT),
				rest: chunkArray(filtered.slice(SMALL_PORTS_LIMIT), PORTS_LIMIT),
			}),
			[filtered],
		);

		return (
			<div
				id={`${deviceId}`}
				style={{
					paddingTop: "1px",
					border: `3px ${borderStyle} ${borderColor}`,
					height: "120px",
					width: `${width}px`,
					minWidth: `${width}px`,
					display: "flex",
					flexWrap: "wrap",
					flexDirection: "row",
					gap: "0px",
					justifyContent: "space-evenly",
					backgroundColor,
					userSelect: "none",
				}}
				onClick={onClick}
				{...longPressEvents}
			>
				<div
					style={{
						display: "inherit",
						flexDirection: "column",
						alignItems: "center",
						justifyContent: "space-between",
						height: "117px",
						width: "25px",
						padding: "1px",
						gap: "2px",
					}}
				>
					<div
						style={{
							maxHeight: "100px",
							display: "flex",
							flexDirection: "column",
							justifyContent: clipping ? "flex-end" : "flex-start",
							overflow: "hidden",
						}}
					>
						<p
							style={{
								margin: 0,
								whiteSpace: "nowrap",
								fontSize: "14px",
								color: "var(--black)",
								writingMode: "vertical-rl",
								textOrientation: "sideways",
								transform: "rotate(180deg)",
							}}
						>
							{generateNameWithAcronym(deviceName, leftLabelLimit)}
						</p>
					</div>
					<div
						style={{
							height: "59px",
							width: "22px",
							margin: "1px",
							display: "inherit",
							flexDirection: "column-reverse",
							justifyContent: "flex-start",
							gap: "2px",
							overflow: "hidden",
						}}
					>
						{params.head.map((p) => (
							<Port
								deviceId={deviceId}
								key={p.name}
								parameter={p}
								isProxy={isProxy}
								noId={noPortIds}
								reverse
							/>
						))}
					</div>
				</div>
				{params.rest.slice(0, MAX_ROWS).map((row, i) => (
					<div
						key={`${deviceId}-${i}`}
						style={{
							height: "117px",
							width: "25px",
							padding: "1px",
							gap: "2px",
							display: "inherit",
							flexDirection: "column-reverse",
							justifyContent: "flex-start",
						}}
					>
						{row.map((p) => (
							<Port
								deviceId={deviceId}
								key={p.name}
								parameter={p}
								isProxy={isProxy}
								noId={noPortIds}
							/>
						))}
					</div>
				))}
				{children}
			</div>
		);
	},
);

interface VDeviceProps {
	device: VirtualDevice;
	onClick?: (device: VirtualDevice) => void;
	onDoubleClick?: (device: VirtualDevice) => void;
	onLongPress?: (device: VirtualDevice) => void;
	onTouchStart?: (device: VirtualDevice) => void;
	selected?: boolean;
	debounceClick?: boolean;
	noPortIds?: boolean;
}

export const VDevice = React.memo(
	({
		device,
		onClick,
		onDoubleClick,
		selected,
		onLongPress,
		onTouchStart,
		debounceClick = true,
		noPortIds = false,
	}: VDeviceProps) => {
		const lastTap = useRef<number | null>(null);
		const trevorSocket = useTrevorWebSocket();
		const dispatch = useTrevorDispatch();
		const [isCodeOpen, setIsCodeOpen] = useState(false);
		const exposedDevices = useTrevorSelector(
			(state) => state.nallely.exposed_services,
		);
		const exposed = Object.keys(exposedDevices).includes(device.id.toString());
		const connections = useTrevorSelector((state) => state.nallely.connections);
		const unhide = useMemo(() => {
			const set = new Set<string>();
			for (const c of connections) {
				if (c.src.device === device.id && HIDE.has(c.src.parameter.name))
					set.add(c.src.parameter.name);
				if (c.dest.device === device.id && HIDE.has(c.dest.parameter.name))
					set.add(c.dest.parameter.name);
			}
			return set.size > 0 ? set : undefined;
		}, [connections, device.id]);

		const longPressEvents = useLongPress(
			() => onLongPress?.(device),
			500,
			() => onTouchStart?.(device),
		);

		const handleDoubleClick = useCallback(
			(dev) => {
				if (onDoubleClick) {
					onDoubleClick(dev);
					return;
				}
				trevorSocket.toggle_device(dev, !dev.running);
			},
			[onDoubleClick, trevorSocket],
		);

		const handleClick = useCallback(
			(event: React.MouseEvent | React.TouchEvent) => {
				event.preventDefault();
				event.stopPropagation();
				if (longPressEvents.didlongpress.current) return;
				if (!debounceClick) {
					onClick?.(device);
					return;
				}
				const now = Date.now();
				const DOUBLE_CLICK_DELAY = 200;
				if (lastTap.current && now - lastTap.current < DOUBLE_CLICK_DELAY) {
					handleDoubleClick(device);
					lastTap.current = null;
				} else {
					lastTap.current = now;
					setTimeout(() => {
						if (
							lastTap.current &&
							Date.now() - lastTap.current >= DOUBLE_CLICK_DELAY
						) {
							if (isClassCodeMode()) {
								setIsCodeOpen(true);
								dispatch(setClassCodeMode(false));
								return;
							}
							onClick?.(device);
							lastTap.current = null;
						}
					}, DOUBLE_CLICK_DELAY);
				}
			},
			[
				onClick,
				handleDoubleClick,
				device,
				dispatch,
				longPressEvents,
				debounceClick,
			],
		);

		const borderColor = selected
			? "gold"
			: exposed
				? "rgba(187, 153, 90, 0.8)"
				: "gray";

		return (
			<DeviceCard
				deviceId={device.id}
				deviceName={device.repr}
				parameters={device.meta.parameters}
				selected={selected}
				borderColor={borderColor}
				borderStyle={device.paused ? "dashed" : "solid"}
				backgroundColor={device.proxy ? "rgba(187, 153, 90, 0.01)" : "#e0e0e0"}
				isProxy={device.proxy}
				noPortIds={noPortIds}
				unhide={unhide}
				onClick={handleClick}
				longPressEvents={longPressEvents}
			>
				{isCodeOpen && (
					<Portal>
						<Suspense fallback={null}>
							<ClassBrowser
								device={device}
								onClose={() => setIsCodeOpen(false)}
							/>
						</Suspense>
					</Portal>
				)}
			</DeviceCard>
		);
	},
);

interface MidiSectionDeviceProps {
	device: MidiDevice;
	section: MidiDeviceSection;
	selected?: boolean;
	onClick?: (device: MidiDevice, section: MidiDeviceSection) => void;
	onDoubleClick?: (device: MidiDevice, section: MidiDeviceSection) => void;
	onLongPress?: (device: MidiDevice, section: MidiDeviceSection) => void;
	onTouchStart?: (device: MidiDevice, section: MidiDeviceSection) => void;
	debounceClick?: boolean;
	noPortIds?: boolean;
}

export const MidiSectionDevice = React.memo(
	({
		device,
		section,
		selected,
		onClick,
		onDoubleClick,
		onLongPress,
		onTouchStart,
		debounceClick = true,
		noPortIds = false,
	}: MidiSectionDeviceProps) => {
		const lastTap = useRef<number | null>(null);

		const longPressEvents = useLongPress(
			() => onLongPress?.(device, section),
			500,
			() => onTouchStart?.(device, section),
		);

		const handleClick = useCallback(
			(event: React.MouseEvent | React.TouchEvent) => {
				event.preventDefault();
				event.stopPropagation();
				if (longPressEvents.didlongpress.current) return;
				if (!debounceClick) {
					onClick?.(device, section);
					return;
				}
				const now = Date.now();
				const DOUBLE_CLICK_DELAY = 200;
				if (lastTap.current && now - lastTap.current < DOUBLE_CLICK_DELAY) {
					onDoubleClick?.(device, section);
					lastTap.current = null;
				} else {
					lastTap.current = now;
					setTimeout(() => {
						if (
							lastTap.current &&
							Date.now() - lastTap.current >= DOUBLE_CLICK_DELAY
						) {
							onClick?.(device, section);
							lastTap.current = null;
						}
					}, DOUBLE_CLICK_DELAY);
				}
			},
			[onClick, onDoubleClick, device, section, longPressEvents, debounceClick],
		);

		return (
			<DeviceCard
				deviceId={device.id}
				deviceName={section.name.replace(/Section$/, "")}
				parameters={section.parameters}
				selected={selected}
				borderColor={selected ? "gold" : "gray"}
				borderStyle="solid"
				backgroundColor="#e0e0e0"
				isProxy={false}
				noPortIds={noPortIds}
				onClick={handleClick}
				longPressEvents={longPressEvents}
			/>
		);
	},
);

interface VDevicePlaceholderProps {
	slots: number;
	onClick?: () => void;
	onLongPress?: () => void;
	onTouchStart?: () => void;
}

export const VDevicePlaceholder = React.memo(
	({ slots, onClick }: VDevicePlaceholderProps) => {
		const height = "120px";
		const width = slots === SMALLSIZE ? 176 : slots * 26.5;
		const [pressed, setPressed] = useState(false);
		const [touchStart, setTouchStart] = useState<{
			x: number;
			y: number;
		} | null>(null);
		const touchThreshold = 10;

		return (
			<div
				data-no-dnd
				style={{
					paddingTop: "1px",
					border: `3px dashed ${pressed ? "orange" : "#aaaaaa"}`,
					height,
					width,
					minWidth: width,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					transform: pressed ? "scale(0.97)" : "scale(1)",
					backgroundColor: pressed ? "rgba(255,165,0,0.1)" : "transparent",
					cursor: "pointer",
					userSelect: "none",
					touchAction: "auto",
				}}
				onTouchStart={(e) => {
					e.stopPropagation();
					const touch = e.touches[0];
					setTouchStart({ x: touch.clientX, y: touch.clientY });
					setPressed(true);
				}}
				onTouchMove={(e) => {
					if (!touchStart) return;
					const touch = e.touches[0];
					if (
						Math.abs(touch.clientX - touchStart.x) > touchThreshold ||
						Math.abs(touch.clientY - touchStart.y) > touchThreshold
					) {
						setPressed(false);
						setTouchStart(null);
					}
				}}
				onTouchEnd={(e) => {
					if (!pressed) return;
					e.stopPropagation();
					setPressed(false);
					setTouchStart(null);
					onClick?.();
				}}
				onClick={(e) => {
					e.stopPropagation();
					onClick?.();
				}}
			>
				<p style={{ fontSize: 27, color: pressed ? "orange" : "#aaaaaa" }}>+</p>
			</div>
		);
	},
);

interface SortableVDeviceProps {
	device: VirtualDevice;
	onClick?: (device: VirtualDevice) => void;
	selectedSections: string[];
	onDrag?: (device: VirtualDevice) => void;
}
const SortableVDevice = React.memo(
	({ device, onClick, selectedSections, onDrag }: SortableVDeviceProps) => {
		const {
			attributes,
			listeners,
			setNodeRef,
			transform,
			transition,
			isDragging,
		} = useSortable({
			id: devUID(device),
		});

		useEffect(() => {
			const handleTouchMove = (e: TouchEvent) => {
				if (isDragging) {
					e.preventDefault();
					onDrag?.(device);
				}
			};
			const end = (e) => {
				onDrag?.(device);
			};

			document.addEventListener("touchmove", handleTouchMove, {
				passive: false,
			});
			document.addEventListener("mousemove", handleTouchMove, {
				passive: false,
			});
			document.addEventListener("mouseup", end);
			document.addEventListener("touchup", end);

			return () => {
				document.removeEventListener("touchmove", handleTouchMove);
				document.removeEventListener("mousemove", handleTouchMove);
				document.removeEventListener("mouseup", end);
				document.removeEventListener("touchup", end);
			};
		}, [isDragging, device, onDrag]);

		const style: React.CSSProperties = {
			transform: isDragging
				? `${CSS.Transform.toString(transform)} scale(1.05)`
				: CSS.Transform.toString(transform),
			boxShadow: isDragging ? "5px 5px rgba(255,165,0,0.7)" : undefined,
			transition,
			touchAction: isDragging ? "pan-y" : "auto",
		};

		const handleDeviceClick = useCallback(
			(device) => {
				onClick?.(device);
			},
			[onClick],
		);

		const isSelected = selectedSections.some((s) =>
			s.startsWith(devUID(device)),
		);

		return (
			<div ref={setNodeRef} style={style} {...attributes} {...listeners}>
				<VDevice
					device={device}
					onClick={handleDeviceClick}
					selected={isSelected}
				/>
			</div>
		);
	},
);

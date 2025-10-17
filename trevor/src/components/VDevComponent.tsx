/** biome-ignore-all lint/a11y/useKeyWithClickEvents: <explanation> */
/** biome-ignore-all lint/a11y/noStaticElementInteractions: <explanation> */
import { useEffect, useState } from "react";
import type { VirtualDevice, VirtualParameter } from "../model";
import {
	buildSectionId,
	devUID,
	generateAcronym,
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

export const MiniRack = ({
	devices,
	rackId,
	onPlaceholderClick,
	onDeviceClick,
	selectedSections,
	onDrag,
}: MiniRackProps) => {
	const totalRackSlots = 6;

	const nbPlaceHolders = totalRackSlots - totalWeightModules(devices);
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

interface VDeviceProps {
	device: VirtualDevice;
	onClick?: (device: VirtualDevice) => void;
	onLongPress?: (device: VirtualDevice) => void;
	onTouchStart?: (device: VirtualDevice) => void;
	selected?: boolean;
}

const Port = ({
	device,
	parameter,
	reverse = false,
}: {
	device;
	parameter: VirtualParameter;
	reverse?: boolean;
}) => {
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
				title={parameter.name}
			>
				{generateAcronym(parameter.name, 4)}
			</p>
			<div
				style={{
					width: "6px",
					height: "6px",
					backgroundColor: "orange",
					borderRadius: "50%",
				}}
				id={buildSectionId(device.id, parameter.cv_name)}
			/>
		</div>
	);
};

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

const HIDE = [];
export const VDevice = ({
	device,
	onClick,
	selected,
	onLongPress,
	onTouchStart,
}: VDeviceProps) => {
	const height = "120px";
	let width = 58;
	const leftLabelLimit = 8;
	const clipping = device.repr.length >= leftLabelLimit;
	const parameters = device.meta.parameters.filter(
		(e) => !HIDE.includes(e.name),
	);
	const nbParameters = parameters.length;

	if (nbParameters <= SMALL_PORTS_LIMIT) {
		width = 25;
	} else if (nbParameters > 19) {
		width = 81;
	}

	const longPressEvents = useLongPress(
		() => {
			onLongPress?.(device);
		},
		500,
		() => onTouchStart?.(device),
	);

	const params = {
		head: parameters.slice(0, SMALL_PORTS_LIMIT),
		rest: chunkArray(parameters.slice(SMALL_PORTS_LIMIT), PORTS_LIMIT),
	};

	return (
		<div
			style={{
				paddingTop: "1px",
				border: `3px solid ${selected ? "yellow" : "gray"}`,
				height: height,
				width: `${width}px`,
				minWidth: `${width}px`,
				display: "flex",
				flexWrap: "wrap",
				flexDirection: "row",
				gap: "0px",
				justifyContent: "space-evenly",
				backgroundColor: "#e0e0e0",
				userSelect: "none",
			}}
			onClick={(event) => {
				event.preventDefault();
				event.stopPropagation();

				if (!longPressEvents.didLongPress.current) {
					onClick?.(device);
				}
			}}
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
							color: "black",
							writingMode: "vertical-rl",
							textOrientation: "sideways",
							transform: "rotate(180deg)",
						}}
					>
						{generateNameWithAcronym(device.repr, leftLabelLimit)}
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
					{/* {parameters.slice(rightPortLimit).map((p) => (
						<Port device={device} key={p.cv_name} parameter={p} reverse />
					))} */}
					{params.head.map((p) => (
						<Port device={device} key={p.cv_name} parameter={p} reverse />
					))}
				</div>
			</div>
			{params.rest.map((row, i) => (
				<div
					key={`${device.id}-${i}`}
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
						<Port device={device} key={p.cv_name} parameter={p} />
					))}
				</div>
			))}
		</div>
	);
};

interface VDevicePlaceholderProps {
	slots: number;
	onClick?: () => void;
	onLongPress?: () => void;
	onTouchStart?: () => void;
}

export const VDevicePlaceholder = ({
	slots,
	onClick,
}: VDevicePlaceholderProps) => {
	const height = "120px";
	const width = slots === SMALLSIZE ? 176 : slots * 26.5;
	const [pressed, setPressed] = useState(false);
	const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(
		null,
	);
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
};

const SortableVDevice = ({ device, onClick, selectedSections, onDrag }) => {
	const { attributes, listeners, setNodeRef, transform, isDragging } =
		useSortable({
			id: devUID(device),
		});

	useEffect(() => {
		const handleTouchMove = (e: TouchEvent) => {
			if (isDragging) {
				e.preventDefault();
				onDrag?.(device);
			}
		};

		document.addEventListener("touchmove", handleTouchMove, { passive: false });
		document.addEventListener("mousemove", handleTouchMove, { passive: false });

		return () => {
			document.removeEventListener("touchmove", handleTouchMove);
			document.removeEventListener("mousemove", handleTouchMove);
		};
	}, [isDragging, device, onDrag]);

	const style: React.CSSProperties = {
		transform: isDragging
			? `${CSS.Transform.toString(transform)} scale(1.05)`
			: CSS.Transform.toString(transform),
		boxShadow: isDragging ? "5px 5px rgba(255,165,0,0.7)" : undefined,
		transition: "transform 0.15s ease",
		touchAction: isDragging ? "pan-y" : "auto",
	};

	return (
		<div ref={setNodeRef} style={style} {...attributes} {...listeners}>
			<VDevice
				device={device}
				onClick={onClick}
				selected={selectedSections.some((s) => s.startsWith(devUID(device)))}
			/>
		</div>
	);
};

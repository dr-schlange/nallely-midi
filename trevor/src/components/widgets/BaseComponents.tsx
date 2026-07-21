/** biome-ignore-all lint/a11y/noStaticElementInteractions: <explanation> */
/** biome-ignore-all lint/a11y/noSvgWithoutTitle: <explanation> */
import { useEffect, useRef, useState } from "react";
import { generateAcronym, resolveAcceptedValueIndex } from "../../utils/utils";
import { MidiParameter, VirtualParameter } from "../../model";

export const Button = ({
	activated = false,
	onClick = undefined,
	text,
	tooltip = undefined,
	variant = "small",
	style = undefined,
	disabled = false,
	className = "",
}: {
	activated?: boolean;
	onClick?: (event) => void;
	text: string | React.ReactElement;
	tooltip: undefined | string;
	variant?: "big" | "small";
	style?: React.CSSProperties;
	disabled?: boolean;
	className?: string;
}) => {
	const [clickColor, setClickColor] = useState<string | undefined>(undefined);

	return (
		<div
			className={`${className} Button ${variant} ${activated ? "active" : ""} ${clickColor ? "clicked" : ""}`}
			style={{
				...(style ?? {}),
				...(className?.length > 0
					? {}
					: {
							color: disabled
								? (style?.color ?? "rgba(127, 127, 127, 0.4)")
								: (style?.color ?? "gray"),
						}),
			}}
			onMouseDown={(event) => {
				event.stopPropagation();
				event.preventDefault();
				if (disabled) {
					return;
				}
				setClickColor("orange");
			}}
			onMouseUp={(event) => {
				event.stopPropagation();
				event.preventDefault();
				if (disabled) {
					return;
				}
				setClickColor(undefined);
				onClick?.(event);
			}}
			title={tooltip}
		>
			<span>{text}</span>
		</div>
	);
};

export interface WidgetProps {
	id: string;
	num: number;
	style?: React.CSSProperties;
	onClose?: (id: string) => void;
}

export const HeaderButton = ({ onClick, text, ...props }) => {
	return (
		<button
			type="button"
			className="close-button"
			onClick={(event) => {
				event.stopPropagation();
				event.preventDefault();
				onClick?.();
			}}
			{...props}
		>
			{text}
		</button>
	);
};

interface TextInputProps {
	value: string;
	onChange: (value: string, event: React.ChangeEvent<HTMLInputElement>) => void;
	onEnter?: (
		value: string,
		event?: React.KeyboardEvent<HTMLInputElement>,
	) => void;
	placeholder?: string;
	style?: React.CSSProperties;
}

export const TextInput = ({
	value,
	onChange,
	onEnter,
	placeholder = "",
	style = {},
	...props
}: TextInputProps) => {
	return (
		<input
			style={{
				height: "10px",
				color: "gray",
				fontSize: "14px",
				textAlign: "right",
				boxShadow: "unset",
				pointerEvents: "auto",
				...style,
			}}
			placeholder={placeholder}
			onChange={(e) => {
				onChange?.(e.target.value, e);
			}}
			onBlur={(e) => {
				e.stopPropagation();
				e.preventDefault();
				onEnter?.(value);
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					e.stopPropagation();
					e.preventDefault();
					onEnter?.(value, e);
				}
			}}
			{...props}
		/>
	);
};

export const PlaceholderWidget = ({
	id,
	componentKey,
	onClose,
	children,
	onClickLoad,
	removeCloseButton = false,
	visible = true,
}: {
	componentKey: string;
	id: string;
	onClose?: (e: string) => void;
	children: React.ReactNode;
	removeCloseButton?: boolean;
	onClickLoad?: (service: string, componentKey: string) => void;
	visible: boolean;
}) => {
	return (
		<div className="scope" style={{ display: visible ? "block" : "none" }}>
			<div
				style={{
					position: "absolute",
					color: "gray",
					zIndex: 1,
					top: "1%",
					right: "1%",
					width: "90%",
					textAlign: "center",
					cursor: "pointer",
					display: "flex",
					justifyContent: "flex-end",
					flexDirection: "row",
					pointerEvents: "none",
					gap: "4px",
				}}
			>
				{!removeCloseButton && (
					<Button
						text="x"
						onClick={() => onClose?.(id)}
						tooltip="Close window"
					/>
				)}
			</div>
			<div
				style={{
					height: "100%",
					display: "flex",
					flexDirection: "column",
					justifyContent: "space-between",
					alignItems: "center",
				}}
			>
				{children}
				<Button
					text="Load"
					onClick={() => onClickLoad?.(componentKey, id)}
					tooltip="Load the widget"
					style={{
						width: "100%",
					}}
				/>
			</div>
		</div>
	);
};

export const AcceptedValuesKnob = ({
	value,
	param,
	onManualSliderChange,
	acronymeLimit = 5,
	labelPosition = "top",
	disabled = false,
}: {
	value: number | string | undefined;
	param: MidiParameter | VirtualParameter;
	acronymeLimit?: number;
	labelPosition?: "top" | "bottom";
	onManualSliderChange: (value: string) => void;
	disabled?: boolean;
}) => {
	const acceptedValues = param.accepted_values;
	const count = acceptedValues.length;
	const maxIndex = count - 1;

	const resolveIndex = (v: number | string | undefined): number =>
		resolveAcceptedValueIndex(v, acceptedValues, param.range[1]);

	const currentIndex = resolveIndex(value);

	const [localIndex, setLocalIndex] = useState<number | null>(null);
	const effectiveIndex = localIndex ?? currentIndex;

	useEffect(() => {
		if (localIndex !== null && resolveIndex(value) === localIndex) {
			setLocalIndex(null);
		}
	}, [value]);

	const radius = 16;
	const strokeWidth = 2;
	const size = radius * 2 + strokeWidth;
	const center = radius + strokeWidth / 2;
	const startAngle = (5 * Math.PI) / 4;
	const totalAngle = (3 * Math.PI) / 2;

	const [ghostIndex, setGhostIndex] = useState<number | null>(null);
	const ghostIndexRef = useRef<number | null>(null);
	const startY = useRef<number | null>(null);
	const startIdx = useRef<number>(effectiveIndex);
	const hasMoved = useRef(false);
	const dragging = useRef(false);

	const indexToAngle = (idx: number) =>
		maxIndex > 0 ? startAngle - (idx / maxIndex) * totalAngle : startAngle;

	const dotAngle = indexToAngle(effectiveIndex);
	const cx = center + radius * Math.cos(dotAngle);
	const cy = center - radius * Math.sin(dotAngle);

	const ghostAngle = ghostIndex !== null ? indexToAngle(ghostIndex) : null;
	const ghostCx =
		ghostAngle !== null ? center + radius * Math.cos(ghostAngle) : null;
	const ghostCy =
		ghostAngle !== null ? center - radius * Math.sin(ghostAngle) : null;

	const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.currentTarget.setPointerCapture(e.pointerId);
		startY.current = e.clientY;
		startIdx.current = effectiveIndex;
		ghostIndexRef.current = null;
		hasMoved.current = false;
		dragging.current = true;
	};

	const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!dragging.current || startY.current === null) return;
		const delta = startY.current - e.clientY;
		if (Math.abs(delta) < 4) return;
		hasMoved.current = true;
		const raw = startIdx.current + delta / 30;
		const newIndex = Math.min(maxIndex, Math.max(0, Math.round(raw)));
		ghostIndexRef.current = newIndex;
		setGhostIndex(newIndex);
	};

	const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!dragging.current) return;
		dragging.current = false;
		if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
			e.currentTarget.releasePointerCapture(e.pointerId);
		}
		const committed = ghostIndexRef.current;
		const moved = hasMoved.current;
		startY.current = null;
		ghostIndexRef.current = null;
		hasMoved.current = false;
		setGhostIndex(null);
		if (!moved) {
			const nextIndex = (effectiveIndex + 1) % count;
			setLocalIndex(nextIndex);
			onManualSliderChange(acceptedValues[nextIndex].toString());
		} else if (committed !== null && committed !== effectiveIndex) {
			setLocalIndex(committed);
			onManualSliderChange(acceptedValues[committed].toString());
		}
	};

	const displayLabel =
		acceptedValues[ghostIndex ?? effectiveIndex]?.toString() ?? "...";

	return (
		<div
			style={{
				flexDirection: labelPosition === "top" ? "column" : "column-reverse",
				display: "flex",
				alignItems: "center",
				userSelect: "none",
				touchAction: "none",
				marginTop: "4px",
				position: "relative",
				gap: "2px",
			}}
			onPointerDown={disabled ? undefined : handlePointerDown}
			onPointerMove={disabled ? undefined : handlePointerMove}
			onPointerUp={disabled ? undefined : endDrag}
			onPointerCancel={disabled ? undefined : endDrag}
		>
			<span style={{ fontSize: "12px" }}>
				{generateAcronym(param.name.replace(/_cv$/, ""), acronymeLimit)}
			</span>
			<div style={{ position: "relative" }}>
				<svg width={size} height={size}>
					<circle
						cx={center}
						cy={center}
						r={radius}
						stroke={disabled ? "none" : "gray"}
						strokeWidth={strokeWidth}
						fill="none"
					/>
					{!disabled && <circle cx={cx} cy={cy} r={4} fill="orange" />}
					{!disabled && ghostIndex !== null && (
						<circle
							cx={ghostCx}
							cy={ghostCy}
							r={4}
							fill="orange"
							opacity={0.4}
						/>
					)}
				</svg>
				<span
					style={{
						position: "absolute",
						top: "50%",
						left: "50%",
						transform: "translate(-50%, -50%)",
						fontSize: "9px",
						pointerEvents: "none",
						zIndex: 10,
						color: ghostIndex !== null ? "orange" : "#333",
						whiteSpace: "nowrap",
						maxWidth: ghostIndex !== null ? "120px" : `${size - 4}px`,
						overflow: "hidden",
					}}
				>
					{disabled
						? "..."
						: ghostIndex !== null
							? displayLabel
							: generateAcronym(displayLabel, 10).toLowerCase()}
				</span>
			</div>
		</div>
	);
};

export const CircularSlider = ({
	value,
	param,
	onManualSliderChange,
	acronymeLimit = 5,
	labelPosition = "top",
	maxValue = 127,
	minValue = 0,
	rounded = true,
	disabled = false,
}: {
	value: number | undefined;
	param: MidiParameter | VirtualParameter;
	acronymeLimit?: number;
	labelPosition?: "top" | "bottom";
	onManualSliderChange: (value: number) => void;
	maxValue?: number;
	minValue?: number;
	rounded?: boolean;
	disabled?: boolean;
}) => {
	const radius = 16;
	const strokeWidth = 2;
	const size = radius * 2 + strokeWidth;
	const center = radius + strokeWidth / 2;

	const startAngle = (5 * Math.PI) / 4;
	const totalAngle = (3 * Math.PI) / 2;

	const [ghostValue, setGhostValue] = useState<number | null>(null);
	const ghostValueRef = useRef<number | null>(null);
	const startY = useRef<number | null>(null);
	const startValue = useRef<number>(value ?? minValue);
	const dragging = useRef(false);

	const span = maxValue - minValue;
	const angle =
		value !== undefined
			? startAngle - ((value - minValue) / span) * totalAngle
			: startAngle;
	const cx = center + radius * Math.cos(angle);
	const cy = center - radius * Math.sin(angle);

	const ghostAngle =
		ghostValue !== null
			? startAngle - ((ghostValue - minValue) / span) * totalAngle
			: null;
	const ghostCx =
		ghostAngle !== null ? center + radius * Math.cos(ghostAngle) : null;
	const ghostCy =
		ghostAngle !== null ? center - radius * Math.sin(ghostAngle) : null;

	const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.currentTarget.setPointerCapture(e.pointerId);
		startY.current = e.clientY;
		startValue.current = value || minValue;
		ghostValueRef.current = null;
		dragging.current = true;
	};

	const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!dragging.current || startY.current === null) return;
		const delta = startY.current - e.clientY;
		const deltaValue = (delta / 2) * ((maxValue - minValue) / 127);
		const raw = startValue.current + deltaValue;
		const newValue = Math.min(
			maxValue,
			Math.max(minValue, rounded ? Math.round(raw) : raw),
		);
		ghostValueRef.current = newValue;
		setGhostValue(newValue);
	};

	const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!dragging.current) return;
		dragging.current = false;
		if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
			e.currentTarget.releasePointerCapture(e.pointerId);
		}
		const committed = ghostValueRef.current;
		startY.current = null;
		ghostValueRef.current = null;
		setGhostValue(null);
		if (committed !== null && committed !== value) {
			onManualSliderChange?.(committed);
		}
	};

	const formatValue = (v: number | undefined): string => {
		if (v === undefined || v === null) return "...";
		if (rounded) return String(Math.round(v));
		const str = String(v);
		const dotIdx = str.indexOf(".");
		if (dotIdx === -1) return str;
		const decimals = str.length - dotIdx - 1;
		if (decimals <= 4) return v.toFixed(decimals);
		return `${v.toFixed(4)}...`;
	};

	return (
		<div
			style={{
				flexDirection: labelPosition === "top" ? "column" : "column-reverse",
				display: "flex",
				alignItems: "center",
				userSelect: "none",
				touchAction: "none",
				marginTop: "4px",
				position: "relative",
				gap: "2px",
			}}
			onPointerDown={disabled ? undefined : handlePointerDown}
			onPointerMove={disabled ? undefined : handlePointerMove}
			onPointerUp={disabled ? undefined : endDrag}
			onPointerCancel={disabled ? undefined : endDrag}
		>
			<span style={{ fontSize: "12px" }}>
				{generateAcronym(param.name.replace(/_cv$/, ""), acronymeLimit)}
			</span>
			<div style={{ position: "relative" }}>
				<svg width={size} height={size}>
					<circle
						cx={center}
						cy={center}
						r={radius}
						stroke={disabled ? "none" : "gray"}
						strokeWidth={strokeWidth}
						fill="none"
					/>
					{!disabled && <circle cx={cx} cy={cy} r={4} fill="orange" />}

					{!disabled && ghostValue !== null && (
						<circle
							cx={ghostCx}
							cy={ghostCy}
							r={4}
							fill="orange"
							opacity={0.4}
						/>
					)}
				</svg>
				<span
					style={{
						position: "absolute",
						top: "50%",
						left: "50%",
						transform: "translate(-50%, -50%)",
						fontSize: "11px",
						pointerEvents: "none",
						zIndex: 10,
						color: "#333",
						whiteSpace: "nowrap",
					}}
				>
					{disabled ? "..." : formatValue(value)}
				</span>

				{ghostValue !== null && (
					<span
						style={{
							position: "absolute",
							top: "calc(50% + 2px)",
							left: "50%",
							transform: "translateX(-50%)",
							fontSize: "11px",
							pointerEvents: "none",
							zIndex: 100,
							color: "rgba(0,0,0,0.55)",
							borderRadius: "3px",
							padding: "1px 4px",
						}}
					>
						{String(ghostValue)}
					</span>
				)}
			</div>
		</div>
	);
};

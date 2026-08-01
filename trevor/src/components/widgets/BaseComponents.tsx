/** biome-ignore-all lint/a11y/noStaticElementInteractions: <explanation> */
/** biome-ignore-all lint/a11y/noSvgWithoutTitle: <explanation> */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
	onTap,
	acronymeLimit = 5,
	labelPosition = "top",
	disabled = false,
	stripPrefix = false,
}: {
	value: number | string | undefined;
	param: MidiParameter | VirtualParameter;
	acronymeLimit?: number;
	labelPosition?: "top" | "bottom";
	onManualSliderChange: (value: string) => void;
	onTap?: () => void;
	disabled?: boolean;
	stripPrefix?: boolean;
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
			onTap?.();
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
				{generateAcronym(
					param.name
						.replace(/_cv$/, "")
						.replace(stripPrefix ? /^[^_]+_/ : "", ""),
					acronymeLimit,
				)}
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
	onTap,
	acronymeLimit = 5,
	labelPosition = "top",
	maxValue = 127,
	minValue = 0,
	rounded = true,
	disabled = false,
	stripPrefix = false,
}: {
	value: number | undefined;
	param: MidiParameter | VirtualParameter;
	acronymeLimit?: number;
	labelPosition?: "top" | "bottom";
	onManualSliderChange: (value: number) => void;
	onTap?: () => void;
	maxValue?: number;
	minValue?: number;
	rounded?: boolean;
	disabled?: boolean;
	stripPrefix?: boolean;
}) => {
	const radius = 16;
	const strokeWidth = 2;
	const size = radius * 2 + strokeWidth;
	const center = radius + strokeWidth / 2;

	const startAngle = (5 * Math.PI) / 4;
	const totalAngle = (3 * Math.PI) / 2;

	const [ghostValue, setGhostValue] = useState<number | null>(null);
	const ghostValueRef = useRef<number | null>(null);
	const svgInnerRef = useRef<SVGSVGElement>(null);
	const svgRectRef = useRef<{ left: number; top: number } | null>(null);
	const startY = useRef<number | null>(null);
	const startX = useRef<number | null>(null);
	const startValue = useRef<number>(value ?? minValue);
	const hasMoved = useRef(false);
	const dragging = useRef(false);
	const basePrecision = useRef<number>(0);
	const extraDecimalsRef = useRef<number>(0);
	const [extraDecimals, setExtraDecimals] = useState<number>(0);
	const [dragOverlay, setDragOverlay] = useState<{
		sx: number;
		sy: number;
		cx: number;
		cy: number;
	} | null>(null);

	const span = maxValue - minValue;
	const angle =
		value !== undefined && span !== 0
			? startAngle - ((value - minValue) / span) * totalAngle
			: startAngle;
	const cx = center + radius * Math.cos(angle);
	const cy = center - radius * Math.sin(angle);

	const ghostAngle =
		ghostValue !== null && span !== 0
			? startAngle - ((ghostValue - minValue) / span) * totalAngle
			: null;
	const ghostCx =
		ghostAngle !== null ? center + radius * Math.cos(ghostAngle) : null;
	const ghostCy =
		ghostAngle !== null ? center - radius * Math.sin(ghostAngle) : null;

	const countDecimals = (v: number): number => {
		const s = v.toString();
		const d = s.indexOf(".");
		return d === -1 ? 0 : s.length - d - 1;
	};

	const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.currentTarget.setPointerCapture(e.pointerId);
		startY.current = e.clientY;
		startX.current = e.clientX;
		startValue.current = value ?? minValue;
		ghostValueRef.current = null;
		hasMoved.current = false;
		dragging.current = true;
		if (!rounded) {
			basePrecision.current = countDecimals(value ?? minValue);
			extraDecimalsRef.current = 0;
			setExtraDecimals(0);
		}
		const svgEl = svgInnerRef.current;
		svgRectRef.current = svgEl
			? {
					left: svgEl.getBoundingClientRect().left,
					top: svgEl.getBoundingClientRect().top,
				}
			: null;
	};

	const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!dragging.current || startY.current === null) return;
		const yDelta = startY.current - e.clientY;
		if (!hasMoved.current && Math.abs(yDelta) < 4) return;
		hasMoved.current = true;

		let newValue: number;
		if (!rounded && startX.current !== null) {
			const xDelta = e.clientX - startX.current;
			const absDist = Math.abs(xDelta);
			const magnitude =
				absDist < 45 ? 0 : Math.min(6, 1 + Math.floor((absDist - 45) / 25));
			const extra = Math.max(
				-basePrecision.current,
				xDelta < 0 ? magnitude : -magnitude,
			);
			if (extra !== extraDecimalsRef.current) {
				startValue.current = ghostValueRef.current ?? startValue.current;
				startY.current = e.clientY;
				extraDecimalsRef.current = extra;
				setExtraDecimals(extra);
			}
			const scale = Math.pow(10, -extra);
			const currentYDelta = startY.current - e.clientY;
			const raw =
				startValue.current +
				(currentYDelta / 2) * ((maxValue - minValue) / 127) * scale;
			newValue = Math.min(maxValue, Math.max(minValue, raw));
		} else {
			const raw =
				startValue.current + (yDelta / 2) * ((maxValue - minValue) / 127);
			newValue = Math.min(
				maxValue,
				Math.max(minValue, rounded ? Math.round(raw) : raw),
			);
		}
		ghostValueRef.current = newValue;
		setGhostValue(newValue);

		const svgRect = svgRectRef.current;
		if (svgRect && span !== 0) {
			const ghostAng = startAngle - ((newValue - minValue) / span) * totalAngle;
			setDragOverlay({
				sx: svgRect.left + center + radius * Math.cos(ghostAng),
				sy: svgRect.top + center - radius * Math.sin(ghostAng),
				cx: e.clientX,
				cy: e.clientY,
			});
		}
	};

	const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!dragging.current) return;
		dragging.current = false;
		if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
			e.currentTarget.releasePointerCapture(e.pointerId);
		}
		let committed = ghostValueRef.current;
		if (!rounded && committed !== null) {
			const precision = Math.max(
				0,
				basePrecision.current + extraDecimalsRef.current,
			);
			const factor = Math.pow(10, precision);
			committed = Math.round(committed * factor) / factor;
		}
		const moved = hasMoved.current;
		startY.current = null;
		startX.current = null;
		ghostValueRef.current = null;
		hasMoved.current = false;
		extraDecimalsRef.current = 0;
		setExtraDecimals(0);
		setDragOverlay(null);
		setGhostValue(null);
		if (!moved) {
			onTap?.();
		} else if (committed !== null && committed !== value) {
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

	const dragLine = dragOverlay
		? (() => {
				const dx = dragOverlay.cx - dragOverlay.sx;
				const dy = dragOverlay.cy - dragOverlay.sy;
				const dist = Math.sqrt(dx * dx + dy * dy);
				if (dist < 6) return null;
				return {
					x1: dragOverlay.sx,
					y1: dragOverlay.sy,
					x2: dragOverlay.cx,
					y2: dragOverlay.cy,
				};
			})()
		: null;

	return (
		<>
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
					{generateAcronym(
						param.name
							.replace(/_cv$/, "")
							.replace(stripPrefix ? /^[^_]+_/ : "", ""),
						acronymeLimit,
					)}
				</span>
				<div style={{ position: "relative" }}>
					<svg width={size} height={size} ref={svgInnerRef}>
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
							{!rounded
								? ghostValue.toFixed(
										Math.max(0, basePrecision.current + extraDecimals),
									)
								: String(ghostValue)}
						</span>
					)}
				</div>
			</div>
			{dragLine &&
				createPortal(
					<svg
						style={{
							position: "fixed",
							top: 0,
							left: 0,
							width: "100%",
							height: "100%",
							pointerEvents: "none",
							zIndex: 9999,
						}}
					>
						<line
							x1={dragLine.x1}
							y1={dragLine.y1}
							x2={dragLine.x2}
							y2={dragLine.y2}
							stroke="rgba(0,0,0,0.45)"
							strokeWidth={1.5}
							strokeDasharray="5 4"
						/>
					</svg>,
					document.body,
				)}
		</>
	);
};
